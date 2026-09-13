"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  BarChart3,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  Eye,
  Filter,
  MousePointerClick,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AnalyticsSummary {
  range: { from: string; to: string; maxDays: number };
  overview: {
    uniqueSessions: number;
    pageViews: number;
    pagesPerSession: number;
    averageSessionSeconds: number;
    convertedSessions: number;
    conversionRate: number;
  };
  funnel: { key: string; label: string; count: number }[];
  topPages: { path: string; views: number }[];
  topSections: {
    path: string;
    section: string;
    views: number;
    totalDurationMs: number;
    averageDurationSeconds: number;
  }[];
  conversions: { name: string; count: number }[];
  devices: { device: string; count: number }[];
  sources: { source: string; count: number }[];
  daily: { date: string; views: number }[];
  recentEvents: {
    id: number;
    name: string;
    path: string;
    section?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    metadata: Record<string, unknown>;
    occurredAt: string;
    session: { deviceType?: string | null; campaignSource?: string | null };
  }[];
  sampling: {
    sectionEventsTruncated: boolean;
    pageViewTimelineTruncated: boolean;
  };
  integrations: {
    meta: {
      enabled: boolean;
      pixelConfigured: boolean;
      capiConfigured: boolean;
      testModeConfigured: boolean;
      consentRequired: boolean;
      browserReady: boolean;
      serverReady: boolean;
    };
  };
}

const EVENT_LABELS: Record<string, string> = {
  page_view: "زيارة صفحة",
  section_dwell: "تفاعل مع قسم",
  form_start: "بدء نموذج",
  form_submit: "إرسال نموذج",
  cart_add: "إضافة منتج",
  cart_update: "تعديل كمية",
  cart_remove: "حذف منتج",
  cart_clear: "تفريغ اللوحة",
  project_board_snapshot: "تحديث لوحة المشروع",
  project_board_open: "فتح لوحة المشروع",
  quote_success: "طلب سعر ناجح",
};

const DEVICE_LABELS: Record<string, string> = {
  mobile: "موبايل",
  tablet: "تابلت",
  desktop: "كمبيوتر",
  unknown: "غير محدد",
};

function dateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits }).format(value);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${formatNumber(seconds)} ث`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder
    ? `${formatNumber(minutes)} د ${formatNumber(remainder)} ث`
    : `${formatNumber(minutes)} دقيقة`;
}

function formatEventMetadata(metadata: Record<string, unknown>): string {
  const pieces = [
    typeof metadata.itemCount === "number" ? `${metadata.itemCount} منتج` : null,
    typeof metadata.pieceCount === "number" ? `${metadata.pieceCount} قطعة` : null,
    typeof metadata.durationMs === "number"
      ? formatDuration(Math.round(metadata.durationMs / 1_000))
      : null,
  ].filter(Boolean);
  return pieces.join(" · ");
}

export default function StorefrontAnalyticsPage() {
  const initialTo = useMemo(() => new Date(), []);
  const initialFrom = useMemo(
    () => new Date(initialTo.getTime() - 29 * 24 * 60 * 60 * 1_000),
    [initialTo],
  );
  const [from, setFrom] = useState(dateInput(initialFrom));
  const [to, setTo] = useState(dateInput(initialTo));
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/analytics/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { signal, cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as AnalyticsSummary | { error?: string } | null;
      if (!response.ok || !payload || !("overview" in payload)) {
        throw new Error(payload && "error" in payload && payload.error
          ? payload.error
          : "تعذر تحميل تحليلات الموقع");
      }
      setData(payload);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        setError((caught as Error).message || "تعذر تحميل تحليلات الموقع");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [load]);

  const maxDailyViews = Math.max(1, ...(data?.daily.map((row) => row.views) || [1]));
  const maxFunnel = Math.max(1, data?.funnel[0]?.count || 1);

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1_000);
    setFrom(dateInput(start));
    setTo(dateInput(end));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#9a7d46]">
            <Activity className="size-4" /> تحليلات داخلية تحترم الخصوصية
          </div>
          <h2 className="text-2xl font-bold text-[#0f172a]">سلوك زوار الموقع والتحويلات</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            زيارات وأوقات تفاعل مجمعة بدون بصمة جهاز، عنوان IP، أو محتوى الحقول الشخصية.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreset(7)}>٧ أيام</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPreset(30)}>٣٠ يوم</Button>
          <label className="grid gap-1 text-[11px] font-medium text-slate-500">
            من
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-md border border-slate-200 px-2 text-xs text-slate-700" />
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-slate-500">
            إلى
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-md border border-slate-200 px-2 text-xs text-slate-700" />
          </label>
          <Button type="button" size="sm" onClick={() => void load()} disabled={loading} className="bg-[#0f172a] text-white">
            {loading ? <RefreshCw className="size-4 animate-spin" /> : <Filter className="size-4" />}
            تطبيق
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "الجلسات", value: data?.overview.uniqueSessions || 0, suffix: "", icon: Users, color: "border-r-[#0f172a]" },
          { label: "مشاهدات الصفحات", value: data?.overview.pageViews || 0, suffix: "", icon: Eye, color: "border-r-blue-500" },
          { label: "متوسط مدة الجلسة", value: 0, display: formatDuration(data?.overview.averageSessionSeconds || 0), icon: Clock3, color: "border-r-amber-500" },
          { label: "معدل طلب السعر", value: (data?.overview.conversionRate || 0) * 100, suffix: "%", fraction: 1, icon: Send, color: "border-r-emerald-500" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={`border-r-4 ${card.color}`}>
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-xs font-medium text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-[#0f172a]">
                    {card.display || `${formatNumber(card.value, card.fraction)}${card.suffix || ""}`}
                  </p>
                </div>
                <span className="grid size-9 place-items-center rounded-md bg-slate-50 text-slate-500">
                  <Icon className="size-4" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">مشاهدات الصفحات يومياً</CardTitle></CardHeader>
          <CardContent>
            {data?.daily.length ? (
              <div className="flex h-56 items-end gap-1 overflow-x-auto border-b border-slate-100 pb-6 pt-4" dir="ltr">
                {data.daily.map((row) => (
                  <div key={row.date} className="group flex min-w-7 flex-1 flex-col items-center justify-end gap-2" title={`${row.date}: ${row.views}`}>
                    <span className="text-[9px] font-bold text-slate-400 opacity-0 group-hover:opacity-100">{row.views}</span>
                    <span className="w-full max-w-8 rounded-t-sm bg-[#c5a975] transition-colors group-hover:bg-[#0f172a]" style={{ height: `${Math.max(4, row.views / maxDailyViews * 150)}px` }} />
                    <span className="rotate-[-55deg] text-[8px] text-slate-400">{row.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : <div className="py-20 text-center text-sm text-slate-400">لا توجد زيارات في هذه الفترة</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">مسار التحويل</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {(data?.funnel || []).map((step, index) => (
              <div key={step.key}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">{step.label}</span>
                  <span className="font-bold text-[#0f172a]">{formatNumber(step.count)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#0f172a]" style={{ width: `${Math.max(step.count ? 3 : 0, step.count / maxFunnel * 100)}%`, opacity: 1 - index * 0.12 }} />
                </div>
                {index < (data?.funnel.length || 0) - 1 && <ArrowDown className="mx-auto mt-2 size-3 text-slate-300" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="size-4 text-[#c5a975]" /> أكثر الصفحات زيارة</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-xs text-slate-400"><th className="py-2 text-right font-medium">المسار</th><th className="py-2 text-left font-medium">المشاهدات</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.topPages || []).map((row) => <tr key={row.path}><td className="max-w-[22rem] truncate py-2.5 font-mono text-xs text-slate-600" dir="ltr">{row.path}</td><td className="py-2.5 text-left font-bold">{formatNumber(row.views)}</td></tr>)}
                </tbody>
              </table>
              {!data?.topPages.length && <p className="py-10 text-center text-sm text-slate-400">لا توجد بيانات</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="size-4 text-[#c5a975]" /> الأقسام الأكثر جذباً للوقت</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-xs text-slate-400"><th className="py-2 text-right font-medium">القسم</th><th className="py-2 text-center font-medium">مرات</th><th className="py-2 text-left font-medium">متوسط</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.topSections || []).map((row) => <tr key={`${row.path}:${row.section}`}><td className="py-2.5"><span className="block font-medium text-slate-700">{row.section}</span><span className="block font-mono text-[10px] text-slate-400" dir="ltr">{row.path}</span></td><td className="py-2.5 text-center">{formatNumber(row.views)}</td><td className="py-2.5 text-left font-bold">{formatDuration(row.averageDurationSeconds)}</td></tr>)}
                </tbody>
              </table>
              {!data?.topSections.length && <p className="py-10 text-center text-sm text-slate-400">تظهر الأقسام بعد تفاعل مدته ٣ ثوانٍ على الأقل</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">مصادر الزيارات</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.sources || []).map((row) => <div key={row.source} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs"><span className="truncate font-medium text-slate-600" dir="ltr">{row.source}</span><Badge variant="secondary">{formatNumber(row.count)}</Badge></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">الأجهزة</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.devices || []).map((row) => <div key={row.device} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs"><span className="font-medium text-slate-600">{DEVICE_LABELS[row.device] || row.device}</span><Badge variant="secondary">{formatNumber(row.count)}</Badge></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">إشارات التحويل</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.conversions || []).map((row) => <div key={row.name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs"><span className="font-medium text-slate-600">{EVENT_LABELS[row.name] || row.name}</span><Badge variant="secondary">{formatNumber(row.count)}</Badge></div>)}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-[#c5a975]/30">
        <CardHeader className="border-b border-slate-100 bg-[#fbfaf7]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">جاهزية ربط إعلانات Meta / Facebook</CardTitle>
              <p className="mt-1 text-xs text-slate-500">مفاتيح الخادم لا تظهر في المتصفح، والربط الخارجي متوقف افتراضياً.</p>
            </div>
            <Badge className={data?.integrations.meta.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
              {data?.integrations.meta.enabled ? "مفعّل من البيئة" : "متوقف بأمان"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pixel ID", ready: data?.integrations.meta.pixelConfigured, detail: "META_PIXEL_ID" },
            { label: "Conversions API", ready: data?.integrations.meta.capiConfigured, detail: "META_CAPI_ACCESS_TOKEN" },
            { label: "وضع الاختبار", ready: data?.integrations.meta.testModeConfigured, detail: "META_CAPI_TEST_EVENT_CODE" },
            { label: "موافقة التسويق", ready: false, detail: data?.integrations.meta.consentRequired ? "مطلوبة قبل الإرسال" : "راجع المتطلبات القانونية" },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                {item.ready ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleSlash2 className="size-4 text-slate-400" />}
                {item.label}
              </div>
              <p className="mt-2 font-mono text-[10px] text-slate-400" dir="ltr">{item.detail}</p>
            </div>
          ))}
          <div className="md:col-span-2 xl:col-span-4 rounded-md bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
            الخطوة الآمنة التالية: واجهة موافقة تسويق صريحة، ثم إرسال ViewContent وAddToCart وLead فقط، مع نفس event_id في المتصفح والخادم لمنع التكرار. لن يتم تحميل Pixel أو فتح نطاقات Meta في سياسة الأمان قبل ذلك.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><MousePointerClick className="size-4 text-[#c5a975]" /> أحدث الأحداث</CardTitle>
          <span className="text-[11px] text-slate-400">لا يتم تسجيل محتوى النماذج</span>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b text-xs text-slate-400"><th className="py-2 text-right font-medium">الحدث</th><th className="py-2 text-right font-medium">المسار / القسم</th><th className="py-2 text-right font-medium">ملخص غير شخصي</th><th className="py-2 text-center font-medium">الجهاز</th><th className="py-2 text-left font-medium">الوقت</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.recentEvents || []).map((event) => (
                  <tr key={event.id}>
                    <td className="py-2.5 font-medium text-slate-700">{EVENT_LABELS[event.name] || event.name}</td>
                    <td className="py-2.5"><span className="block font-mono text-xs text-slate-600" dir="ltr">{event.path}</span>{event.section && <span className="text-[10px] text-slate-400">{event.section}</span>}</td>
                    <td className="py-2.5 text-xs text-slate-500">{formatEventMetadata(event.metadata) || "—"}</td>
                    <td className="py-2.5 text-center text-xs text-slate-500">{DEVICE_LABELS[event.session.deviceType || "unknown"] || event.session.deviceType}</td>
                    <td className="py-2.5 text-left text-xs text-slate-500">{new Date(event.occurredAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.recentEvents.length && !loading && <p className="py-12 text-center text-sm text-slate-400">لا توجد أحداث بعد</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
