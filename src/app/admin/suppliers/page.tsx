"use client";

import React, { useEffect, useState } from "react";
import {
  Factory,
  Plus,
  Search,
  Star,
  Phone,
  Mail,
  MapPin,
  User,
  ShoppingBag,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Clock,
  Eye,
  DollarSign,
  Edit,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";

interface SupplierItem {
  id: number;
  name: string;
  contactPerson?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  specialization?: string | null;
  qualityRating: number;
  deliveryRating: number;
  notes?: string | null;
  isActive: boolean;
  activeOrdersCount: number;
  totalActiveAmount: number;
  totalActivePaid: number;
  totalActiveRemaining: number;
  _count?: {
    catalogItems: number;
    supplierOrders: number;
  };
}

interface SupplierDetailData extends SupplierItem {
  supplierOrders: Array<{
    id: number;
    status: string;
    orderDate: string;
    expectedDate?: string | null;
    totalAmount: number;
    amountPaid: number;
    project: {
      id: number;
      title: string;
      client: { name: string; phone: string };
    };
    items: Array<{
      id: number;
      quantity: number;
      projectItem: {
        catalogItem: { nameAr: string; sku: string };
      };
    }>;
  }>;
  catalogItems: Array<{
    id: number;
    nameAr: string;
    sku: string;
    costPrice: number;
    sellingPrice: number;
    category?: { nameAr: string };
  }>;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Add / Edit Supplier Dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete Supplier Dialog
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  
  const defaultFormData = {
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    specialization: "مصنع للأثاث المكتبي",
    qualityRating: 5,
    deliveryRating: 5,
    notes: "",
  };
  
  const [formData, setFormData] = useState(defaultFormData);

  // Supplier Details Modal
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchSuppliers = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/suppliers?active=true";
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error("فشل في استيراد الموردين");
      const data = await res.json();
      setSuppliers(data);
    } catch (err: any) {
      setError(err.message || "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSuppliers();
  };

  const openAddSupplier = () => {
    setEditingId(null);
    setFormData(defaultFormData);
    setIsAddOpen(true);
  };

  const openEditSupplier = (supplier: SupplierItem) => {
    setEditingId(supplier.id);
    setFormData({
      name: supplier.name,
      contactPerson: supplier.contactPerson || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      specialization: supplier.specialization || defaultFormData.specialization,
      qualityRating: supplier.qualityRating,
      deliveryRating: supplier.deliveryRating,
      notes: supplier.notes || "",
    });
    setIsAddOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert("الرجاء ملء الحقول الإلزامية: اسم المصنع ورقم الهاتف");
      return;
    }

    setSubmitting(true);
    try {
      const url = editingId ? `/api/suppliers/${editingId}` : "/api/suppliers";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "فشل في حفظ المورد");
      }

      setIsAddOpen(false);
      setFormData(defaultFormData);
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message || "حدث خطأ");
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteSupplier = (id: number) => {
    setDeletingId(id);
    setIsDeleteOpen(true);
  };

  const handleDeleteSupplier = async () => {
    if (!deletingId) return;
    
    setSubmitting(true);
    try {
      const res = await fetch(`/api/suppliers/${deletingId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "فشل في حذف المورد");
      }

      setIsDeleteOpen(false);
      setDeletingId(null);
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message || "حدث خطأ");
    } finally {
      setSubmitting(false);
    }
  };

  const openSupplierDetail = async (supplierId: number) => {
    setIsDetailOpen(true);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`);
      if (!res.ok) throw new Error("فشل في تحميل بيانات المورد");
      const data = await res.json();
      setSelectedSupplier(data);
    } catch (err: any) {
      alert(err.message || "حدث خطأ");
      setIsDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5 text-amber-500">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 ${
              i <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200"
            }`}
          />
        ))}
        <span className="text-[11px] text-slate-500 font-bold mr-1">
          {rating}/5
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#0f172a]">
            المصانع والموردين
          </h2>
          <p className="text-sm text-slate-600">
            إدارة شبكة المصانع الشريكة، تقييم الجودة، ومتابعة أوامر التوريد
          </p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddSupplier} className="bg-[#0f172a] hover:bg-[#162d4a] text-white shadow">
              <Plus className="w-4 h-4 ml-1.5 text-[#c5a975]" />
              إضافة مورد / مصنع جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#0f172a]">
                إضافة مورد أو مصنع جديد
              </DialogTitle>
              <DialogDescription>
                تسجيل بيانات المصنع وتخصصه وتقييمات الالتزام
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveSupplier} className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="supName" className="text-xs font-bold">
                    اسم المصنع / المورد <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="supName"
                    placeholder="مثال: مصنع الأهرام للأثاث المكتبي"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactPerson" className="text-xs font-bold">
                    المسؤول / جهة الاتصال
                  </Label>
                  <Input
                    id="contactPerson"
                    placeholder="م/ محمود حسن"
                    value={formData.contactPerson}
                    onChange={(e) =>
                      setFormData({ ...formData, contactPerson: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="supPhone" className="text-xs font-bold">
                    رقم الهاتف <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="supPhone"
                    placeholder="01112233445"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="supSpecial" className="text-xs font-bold">
                    التخصص الأساسي
                  </Label>
                  <Select
                    value={formData.specialization}
                    onValueChange={(val) =>
                      setFormData({ ...formData, specialization: val })
                    }
                  >
                    <SelectTrigger id="supSpecial">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="أعمال خشبية ومكاتب">
                        أعمال خشبية ومكاتب
                      </SelectItem>
                      <SelectItem value="كراسي وشبك طبي">
                        كراسي وشبك طبي
                      </SelectItem>
                      <SelectItem value="قواطع ألومنيوم وزجاج">
                        قواطع ألومنيوم وزجاج
                      </SelectItem>
                      <SelectItem value="تنجيد وجلود">تنجيد وجلود</SelectItem>
                      <SelectItem value="أثاث معدني ووحدات تخزين">
                        أثاث معدني ووحدات تخزين
                      </SelectItem>
                      <SelectItem value="إكسسوارات ومقابض">
                        إكسسوارات ومقابض
                      </SelectItem>
                      <SelectItem value="كراسى جلد">كراسى جلد</SelectItem>
                      <SelectItem value="كنب فايبر">كنب فايبر</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="supEmail" className="text-xs font-bold">
                    البريد الإلكتروني
                  </Label>
                  <Input
                    id="supEmail"
                    type="email"
                    placeholder="factory@domain.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="supAddress" className="text-xs font-bold">
                    عنوان المصنع / المنطقة الصناعية
                  </Label>
                  <Input
                    id="supAddress"
                    placeholder="المنطقة الصناعية الثالثة، مدينة 6 أكتوبر"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="qualityRating" className="text-xs font-bold">
                    تقييم الجودة (من 1 إلى 5)
                  </Label>
                  <Select
                    value={String(formData.qualityRating)}
                    onValueChange={(val) =>
                      setFormData({ ...formData, qualityRating: parseInt(val, 10) })
                    }
                  >
                    <SelectTrigger id="qualityRating">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">⭐⭐⭐⭐⭐ 5 نجوم (ممتاز)</SelectItem>
                      <SelectItem value="4">⭐⭐⭐⭐ 4 نجوم (جيد جداً)</SelectItem>
                      <SelectItem value="3">⭐⭐⭐ 3 نجوم (متوسط)</SelectItem>
                      <SelectItem value="2">⭐⭐ 2 نجوم (مقبول)</SelectItem>
                      <SelectItem value="1">⭐ 1 نجمة (ضعيف)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="deliveryRating" className="text-xs font-bold">
                    تقييم الالتزام بالمواعيد (من 1 إلى 5)
                  </Label>
                  <Select
                    value={String(formData.deliveryRating)}
                    onValueChange={(val) =>
                      setFormData({ ...formData, deliveryRating: parseInt(val, 10) })
                    }
                  >
                    <SelectTrigger id="deliveryRating">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">⭐⭐⭐⭐⭐ 5 نجوم (دقة تامة)</SelectItem>
                      <SelectItem value="4">⭐⭐⭐⭐ 4 نجوم (التزام عالي)</SelectItem>
                      <SelectItem value="3">⭐⭐⭐ 3 نجوم (تأخير معتاد)</SelectItem>
                      <SelectItem value="2">⭐⭐ 2 نجوم (تأخير متكرر)</SelectItem>
                      <SelectItem value="1">⭐ 1 نجمة (غير ملتزم)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="supNotes" className="text-xs font-bold">
                    ملاحظات
                  </Label>
                  <Textarea
                    id="supNotes"
                    placeholder="شروط الدفع، الخصومات المتفق عليها..."
                    rows={2}
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddOpen(false)}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#0f172a] hover:bg-[#162d4a] text-white"
                >
                  {submitting ? "جاري الحفظ..." : "حفظ المورد"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-md border border-slate-200 shadow-sm">
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-2 max-w-md"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="بحث باسم المصنع، المسؤول، الهاتف، التخصص..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 text-xs"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="text-xs">
            بحث
          </Button>
        </form>
      </div>

      {/* Suppliers Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#0f172a] mb-3" />
          <p className="text-sm font-medium">جاري تحميل شبكة المصانع...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-600 bg-white rounded-md border border-red-200">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSuppliers}
            className="mt-4"
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-md border border-slate-200">
          <Factory className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-700">لا يوجد موردين</h3>
          <p className="text-xs text-slate-500 mt-1">
            أضف الموردين لربطهم بالأصناف وحساب جداول المزامنة
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {suppliers.map((sup) => (
            <Card
              key={sup.id}
              className="shadow-sm hover:shadow-sm transition-all cursor-pointer border-slate-200 flex flex-col justify-between"
              onClick={() => openSupplierDetail(sup.id)}
            >
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-bold text-[#0f172a] hover:text-[#c5a975] transition-colors">
                      {sup.name}
                    </CardTitle>
                    <Badge
                      variant="secondary"
                      className="text-[11px] mt-1.5 font-normal bg-blue-50 text-[#0f172a]"
                    >
                      {sup.specialization || "توريدات عامة"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => openEditSupplier(sup)} className="h-8 w-8 text-slate-400 hover:text-emerald-600">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openDeleteSupplier(sup.id)} className="h-8 w-8 text-slate-400 hover:text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-3 text-xs flex-1">
                {/* Ratings */}
                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">جودة التشطيب:</span>
                    {renderStars(sup.qualityRating)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">الالتزام بالمواعيد:</span>
                    {renderStars(sup.deliveryRating)}
                  </div>
                </div>

                {/* Contact Info */}
                <div className="space-y-1 text-slate-600">
                  {sup.contactPerson && (
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{sup.contactPerson}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                    <Phone className="w-3.5 h-3.5 text-[#c5a975]" />
                    <span>{sup.phone}</span>
                  </div>
                  {sup.address && (
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{sup.address}</span>
                    </div>
                  )}
                </div>

                {/* Active Orders Count & Stats */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500">الأوامر النشطة حالياً:</span>
                  <Badge
                    variant={sup.activeOrdersCount > 0 ? "default" : "secondary"}
                    className={
                      sup.activeOrdersCount > 0
                        ? "bg-amber-600 text-white font-bold"
                        : "bg-slate-100 text-slate-600"
                    }
                  >
                    {sup.activeOrdersCount} أمر تصنيع
                  </Badge>
                </div>
              </CardContent>

              <CardFooter className="pt-2 pb-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-[11px] text-slate-500">
                  منتجات الكتالوج: {sup._count?.catalogItems || 0}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-[#0f172a] hover:text-[#c5a975] p-0 h-auto"
                >
                  عرض تفاصيل الأوامر
                  <Eye className="w-3.5 h-3.5 mr-1" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Supplier Orders Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {loadingDetail ? (
            <div className="p-8 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#0f172a] mb-2" />
              <p className="text-xs">جاري تحميل بيانات المصنع وأوامر التوريد...</p>
            </div>
          ) : selectedSupplier ? (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-lg font-black text-[#0f172a]">
                      {selectedSupplier.name}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      {selectedSupplier.specialization} • هاتف: {selectedSupplier.phone}
                    </DialogDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {selectedSupplier.supplierOrders?.length || 0} أوامر توريد مسجلة
                  </Badge>
                </div>
              </DialogHeader>

              {/* Financial summary for this supplier */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg text-center text-xs">
                <div>
                  <span className="text-slate-500 block">إجمالي التعاملات</span>
                  <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                    {formatCurrency(
                      selectedSupplier.supplierOrders?.reduce(
                        (sum, o) => sum + o.totalAmount,
                        0
                      ) || 0
                    )}
                  </span>
                </div>
                <div className="border-r border-slate-200">
                  <span className="text-slate-500 block">المسدد للمورد</span>
                  <span className="font-bold text-emerald-700 text-sm mt-0.5 block">
                    {formatCurrency(
                      selectedSupplier.supplierOrders?.reduce(
                        (sum, o) => sum + o.amountPaid,
                        0
                      ) || 0
                    )}
                  </span>
                </div>
                <div className="border-r border-slate-200">
                  <span className="text-slate-500 block">المتبقي له</span>
                  <span className="font-bold text-amber-700 text-sm mt-0.5 block">
                    {formatCurrency(
                      (selectedSupplier.supplierOrders?.reduce(
                        (sum, o) => sum + o.totalAmount,
                        0
                      ) || 0) -
                        (selectedSupplier.supplierOrders?.reduce(
                          (sum, o) => sum + o.amountPaid,
                          0
                        ) || 0)
                    )}
                  </span>
                </div>
              </div>

              {/* Supplier Orders Table */}
              <div>
                <h4 className="text-xs font-bold text-[#0f172a] uppercase tracking-wider mb-2">
                  سجل أوامر التوريد للمشاريع
                </h4>
                {selectedSupplier.supplierOrders?.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs border rounded-lg">
                    لا توجد أوامر توريد مسندة لهذا المصنع حالياً
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50 text-xs">
                        <TableRow>
                          <TableHead>المشروع / العميل</TableHead>
                          <TableHead>تاريخ الطلب</TableHead>
                          <TableHead>التسليم المتوقع</TableHead>
                          <TableHead className="text-left">القيمة</TableHead>
                          <TableHead className="text-center">الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs divide-y divide-slate-100">
                        {selectedSupplier.supplierOrders?.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell>
                              <div className="font-bold text-slate-900">
                                {order.project.title}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                العميل: {order.project.client.name}
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(order.orderDate)}</TableCell>
                            <TableCell className="font-semibold text-amber-700">
                              {formatDate(order.expectedDate)}
                            </TableCell>
                            <TableCell className="text-left font-bold text-slate-900">
                              {formatCurrency(order.totalAmount)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${getStatusColor(order.status)}`}
                              >
                                {getStatusLabel(order.status)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                  إغلاق
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0f172a]">
              ????? ??? ??????
            </DialogTitle>
            <DialogDescription className="text-rose-600">
              ?? ??? ????? ?? ??? ??? ??????? ???? ?????? ?? ????? ???????? ???? ????? ??????? ???????? ????????? ???????? ?????? ??????.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2 gap-2 sm:justify-start">
            <Button
              variant="destructive"
              disabled={submitting}
              onClick={handleDeleteSupplier}
            >
              {submitting ? "???? ?????..." : "???? ???? ??????"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteOpen(false)}
            >
              ?????
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



