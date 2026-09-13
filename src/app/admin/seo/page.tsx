import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpLeft,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Languages,
  Search,
  Sparkles,
} from "lucide-react";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import {
  getSeoAuditSnapshot,
  type SeoOpportunityKind,
} from "@/lib/seo-audit";

interface SeoAuditPageProps {
  searchParams: Promise<{
    q?: string;
    kind?: string;
    state?: string;
  }>;
}

const kindLabels: Record<SeoOpportunityKind, string> = {
  CATEGORY: "فئة",
  STYLE: "أسلوب",
  COLLECTION: "تشكيلة",
  TAG: "موضوع من الوسوم",
};

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "giu"));
  return parts.map((part, index) => index % 2 === 1
    ? <mark key={`${part}-${index}`} className="rounded bg-amber-200 px-0.5 text-slate-950">{part}</mark>
    : part);
}

export default async function SeoAuditPage({ searchParams }: SeoAuditPageProps) {
  const [params, snapshot] = await Promise.all([searchParams, getSeoAuditSnapshot()]);
  const query = params.q?.trim().slice(0, 80) || "";
  const kind = ["CATEGORY", "STYLE", "COLLECTION", "TAG"].includes(params.kind || "")
    ? params.kind as SeoOpportunityKind
    : undefined;
  const state = params.state === "INDEXABLE" || params.state === "CONTENT_GAP"
    ? params.state
    : undefined;
  const normalizedQuery = query.toLocaleLowerCase();
  const opportunities = snapshot.opportunities.filter((opportunity) => {
    if (kind && opportunity.kind !== kind) return false;
    if (state && opportunity.state !== state) return false;
    if (!normalizedQuery) return true;
    return [opportunity.labelAr, opportunity.labelEn, opportunity.key]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
  const readinessRate = snapshot.metrics.publishedProducts > 0
    ? Math.round((snapshot.metrics.seoReadyProducts / snapshot.metrics.publishedProducts) * 100)
    : 0;
  const metricCards = [
    { label: "منتجات منشورة", value: snapshot.metrics.publishedProducts, hint: "بعد بوابة النشر الحالية" },
    { label: "جاهزة للفهرسة", value: snapshot.metrics.seoReadyProducts, hint: `${readinessRate}% من المنشور` },
    { label: "صفحات فئات", value: snapshot.metrics.indexableCategories, hint: "عناوين قانونية للفهرسة" },
    { label: "تحريرات أسلوبية", value: snapshot.metrics.indexableStyles, hint: "Classic · Smart · وغيرها" },
    { label: "تشكيلات منشورة", value: snapshot.metrics.publishedCollections, hint: "نشطة وغير مسودة" },
    { label: "فرص موضوعية", value: snapshot.metrics.topicGaps, hint: "وسوم تغطي 3 قطع فأكثر" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8" dir="rtl">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-8 bg-[linear-gradient(125deg,#0f172a_0%,#172033_62%,#263246_100%)] p-7 text-white lg:grid-cols-[1fr_0.55fr] lg:p-10">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-bold text-[#d8c18e]">
              <FileSearch className="h-4 w-4" aria-hidden="true" />
              SEO · GEO · قابلية الاقتباس
            </span>
            <h1 className="mt-4 text-3xl font-bold sm:text-4xl">محرك فرص البحث وجودة الفهرسة</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              يعرض هذا التقرير ما هو قابل للفهرسة فعلاً، وما ينقص البيانات، والموضوعات التي يدعمها الكتالوج الحالي. لا يعرض حجم بحث أو وعداً بالترتيب لعدم وجود بيانات موثقة من Search Console أو Bing.
            </p>
          </div>
          <aside className="border-r border-white/15 pr-6">
            <p className="text-xs font-bold text-[#d8c18e]">قاعدة النشر</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              صفحات المنتج تُفهرس فقط عند حالة READY أو VERIFIED ودرجة اكتمال 80 فأعلى. السعر عند الطلب لا يتحول إلى سعر أو Offer تلقائياً.
            </p>
            <p className="mt-4 text-[11px] text-slate-500">
              آخر قراءة: {snapshot.generatedAt.toLocaleString("ar-EG")}
            </p>
          </aside>
        </div>
      </header>

      {!snapshot.metrics.siteUrlConfigured && (
        <aside className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-950">
          <strong>عنوان النشر غير مضبوط.</strong>{" "}
          أضف <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SITE_URL</code> أو <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">SITE_URL</code> بعنوان HTTPS القانوني قبل النشر. القيمة الحالية هي <span dir="ltr" className="font-mono text-xs">{snapshot.metrics.resolvedSiteUrl}</span>، وسيتم منع الزحف في وضع الإنتاج حتى لا تُنشر روابط localhost في sitemap أو canonical.
        </aside>
      )}

      <section aria-labelledby="seo-metrics-heading">
        <h2 id="seo-metrics-heading" className="sr-only">مؤشرات التغطية</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metricCards.map((metric) => (
            <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">{metric.label}</p>
                  <p className="mt-3 text-3xl font-bold text-slate-950">{metric.value.toLocaleString("ar-EG")}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{metric.hint}</p>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="seo-issues-heading">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center">
          <div>
            <h2 id="seo-issues-heading" className="text-lg font-bold text-slate-950">أولويات الإصلاح</h2>
            <p className="mt-1 text-xs text-slate-500">أعداد مشتقة من السجلات المنشورة ومحتوى الموقع الحالي.</p>
          </div>
          <Link href="/admin/data-quality" className="inline-flex items-center gap-2 text-xs font-bold text-[#8a703e] hover:text-slate-950">
            فتح جودة البيانات <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {snapshot.issues.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {snapshot.issues.map((issue) => (
              <article key={issue.key} className="grid gap-4 px-6 py-5 lg:grid-cols-[7rem_1fr_1.2fr] lg:items-start">
                <div className="flex items-center gap-2">
                  <span className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-bold ${issue.severity === "HIGH" ? "bg-rose-50 text-rose-700" : issue.severity === "MEDIUM" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                    {issue.count.toLocaleString("ar-EG")}
                  </span>
                  <AlertTriangle className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{issue.titleAr}</h3>
                  <p className="mt-1 text-xs text-slate-400" dir="ltr">{issue.titleEn}</p>
                </div>
                <div>
                  <p className="text-xs leading-6 text-slate-600">{issue.actionAr}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400" dir="ltr">{issue.actionEn}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-emerald-700">لا توجد فجوات مسجلة في الفحص الحالي.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="keyword-engine-heading">
        <div className="border-b border-slate-200 p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id="keyword-engine-heading" className="text-lg font-bold text-slate-950">محرك الموضوعات والكلمات</h2>
              <p className="mt-1 max-w-3xl text-xs leading-6 text-slate-500">
                درجة التغطية تقيس عدد القطع، ثنائية اللغة، الوصف والصورة داخل الكتالوج فقط؛ وهي ليست درجة ترتيب أو حجم بحث.
              </p>
            </div>
          </div>

          <form className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]" method="get">
            <label className="relative">
              <span className="sr-only">ابحث عن كلمة أو موضوع</span>
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                name="q"
                defaultValue={query}
                placeholder="ابحث بالعربية أو الإنجليزية…"
                className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pr-10 pl-4 text-sm outline-none transition focus:border-[#c5a975] focus:bg-white focus:ring-2 focus:ring-[#c5a975]/20"
              />
            </label>
            <select name="kind" defaultValue={kind || ""} className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-[#c5a975]">
              <option value="">كل الأنواع</option>
              <option value="CATEGORY">الفئات</option>
              <option value="STYLE">الأساليب</option>
              <option value="COLLECTION">التشكيلات</option>
              <option value="TAG">موضوعات الوسوم</option>
            </select>
            <select name="state" defaultValue={state || ""} className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-[#c5a975]">
              <option value="">كل الحالات</option>
              <option value="INDEXABLE">مفهرس</option>
              <option value="CONTENT_GAP">فرصة محتوى</option>
            </select>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-xs font-bold text-white hover:bg-[#8a703e]">
              <Search className="h-3.5 w-3.5" aria-hidden="true" /> بحث
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-right text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-bold">الموضوع</th>
                <th className="px-5 py-3 font-bold">النوع</th>
                <th className="px-5 py-3 font-bold">القطع</th>
                <th className="px-5 py-3 font-bold">تغطية الكتالوج</th>
                <th className="px-5 py-3 font-bold">الحالة والتوصية</th>
                <th className="px-5 py-3 font-bold">معاينة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {opportunities.slice(0, 150).map((opportunity) => (
                <tr key={opportunity.key} className="align-top hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <p className="font-bold text-slate-900"><Highlight text={opportunity.labelAr} query={query} /></p>
                    <p className="mt-1 text-xs text-slate-400" dir="ltr"><Highlight text={opportunity.labelEn} query={query} /></p>
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-600">{kindLabels[opportunity.kind]}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">{opportunity.productCount.toLocaleString("ar-EG")}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full bg-[#c5a975]" style={{ width: `${opportunity.coverageScore}%` }} />
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">{opportunity.coverageScore}%</span>
                    </div>
                  </td>
                  <td className="max-w-sm px-5 py-4">
                    <span className={`inline-flex rounded-md px-2 py-1 text-[9px] font-bold ${opportunity.state === "INDEXABLE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {opportunity.state === "INDEXABLE" ? "قابل للفهرسة" : "فرصة صفحة مستقلة"}
                    </span>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">{opportunity.noteAr}</p>
                  </td>
                  <td className="px-5 py-4">
                    {opportunity.path ? (
                      <div className="flex items-center gap-2">
                        <Link href={localizedStorefrontPath("ar", opportunity.path)} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[10px] font-bold text-slate-600 hover:border-[#c5a975] hover:text-slate-950">
                          ع <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                        <Link href={localizedStorefrontPath("en", opportunity.path)} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[10px] font-bold text-slate-600 hover:border-[#c5a975] hover:text-slate-950" dir="ltr">
                          EN <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
                        <Languages className="h-3.5 w-3.5" aria-hidden="true" /> غير منشور
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {opportunities.length === 0 && (
          <p className="border-t border-slate-100 px-6 py-12 text-center text-sm text-slate-500">لا توجد نتائج مطابقة.</p>
        )}
      </section>

      <aside className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-xs leading-6 text-amber-950">
        يوجد {snapshot.metrics.internalPortfolioRecords.toLocaleString("ar-EG")} سجل مشروع داخلي، لكن مخطط البيانات لا يحتوي حالياً على بوابة نشر صريحة للمشروعات؛ لذلك لا يعامل التقرير أيّاً منها كدراسة حالة عامة ولا يولّد عنها بيانات منظمة.
      </aside>
    </div>
  );
}
