"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  Plus,
  Search,
  Filter,
  Eye,
  Calendar,
  User,
  Phone,
  Building,
  DollarSign,
  AlertCircle,
  RefreshCw,
  Clock,
  ArrowUpDown,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
} from "@/lib/utils";

interface Client {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
}

interface Project {
  id: number;
  title: string;
  type: string;
  status: string;
  priority: string;
  totalCost: number;
  totalPrice: number;
  amountPaid: number;
  createdAt: string;
  inspectionDate?: string | null;
  syncDate?: string | null;
  client: Client;
  _count?: {
    items: number;
    tasks: number;
    supplierOrders: number;
    payments: number;
  };
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL"); // ALL | LARGE_PROJECT | SIMPLE_ORDER
  const [statusFilter, setStatusFilter] = useState("ALL");

  // New Project Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    type: "LARGE_PROJECT",
    priority: "MEDIUM",
    clientName: "",
    clientPhone: "",
    clientEmail: "",
    clientCompany: "",
    clientAddress: "",
    inspectionDate: "",
    estimatedDelivery: "",
    notes: "",
  });

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/projects";
      const params = new URLSearchParams();

      if (typeFilter !== "ALL") {
        params.append("type", typeFilter);
      }
      if (statusFilter !== "ALL") {
        params.append("status", statusFilter);
      }
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("فشل في تحميل قائمة المشاريع");
      }
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء تحميل المشاريع");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [typeFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProjects();
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.clientName || !formData.clientPhone) {
      alert("يرجى ملء الحقول الإلزامية: عنوان المشروع، اسم العميل، ورقم الهاتف");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: formData.title,
        type: formData.type,
        priority: formData.priority,
        status: "LEAD",
        client: {
          name: formData.clientName,
          phone: formData.clientPhone,
          email: formData.clientEmail || null,
          company: formData.clientCompany || null,
          address: formData.clientAddress || null,
        },
        inspectionDate: formData.inspectionDate ? new Date(formData.inspectionDate) : null,
        estimatedDelivery: formData.estimatedDelivery ? new Date(formData.estimatedDelivery) : null,
        notes: formData.notes || null,
      };

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "فشل في إنشاء المشروع");
      }

      const newProject = await res.json();
      setIsDialogOpen(false);
      // Reset form
      setFormData({
        title: "",
        type: "LARGE_PROJECT",
        priority: "MEDIUM",
        clientName: "",
        clientPhone: "",
        clientEmail: "",
        clientCompany: "",
        clientAddress: "",
        inspectionDate: "",
        estimatedDelivery: "",
        notes: "",
      });

      // Navigate to new project detail
      router.push(`/admin/projects/${newProject.id}`);
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء إنشاء المشروع");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#0f172a]">المشاريع والطلبات</h2>
          <p className="text-sm text-slate-600">
            إدارة جميع المشاريع، متابعة مراحل التنفيذ، وحسابات العقود
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0f172a] hover:bg-[#162d4a] text-white shadow">
              <Plus className="w-4 h-4 ml-1.5 text-[#c5a975]" />
              مشروع جديد
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#0f172a]">
                إضافة مشروع أو طلب جديد
              </DialogTitle>
              <DialogDescription>
                أدخل تفاصيل المشروع وبيانات العميل لبدء دورة العمل والمتابعة
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateProject} className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="title" className="text-xs font-bold text-slate-700">
                    عنوان المشروع / الطلب <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="title"
                    placeholder="مثال: تأثيث المقر الإداري لشركة النور"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="type" className="text-xs font-bold text-slate-700">
                    نوع المشروع
                  </Label>
                  <Select
                    value={formData.type}
                    onValueChange={(val) =>
                      setFormData({ ...formData, type: val })
                    }
                  >
                    <SelectTrigger id="type">
                      <SelectValue placeholder="اختر نوع المشروع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LARGE_PROJECT">
                        مشروع كبير (مقر متكامل / قواطع / متعدد الغرف)
                      </SelectItem>
                      <SelectItem value="SIMPLE_ORDER">
                        طلب بسيط (قطع محددة / تسليم سريع)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="priority" className="text-xs font-bold text-slate-700">
                    درجة الأولوية
                  </Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(val) =>
                      setFormData({ ...formData, priority: val })
                    }
                  >
                    <SelectTrigger id="priority">
                      <SelectValue placeholder="اختر الأولوية" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">منخفضة</SelectItem>
                      <SelectItem value="MEDIUM">متوسطة (عادي)</SelectItem>
                      <SelectItem value="HIGH">عالية</SelectItem>
                      <SelectItem value="URGENT">عاجل جداً</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Client Info Section */}
              <div className="border-t border-slate-200 pt-3">
                <h4 className="text-xs font-bold text-[#0f172a] uppercase tracking-wider mb-2">
                  بيانات العميل
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="clientName" className="text-xs font-bold text-slate-700">
                      اسم العميل المسؤول <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="clientName"
                      placeholder="أ/ أحمد إبراهيم"
                      value={formData.clientName}
                      onChange={(e) =>
                        setFormData({ ...formData, clientName: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="clientPhone" className="text-xs font-bold text-slate-700">
                      رقم الهاتف / واتساب <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="clientPhone"
                      placeholder="01012345678"
                      value={formData.clientPhone}
                      onChange={(e) =>
                        setFormData({ ...formData, clientPhone: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="clientCompany" className="text-xs font-bold text-slate-700">
                      اسم الشركة أو المؤسسة
                    </Label>
                    <Input
                      id="clientCompany"
                      placeholder="شركة النور للاستشارات"
                      value={formData.clientCompany}
                      onChange={(e) =>
                        setFormData({ ...formData, clientCompany: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="clientEmail" className="text-xs font-bold text-slate-700">
                      البريد الإلكتروني
                    </Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      placeholder="client@company.com"
                      value={formData.clientEmail}
                      onChange={(e) =>
                        setFormData({ ...formData, clientEmail: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="clientAddress" className="text-xs font-bold text-slate-700">
                      عنوان موقع التركيب / المعاينة
                    </Label>
                    <Input
                      id="clientAddress"
                      placeholder="التجمع الخامس، القاهرة الجديدة - مبنى 14"
                      value={formData.clientAddress}
                      onChange={(e) =>
                        setFormData({ ...formData, clientAddress: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Dates & Notes */}
              <div className="border-t border-slate-200 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="inspectionDate" className="text-xs font-bold text-slate-700">
                      تاريخ المعاينة المبدئية
                    </Label>
                    <Input
                      id="inspectionDate"
                      type="date"
                      value={formData.inspectionDate}
                      onChange={(e) =>
                        setFormData({ ...formData, inspectionDate: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="estimatedDelivery" className="text-xs font-bold text-slate-700">
                      الموعد المستهدف للتسليم
                    </Label>
                    <Input
                      id="estimatedDelivery"
                      type="date"
                      value={formData.estimatedDelivery}
                      onChange={(e) =>
                        setFormData({ ...formData, estimatedDelivery: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="notes" className="text-xs font-bold text-slate-700">
                      ملاحظات أو متطلبات خاصة
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="أي اشتراطات خاصة بالألوان، المقاسات، أو طبيعة المكان..."
                      rows={3}
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t border-slate-200 pt-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#0f172a] hover:bg-[#162d4a] text-white"
                >
                  {submitting ? "جاري الحفظ..." : "إنشاء المشروع ومتابعة"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-md border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Filter Tabs: All / Large / Simple */}
          <Tabs
            value={typeFilter}
            onValueChange={setTypeFilter}
            className="w-full md:w-auto"
          >
            <TabsList className="bg-slate-100 p-1">
              <TabsTrigger value="ALL" className="text-xs">
                الكل
              </TabsTrigger>
              <TabsTrigger value="LARGE_PROJECT" className="text-xs">
                مشاريع كبيرة
              </TabsTrigger>
              <TabsTrigger value="SIMPLE_ORDER" className="text-xs">
                طلبات بسيطة
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Status Dropdown & Search Form */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Status Dropdown */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44 text-xs">
                <SelectValue placeholder="تصفية حسب الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">جميع الحالات</SelectItem>
                <SelectItem value="LEAD">عميل محتمل</SelectItem>
                <SelectItem value="INSPECTION">معاينة</SelectItem>
                <SelectItem value="DESIGNING">جاري التصميم</SelectItem>
                <SelectItem value="PENDING_APPROVAL">في انتظار الاعتماد</SelectItem>
                <SelectItem value="APPROVED">تمت الموافقة</SelectItem>
                <SelectItem value="IN_PRODUCTION">جاري التصنيع</SelectItem>
                <SelectItem value="READY">جاهز للتسليم</SelectItem>
                <SelectItem value="INSTALLING">جاري التركيب</SelectItem>
                <SelectItem value="COMPLETED">مكتمل</SelectItem>
                <SelectItem value="CANCELLED">ملغي</SelectItem>
              </SelectContent>
            </Select>

            {/* Search Input */}
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center gap-2 w-full sm:w-72"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  placeholder="بحث باسم المشروع، العميل، الهاتف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 text-xs"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" className="text-xs shrink-0">
                بحث
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#0f172a] mb-3" />
            <p className="text-sm font-medium">جاري تحميل قائمة المشاريع...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchProjects}
              className="mt-4"
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FolderKanban className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-bold text-slate-700">
              لا توجد مشاريع مطابقة
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              لم يتم العثور على أي مشروع يطابق معايير التصفية الحالية. يمكنك إضافة مشروع جديد أو تعديل معايير البحث.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>المشروع</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">الإجمالي</TableHead>
                <TableHead className="text-left">المدفوع</TableHead>
                <TableHead className="w-24 text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {projects.map((project) => (
                <TableRow
                  key={project.id}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/projects/${project.id}`)}
                >
                  <TableCell className="text-center font-mono text-xs text-slate-400">
                    {project.id}
                  </TableCell>

                  {/* Project Title & Priority */}
                  <TableCell>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 hover:text-[#0f172a]">
                          {project.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] py-0 px-1.5 ${getPriorityColor(project.priority)}`}
                        >
                          {getStatusLabel(project.priority)}
                        </Badge>
                      </div>
                      <span className="text-xs text-slate-500 mt-0.5">
                        أُضيف في: {formatDate(project.createdAt)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Client Info */}
                  <TableCell>
                    <div className="flex flex-col text-xs">
                      <span className="font-semibold text-slate-800">
                        {project.client.name}
                      </span>
                      <span className="text-slate-500">
                        {project.client.company || project.client.phone}
                      </span>
                    </div>
                  </TableCell>

                  {/* Type */}
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-xs font-normal bg-slate-100 text-slate-700"
                    >
                      {getStatusLabel(project.type)}
                    </Badge>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-xs font-semibold ${getStatusColor(project.status)}`}
                    >
                      {getStatusLabel(project.status)}
                    </Badge>
                  </TableCell>

                  {/* Total Price */}
                  <TableCell className="text-left font-bold text-sm text-slate-900">
                    {formatCurrency(project.totalPrice)}
                  </TableCell>

                  {/* Amount Paid & Progress */}
                  <TableCell className="text-left">
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-semibold text-emerald-700">
                        {formatCurrency(project.amountPaid)}
                      </span>
                      {project.totalPrice > 0 && (
                        <span className="text-[10px] text-slate-500">
                          {((project.amountPaid / project.totalPrice) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Action */}
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/admin/projects/${project.id}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-xs text-[#0f172a] border-slate-200 hover:bg-[#0f172a] hover:text-white"
                      >
                        <Eye className="w-3.5 h-3.5 ml-1" />
                        عرض
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
