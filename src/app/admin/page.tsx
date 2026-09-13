"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderKanban,
  TrendingUp,
  Clock,
  AlertCircle,
  FileText,
  CheckCircle2,
  RefreshCw,
  Plus,
  Coins,
  ChevronLeft,
  CalendarDays,
  Factory,
  Truck,
  Wrench,
  Eye,
  Palette,
  ClipboardCheck,
  AlertTriangle,
  ArrowUpRight,
  Phone,
  User,
  Timer,
  CircleDot,
  MessageSquare,
  Users,
  Wallet,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getTaskTypeIcon,
} from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ─── Types ──────────────────────────────────────
interface SummaryData {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalRevenue: number;
  totalCollected: number;
  totalPending: number;
  totalCosts: number;
  totalProfit: number;
  profitMargin: string;
  projectsByStatus: Record<string, number>;
  recentQuotes: number;
  todayTasks: number;
  suppliersCount: number;
  clientsCount: number;
  catalogItemsCount: number;
}

interface TimelineEvent {
  id: string;
  date: string;
  type: string;
  category: string;
  title: string;
  status: string;
  priority: string;
  projectId?: number | null;
  projectTitle?: string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  technicianName?: string | null;
  technicianPhone?: string | null;
  supplierName?: string | null;
  supplierPhone?: string | null;
  amount?: number;
  description?: string | null;
}

interface ActiveProject {
  id: number;
  title: string;
  status: string;
  priority: string;
  type: string;
  estimatedDelivery?: string | null;
  inspectionDate?: string | null;
  syncDate?: string | null;
  client: { name: string; company?: string | null };
  _count: { items: number; tasks: number; supplierOrders: number };
}

interface TimelineData {
  events: TimelineEvent[];
  grouped: Record<string, TimelineEvent[]>;
  activeProjects: ActiveProject[];
  stats: { totalEvents: number; overdue: number; today: number; upcoming: number };
}

interface QuoteItem {
  id: number;
  clientName: string;
  company?: string | null;
  clientPhone: string;
  totalEstimate: number;
  status: string;
  createdAt: string;
}

