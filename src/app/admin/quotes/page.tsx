"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Search,
  ArrowRight,
  Sparkles,
  Phone,
  Mail,
  Building,
  Calendar,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  FolderKanban,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";

interface QuoteItem {
  id: number;
  clientName: string;
  clientEmail?: string | null;
  clientPhone: string;
  company?: string | null;
  message?: string | null;
  status: string;
  totalEstimate: number;
  createdAt: string;
  items: Array<{
    id: number;
    catalogItemId: number;
    quantity: number;
    catalogItem: {
      id: number;
      nameAr: string;
      sku: string;
      sellingPrice: number;
      category?: { nameAr: string } | null;
      supplier?: { name: string } | null;
    };
  }>;
}

export default function QuotesPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedQuoteId, setExpandedQuoteId] = useState<number | null>(null);

  // Conversion Dialog State
  const [convertingQuote, setConvertingQuote] = useState<QuoteItem | null>(null);
  const [convertTitle, setConvertTitle] = useState("");
  const [convertType, setConvertType] = useState("LARGE_PROJECT");
  const [isConverting, setIsConverting] = useState(false);

  const fetchQuotes = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/quotes";
      const params = new URLSearchParams();
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
      if (!res.ok) throw new Error("فشل في تحميل طلبات عروض الأسعار");
      const data = await res.json();
      setQuotes(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQuotes();
  };

  const handleStatusChange = async (quoteId: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("فشل في تحديث الحالة");
      fetchQuotes();
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء تحديث حالة العرض");
    }
  };

  const openConvertModal = (quote: QuoteItem) => {
    setConvertingQuote(quote);
    setConvertTitle(
      `مشروع ${quote.company ? quote.company + " - " : ""}${quote.clientName}`
    );
    setConvertType(
      quote.items && quote.items.length > 3 ? "LARGE_PROJECT" : "SIMPLE_ORDER"
    );
  };

  const handleConvertSubmit = async () => {
    if (!convertingQuote) return;
    setIsConverting(true);
    try {
      const res = await fetch(`/api/quotes/${convertingQuote.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectTitle: convertTitle,
          projectType: convertType,
          priority: "HIGH",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "فشل في تحويل العرض إلى مشروع");
      }

      setConvertingQuote(null);
      alert("تم تحويل عرض السعر إلى مشروع بنجاح!");
      if (data.project?.id) {
        router.push(`/admin/projects/${data.project.id}`);
      } else {
        fetchQuotes();
      }
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء التحويل");
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#0f172a]">
            طلبات عروض الأسعار
          </h2>
          <p className="text-sm text-slate-600">
            متابعة استفسارات وسلات التسعير الواردة من عملاء المتجر الإلكتروني
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchQuotes}
          className="border-slate-300"
        >
          <RefreshCw className="w-4 h-4 ml-1.5" />
          تحديث القائمة
        </Button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="bg-white p-4 rounded-md border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <Tabs
            value={statusFilter}
            onValueChange={setStatusFilter}
            className="w-full lg:w-auto overflow-x-auto"
          >
            <TabsList className="bg-slate-100 p-1 inline-flex w-max">
              <TabsTrigger value="ALL" className="text-xs">
                الكل ({quotes.length})
              </TabsTrigger>
              <TabsTrigger value="NEW" className="text-xs">
                جديد (NEW)
              </TabsTrigger>
              <TabsTrigger value="CONTACTED" className="text-xs">
                تم التواصل
              </TabsTrigger>
              <TabsTrigger value="QUOTED" className="text-xs">
                تم التسعير
              </TabsTrigger>
              <TabsTrigger value="CONVERTED" className="text-xs">
                تم التحويل لمشروع
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center gap-2 max-w-md w-full"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder="بحث باسم العميل، الشركة، الهاتف..."
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
      </div>

      {/* Quotes Table */}
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#0f172a] mb-3" />
            <p className="text-sm font-medium">جاري تحميل عروض الأسعار...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchQuotes} className="mt-4">
              إعادة المحاولة
            </Button>
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-bold text-slate-700">
              لا توجد طلبات عروض أسعار
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              ستظهر هنا أي طلبات أسعار جديدة يقوم زوار المتجر بإرسالها.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>العميل والشركة</TableHead>
                <TableHead>الهاتف والبريد</TableHead>
                <TableHead className="text-center">عدد الأصناف</TableHead>
                <TableHead className="text-left">التقدير المالي</TableHead>
                <TableHead>تاريخ الطلب</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-center">إجراءات التحويل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {quotes.map((quote) => {
                const isExpanded = expandedQuoteId === quote.id;
                const isConverted = quote.status === "CONVERTED";

                return (
                  <React.Fragment key={quote.id}>
                    <TableRow className="hover:bg-slate-50/80 transition-colors">
                      {/* Expand Toggle */}
                      <TableCell>
                        <button
                          onClick={() =>
                            setExpandedQuoteId(isExpanded ? null : quote.id)
                          }
                          className="p-1 text-slate-400 hover:text-slate-700 rounded"
                          title="عرض تفاصيل الأصناف"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </TableCell>

                      {/* Client & Company */}
                      <TableCell>
                        <div className="font-bold text-sm text-slate-900">
                          {quote.clientName}
                        </div>
                        {quote.company && (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building className="w-3 h-3 text-slate-400" />
                            {quote.company}
                          </div>
                        )}
                      </TableCell>

                      {/* Phone & Email */}
                      <TableCell>
                        <div className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-[#c5a975]" />
                          {quote.clientPhone}
                        </div>
                        {quote.clientEmail && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 text-slate-400" />
                            {quote.clientEmail}
                          </div>
                        )}
                      </TableCell>

                      {/* Items Count */}
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs bg-slate-100">
                          {quote.items?.length || 0} قطع
                        </Badge>
                      </TableCell>

                      {/* Total Estimate */}
                      <TableCell className="text-left font-bold text-sm text-[#0f172a]">
                        {quote.totalEstimate > 0
                          ? formatCurrency(quote.totalEstimate)
                          : "طلب مخصص"}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="text-xs text-slate-600">
                        {formatDate(quote.createdAt)}
                      </TableCell>

                      {/* Status Dropdown */}
                      <TableCell className="text-center">
                        <Select
                          value={quote.status}
                          onValueChange={(val) => handleStatusChange(quote.id, val)}
                          disabled={isConverted}
                        >
                          <SelectTrigger className="h-7 text-xs w-32 mx-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NEW">جديد (NEW)</SelectItem>
                            <SelectItem value="CONTACTED">تم التواصل</SelectItem>
                            <SelectItem value="QUOTED">تم التسعير</SelectItem>
                            <SelectItem value="CONVERTED">تم التحويل</SelectItem>
                            <SelectItem value="REJECTED">مرفوض</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Convert Button */}
                      <TableCell className="text-center">
                        {isConverted ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[11px]">
                            ✓ تم التحويل
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => openConvertModal(quote)}
                            className="bg-[#0f172a] hover:bg-[#162d4a] text-white text-xs h-8 shadow-sm font-semibold"
                          >
                            <Sparkles className="w-3.5 h-3.5 ml-1 text-[#c5a975]" />
                            تحويل لمشروع
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Expanded Items Drawer Row */}
                    {isExpanded && (
                      <TableRow className="bg-slate-50/80">
                        <TableCell colSpan={8} className="p-4">
                          <div className="bg-white p-4 rounded-md border border-slate-200 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-[#0f172a] uppercase tracking-wider">
                                الأصناف المطلوبة في هذا العرض
                              </h4>
                              {quote.message && (
                                <p className="text-xs text-slate-600 bg-amber-50 px-2.5 py-1 rounded border border-amber-200 max-w-lg">
                                  <strong>رسالة العميل:</strong> {quote.message}
                                </p>
                              )}
                            </div>

                            {quote.items?.length === 0 ? (
                              <p className="text-xs text-slate-400 py-2">
                                لم يتم تضمين أي أصناف محددة بالطلب (استفسار مباشر).
                              </p>
                            ) : (
                              <div className="divide-y divide-slate-100 border rounded-lg overflow-hidden">
                                {quote.items.map((item) => (
                                  <div
                                    key={item.id}
                                    className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded bg-[#0f172a] text-white flex items-center justify-center font-bold text-[10px]">
                                        {item.catalogItem?.category?.nameAr?.slice(0, 2) || "أث"}
                                      </div>
                                      <div>
                                        <div className="font-bold text-slate-800">
                                          {item.catalogItem?.nameAr}
                                        </div>
                                        <div className="text-[11px] text-slate-500 font-mono">
                                          كود: {item.catalogItem?.sku} • المورد:{" "}
                                          {item.catalogItem?.supplier?.name || "عام"}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                      <span className="text-slate-600">
                                        الكمية: <strong>{item.quantity}</strong>
                                      </span>
                                      <span className="text-slate-600">
                                        سعر الوحدة:{" "}
                                        {formatCurrency(
                                          item.catalogItem?.sellingPrice || 0
                                        )}
                                      </span>
                                      <span className="font-bold text-slate-900">
                                        الإجمالي:{" "}
                                        {formatCurrency(
                                          (item.catalogItem?.sellingPrice || 0) *
                                            item.quantity
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Convert to Project Dialog */}
      <Dialog
        open={!!convertingQuote}
        onOpenChange={(open) => !open && setConvertingQuote(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0f172a] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#c5a975]" />
              تحويل عرض السعر إلى مشروع معتمد
            </DialogTitle>
            <DialogDescription className="text-xs">
              سيتم إنشاء مشروع جديد، وربط العميل والبنود، ونقله مباشرة لحالة
              &quot;معتمد&quot; تمهيداً للتصنيع.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="convertTitle" className="text-xs font-bold">
                عنوان المشروع
              </Label>
              <Input
                id="convertTitle"
                value={convertTitle}
                onChange={(e) => setConvertTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="convertType" className="text-xs font-bold">
                نوع المشروع
              </Label>
              <Select value={convertType} onValueChange={setConvertType}>
                <SelectTrigger id="convertType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LARGE_PROJECT">مشروع كبير متكامل</SelectItem>
                  <SelectItem value="SIMPLE_ORDER">طلب بسيط ومباشر</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1 text-slate-700">
              <div>
                <strong>العميل:</strong> {convertingQuote?.clientName}
              </div>
              <div>
                <strong>الهاتف:</strong> {convertingQuote?.clientPhone}
              </div>
              <div>
                <strong>إجمالي التقدير:</strong>{" "}
                {formatCurrency(convertingQuote?.totalEstimate || 0)}
              </div>
              <div>
                <strong>عدد البنود:</strong> {convertingQuote?.items?.length || 0} قطع
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConvertingQuote(null)}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              disabled={isConverting}
              onClick={handleConvertSubmit}
              className="bg-[#0f172a] hover:bg-[#162d4a] text-white"
            >
              {isConverting ? "جاري التحويل..." : "تأكيد التحويل والانتقال للمشروع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
