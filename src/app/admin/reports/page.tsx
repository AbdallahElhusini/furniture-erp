"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart3,
  Download,
  Calendar,
  DollarSign,
  TrendingUp,
  Factory,
  Building,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  Coins,
  FileSpreadsheet,
  Layers,
  ArrowUpRight,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";

interface RevenueReportData {
  summary: {
    totalProjects: number;
    totalRevenue: number;
    totalCost: number;
    totalPaid: number;
    totalRemaining: number;
    totalProfit: number;
  };
  projects: Array<{
    id: number;
    projectTitle: string;
    clientName: string;
    company: string;
    phone: string;
    type: string;
    status: string;
    statusAr: string;
    totalCost: number;
    totalPrice: number;
    amountPaid: number;
    remaining: number;
    profit: number;
    profitMargin: string;
    createdAt: string;
  }>;
}

interface SupplierCostReportData {
  summary: {
    totalSuppliers: number;
    totalOrders: number;
    totalAmount: number;
    totalPaid: number;
    totalRemaining: number;
  };
  suppliers: Array<{
    id: number;
    name: string;
    contactPerson: string;
    phone: string;
    specialization: string;
    totalOrders: number;
    totalAmount: number;
    amountPaid: number;
    remaining: number;
  }>;
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [revenueReport, setRevenueReport] = useState<RevenueReportData | null>(null);
  const [supplierReport, setSupplierReport] = useState<SupplierCostReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Section collapse states
  const [showSummary, setShowSummary] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showSuppliers, setShowSuppliers] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const queryString = params.toString() ? `?${params.toString()}` : "";

      const [revRes, supRes] = await Promise.all([
        fetch(`/api/reports/revenue${queryString}`),
        fetch(`/api/reports/supplier-costs${queryString}`),
      ]);

      if (!revRes.ok || !supRes.ok) {
        throw new Error("فشل في تحميل التقارير المالية");
      }

      const revData = await revRes.json();
      const supData = await supRes.json();

      setRevenueReport(revData);
      setSupplierReport(supData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء تحميل التقارير");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReports();
  };

  const handleExportExcel = (type: "revenue" | "supplier-costs") => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    params.append("format", "excel");

    const endpoint =
      type === "revenue"
        ? `/api/reports/revenue?${params.toString()}`
        : `/api/reports/supplier-costs?${params.toString()}`;

    window.open(endpoint, "_blank");
  };

  const summary = revenueReport?.summary;
  const profitMarginPercent =
    summary && summary.totalRevenue > 0
      ? ((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1)
      : "0";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#0f172a]">
            التقارير والحسابات المالية
          </h2>
          <p className="text-sm text-slate-600">
            متابعة الإيرادات، تكاليف المصانع، وهوامش الأرباح وتصدير ملفات Excel
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchReports}
          className="border-slate-300"
        >
          <RefreshCw className="w-4 h-4 ml-1.5" />
          تحديث الحسابات
        </Button>
      </div>

      {/* Date Range Picker Bar */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <form
            onSubmit={handleApplyFilter}
            className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1">
                <Label htmlFor="repStart" className="text-xs font-bold text-slate-700">
                  من تاريخ:
                </Label>
                <Input
                  id="repStart"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="repEnd" className="text-xs font-bold text-slate-700">
                  إلى تاريخ:
                </Label>
                <Input
                  id="repEnd"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>

              <Button
                type="submit"
                size="sm"
                className="h-8 text-xs bg-[#0f172a] hover:bg-[#162d4a] text-white mt-auto"
              >
                <Filter className="w-3.5 h-3.5 ml-1" />
                تطبيق الفترة
              </Button>

              {(startDate || endDate) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setTimeout(fetchReports, 50);
                  }}
                  className="h-8 text-xs text-slate-500 hover:text-slate-900 mt-auto"
                >
                  إلغاء الفلتر
                </Button>
              )}
            </div>

            <div className="text-xs text-slate-500">
              {startDate || endDate
                ? `الفترة المحددة: ${startDate || "البداية"} إلى ${endDate || "اليوم"}`
                : "عرض جميع البيانات التاريخية المسجلة"}
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-md border">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#0f172a] mb-3" />
          <p className="text-sm font-medium">جاري احتساب البيانات والتقارير المالية...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-600 bg-white rounded-md border border-red-200">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchReports} className="mt-4">
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ======================================================== */}
          {/* SECTION 1: EXECUTIVE FINANCIAL SUMMARY */}
          {/* ======================================================== */}
          <Card className="shadow-sm border-slate-200 overflow-hidden">
            <CardHeader
              className="bg-slate-50/70 border-b border-slate-200 py-3.5 cursor-pointer flex flex-row items-center justify-between"
              onClick={() => setShowSummary(!showSummary)}
            >
              <div>
                <CardTitle className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#c5a975]" />
                  الملخص المالي العام وهوامش الربحية
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  صافي الأرباح، نسبة التدفقات المحصلة والمتبقية
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500">
                {showSummary ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </CardHeader>

            {showSummary && (
              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Total Revenue */}
                  <div className="p-4 bg-blue-50/60 rounded-md border border-blue-100 space-y-1">
                    <span className="text-xs font-semibold text-blue-900">
                      إجمالي الإيرادات (المبيعات)
                    </span>
                    <div className="text-2xl font-black text-[#0f172a]">
                      {formatCurrency(summary?.totalRevenue || 0)}
                    </div>
                    <span className="text-[11px] text-slate-500 block">
                      إجمالي قيمة {summary?.totalProjects || 0} مشاريع
                    </span>
                  </div>

                  {/* Total Costs */}
                  <div className="p-4 bg-amber-50/60 rounded-md border border-amber-100 space-y-1">
                    <span className="text-xs font-semibold text-amber-900">
                      إجمالي تكاليف التصنيع
                    </span>
                    <div className="text-2xl font-black text-amber-800">
                      {formatCurrency(summary?.totalCost || 0)}
                    </div>
                    <span className="text-[11px] text-slate-500 block">
                      مستحقات المصانع والموردين
                    </span>
                  </div>

                  {/* Net Profit */}
                  <div className="p-4 bg-emerald-50/60 rounded-md border border-emerald-100 space-y-1">
                    <span className="text-xs font-semibold text-emerald-900">
                      صافي الأرباح التقديرية
                    </span>
                    <div className="text-2xl font-black text-emerald-700">
                      {formatCurrency(summary?.totalProfit || 0)}
                    </div>
                    <span className="text-[11px] font-bold text-emerald-600 block">
                      هامش الربح: {profitMarginPercent}%
                    </span>
                  </div>

                  {/* Collections */}
                  <div className="p-4 bg-purple-50/60 rounded-md border border-purple-100 space-y-1">
                    <span className="text-xs font-semibold text-purple-900">
                      المحصل مقابل المتبقي
                    </span>
                    <div className="text-xl font-black text-purple-900">
                      {formatCurrency(summary?.totalPaid || 0)}
                    </div>
                    <span className="text-[11px] text-amber-700 font-bold block">
                      متبقي: {formatCurrency(summary?.totalRemaining || 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* ======================================================== */}
          {/* SECTION 2: CLIENT REVENUE REPORT */}
          {/* ======================================================== */}
          <Card className="shadow-sm border-slate-200 overflow-hidden">
            <CardHeader
              className="bg-slate-50/70 border-b border-slate-200 py-3.5 flex flex-row items-center justify-between"
            >
              <div>
                <CardTitle className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                  <Building className="w-4 h-4 text-blue-600" />
                  تقرير إيرادات ومشاريع العملاء
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  تفاصيل كل مشروع، المبالغ المحصلة والمتبقية والأرباح
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleExportExcel("revenue")}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8 shadow-sm font-semibold"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 ml-1.5" />
                  تصدير Excel
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500"
                  onClick={() => setShowRevenue(!showRevenue)}
                >
                  {showRevenue ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardHeader>

            {showRevenue && (
              <CardContent className="p-0">
                {!revenueReport || revenueReport.projects.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    لا توجد مشاريع مسجلة في هذه الفترة
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow className="text-xs">
                          <TableHead>اسم المشروع</TableHead>
                          <TableHead>العميل / الشركة</TableHead>
                          <TableHead>الحالة</TableHead>
                          <TableHead className="text-left">إجمالي السعر</TableHead>
                          <TableHead className="text-left">المحصل</TableHead>
                          <TableHead className="text-left">المتبقي</TableHead>
                          <TableHead className="text-left">التكلفة</TableHead>
                          <TableHead className="text-left">الربح</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-100 text-xs">
                        {revenueReport.projects.map((proj) => (
                          <TableRow key={proj.id} className="hover:bg-slate-50/50">
                            <TableCell className="font-bold text-slate-900">
                              {proj.projectTitle}
                            </TableCell>
                            <TableCell>
                              <div>{proj.clientName}</div>
                              {proj.company !== "-" && (
                                <div className="text-[11px] text-slate-400">
                                  {proj.company}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${getStatusColor(proj.status)}`}
                              >
                                {proj.statusAr}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-left font-bold text-[#0f172a]">
                              {formatCurrency(proj.totalPrice)}
                            </TableCell>
                            <TableCell className="text-left font-semibold text-emerald-700">
                              {formatCurrency(proj.amountPaid)}
                            </TableCell>
                            <TableCell className="text-left text-amber-700 font-semibold">
                              {formatCurrency(proj.remaining)}
                            </TableCell>
                            <TableCell className="text-left text-slate-600">
                              {formatCurrency(proj.totalCost)}
                            </TableCell>
                            <TableCell className="text-left font-bold text-emerald-700">
                              {formatCurrency(proj.profit)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* ======================================================== */}
          {/* SECTION 3: SUPPLIER COSTS REPORT */}
          {/* ======================================================== */}
          <Card className="shadow-sm border-slate-200 overflow-hidden">
            <CardHeader
              className="bg-slate-50/70 border-b border-slate-200 py-3.5 flex flex-row items-center justify-between"
            >
              <div>
                <CardTitle className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                  <Factory className="w-4 h-4 text-amber-600" />
                  تقرير تكاليف المصانع والموردين
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  حسابات المصانع، إجمالي الأوامر والمسدد والمتبقي لكل مورد
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleExportExcel("supplier-costs")}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8 shadow-sm font-semibold"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 ml-1.5" />
                  تصدير Excel
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500"
                  onClick={() => setShowSuppliers(!showSuppliers)}
                >
                  {showSuppliers ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardHeader>

            {showSuppliers && (
              <CardContent className="p-0">
                {!supplierReport || supplierReport.suppliers.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    لا توجد بيانات موردين في هذه الفترة
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow className="text-xs">
                          <TableHead>المصنع / المورد</TableHead>
                          <TableHead>المسؤول / الهاتف</TableHead>
                          <TableHead>التخصص</TableHead>
                          <TableHead className="text-center">عدد الأوامر</TableHead>
                          <TableHead className="text-left">إجمالي التكلفة</TableHead>
                          <TableHead className="text-left">المدفوع للمورد</TableHead>
                          <TableHead className="text-left">المتبقي له</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-100 text-xs">
                        {supplierReport.suppliers.map((sup) => (
                          <TableRow key={sup.id} className="hover:bg-slate-50/50">
                            <TableCell className="font-bold text-slate-900">
                              {sup.name}
                            </TableCell>
                            <TableCell>
                              <div>{sup.contactPerson}</div>
                              <div className="text-[11px] text-slate-400 font-semibold">
                                {sup.phone}
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-600">
                              {sup.specialization}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs bg-slate-100">
                                {sup.totalOrders} أوامر
                              </Badge>
                            </TableCell>
                            <TableCell className="text-left font-bold text-slate-900">
                              {formatCurrency(sup.totalAmount)}
                            </TableCell>
                            <TableCell className="text-left font-semibold text-emerald-700">
                              {formatCurrency(sup.amountPaid)}
                            </TableCell>
                            <TableCell className="text-left font-bold text-amber-700">
                              {formatCurrency(sup.remaining)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