// ─── Constants ──────────────────────────────────
const STATUS_ORDER = [
  { key: "LEAD", label: "عميل محتمل", color: "#64748b" },
  { key: "INSPECTION", label: "معاينة", color: "#3b82f6" },
  { key: "DESIGNING", label: "تصميم", color: "#8b5cf6" },
  { key: "PENDING_APPROVAL", label: "موافقة", color: "#f59e0b" },
  { key: "APPROVED", label: "معتمد", color: "#10b981" },
  { key: "IN_PRODUCTION", label: "تصنيع", color: "#ea580c" },
  { key: "READY", label: "جاهز", color: "#059669" },
  { key: "INSTALLING", label: "تركيب", color: "#6366f1" },
  { key: "COMPLETED", label: "مكتمل", color: "#15803d" },
];

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  SUPPLIER_FOLLOWUP: { icon: <Factory className="w-3.5 h-3.5" />, color: "text-orange-600", bg: "bg-orange-50 border-orange-200", label: "متابعة مورد" },
  INSTALLATION: { icon: <Wrench className="w-3.5 h-3.5" />, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200", label: "تركيب" },
  DELIVERY: { icon: <Truck className="w-3.5 h-3.5" />, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "تسليم" },
  DESIGN: { icon: <Palette className="w-3.5 h-3.5" />, color: "text-purple-600", bg: "bg-purple-50 border-purple-200", label: "تصميم" },
  INSPECTION: { icon: <Eye className="w-3.5 h-3.5" />, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", label: "معاينة" },
  GENERAL: { icon: <ClipboardCheck className="w-3.5 h-3.5" />, color: "text-slate-600", bg: "bg-slate-50 border-slate-200", label: "مهمة عامة" },
  DESIGN_DEADLINE: { icon: <Palette className="w-3.5 h-3.5" />, color: "text-purple-700", bg: "bg-purple-50 border-purple-300", label: "موعد تسليم تصميم" },
  CLIENT_DELIVERY: { icon: <Truck className="w-3.5 h-3.5" />, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-300", label: "تسليم عميل" },
  SYNC_DATE: { icon: <Timer className="w-3.5 h-3.5" />, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "موعد تزامن المصانع" },
  SUPPLIER_DELIVERY: { icon: <Factory className="w-3.5 h-3.5" />, color: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "استلام من مصنع" },
};

const PRIORITY_DOT: Record<string, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-blue-400",
  LOW: "bg-slate-300",
};

// ─── Helpers ────────────────────────────────────
function isToday(d: string) {
  return new Date(d).toDateString() === new Date().toDateString();
}
function isPast(d: string) {
  return new Date(d) < new Date(new Date().toDateString());
}
function isFuture(d: string) {
  return new Date(d) > new Date();
}
function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((d.getTime() - new Date(now.toDateString()).getTime()) / 86400000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "غداً";
  if (diff === -1) return "أمس";
  if (diff > 1 && diff <= 7) return `بعد ${diff} أيام`;
  if (diff < -1 && diff >= -7) return `منذ ${Math.abs(diff)} أيام`;
  return formatDate(dateStr);
}
function formatWeekday(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ar-EG", { weekday: "long" });
}
function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

// ═══════════════════════════════════════════════
// Main Dashboard Component
// ═══════════════════════════════════════════════
export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [recentQuotes, setRecentQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState("ALL");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setPartialWarning(null);
    try {
      const [summaryRes, timelineRes, quotesRes] = await Promise.all([
        fetch("/api/reports/summary"),
        fetch("/api/reports/timeline?days=14&back=7"),
        fetch("/api/quotes?status=NEW"),
      ]);

      if (!summaryRes.ok) throw new Error("فشل في تحميل بيانات لوحة التحكم");

      const summaryData = await summaryRes.json();
      const timelineData = timelineRes.ok ? await timelineRes.json() : { events: [], grouped: {}, activeProjects: [], stats: { totalEvents: 0, overdue: 0, today: 0, upcoming: 0 } };
      const quotesData = quotesRes.ok ? await quotesRes.json() : [];
      if (!timelineRes.ok || !quotesRes.ok) {
        setPartialWarning("بعض بيانات المواعيد أو عروض الأسعار لم تُحمّل. الأرقام الناقصة ليست صفراً؛ جرّب التحديث.");
      }

      setSummary(summaryData);
      setTimeline(timelineData);
      setRecentQuotes(Array.isArray(quotesData) ? quotesData.slice(0, 5) : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "تعذر تحميل لوحة التحكم");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const statusBarData = STATUS_ORDER.map((item) => ({
    name: item.label,
    count: summary?.projectsByStatus?.[item.key] || 0,
    fill: item.color,
  }));

  // ─── Loading State ─────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 bg-slate-200 rounded w-48 animate-pulse" />
          <div className="h-9 bg-slate-200 rounded w-32 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6">
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/2" />
                <div className="h-8 bg-slate-300 rounded w-3/4" />
              </div>
            </Card>
          ))}
        </div>
        <Card className="p-6 h-96 animate-pulse bg-slate-50" />
      </div>
    );
  }

  // ─── Error State ─────
  if (error) {
    return (
      <div className="p-8 text-center bg-white rounded-md border border-red-200 space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <h3 className="text-lg font-bold text-slate-800">تعذر تحميل لوحة التحكم</h3>
        <p className="text-sm text-slate-600">{error}</p>
        <Button onClick={fetchData} className="bg-[#0f172a] text-white">
          <RefreshCw className="w-4 h-4 ml-2" /> إعادة المحاولة
        </Button>
      </div>
    );
  }

  const filteredGrouped: Record<string, TimelineEvent[]> = {};
  if (timeline) {
    Object.keys(timeline.grouped).forEach((dateStr) => {
      const filteredEvents = timeline.grouped[dateStr].filter((e) => {
        if (timelineFilter === "ALL") return true;
        
        const isPastDate = isPast(e.date);
        const isTodayDate = isToday(e.date);
        
        if (timelineFilter === "UPCOMING") return !isPastDate || isTodayDate;
        if (timelineFilter === "OVERDUE") return isPastDate && e.status !== "DONE";
        
        if (timelineFilter === "SUPPLIERS") {
          return e.category === "SUPPLIER" || e.type === "SUPPLIER_FOLLOWUP" || e.type === "SYNC_DATE";
        }
        
        if (timelineFilter === "INSTALLATIONS") {
          return e.type === "INSTALLATION" || e.type === "CLIENT_DELIVERY";
        }
        
        return true;
      });
      if (filteredEvents.length > 0) {
        filteredGrouped[dateStr] = filteredEvents;
      }
    });
  }
  const sortedDates = Object.keys(filteredGrouped).sort();

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#0f172a]">حطب — متابعة الشغل</h2>
          <p className="text-sm text-slate-500 font-light">المتابعة الحية للمشاريع والمواعيد والتوريدات والتركيبات</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="text-xs">
            <RefreshCw className="w-3.5 h-3.5 ml-1.5" /> تحديث
          </Button>
          <Link href="/admin/projects">
            <Button size="sm" className="bg-[#0f172a] text-white text-xs">
              <Plus className="w-3.5 h-3.5 ml-1.5 text-[#c5a975]" /> مشروع جديد
            </Button>
          </Link>
        </div>
      </div>

      <nav aria-label="ابدأ شغلك اليومي" className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/admin/assistant", icon: MessageSquare, title: "احكي للمساعد", description: "اكتب المطلوب، راجع التفاصيل، ثم وافق على التنفيذ." },
          { href: "/admin/clients", icon: Users, title: "العملاء والمتابعة", description: "عميل محتمل، بريف، موعد متابعة أو طلب جديد." },
          { href: "/admin/accounting", icon: Wallet, title: "شيت الحسابات", description: "قبض وصرف ومدفوعات مصانع، مع تعديل وتصدير." },
        ].map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-[#84383e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#84383e]">
            <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#84383e]" />
            <span><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="mt-1 block text-xs leading-6 text-slate-500">{description}</span></span>
          </Link>
        ))}
      </nav>
      {partialWarning && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{partialWarning}</p>}

      {/* ─── Row 1: 4 Stat Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-r-4 border-r-[#0f172a]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">إجمالي المشاريع</CardTitle>
            <FolderKanban className="w-5 h-5 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0f172a]">{summary?.totalProjects || 0}</div>
            <p className="text-xs text-slate-500 mt-1">
              <span className="text-emerald-600 font-medium">{summary?.completedProjects || 0} مكتمل</span> · {summary?.activeProjects || 0} نشط
            </p>
          </CardContent>
        </Card>

        <Card className="border-r-4 border-r-[#c5a975]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">المشاريع النشطة</CardTitle>
            <Clock className="w-5 h-5 text-[#c5a975]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0f172a]">{summary?.activeProjects || 0}</div>
            <p className="text-xs text-slate-500 mt-1">تتطلب متابعة تصنيع أو تركيب</p>
          </CardContent>
        </Card>

        <Card className="border-r-4 border-r-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">قيمة المشاريع غير الملغاة</CardTitle>
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{formatCurrency(summary?.totalRevenue || 0)}</div>
            <p className="text-xs text-slate-500 mt-1">
              محصّل: <span className="font-medium text-emerald-600">{formatCurrency(summary?.totalCollected || 0)}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-r-4 border-r-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">المبالغ المستحقة</CardTitle>
            <Coins className="w-5 h-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{formatCurrency(summary?.totalPending || 0)}</div>
            <p className="text-xs text-slate-500 mt-1">أقساط تحت التحصيل</p>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* ─── Row 2: ERP TIMELINE BOARD ─── */}
      {/* ═══════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#0f172a] flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-[#c5a975]" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[#0f172a]">التايم لاين — جدول المواعيد والمتابعات</CardTitle>
                <CardDescription className="text-xs">كل مواعيد التسليم والاستلام والتركيبات والمتابعات الأسبوعية في مكان واحد</CardDescription>
              </div>
            </div>
            {/* Timeline Stats */}
            {timeline && (
              <div className="flex items-center gap-3 text-xs">
                {timeline.stats.overdue > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-700 font-medium border border-red-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {timeline.stats.overdue} متأخر
                  </span>
                )}
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
                  <CircleDot className="w-3.5 h-3.5" />
                  {timeline.stats.today} اليوم
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 text-slate-600 font-medium border border-slate-200">
                  {timeline.stats.upcoming} قادم
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1">
            <button onClick={() => setTimelineFilter("ALL")} className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border ${timelineFilter === "ALL" ? "bg-[#0f172a] text-white border-[#0f172a]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>الجميع</button>
            <button onClick={() => setTimelineFilter("UPCOMING")} className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border ${timelineFilter === "UPCOMING" ? "bg-[#0f172a] text-white border-[#0f172a]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>القادم فقط واليوم</button>
            <button onClick={() => setTimelineFilter("OVERDUE")} className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border ${timelineFilter === "OVERDUE" ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>تأخيرات فقط</button>
            <button onClick={() => setTimelineFilter("SUPPLIERS")} className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border ${timelineFilter === "SUPPLIERS" ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>المصانع والموردين</button>
            <button onClick={() => setTimelineFilter("INSTALLATIONS")} className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border ${timelineFilter === "INSTALLATIONS" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>التركيبات والتسليمات</button>
          </div>
        </CardHeader>
        <CardContent>
          {!timeline || sortedDates.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">لا توجد مواعيد أو مهام مجدولة في الفترة القادمة</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute top-0 bottom-0 right-[19px] w-px bg-slate-200" />

              <div className="space-y-1">
                {sortedDates.map((dateKey) => {
                  const events = filteredGrouped[dateKey];
                  const dateIsToday = isToday(dateKey);
                  const dateIsPast = isPast(dateKey);

                  return (
                    <div key={dateKey} className="relative">
                      {/* Date Header */}
                      <div className="flex items-center gap-3 mb-3 sticky top-0 z-10 bg-white py-2">
                        <div className={`relative z-10 w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                          dateIsToday
                            ? "bg-[#0f172a] border-[#0f172a] text-white"
                            : dateIsPast
                            ? "bg-slate-100 border-slate-300 text-slate-500"
                            : "bg-white border-[#c5a975] text-[#c5a975]"
                        }`}>
                          {new Date(dateKey).getDate()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${dateIsToday ? "text-[#0f172a]" : dateIsPast ? "text-slate-400" : "text-slate-700"}`}>
                              {dayLabel(dateKey)}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatWeekday(dateKey)} · {formatShortDate(dateKey)}
                            </span>
                            {dateIsToday && (
                              <Badge className="bg-[#0f172a] text-white text-[10px] px-2 py-0">اليوم</Badge>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{events.length} حدث</span>
                      </div>

                      {/* Events for this date */}
                      <div className="mr-[40px] pr-5 space-y-2 pb-4">
                        {events.map((event) => {
                          const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.GENERAL;
                          const isOverdue = dateIsPast && event.status !== "DONE";

                          return (
                            <div
                              key={event.id}
                              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors hover:shadow-sm ${
                                isOverdue
                                  ? "bg-red-50/50 border-red-200"
                                  : `${config.bg}`
                              } ${event.status === "DONE" ? "opacity-60" : ""}`}
                            >
                              {/* Type Icon */}
                              <div className={`mt-0.5 ${isOverdue ? "text-red-500" : config.color}`}>
                                {config.icon}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-sm font-medium ${event.status === "DONE" ? "line-through text-slate-400" : "text-[#0f172a]"}`}>
                                        {event.title}
                                      </span>
                                      {/* Priority dot */}
                                      <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[event.priority] || PRIORITY_DOT.MEDIUM}`} title={event.priority} />
                                      {isOverdue && (
                                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">متأخر</Badge>
                                      )}
                                    </div>
                                    {/* Sub info line */}
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                                      {event.clientName && (
                                        <span className="flex items-center gap-1">
                                          <User className="w-3 h-3" />
                                          {event.clientName}
                                          {event.clientCompany && <span className="text-slate-400">({event.clientCompany})</span>}
                                        </span>
                                      )}
                                      {event.technicianName && (
                                        <span className="flex items-center gap-1">
                                          <Wrench className="w-3 h-3" />
                                          {event.technicianName}
                                        </span>
                                      )}
                                      {event.supplierName && (
                                        <span className="flex items-center gap-1">
                                          <Factory className="w-3 h-3" />
                                          {event.supplierName}
                                        </span>
                                      )}
                                      {event.amount && event.amount > 0 && (
                                        <span className="font-medium text-emerald-600">{formatCurrency(event.amount)}</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Status + link */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant="secondary" className={`text-[10px] ${getStatusColor(event.status)}`}>
                                      {getStatusLabel(event.status)}
                                    </Badge>
                                    {event.projectId && (
                                      <Link href={`/admin/projects/${event.projectId}`}>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-[#0f172a]">
                                          <ArrowUpRight className="w-3.5 h-3.5" />
                                        </Button>
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Row 3: Active Projects Board ─── */}
      {timeline && timeline.activeProjects.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-[#c5a975]" />
                المشاريع النشطة — حالة كل مشروع
              </CardTitle>
              <Link href="/admin/projects">
                <Button variant="ghost" size="sm" className="text-xs">
                  عرض الكل <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="text-right py-2 pr-3 font-medium">المشروع</th>
                    <th className="text-right py-2 font-medium">العميل</th>
                    <th className="text-center py-2 font-medium">الحالة</th>
                    <th className="text-center py-2 font-medium">الأولوية</th>
                    <th className="text-center py-2 font-medium">مهام</th>
                    <th className="text-center py-2 font-medium">أوامر توريد</th>
                    <th className="text-center py-2 font-medium">التسليم المتوقع</th>
                    <th className="text-center py-2 pl-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {timeline.activeProjects.map((proj) => (
                    <tr key={proj.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 pr-3">
                        <span className="font-medium text-[#0f172a]">{proj.title}</span>
                      </td>
                      <td className="py-3">
                        <span className="text-slate-600">{proj.client.name}</span>
                        {proj.client.company && (
                          <span className="text-xs text-slate-400 block">{proj.client.company}</span>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        <Badge variant="secondary" className={`text-[10px] ${getStatusColor(proj.status)}`}>
                          {getStatusLabel(proj.status)}
                        </Badge>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${PRIORITY_DOT[proj.priority] || PRIORITY_DOT.MEDIUM}`} />
                      </td>
                      <td className="py-3 text-center text-xs text-slate-500">{proj._count.tasks}</td>
                      <td className="py-3 text-center text-xs text-slate-500">{proj._count.supplierOrders}</td>
                      <td className="py-3 text-center text-xs">
                        {proj.estimatedDelivery ? (
                          <span className={isPast(proj.estimatedDelivery) ? "text-red-600 font-medium" : "text-slate-600"}>
                            {formatShortDate(proj.estimatedDelivery)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3 pl-3 text-center">
                        <Link href={`/admin/projects/${proj.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-[#c5a975] hover:text-[#0f172a]">
                            تفاصيل
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Row 4: Charts + Quotes ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-[#0f172a]">توزيع المشاريع حسب المرحلة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusBarData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={0} angle={-25} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip formatter={(v: any) => [`${v} مشروع`, "العدد"]} contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", direction: "rtl", textAlign: "right", fontSize: "12px" }} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {statusBarData.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Quotes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#c5a975]" />
                عروض أسعار جديدة
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">طلبات واردة من الموقع</CardDescription>
            </div>
            <Link href="/admin/quotes">
              <Button variant="ghost" size="sm" className="text-xs">
                عرض الكل <ChevronLeft className="w-3.5 h-3.5 mr-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentQuotes.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">لا توجد طلبات جديدة</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentQuotes.map((q) => (
                  <div key={q.id} className="py-3 flex items-center justify-between hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-[#0f172a]">{q.clientName}</span>
                        {q.company && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{q.company}</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                        <Phone className="w-3 h-3" />{q.clientPhone} · {formatDate(q.createdAt)}
                      </div>
                    </div>
                    <Link href="/admin/quotes">
                      <Button size="sm" variant="outline" className="h-7 text-xs">تفاصيل</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 5: Quick Stats ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-white rounded-md border border-slate-100 text-center">
        <div>
          <div className="text-xs text-slate-500">الموردين النشطين</div>
          <div className="text-lg font-bold text-[#0f172a] mt-1">{summary?.suppliersCount || 0}</div>
        </div>
        <div className="border-r border-slate-100">
          <div className="text-xs text-slate-500">قاعدة العملاء</div>
          <div className="text-lg font-bold text-[#0f172a] mt-1">{summary?.clientsCount || 0}</div>
        </div>
        <div className="border-r border-slate-100">
          <div className="text-xs text-slate-500">منتجات الكتالوج</div>
          <div className="text-lg font-bold text-[#0f172a] mt-1">{summary?.catalogItemsCount || 0}</div>
        </div>
        <div className="border-r border-slate-100">
          <div className="text-xs text-slate-500">هامش الربح</div>
          <div className="text-lg font-bold text-emerald-600 mt-1">{summary?.profitMargin || "0%"}</div>
        </div>
      </div>
    </div>
  );
}
