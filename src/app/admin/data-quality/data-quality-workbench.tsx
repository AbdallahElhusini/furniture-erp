"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Copy,
  DatabaseZap,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, errorMessage, isAbortError } from "./client";
import { FamiliesTab } from "./families-tab";
import { MissingDataTab } from "./missing-data-tab";
import { AssetsTab } from "./assets-tab";
import type { OverviewData } from "./types";

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof DatabaseZap;
  tone: "gold" | "blue" | "green" | "rose";
}) {
  const tones = {
    gold: "bg-amber-50 text-amber-700 ring-amber-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
  };

  return (
    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950" dir="ltr">
              {value}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p>
          </div>
          <div className={`rounded-2xl p-3 ring-1 ${tones[tone]}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const width = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums text-slate-950">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: OverviewData }) {
  const unresolved =
    data.catalog.contentStatuses.NEEDS_REVIEW + data.catalog.contentStatuses.READY;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="متوسط اكتمال الكتالوج"
          value={`${data.catalog.averageCompleteness}%`}
          hint={`${data.catalog.total} منتج محفوظ في الكتالوج`}
          icon={DatabaseZap}
          tone="gold"
        />
        <MetricCard
          label="بانتظار التحقق"
          value={unresolved}
          hint={`${data.catalog.contentStatuses.READY} جاهز للمراجعة النهائية`}
          icon={ScanSearch}
          tone="blue"
        />
        <MetricCard
          label="عائلات مرشحة"
          value={data.families.CANDIDATE}
          hint="اقتراحات تصنيف؛ لا دمج تلقائي للمنتجات"
          icon={Boxes}
          tone="green"
        />
        <MetricCard
          label="صور مكررة مؤكدة"
          value={data.assets.duplicates}
          hint={`من أصل ${data.assets.total} أصل وسائط منظم`}
          icon={Copy}
          tone="rose"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">جاهزية المحتوى</CardTitle>
              <Badge variant="outline" className="font-normal text-slate-500">
                المؤشر لا يختلق أي بيانات
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <ProgressRow
              label="حرج — أقل من 50%"
              value={data.catalog.scoreBands.CRITICAL}
              total={data.catalog.total}
              color="bg-rose-500"
            />
            <ProgressRow
              label="غير مكتمل — من 50% إلى 79%"
              value={data.catalog.scoreBands.INCOMPLETE}
              total={data.catalog.total}
              color="bg-amber-500"
            />
            <ProgressRow
              label="مكتمل بنيوياً — 80% فأكثر"
              value={data.catalog.scoreBands.COMPLETE}
              total={data.catalog.total}
              color="bg-emerald-500"
            />
            <div className="grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">يحتاج مراجعة</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {data.catalog.contentStatuses.NEEDS_REVIEW}
                </p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3">
                <p className="text-xs text-blue-600">جاهز للتحقق</p>
                <p className="mt-1 text-xl font-bold text-blue-900">
                  {data.catalog.contentStatuses.READY}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs text-emerald-600">تم التحقق</p>
                <p className="mt-1 text-xl font-bold text-emerald-900">
                  {data.catalog.contentStatuses.VERIFIED}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">أكبر فجوات البيانات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ["هوية منتج حقيقية", data.catalog.missing.IDENTITY],
              ["وصف ثنائي اللغة", data.catalog.missing.DESCRIPTION],
              ["الأبعاد", data.catalog.missing.DIMENSIONS],
              ["الخامة", data.catalog.missing.MATERIAL],
              ["المورد", data.catalog.missing.SUPPLIER],
            ].map(([label, count]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3"
              >
                <span className="text-sm text-slate-600">{label}</span>
                <Badge variant={Number(count) > 0 ? "secondary" : "outline"}>
                  {count}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-emerald-100 bg-emerald-50/50 shadow-none">
        <CardContent className="flex gap-3 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
          <div className="space-y-1 text-sm leading-6 text-emerald-950">
            <p className="font-semibold">حدود آمنة للمراجعة</p>
            <p>
              اعتماد العائلة يثبت قرار التصنيف فقط. الرفض يستبعد الاقتراح من سير المراجعة،
              وإرجاعها إلى «مرشحة» يعيد فتح القرار. لا تنفذ أي حالة دمجاً أو حذفاً أو نقلاً
              للمنتجات.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingOverview() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="جار تحميل المؤشرات">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-36 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

export function DataQualityWorkbench() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRefreshVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    apiRequest<OverviewData>("/api/data-quality/overview", {
      signal: controller.signal,
    })
      .then(({ data }) => {
        setOverview(data);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError)) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [refreshVersion]);

  return (
    <div className="space-y-7">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7">
        <div className="absolute inset-y-0 right-0 w-1 bg-[#c5a975]" />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-[#9a7b42]">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              مركز التحرير والمراجعة
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              جودة بيانات الكتالوج
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              راجع الاقتراحات، أكمل الحقائق الموثقة، ثم انقل المحتوى الجاهز إلى التحقق
              النهائي—من دون توليد مواصفات أو دمج منتجات تلقائياً.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
              تحديث المؤشرات
            </Button>
            {overview && (
              <span className="text-[11px] text-slate-400" dir="ltr">
                {new Intl.DateTimeFormat("ar-EG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(overview.generatedAt))}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">تعذر تحميل مؤشرات الجودة</p>
            <p className="mt-1 text-rose-700">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={refresh}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full" dir="rtl">
        <TabsList className="mb-5 grid h-auto w-full grid-cols-2 rounded-xl bg-slate-100 p-1 sm:w-fit sm:min-w-[680px] sm:grid-cols-4">
          <TabsTrigger value="overview" className="py-2.5">
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="families" className="py-2.5">
            مراجعة العائلات
          </TabsTrigger>
          <TabsTrigger value="missing-data" className="py-2.5">
            استكمال البيانات
          </TabsTrigger>
          <TabsTrigger value="assets" className="py-2.5">
            مراجعة الوسائط
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {loading && !overview ? <LoadingOverview /> : overview ? <OverviewTab data={overview} /> : null}
        </TabsContent>

        <TabsContent value="families">
          <FamiliesTab
            categories={overview?.categories || []}
            refreshVersion={refreshVersion}
            onDataChanged={refresh}
          />
        </TabsContent>

        <TabsContent value="missing-data">
          <MissingDataTab
            categories={overview?.categories || []}
            refreshVersion={refreshVersion}
            onDataChanged={refresh}
          />
        </TabsContent>

        <TabsContent value="assets">
          <AssetsTab refreshVersion={refreshVersion} onDataChanged={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
