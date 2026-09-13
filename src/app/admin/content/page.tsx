"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FilePenLine,
  Film,
  ImageIcon,
  Languages,
  LoaderCircle,
  RotateCcw,
  Save,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ContentType = "TEXT" | "TEXTAREA" | "LINK" | "IMAGE" | "VIDEO" | "BANNER";

interface ContentEntry {
  key: string;
  group: string;
  type: ContentType;
  label: string;
  valueAr: string | null;
  valueEn: string | null;
  mediaUrl: string | null;
  altAr: string | null;
  altEn: string | null;
  linkUrl: string | null;
  metadata: string | null;
  isActive: boolean;
  sortOrder: number;
  defaultValueAr: string | null;
  defaultValueEn: string | null;
  defaultMediaUrl: string | null;
  defaultAltAr: string | null;
  defaultAltEn: string | null;
  defaultLinkUrl: string | null;
  defaultMetadata: string | null;
  customized: boolean;
}

const GROUP_LABELS: Record<string, string> = {
  "dictionary.language": "اللغة",
  "dictionary.common": "النصوص المشتركة",
  "dictionary.nav": "التنقل والقوائم",
  "dictionary.footer": "تذييل الموقع",
  "dictionary.catalog": "الكتالوج والبحث",
  "dictionary.collections": "التشكيلات",
  "dictionary.product": "صفحة المنتج",
  "dictionary.portfolio": "المشروعات السابقة",
  "dictionary.quote": "طلب عرض السعر",
  "home.proof": "الرئيسية · مؤشرات الثقة",
  "home.metadataTitle": "الرئيسية · عنوان محركات البحث",
  "home.metadataDescription": "الرئيسية · وصف محركات البحث",
  "home.organizationName": "الرئيسية · اسم العلامة",
  "home.hero": "الرئيسية · الغلاف التفاعلي",
  "home.spaces": "الرئيسية · المساحات",
  "home.marquee": "الرئيسية · الشريط المتحرك",
  "home.catalog": "الرئيسية · الكتالوج",
  "home.coordination": "الرئيسية · تنسيق القطع",
  "home.picks": "الرئيسية · الاختيارات",
  "home.journey": "الرئيسية · رحلة المشروع",
  "home.project": "الرئيسية · دعوة المشروع",
  "home.process": "الرئيسية · فيلم مراحل العمل",
  "storefront.catalog": "الكتالوج · الصفحة والبيانات الوصفية",
  "storefront.catalogFilter": "الكتالوج · البحث والفلاتر",
  "storefront.productCard": "الكتالوج · بطاقات المنتجات",
  "storefront.collections": "التشكيلات والأساليب",
  "storefront.portfolio": "المشروعات السابقة",
  "storefront.product": "تفاصيل المنتج",
  "storefront.productActions": "المنتج · لوحة المشروع",
  "storefront.addToQuote": "المنتج · الإضافة للطلب",
  "storefront.quantity": "المنتج · الكمية",
  "storefront.gallery": "المنتج · معرض الصور",
  "storefront.notFound": "صفحة غير موجودة",
  "storefront.styles": "مكتبة الأساليب",
  "media.global": "الوسائط · الهوية",
  "media.home": "الوسائط · الصفحة الرئيسية",
  "media.catalog": "الوسائط · الكتالوج والفئات",
  "media.collections": "الوسائط · التشكيلات",
  "media.portfolio": "الوسائط · المشروعات",
};

const OVERRIDE_FIELDS = [
  "valueAr",
  "valueEn",
  "mediaUrl",
  "altAr",
  "altEn",
  "linkUrl",
  "metadata",
] as const;

type OverrideField = (typeof OVERRIDE_FIELDS)[number];

function groupLabel(group: string) {
  return GROUP_LABELS[group] ?? group.replaceAll(".", " · ");
}

function isMediaEntry(entry: ContentEntry) {
  return entry.type === "IMAGE" || entry.type === "VIDEO" || entry.type === "BANNER";
}

