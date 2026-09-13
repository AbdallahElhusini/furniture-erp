"use client";

import React, { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FolderKanban,
  ChevronLeft,
  Calendar,
  Clock,
  User,
  Phone,
  Building,
  MapPin,
  Mail,
  DollarSign,
  Plus,
  Truck,
  Factory,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowRight,
  ShieldAlert,
  CreditCard,
  Layers,
  Sparkles,
  RefreshCw,
  Edit,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, calendarDate } from "@/lib/accounting/validation";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getTaskTypeIcon,
  daysUntil,
} from "@/lib/utils";

function currentCalendarDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

interface CatalogItemOption {
  id: number;
  nameAr: string;
  sku: string;
  costPrice: number;
  sellingPrice: number;
  leadTimeDays: number;
  supplier?: { id: number; name: string } | null;
}

interface ProjectData {
  id: number;
  title: string;
  type: string;
  status: string;
  priority: string;
  inspectionDate?: string | null;
  designDeadline?: string | null;
  approvalDate?: string | null;
  estimatedDelivery?: string | null;
  syncDate?: string | null;
  totalCost: number;
  totalPrice: number;
  amountPaid: number;
  shippingCost: number;
  installationCost: number;
  notes?: string | null;
  createdAt: string;
  client: {
    id: number;
    name: string;
    phone: string;
    email?: string | null;
    company?: string | null;
    address?: string | null;
    notes?: string | null;
  };
  items: Array<{
    id: number;
    catalogItemId: number;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    status: string;
    leadTimeDays: number;
    notes?: string | null;
    catalogItem: {
      id: number;
      nameAr: string;
      nameEn: string;
      sku: string;
      leadTimeDays: number;
      category?: { nameAr: string } | null;
      supplier?: { id: number; name: string; phone: string } | null;
    };
  }>;
  supplierOrders: Array<{
    id: number;
    supplierId: number;
    status: string;
    orderDate: string;
    expectedDate?: string | null;
    actualDeliveryDate?: string | null;
    totalAmount: number;
    amountPaid: number;
    notes?: string | null;
    supplier: {
      id: number;
      name: string;
      phone: string;
      specialization?: string | null;
    };
    items: Array<{
      id: number;
      quantity: number;
      projectItem: {
        id: number;
        catalogItem: { nameAr: string; sku: string };
      };
    }>;
  }>;
  tasks: Array<{
    id: number;
    type: string;
    title: string;
    description?: string | null;
    dueDate: string;
    status: string;
    priority: string;
    technician?: { id: number; name: string; phone: string } | null;
  }>;
  payments: Array<{
    id: number;
    amount: number;
    method: string;
    notes?: string | null;
    date: string;
  }>;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);

  // Catalog items for item picker dialog
  const [catalogOptions, setCatalogOptions] = useState<CatalogItemOption[]>([]);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [itemFormData, setItemFormData] = useState({
    catalogItemId: "",
    quantity: 1,
    unitCost: 0,
    unitPrice: 0,
    leadTimeDays: 7,
    notes: "",
    status: "PENDING",
  });

  // Add Payment Dialog State
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [addingPayment, setAddingPayment] = useState(false);
  const paymentRequestKey = useRef<string | null>(null);
  const paymentInFlight = useRef(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentFormData, setPaymentFormData] = useState({
    amount: "",
    method: "CASH",
    notes: "",
    date: currentCalendarDate(),
  });

  // Add Task Dialog State
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [taskFormData, setTaskFormData] = useState({
    title: "",
    type: "SUPPLIER_FOLLOWUP",
    priority: "MEDIUM",
    dueDate: new Date().toISOString().split("T")[0],
    description: "",
  });

  const fetchProjectDetails = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        throw new Error("فشل في تحميل تفاصيل المشروع");
      }
      const data = await res.json();
      setProject(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogOptions = async () => {
    try {
      const res = await fetch("/api/catalog?isActive=true");
      if (res.ok) {
        const data = await res.json();
        setCatalogOptions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error fetching catalog items for selector:", err);
    }
  };

  useEffect(() => {
    fetchProjectDetails();
    fetchCatalogOptions();
  }, [projectId]);

  // Status transition handler
  const handleUpdateItemStatus = async (itemId: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchProjectDetails();
      } else {
        alert("فشل في تحديث حالة المنتج");
      }
    } catch (err) {
      alert("حدث خطأ أثناء تحديث حالة المنتج");
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("فشل في تحديث حالة المشروع");
      }
      await fetchProjectDetails();
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء تحديث الحالة");
    }
  };

  // Dispatch project to factories (Sync Engine)
  const handleDispatchProject = async () => {
    if (
      !confirm(
        "هل تريد بالتأكيد تفعيل التصنيع؟ سيتم إنشاء أوامر التوريد للمصانع، حساب موعد المزامنة والتسليم تلقائياً، وإنشاء مهام المتابعة."
      )
    ) {
      return;
    }

    setDispatching(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/dispatch`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "فشل في تفعيل التصنيع للمشروع");
      }

      alert("تم إرسال أوامر التوريد للمصانع بنجاح وتفعيل محرك التزامن!");
      await fetchProjectDetails();
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء إرسال أوامر التوريد");
    } finally {
      setDispatching(false);
    }
  };

  // Add Item to project
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemFormData.catalogItemId) {
      alert("يرجى اختيار المنتج من الكتالوج");
      return;
    }

    setAddingItem(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogItemId: parseInt(itemFormData.catalogItemId, 10),
          quantity: parseInt(String(itemFormData.quantity), 10) || 1,
          unitCost: parseFloat(String(itemFormData.unitCost)),
          unitPrice: parseFloat(String(itemFormData.unitPrice)),
          leadTimeDays: parseInt(String(itemFormData.leadTimeDays), 10),
          notes: itemFormData.notes || null,
          status: itemFormData.status,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "فشل في إضافة القطعة للمشروع");
      }

      setIsAddItemOpen(false);
      setItemFormData({
        catalogItemId: "",
        quantity: 1,
        unitCost: 0,
        unitPrice: 0,
        leadTimeDays: 7,
        notes: "",
        status: "PENDING",
      });
      await fetchProjectDetails();
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء إضافة القطعة");
    } finally {
      setAddingItem(false);
    }
  };

  // Add Payment
  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentInFlight.current) return;
    setPaymentError("");
    paymentInFlight.current = true;
    setAddingPayment(true);
    try {
      const amount = money(paymentFormData.amount);
      const date = calendarDate(paymentFormData.date);
      paymentRequestKey.current ??= crypto.randomUUID();
      const res = await fetch(`/api/projects/${projectId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          method: paymentFormData.method,
          notes: paymentFormData.notes || null,
          date,
          requestKey: paymentRequestKey.current,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "فشل في تسجيل الدفعة");
      }

      setIsAddPaymentOpen(false);
      paymentRequestKey.current = null;
      setPaymentFormData({
        amount: "",
        method: "CASH",
        notes: "",
        date: currentCalendarDate(),
      });
      await fetchProjectDetails();
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : "حدث خطأ أثناء تسجيل الدفعة");
    } finally {
      paymentInFlight.current = false;
      setAddingPayment(false);
    }
  };

  // Add Task
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskFormData.title) {
      alert("يرجى إدخال عنوان المهمة");
      return;
    }

    setAddingTask(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: parseInt(projectId, 10),
          title: taskFormData.title,
          type: taskFormData.type,
          priority: taskFormData.priority,
          dueDate: new Date(taskFormData.dueDate),
          description: taskFormData.description || null,
          status: "TODO",
        }),
      });

      if (!res.ok) {
        throw new Error("فشل في إضافة المهمة للمشروع");
      }

      setIsAddTaskOpen(false);
      setTaskFormData({
        title: "",
        type: "SUPPLIER_FOLLOWUP",
        priority: "MEDIUM",
        dueDate: new Date().toISOString().split("T")[0],
        description: "",
      });
      await fetchProjectDetails();
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء إضافة المهمة");
    } finally {
      setAddingTask(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6 text-center text-slate-500">
        <RefreshCw className="w-10 h-10 animate-spin mx-auto text-[#0f172a] mb-3" />
        <p className="font-bold text-slate-700">جاري تحميل ملف المشروع...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8 bg-white rounded-md border border-red-200 text-center space-y-4 max-w-lg mx-auto">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
        <h3 className="text-lg font-bold text-slate-800">تعذر فتح المشروع</h3>
        <p className="text-sm text-slate-600">{error || "المشروع غير موجود"}</p>
        <Link href="/admin/projects">
          <Button variant="outline">العودة لقائمة المشاريع</Button>
        </Link>
      </div>
    );
  }

  // Calculate Critical Path / Sync Visualization Data
  const itemsWithLead = project.items || [];
  const maxLeadTime = itemsWithLead.reduce(
    (max, item) =>
      Math.max(max, item.leadTimeDays || item.catalogItem?.leadTimeDays || 0),
    0
  );

  const remainingBalance = Math.max(0, project.totalPrice - project.amountPaid);
  const profit = project.totalPrice - project.totalCost;
  const profitMargin =
    project.totalPrice > 0 ? ((profit / project.totalPrice) * 100).toFixed(1) : 0;

  // Workflow Next Button Logic
  const renderWorkflowButton = () => {
    switch (project.status) {
      case "LEAD":
        return (
          <Button
            onClick={() => handleUpdateStatus("INSPECTION")}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm shadow-sm"
          >
            <Calendar className="w-4 h-4 ml-1.5" />
            تحديد موعد معاينة ورفع مقاسات
          </Button>
        );
      case "INSPECTION":
        return (
          <Button
            onClick={() => handleUpdateStatus("DESIGNING")}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm shadow-sm"
          >
            <Layers className="w-4 h-4 ml-1.5" />
            بدء التصميم ثلاثي الأبعاد (3D)
          </Button>
        );
      case "DESIGNING":
        return (
          <Button
            onClick={() => handleUpdateStatus("PENDING_APPROVAL")}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm shadow-sm"
          >
            <Clock className="w-4 h-4 ml-1.5" />
            إرسال التصاميم للموافقة والاعتماد
          </Button>
        );
      case "PENDING_APPROVAL":
        return (
          <Button
            onClick={() => handleUpdateStatus("APPROVED")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4 ml-1.5" />
            اعتماد العميل والموافقة النهائية
          </Button>
        );
      case "APPROVED":
        return (
          <Button
            onClick={handleDispatchProject}
            disabled={dispatching || project.items.length === 0}
            className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white text-xs sm:text-sm shadow-sm font-bold animate-pulse"
          >
            <Sparkles className="w-4 h-4 ml-1.5 text-yellow-300" />
            {dispatching ? "جاري التفعيل..." : "⚡ تفعيل التصنيع (Dispatch والمزامنة)"}
          </Button>
        );
      case "IN_PRODUCTION":
        return (
          <Button
            onClick={() => handleUpdateStatus("READY")}
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4 ml-1.5" />
            اكتمال تصنيع كل القطع وجاهز للتسليم
          </Button>
        );
      case "READY":
        return (
          <Button
            onClick={() => handleUpdateStatus("INSTALLING")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm shadow-sm"
          >
            <Truck className="w-4 h-4 ml-1.5" />
            شحن القطع وبدء عمليات التركيب بالموقع
          </Button>
        );
      case "INSTALLING":
        return (
          <Button
            onClick={() => handleUpdateStatus("COMPLETED")}
            className="bg-green-700 hover:bg-green-800 text-white text-xs sm:text-sm shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4 ml-1.5" />
            تسليم المشروع النهائي واعتماد الإنجاز
          </Button>
        );
      case "COMPLETED":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs py-1.5 px-3">
            ✓ المشروع مكتمل وتم التسليم بنجاح
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/admin/projects" className="hover:text-[#0f172a] font-medium">
          المشاريع
        </Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        <span className="text-slate-800 font-bold truncate">{project.title}</span>
      </div>

      {/* Project Master Header */}
      <div className="bg-white p-5 rounded-md border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-black text-[#0f172a]">{project.title}</h2>
            <Badge className={`text-xs ${getStatusColor(project.status)}`}>
              {getStatusLabel(project.status)}
            </Badge>
            <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700">
              {getStatusLabel(project.type)}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${getPriorityColor(project.priority)}`}
            >
              أولوية {getStatusLabel(project.priority)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 font-semibold text-slate-700">
              <User className="w-3.5 h-3.5 text-[#c5a975]" />
              {project.client.name}
            </span>
            {project.client.company && (
              <span className="flex items-center gap-1">
                <Building className="w-3.5 h-3.5" />
                {project.client.company}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" />
              {project.client.phone}
            </span>
            <span>â€¢</span>
            <span>تاريخ البدء: {formatDate(project.createdAt)}</span>
          </div>
        </div>

        {/* Workflow Action Button */}
        <div className="flex items-center gap-2 shrink-0">{renderWorkflowButton()}</div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1 rounded-md w-full sm:w-auto grid grid-cols-3 sm:inline-flex shadow-sm">
          <TabsTrigger value="summary" className="text-xs font-semibold px-4">
            الملخص المالي
          </TabsTrigger>
          <TabsTrigger value="items" className="text-xs font-semibold px-4">
            قطع وأصناف المشروع ({project.items?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="sync" className="text-xs font-semibold px-4 text-[#c5a975] data-[state=active]:bg-[#0f172a] data-[state=active]:text-white">
            ⚡ محرك التزامن (Sync)
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="text-xs font-semibold px-4">
            أوامر الموردين ({project.supplierOrders?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs font-semibold px-4">
            سجل المدفوعات ({project.payments?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs font-semibold px-4">
            المهام المرتبطة ({project.tasks?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* ======================================================== */}
        {/* TAB 1: SUMMARY */}
        {/* ======================================================== */}
        <TabsContent value="summary" className="space-y-6">
          {/* Financial Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-r-4 border-r-[#0f172a] shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-500">إجمالي قيمة المشروع</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900">
                  {formatCurrency(project.totalPrice)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  إجمالي المبلغ المتفق عليه مع العميل
                </p>
              </CardContent>
            </Card>

            <Card className="border-r-4 border-r-emerald-500 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-500">المبلغ المحصل</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-emerald-700">
                  {formatCurrency(project.amountPaid)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  نسبة التحصيل:{" "}
                  {project.totalPrice > 0
                    ? ((project.amountPaid / project.totalPrice) * 100).toFixed(0) + "%"
                    : "0%"}
                </p>
              </CardContent>
            </Card>

            <Card className="border-r-4 border-r-amber-500 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-500">المبلغ المتبقي</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-amber-700">
                  {formatCurrency(remainingBalance)}
                </div>
                <p className="text-xs text-slate-500 mt-1">مستحق عند التوريد والتركيب</p>
              </CardContent>
            </Card>

            <Card className="border-r-4 border-r-purple-500 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-500">الربح التقديري والهامش</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-purple-700">
                  {formatCurrency(profit)}
                </div>
                <p className="text-xs text-purple-600 font-semibold mt-1">
                  هامش الربح: {profitMargin}% (التكلفة: {formatCurrency(project.totalCost)})
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Client Info Card */}
            <Card className="shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#c5a975]" />
                  بيانات العميل وموقع العمل
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">الاسم:</span>
                  <span className="font-bold text-slate-900">{project.client.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">الهاتف:</span>
                  <span className="font-bold text-slate-900">{project.client.phone}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">الشركة:</span>
                  <span className="font-medium text-slate-800">
                    {project.client.company || "غير محدد"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">البريد الإلكتروني:</span>
                  <span className="font-medium text-slate-800">
                    {project.client.email || "غير محدد"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">عنوان المعاينة / الموقع:</span>
                  <span className="font-medium text-slate-800">
                    {project.client.address || "غير محدد"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Dates & Milestones Card */}
            <Card className="shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#0f172a]" />
                  المواعيد الزمنية والمحطات الرئيسية
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">تاريخ المعاينة الميدانية:</span>
                  <span className="font-bold text-slate-800">
                    {formatDate(project.inspectionDate)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">الموعد النهائي للتصميم:</span>
                  <span className="font-medium text-slate-800">
                    {formatDate(project.designDeadline)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">تاريخ اعتماد العميل:</span>
                  <span className="font-medium text-slate-800">
                    {formatDate(project.approvalDate)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 bg-amber-50/70 p-1.5 rounded">
                  <span className="text-amber-900 font-bold">
                    ⚡ تاريخ المزامنة المحسوب (Sync Date):
                  </span>
                  <span className="font-black text-amber-800">
                    {formatDate(project.syncDate)}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">الموعد المتوقع للتسليم النهائي:</span>
                  <span className="font-bold text-emerald-700">
                    {formatDate(project.estimatedDelivery)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Notes Card */}
          {project.notes && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-slate-700">
                  ملاحظات واشتراطات المشروع
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-600 whitespace-pre-line bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {project.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 2: ITEMS */}
        {/* ======================================================== */}
        <TabsContent value="items" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0f172a]">
              قائمة قطع وأثاث المشروع
            </h3>

            <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[#0f172a] hover:bg-[#162d4a] text-white">
                  <Plus className="w-4 h-4 ml-1.5 text-[#c5a975]" />
                  إضافة قطعة من الكتالوج
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-[#0f172a]">
                    إضافة صنف إلى المشروع
                  </DialogTitle>
                  <DialogDescription>
                    اختر الصنف من الكتالوج وحدد الكمية والأسعار
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAddItem} className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="catalogItemSelect" className="text-xs font-bold">
                      اختر المنتج من الكتالوج <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={itemFormData.catalogItemId}
                      onValueChange={(val) => {
                        const selected = catalogOptions.find(
                          (c) => c.id === parseInt(val, 10)
                        );
                        if (selected) {
                          setItemFormData({
                            ...itemFormData,
                            catalogItemId: val,
                            unitCost: selected.costPrice,
                            unitPrice: selected.sellingPrice,
                            leadTimeDays: selected.leadTimeDays || 7,
                          });
                        }
                      }}
                    >
                      <SelectTrigger id="catalogItemSelect">
                        <SelectValue placeholder="اختر من المنتجات المتاحة" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {catalogOptions.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.nameAr} ({opt.sku}) - {opt.supplier?.name || "بدون مورد"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="qty" className="text-xs font-bold">
                        الكمية المطلوبة
                      </Label>
                      <Input
                        id="qty"
                        type="number"
                        min="1"
                        value={itemFormData.quantity}
                        onChange={(e) =>
                          setItemFormData({
                            ...itemFormData,
                            quantity: parseInt(e.target.value, 10) || 1,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="leadDays" className="text-xs font-bold">
                        مدة التصنيع (بالأيام)
                      </Label>
                      <Input
                        id="leadDays"
                        type="number"
                        min="1"
                        value={itemFormData.leadTimeDays}
                        onChange={(e) =>
                          setItemFormData({
                            ...itemFormData,
                            leadTimeDays: parseInt(e.target.value, 10) || 7,
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="cost" className="text-xs font-bold">
                        سعر التكلفة للقطعة (ج.م)
                      </Label>
                      <Input
                        id="cost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemFormData.unitCost}
                        onChange={(e) =>
                          setItemFormData({
                            ...itemFormData,
                            unitCost: parseFloat(e.target.value) || 0,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="price" className="text-xs font-bold">
                        سعر البيع للقطعة (ج.م)
                      </Label>
                      <Input
                        id="price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemFormData.unitPrice}
                        onChange={(e) =>
                          setItemFormData({
                            ...itemFormData,
                            unitPrice: parseFloat(e.target.value) || 0,
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="itemNotes" className="text-xs font-bold">
                      ملاحظات خاصة بالمقاسات أو اللون
                    </Label>
                    <Input
                      id="itemNotes"
                      placeholder="مثال: قماش رمادي فاتح، أرجل خشبية..."
                      value={itemFormData.notes}
                      onChange={(e) =>
                        setItemFormData({ ...itemFormData, notes: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="itemStatus" className="text-xs font-bold">
                      مرحلة المنتج (الحالة)
                    </Label>
                    <Select
                      value={itemFormData.status}
                      onValueChange={(val) => setItemFormData({ ...itemFormData, status: val })}
                    >
                      <SelectTrigger id="itemStatus">
                        <SelectValue placeholder="اختر المرحلة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">معلق / قيد المراجعة</SelectItem>
                        <SelectItem value="ORDERED">تم الطلب</SelectItem>
                        <SelectItem value="IN_PRODUCTION">في الإنتاج</SelectItem>
                        <SelectItem value="READY">جاهز للتسليم</SelectItem>
                        <SelectItem value="DELIVERED">تم التسليم</SelectItem>
                        <SelectItem value="INSTALLED">تم التركيب</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddItemOpen(false)}
                    >
                      إلغاء
                    </Button>
                    <Button
                      type="submit"
                      disabled={addingItem}
                      className="bg-[#0f172a] hover:bg-[#162d4a] text-white"
                    >
                      {addingItem ? "جاري الإضافة..." : "إضافة إلى المشروع"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
            {project.items?.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                لم يتم إضافة أي قطع لهذا المشروع بعد. استخدم زر &quot;إضافة قطعة من الكتالوج&quot; أعلاه.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>القطعة / الموديل</TableHead>
                    <TableHead>كود الصنف (SKU)</TableHead>
                    <TableHead>المصنع / المورد</TableHead>
                    <TableHead className="text-center">فترة التصنيع</TableHead>
                    <TableHead className="text-center">الكمية</TableHead>
                    <TableHead className="text-left">سعر التكلفة</TableHead>
                    <TableHead className="text-left">سعر البيع</TableHead>
                    <TableHead className="text-left">الإجمالي</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {project.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-bold text-slate-800 text-sm">
                          {item.catalogItem.nameAr}
                        </div>
                        {item.notes && (
                          <div className="text-[11px] text-slate-500">{item.notes}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {item.catalogItem.sku}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {item.catalogItem.supplier?.name || "مورد عام"}
                      </TableCell>
                      <TableCell className="text-center text-xs font-semibold text-amber-700">
                        {item.leadTimeDays} يوم
                      </TableCell>
                      <TableCell className="text-center font-bold text-sm">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-left text-xs text-slate-500">
                        {formatCurrency(item.unitCost)}
                      </TableCell>
                      <TableCell className="text-left text-xs font-medium text-slate-700">
                        {formatCurrency(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-left text-sm font-bold text-[#0f172a]">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={item.status}
                          onValueChange={(val) => handleUpdateItemStatus(item.id, val)}
                        >
                          <SelectTrigger className={`h-7 text-[10px] font-bold inline-flex w-32 border-0 focus:ring-0 ${getStatusColor(item.status)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDING">معلق / قيد المراجعة</SelectItem>
                            <SelectItem value="ORDERED">تم الطلب</SelectItem>
                            <SelectItem value="IN_PRODUCTION">في الإنتاج</SelectItem>
                            <SelectItem value="READY">جاهز للتسليم</SelectItem>
                            <SelectItem value="DELIVERED">تم التسليم</SelectItem>
                            <SelectItem value="INSTALLED">تم التركيب</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 3: SYNC VISUALIZATION (KEY DIFFERENTIATOR) */}
        {/* ======================================================== */}
        <TabsContent value="sync" className="space-y-6">
          <Card className="border-t-4 border-t-[#c5a975] shadow-sm bg-gradient-to-br from-white to-amber-50/30">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg font-black text-[#0f172a] flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#c5a975]" />
                    محرك التزامن الذكي (Furniture Sync Engine)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-600 mt-1">
                    حساب المسار الحرج (Critical Path) لتزامن خروج كل قطع الأثاث من مختلف المصانع في وقت واحد
                  </CardDescription>
                </div>

                {project.syncDate && (
                  <div className="bg-[#0f172a] text-white px-4 py-2 rounded-lg text-right shadow-sm shrink-0">
                    <div className="text-[10px] text-[#c5a975] font-bold">
                      تاريخ المزامنة المعتمد
                    </div>
                    <div className="text-base font-black">
                      {formatDate(project.syncDate)}
                    </div>
                    <div className="text-[10px] text-slate-300">
                      متبقي {daysUntil(project.syncDate)} يوم
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Sync Overview Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-md border border-amber-200">
                <div>
                  <div className="text-xs text-slate-500">أطول مدة تصنيع (المسار الحرج)</div>
                  <div className="text-xl font-black text-amber-800 mt-1">
                    {maxLeadTime} يوم
                  </div>
                </div>
                <div className="border-r border-slate-100">
                  <div className="text-xs text-slate-500">أيام العازل الزمني (Buffer)</div>
                  <div className="text-xl font-black text-blue-700 mt-1">
                    + 2 يوم أمان
                  </div>
                </div>
                <div className="border-r border-slate-100">
                  <div className="text-xs text-slate-500">المصانع المشتركة في المشروع</div>
                  <div className="text-xl font-black text-slate-800 mt-1">
                    {
                      new Set(
                        project.items
                          .map((i) => i.catalogItem.supplier?.name)
                          .filter(Boolean)
                      ).size
                    }{" "}
                    مصانع
                  </div>
                </div>
              </div>

              {/* Visual Gantt Bar Charts */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  مخطط التزامن الزمني لكل قطعة
                </h4>

                {project.items?.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    أضف بنوداً إلى المشروع لعرض المخطط الزمني
                  </p>
                ) : (
                  <div className="space-y-3">
                    {project.items.map((item) => {
                      const lead =
                        item.leadTimeDays || item.catalogItem?.leadTimeDays || 7;
                      const isCritical = lead === maxLeadTime && maxLeadTime > 0;
                      const percentage =
                        maxLeadTime > 0 ? (lead / maxLeadTime) * 100 : 50;

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-lg border transition-all ${
                            isCritical
                              ? "bg-amber-50/80 border-amber-300 shadow-sm ring-1 ring-amber-400"
                              : "bg-white border-slate-200"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs mb-2 gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">
                                {item.catalogItem.nameAr}
                              </span>
                              <span className="text-slate-500">
                                (المورد: {item.catalogItem.supplier?.name || "عام"})
                              </span>
                              {isCritical && (
                                <Badge className="bg-amber-600 text-white text-[10px] py-0 px-1.5 font-bold animate-pulse">
                                  ⚡ المسار الحرج (الأطول)
                                </Badge>
                              )}
                            </div>
                            <span className="font-bold text-slate-700">
                              {lead} يوم عمل
                            </span>
                          </div>

                          {/* Progress Bar Visual */}
                          <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden flex">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isCritical
                                  ? "bg-gradient-to-r from-amber-500 to-orange-500"
                                  : "bg-[#0f172a]"
                              }`}
                              style={{ width: `${Math.max(percentage, 8)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sync Explanation Box */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-900 leading-relaxed flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-1">
                    كيف يضمن محرك التزامن كفاءة التسليم؟
                  </span>
                  يقوم النظام بحساب زمن تصنيع كل قطعة على حدة وفقاً لقدرات كل مصنع.
                  ثم يجدول أوامر الشحن بحيث تصل جميع القطع معاً في يوم المزامنة المحدد (
                  {formatDate(project.syncDate)})، لتفادي تكاليف التخزين المزدوجة وضمان
                  تركيب الموقع بالكامل دفعة واحدة.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 4: SUPPLIERS & FACTORY ORDERS */}
        {/* ======================================================== */}
        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0f172a]">
              أوامر التوريد للمصانع والموردين
            </h3>
            {project.status === "APPROVED" && (
              <Button
                size="sm"
                onClick={handleDispatchProject}
                disabled={dispatching}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                تفعيل وإرسال أوامر التوريد
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {project.supplierOrders?.length === 0 ? (
              <div className="md:col-span-2 p-8 bg-white rounded-md border border-slate-200 text-center text-slate-500 text-sm">
                لم يتم إرسال أوامر توريد للمصانع بعد. يتم إنشاء الأوامر تلقائياً عند النقر على &quot;تفعيل التصنيع&quot;.
              </div>
            ) : (
              project.supplierOrders.map((order) => (
                <Card key={order.id} className="shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-900">
                        {order.supplier.name}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500 mt-0.5">
                        {order.supplier.specialization || "توريدات أثاث"} • هاتف:{" "}
                        {order.supplier.phone}
                      </CardDescription>
                    </div>
                    <Badge className={`text-xs ${getStatusColor(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">تاريخ الطلب:</span>
                      <span className="font-semibold text-slate-800">
                        {formatDate(order.orderDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">التسليم المتوقع:</span>
                      <span className="font-semibold text-amber-700">
                        {formatDate(order.expectedDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">قيمة التوريد:</span>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(order.totalAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">المدفوع للمورد:</span>
                      <span className="font-bold text-emerald-700">
                        {formatCurrency(order.amountPaid)}
                      </span>
                    </div>

                    {order.items && order.items.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-slate-500 font-bold block mb-1">
                          الأصناف المسندة لهذا المصنع ({order.items.length}):
                        </span>
                        <ul className="list-disc list-inside text-slate-700 space-y-0.5">
                          {order.items.map((it) => (
                            <li key={it.id}>
                              {it.projectItem.catalogItem.nameAr} (عدد: {it.quantity})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 5: PAYMENTS */}
        {/* ======================================================== */}
        <TabsContent value="payments" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0f172a]">
              سجل الدفعات والمقبوضات
            </h3>

            <Dialog open={isAddPaymentOpen} onOpenChange={(open) => { if (!paymentInFlight.current) setIsAddPaymentOpen(open); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CreditCard className="w-4 h-4 ml-1.5" />
                  تسجيل دفعة جديدة
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-[#0f172a]">
                    تسجيل دفعة مالية
                  </DialogTitle>
                  <DialogDescription>
                    إضافة إيصال أو تحويل بنكي لحساب هذا المشروع
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAddPayment} className="space-y-4 py-2">
                  {paymentError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{paymentError}</p>}
                  <div className="space-y-1.5">
                    <Label htmlFor="paymentAmount" className="text-xs font-bold">
                      مبلغ الدفعة (ج.م) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="paymentAmount"
                      type="text"
                      inputMode="decimal"
                      disabled={addingPayment}
                      placeholder="مثال: 50000"
                      value={paymentFormData.amount}
                      onChange={(e) =>
                        setPaymentFormData({ ...paymentFormData, amount: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="paymentMethod" className="text-xs font-bold">
                      طريقة الدفع
                    </Label>
                    <Select
                      value={paymentFormData.method}
                      disabled={addingPayment}
                      onValueChange={(val) =>
                        setPaymentFormData({ ...paymentFormData, method: val })
                      }
                    >
                      <SelectTrigger id="paymentMethod">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">نقدي (Cash)</SelectItem>
                        <SelectItem value="BANK_TRANSFER">تحويل بنكي</SelectItem>
                        <SelectItem value="CHECK">شيك مصرفي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="paymentDate" className="text-xs font-bold">
                      تاريخ التحصيل
                    </Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      disabled={addingPayment}
                      value={paymentFormData.date}
                      onChange={(e) =>
                        setPaymentFormData({ ...paymentFormData, date: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="paymentNotes" className="text-xs font-bold">
                      ملاحظات أو رقم الإيصال / الشيك
                    </Label>
                    <Input
                      id="paymentNotes"
                      disabled={addingPayment}
                      maxLength={2000}
                      placeholder="إيصال رقم 1045..."
                      value={paymentFormData.notes}
                      onChange={(e) =>
                        setPaymentFormData({ ...paymentFormData, notes: e.target.value })
                      }
                    />
                  </div>

                  <DialogFooter className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddPaymentOpen(false)}
                      disabled={addingPayment}
                    >
                      إلغاء
                    </Button>
                    <Button
                      type="submit"
                      disabled={addingPayment}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {addingPayment ? "جاري الحفظ..." : "حفظ الدفعة"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
            {project.payments?.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                لم يتم تسجيل أي دفعات لهذا المشروع بعد.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المبلغ المحصل</TableHead>
                    <TableHead>طريقة السداد</TableHead>
                    <TableHead>الملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {project.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold text-xs text-slate-800">
                        {formatDate(p.date)}
                      </TableCell>
                      <TableCell className="font-bold text-sm text-emerald-700">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs bg-slate-100">
                          {getStatusLabel(p.method)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {p.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 6: TASKS */}
        {/* ======================================================== */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0f172a]">
              مهام ومتابعات المشروع
            </h3>

            <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[#0f172a] hover:bg-[#162d4a] text-white">
                  <Plus className="w-4 h-4 ml-1.5 text-[#c5a975]" />
                  مهمة جديدة
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-[#0f172a]">
                    إضافة مهمة جديدة للمشروع
                  </DialogTitle>
                  <DialogDescription>
                    جدولة مهمة للمتابعة مع المصنع أو فني التركيبات
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAddTask} className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="taskTitle" className="text-xs font-bold">
                      عنوان المهمة <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="taskTitle"
                      placeholder="مثال: مراجعة عينة الأقمشة مع العميل"
                      value={taskFormData.title}
                      onChange={(e) =>
                        setTaskFormData({ ...taskFormData, title: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="taskType" className="text-xs font-bold">
                        نوع المهمة
                      </Label>
                      <Select
                        value={taskFormData.type}
                        onValueChange={(val) =>
                          setTaskFormData({ ...taskFormData, type: val })
                        }
                      >
                        <SelectTrigger id="taskType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SUPPLIER_FOLLOWUP">متابعة موردين</SelectItem>
                          <SelectItem value="DESIGN">تصميم 3D</SelectItem>
                          <SelectItem value="INSTALLATION">تركيب بالموقع</SelectItem>
                          <SelectItem value="INSPECTION">معاينة</SelectItem>
                          <SelectItem value="DELIVERY">توصيل وشحن</SelectItem>
                          <SelectItem value="GENERAL">عام</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="taskPriority" className="text-xs font-bold">
                        الأولوية
                      </Label>
                      <Select
                        value={taskFormData.priority}
                        onValueChange={(val) =>
                          setTaskFormData({ ...taskFormData, priority: val })
                        }
                      >
                        <SelectTrigger id="taskPriority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">منخفضة</SelectItem>
                          <SelectItem value="MEDIUM">متوسطة</SelectItem>
                          <SelectItem value="HIGH">عالية</SelectItem>
                          <SelectItem value="URGENT">عاجل</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="taskDueDate" className="text-xs font-bold">
                      تاريخ الاستحقاق
                    </Label>
                    <Input
                      id="taskDueDate"
                      type="date"
                      value={taskFormData.dueDate}
                      onChange={(e) =>
                        setTaskFormData({ ...taskFormData, dueDate: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="taskDesc" className="text-xs font-bold">
                      التفاصيل
                    </Label>
                    <Textarea
                      id="taskDesc"
                      placeholder="تفاصيل إضافية عن المهمة..."
                      rows={2}
                      value={taskFormData.description}
                      onChange={(e) =>
                        setTaskFormData({ ...taskFormData, description: e.target.value })
                      }
                    />
                  </div>

                  <DialogFooter className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddTaskOpen(false)}
                    >
                      إلغاء
                    </Button>
                    <Button
                      type="submit"
                      disabled={addingTask}
                      className="bg-[#0f172a] hover:bg-[#162d4a] text-white"
                    >
                      {addingTask ? "جاري الإضافة..." : "حفظ المهمة"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
            {project.tasks?.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                لا توجد مهام مسجلة لهذا المشروع.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>المهمة</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>تاريخ الاستحقاق</TableHead>
                    <TableHead>الفني المسند إليه</TableHead>
                    <TableHead>الأولوية</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {project.tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                          <span>{getTaskTypeIcon(task.type)}</span>
                          <span>{task.title}</span>
                        </div>
                        {task.description && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {task.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {getStatusLabel(task.type)}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-800">
                        {formatDate(task.dueDate)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {task.technician ? task.technician.name : "غير مسند"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${getPriorityColor(task.priority)}`}
                        >
                          {getStatusLabel(task.priority)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${getStatusColor(task.status)}`}
                        >
                          {getStatusLabel(task.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}