function currentOrDefault(
  entry: ContentEntry,
  field: OverrideField,
): string {
  if (entry.isActive && entry[field] !== null) return entry[field] ?? "";
  const defaults: Partial<Record<OverrideField, keyof ContentEntry>> = {
    valueAr: "defaultValueAr",
    valueEn: "defaultValueEn",
    mediaUrl: "defaultMediaUrl",
    altAr: "defaultAltAr",
    altEn: "defaultAltEn",
    linkUrl: "defaultLinkUrl",
    metadata: "defaultMetadata",
  };
  const defaultField = defaults[field];
  return defaultField ? String(entry[defaultField] ?? "") : "";
}

function hasLocalOverride(entry: ContentEntry) {
  return !entry.isActive || OVERRIDE_FIELDS.some((field) => Boolean(entry[field]));
}

function metadataObjectPosition(metadata: string) {
  if (!metadata) return "50% 50%";
  try {
    const value = (JSON.parse(metadata) as { objectPosition?: unknown })
      .objectPosition;
    return typeof value === "string" && value.trim()
      ? value.trim()
      : "50% 50%";
  } catch {
    return "50% 50%";
  }
}

function metadataWithObjectPosition(metadata: string, objectPosition: string) {
  let parsed: Record<string, unknown> = {};
  try {
    const candidate = JSON.parse(metadata) as unknown;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    // Invalid legacy metadata is replaced with the supported focal-position shape.
  }
  return JSON.stringify({ ...parsed, objectPosition: objectPosition.trim() });
}

export default function SiteContentAdminPage() {
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("home.process");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/site-content", { cache: "no-store" });
      const payload = (await response.json()) as {
        entries?: ContentEntry[];
        error?: string;
      };
      if (!response.ok || !payload.entries) {
        throw new Error(payload.error || "تعذّر تحميل محتوى الموقع.");
      }
      setEntries(payload.entries);
      setDirtyKeys(new Set());
      if (!payload.entries.some((entry) => entry.group === group)) {
        setGroup(payload.entries[0]?.group ?? "all");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذّر تحميل محتوى الموقع.");
    } finally {
      setLoading(false);
    }
  }, [group]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/site-content", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          entries?: ContentEntry[];
          error?: string;
        };
        if (!response.ok || !payload.entries) {
          throw new Error(payload.error || "تعذّر تحميل محتوى الموقع.");
        }
        return payload.entries;
      })
      .then((loadedEntries) => {
        if (cancelled) return;
        setEntries(loadedEntries);
        setDirtyKeys(new Set());
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "تعذّر تحميل محتوى الموقع.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.group))),
    [entries],
  );

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ar");
    return entries.filter((entry) => {
      if (group !== "all" && entry.group !== group) return false;
      if (!query) return true;
      return [entry.key, entry.label, entry.defaultValueAr, entry.defaultValueEn]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ar").includes(query));
    });
  }, [entries, group, search]);

  const updateEntry = useCallback(
    (key: string, field: OverrideField | "isActive", value: string | boolean | null) => {
      setEntries((current) =>
        current.map((entry) =>
          entry.key === key
            ? {
                ...entry,
                [field]: value,
                isActive: field === "isActive" ? Boolean(value) : true,
              }
            : entry,
        ),
      );
      setDirtyKeys((current) => new Set(current).add(key));
      setSuccess(null);
    },
    [],
  );

  const resetEntry = useCallback((key: string) => {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.key !== key) return entry;
        return {
          ...entry,
          valueAr: null,
          valueEn: null,
          mediaUrl: null,
          altAr: null,
          altEn: null,
          linkUrl: null,
          metadata: null,
          isActive: true,
        };
      }),
    );
    setDirtyKeys((current) => new Set(current).add(key));
    setSuccess(null);
  }, []);

  const save = async () => {
    const changedEntries = entries.filter((entry) => dirtyKeys.has(entry.key));
    if (!changedEntries.length) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: changedEntries.map((entry) => ({
            key: entry.key,
            valueAr: entry.valueAr,
            valueEn: entry.valueEn,
            mediaUrl: entry.mediaUrl,
            altAr: entry.altAr,
            altEn: entry.altEn,
            linkUrl: entry.linkUrl,
            metadata: entry.metadata,
            isActive: entry.isActive,
          })),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        updatedCount?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error || "تعذّر حفظ محتوى الموقع.");
      }
      setSuccess(`تم نشر ${payload.updatedCount ?? changedEntries.length} تحديثاً بنجاح.`);
      await loadEntries();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذّر حفظ محتوى الموقع.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#fff_0%,#f8f6f0_100%)] px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-[#9a7d45]">
                <FilePenLine className="h-4 w-4" />
                محتوى ووسائط الموقع
              </div>
              <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
                تحرير عربي وإنجليزي من مصدر واحد
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                عدّل النصوص والمواضع المرئية المسجلة فقط. أي حقل غير مخصص يعود تلقائياً إلى النص أو الأصل المضمّن في الموقع.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || dirtyKeys.size === 0}
              className="min-w-44 bg-[#0f172a] text-white hover:bg-[#1e293b]"
            >
              {saving ? (
                <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="ml-2 h-4 w-4" />
              )}
              حفظ ونشر {dirtyKeys.size ? `(${dirtyKeys.size})` : ""}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)] sm:p-6">
          <label className="relative block">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالمفتاح أو النص العربي أو الإنجليزي"
              className="pr-10"
            />
          </label>
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#c5a975] focus:ring-2 focus:ring-[#c5a975]/20"
          >
            <option value="all">كل أقسام المحتوى</option>
            {groups.map((item) => (
              <option key={item} value={item}>
                {groupLabel(item)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {success}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <LoaderCircle className="h-7 w-7 animate-spin text-[#9a7d45]" />
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          لا توجد حقول تطابق البحث الحالي.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleEntries.map((entry) => {
            const media = isMediaEntry(entry);
            const mediaUrl = currentOrDefault(entry, "mediaUrl");
            const mediaMetadata = currentOrDefault(entry, "metadata");
            const objectPosition = metadataObjectPosition(mediaMetadata);
            const isDirty = dirtyKeys.has(entry.key);
            const customized = hasLocalOverride(entry);
            return (
              <article
                key={entry.key}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-950">{entry.label}</h3>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {entry.type}
                      </Badge>
                      {isDirty ? <Badge className="bg-amber-100 text-amber-800">غير محفوظ</Badge> : null}
                      {customized && !isDirty ? <Badge className="bg-emerald-100 text-emerald-800">مخصص</Badge> : null}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-400" dir="ltr">
                      {entry.key}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {customized ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => updateEntry(entry.key, "isActive", !entry.isActive)}
                      >
                        {entry.isActive ? "التخصيص مفعّل" : "استخدام الافتراضي"}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => resetEntry(entry.key)}
                      className="text-slate-500"
                    >
                      <RotateCcw className="ml-2 h-4 w-4" />
                      استعادة الافتراضي
                    </Button>
                  </div>
                </header>

                {media ? (
                  <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                      <label className="block space-y-2">
                        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          {entry.type === "VIDEO" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                          مسار الملف داخل الموقع
                        </span>
                        <Input
                          dir="ltr"
                          value={currentOrDefault(entry, "mediaUrl")}
                          onChange={(event) => updateEntry(entry.key, "mediaUrl", event.target.value)}
                          placeholder="/uploads/... أو /images/... أو /media/..."
                          className="text-left font-mono text-xs"
                        />
                        <span className="block text-[11px] leading-5 text-slate-400">
                          يُسمح فقط بمسار من نفس النطاق داخل images أو media أو uploads.
                        </span>
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block space-y-2">
                          <span className="text-xs font-semibold text-slate-700">النص البديل بالعربية</span>
                          <Input
                            value={currentOrDefault(entry, "altAr")}
                            onChange={(event) => updateEntry(entry.key, "altAr", event.target.value)}
                          />
                        </label>
                        <label className="block space-y-2" dir="ltr">
                          <span className="text-xs font-semibold text-slate-700">English alt text</span>
                          <Input
                            value={currentOrDefault(entry, "altEn")}
                            onChange={(event) => updateEntry(entry.key, "altEn", event.target.value)}
                          />
                        </label>
                      </div>
                      {entry.type !== "VIDEO" ? (
                        <label className="block space-y-2">
                          <span className="text-xs font-semibold text-slate-700">
                            موضع التركيز داخل الصورة
                          </span>
                          <Input
                            dir="ltr"
                            value={objectPosition}
                            onChange={(event) =>
                              updateEntry(
                                entry.key,
                                "metadata",
                                metadataWithObjectPosition(
                                  mediaMetadata,
                                  event.target.value,
                                ),
                              )
                            }
                            placeholder="50% 50%"
                            className="text-left font-mono text-xs"
                          />
                          <span className="block text-[11px] leading-5 text-slate-400">
                            مثال: 50% 50% للمنتصف، أو 70% 40% لنقل نقطة الاهتمام يميناً وأعلى.
                          </span>
                        </label>
                      ) : null}
                    </div>
                    <div className="relative flex min-h-44 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-[#f6f6f6]">
                      {mediaUrl ? (
                        entry.type === "VIDEO" ? (
                          <video
                            src={mediaUrl}
                            className="h-full max-h-56 w-full object-contain"
                            muted
                            controls
                            playsInline
                          />
                        ) : (
                          <Image
                            src={mediaUrl}
                            alt={currentOrDefault(entry, "altAr") || entry.label}
                            width={560}
                            height={360}
                            unoptimized
                            className={`h-full max-h-56 w-full ${
                              entry.type === "BANNER"
                                ? "object-cover"
                                : "object-contain"
                            }`}
                            style={{ objectPosition }}
                          />
                        )
                      ) : (
                        <div className="text-center text-xs text-slate-400">
                          <ImageIcon className="mx-auto mb-2 h-6 w-6" />
                          لم يتم تحديد ملف لهذا الموضع
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 p-5 lg:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <Languages className="h-4 w-4" />
                        العربية
                      </span>
                      {entry.type === "TEXTAREA" ? (
                        <Textarea
                          dir="rtl"
                          rows={4}
                          value={currentOrDefault(entry, "valueAr")}
                          onChange={(event) => updateEntry(entry.key, "valueAr", event.target.value)}
                        />
                      ) : (
                        <Input
                          dir="rtl"
                          value={currentOrDefault(entry, "valueAr")}
                          onChange={(event) => updateEntry(entry.key, "valueAr", event.target.value)}
                        />
                      )}
                      <span className="block text-[11px] leading-5 text-slate-400">
                        مسح الحقل وتركه فارغاً يعني استعادة النص الافتراضي عند الحفظ.
                      </span>
                    </label>
                    <label className="block space-y-2" dir="ltr">
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <Languages className="h-4 w-4" />
                        English
                      </span>
                      {entry.type === "TEXTAREA" ? (
                        <Textarea
                          dir="ltr"
                          rows={4}
                          value={currentOrDefault(entry, "valueEn")}
                          onChange={(event) => updateEntry(entry.key, "valueEn", event.target.value)}
                        />
                      ) : (
                        <Input
                          dir="ltr"
                          value={currentOrDefault(entry, "valueEn")}
                          onChange={(event) => updateEntry(entry.key, "valueEn", event.target.value)}
                        />
                      )}
                    </label>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <aside className="rounded-xl border border-slate-200 bg-slate-100/70 px-5 py-4 text-xs leading-6 text-slate-600">
        النشر يفرغ ذاكرة المحتوى المؤقتة ويعيد توليد صفحات المتجر. جميع التغييرات تُسجل باسم حساب الإدارة، والمفاتيح وأنواع الحقول ثابتة في سجل مسموح به ولا يمكن إنشاء مفاتيح تنفيذ عشوائية من هذه الشاشة.
      </aside>
    </div>
  );
}
