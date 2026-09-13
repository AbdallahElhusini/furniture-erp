"use client";

import Image from "next/image";
import { FormEvent, useDeferredValue, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Eye,
  ImageIcon,
  Loader2,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inferProductMediaKind } from "@/lib/product-media";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiRequestError, apiRequest, errorMessage, isAbortError } from "./client";
import { Pagination } from "./pagination";
import type {
  AssetPreview,
  CategoryOption,
  FamilyDetail,
  FamilyReviewStatus,
  FamilySummary,
  PaginationMeta,
} from "./types";

const STATUS_COPY: Record<
  FamilyReviewStatus,
  { label: string; className: string; description: string }
> = {
  CANDIDATE: {
    label: "مرشحة",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    description: "اقتراح آلي يحتاج قراراً بشرياً.",
  },
  APPROVED: {
    label: "معتمدة",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    description: "تم اعتماد علاقة التصنيف فقط؛ المنتجات مستقلة.",
  },
  REJECTED: {
    label: "مرفوضة",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    description: "مستبعدة من الاقتراحات؛ لم يُحذف أي منتج.",
  },
};

function StatusBadge({ status }: { status: FamilyReviewStatus }) {
  return (
    <Badge variant="outline" className={STATUS_COPY[status].className}>
      {STATUS_COPY[status].label}
    </Badge>
  );
}

function familyIdentityIsPublicSafe(family: { nameAr: string; nameEn: string; slug: string }) {
  return (
    family.nameAr.trim().length >= 3 &&
    family.nameEn.trim().length >= 3 &&
    !/(?:مرشح|مرشحة|مؤقت|تجريبي|عنصر\s*نائب)/i.test(family.nameAr) &&
    !/\b(?:candidate|placeholder|temporary|draft)\b/i.test(family.nameEn) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(family.slug) &&
    !/^(?:single|candidate|placeholder|temporary|draft|import|batch)-/i.test(family.slug)
  );
}

function FamilyAssetVisual({ asset, label, sizes }: { asset: AssetPreview; label: string; sizes: string }) {
  if (inferProductMediaKind(asset.url) === "VIDEO") {
    return (
      <video
        src={asset.url}
        controls
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-contain p-1"
        aria-label={asset.altAr || asset.altEn || label}
      >
        متصفحك لا يدعم تشغيل الفيديو.
      </video>
    );
  }
  return (
    <Image
      src={asset.url}
      alt={asset.altAr || asset.altEn || label}
      fill
      sizes={sizes}
      className="object-contain p-1"
      unoptimized
    />
  );
}

function FamilyImages({ family }: { family: FamilySummary }) {
  if (family.assets.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <ImageIcon className="h-6 w-6" aria-hidden="true" />
        <span className="mr-2 text-xs">لا توجد معاينات</span>
      </div>
    );
  }

  return (
    <div className="grid h-32 grid-cols-4 gap-2 overflow-hidden rounded-xl bg-slate-50 p-2">
      {family.assets.map((asset, index) => (
        <div
          key={asset.id}
          className={`relative overflow-hidden rounded-lg bg-white ${
            family.assets.length === 1 ? "col-span-4" : index === 0 ? "col-span-2" : ""
          }`}
        >
          <FamilyAssetVisual asset={asset} label={family.nameAr} sizes="(max-width: 768px) 40vw, 160px" />
        </div>
      ))}
    </div>
  );
}

function DecisionButtons({
  family,
  updating,
  onStatusChange,
}: {
  family: Pick<FamilySummary, "id" | "reviewStatus" | "nameAr" | "nameEn" | "slug">;
  updating: boolean;
  onStatusChange: (nextStatus: FamilyReviewStatus) => void;
}) {
  if (family.reviewStatus !== "CANDIDATE") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={updating}
        onClick={() => onStatusChange("CANDIDATE")}
      >
        {updating ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        إعادة إلى المرشحات
      </Button>
    );
  }

  const publicSafe = familyIdentityIsPublicSafe(family);

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        className="bg-emerald-700 hover:bg-emerald-800"
        disabled={updating || !publicSafe}
        title={!publicSafe ? "حرر الاسم العربي والإنجليزي والرابط قبل الاعتماد" : undefined}
        onClick={() => onStatusChange("APPROVED")}
      >
        {updating ? <Loader2 className="animate-spin" /> : <Check />}
        {publicSafe ? "اعتماد" : "حرر الاسم أولاً"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-rose-200 text-rose-700 hover:bg-rose-50"
        disabled={updating}
        onClick={() => onStatusChange("REJECTED")}
      >
        <X />
        رفض
      </Button>
    </div>
  );
}

function FamilyIdentityEditor({
  family,
  onSaved,
}: {
  family: FamilyDetail;
  onSaved: (updated: Pick<FamilyDetail, "nameAr" | "nameEn" | "slug" | "reviewStatus" | "updatedAt">) => void;
}) {
  const [nameAr, setNameAr] = useState(family.nameAr);
  const [nameEn, setNameEn] = useState(family.nameEn);
  const [slug, setSlug] = useState(family.slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const { data } = await apiRequest<
        Pick<FamilyDetail, "nameAr" | "nameEn" | "slug" | "reviewStatus" | "updatedAt">
      >(`/api/data-quality/families/${family.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameAr,
          nameEn,
          slug,
          expectedUpdatedAt: family.updatedAt,
        }),
      });
      onSaved(data);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.fields) {
        setFieldErrors(requestError.fields);
      }
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const safe = familyIdentityIsPublicSafe({ nameAr, nameEn, slug });

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-amber-100 bg-amber-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">هوية العائلة العامة</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            أسماء المرشحات الحالية داخلية. يجب استبدالها قبل الاعتماد.
          </p>
        </div>
        <Badge variant="outline" className={safe ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>
          {safe ? "صالحة للنشر" : "اسم داخلي"}
        </Badge>
      </div>
      {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`family-name-ar-${family.id}`}>الاسم العربي العام</Label>
          <Input id={`family-name-ar-${family.id}`} value={nameAr} maxLength={160} onChange={(event) => setNameAr(event.target.value)} aria-invalid={Boolean(fieldErrors.nameAr)} />
          {fieldErrors.nameAr && <p className="text-xs text-rose-600">{fieldErrors.nameAr}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`family-name-en-${family.id}`}>الاسم الإنجليزي العام</Label>
          <Input id={`family-name-en-${family.id}`} value={nameEn} maxLength={160} dir="ltr" className="text-left" onChange={(event) => setNameEn(event.target.value)} aria-invalid={Boolean(fieldErrors.nameEn)} />
          {fieldErrors.nameEn && <p className="text-xs text-rose-600">{fieldErrors.nameEn}</p>}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`family-slug-${family.id}`}>الرابط الدائم</Label>
        <Input id={`family-slug-${family.id}`} value={slug} maxLength={120} dir="ltr" className="text-left font-mono" onChange={(event) => setSlug(event.target.value.toLowerCase())} aria-invalid={Boolean(fieldErrors.slug)} />
        {fieldErrors.slug && <p className="text-xs text-rose-600">{fieldErrors.slug}</p>}
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={saving || !safe}>
          {saving && <Loader2 className="animate-spin" />}
          حفظ الهوية وإعادة المراجعة
        </Button>
      </div>
    </form>
  );
}

function FamilyDetailDialog({
  familyId,
  open,
  onOpenChange,
  updating,
  onStatusChange,
  onDataChanged,
}: {
  familyId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updating: boolean;
  onStatusChange: (
    family: Pick<FamilySummary, "id" | "reviewStatus" | "nameAr" | "nameEn" | "slug">,
    nextStatus: FamilyReviewStatus,
  ) => void;
  onDataChanged: () => void;
}) {
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = open && !detail && !error;

  useEffect(() => {
    if (!open || !familyId) return;
    const controller = new AbortController();

    apiRequest<FamilyDetail>(`/api/data-quality/families/${familyId}`, {
      signal: controller.signal,
    })
      .then(({ data }) => {
        setDetail(data);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError)) setError(errorMessage(requestError));
      });

    return () => controller.abort();
  }, [familyId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{detail?.nameAr || "تفاصيل العائلة"}</DialogTitle>
          <DialogDescription>
            افحص الصور والمنتجات المرتبطة قبل تسجيل قرار التصنيف.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400" aria-label="جار التحميل" />
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}
        {detail && (
          <div className="space-y-6">
            <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">الحالة</p>
                <div className="mt-2"><StatusBadge status={detail.reviewStatus} /></div>
              </div>
              <div>
                <p className="text-xs text-slate-500">الفئة</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{detail.category.nameAr}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">مفتاح المصدر</p>
                <p className="mt-2 truncate font-mono text-xs text-slate-700" dir="ltr">
                  {detail.sourceKey}
                </p>
              </div>
            </div>

            <FamilyIdentityEditor
              key={detail.updatedAt}
              family={detail}
              onSaved={(updated) => {
                setDetail((current) => (current ? { ...current, ...updated } : current));
                onDataChanged();
              }}
            />

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">الصور ({detail.assets.length})</h3>
                <span className="text-xs text-slate-500">
                  {detail.assets.filter((asset) => asset.duplicateOfId).length} نسخة مطابقة
                </span>
              </div>
              {detail.assets.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {detail.assets.map((asset) => (
                    <div key={asset.id} className="space-y-2">
                      <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                        <FamilyAssetVisual asset={asset} label={detail.nameAr} sizes="200px" />
                      </div>
                      {asset.duplicateOfId && (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                          نسخة من #{asset.duplicateOfId}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">لا توجد صور مرتبطة.</p>
              )}
            </div>

            <div>
              <h3 className="mb-3 font-semibold text-slate-900">المنتجات ({detail.items.length})</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>SKU</TableHead>
                      <TableHead>الاسم العربي</TableHead>
                      <TableHead>الاسم الإنجليزي</TableHead>
                      <TableHead>الاكتمال</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs" dir="ltr">{item.sku}</TableCell>
                        <TableCell>{item.nameAr}</TableCell>
                        <TableCell dir="ltr" className="text-left">{item.nameEn}</TableCell>
                        <TableCell>{item.completenessScore}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
              <p>
                هذا القرار يغيّر حالة العائلة فقط. لا يجمع السجلات ولا يستبدل أسماء المنتجات
                ولا يحذف الصور المكررة.
              </p>
            </div>

            <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                إغلاق
              </Button>
              <DecisionButtons
                family={detail}
                updating={updating}
                onStatusChange={(nextStatus) => onStatusChange(detail, nextStatus)}
              />
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function FamiliesTab({
  categories,
  refreshVersion,
  onDataChanged,
}: {
  categories: CategoryOption[];
  refreshVersion: number;
  onDataChanged: () => void;
}) {
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<FamilyReviewStatus | "ALL">("CANDIDATE");
  const [categoryId, setCategoryId] = useState("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "12",
      status,
    });
    if (categoryId !== "ALL") params.set("categoryId", categoryId);
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());

    apiRequest<{ families: FamilySummary[] }>(`/api/data-quality/families?${params}`, {
      signal: controller.signal,
    })
      .then(({ data, pagination: nextPagination }) => {
        setFamilies(data.families);
        setPagination(nextPagination || null);
        setError(null);
        if (nextPagination && page > nextPagination.pageCount) {
          setPage(nextPagination.pageCount);
        }
      })
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError)) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [categoryId, deferredSearch, page, refreshVersion, reloadVersion, status]);

  const updateStatus = async (
    family: Pick<FamilySummary, "id" | "reviewStatus" | "nameAr" | "nameEn" | "slug">,
    nextStatus: FamilyReviewStatus,
  ) => {
    setUpdatingId(family.id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/data-quality/families/${family.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: nextStatus,
          expectedStatus: family.reviewStatus,
        }),
      });
      setNotice(
        nextStatus === "APPROVED"
          ? "تم اعتماد علاقة العائلة من دون دمج المنتجات."
          : nextStatus === "REJECTED"
            ? "تم رفض الاقتراح مع إبقاء كل المنتجات كما هي."
            : "أُعيدت العائلة إلى قائمة المرشحات.",
      );
      setDetailId(null);
      setReloadVersion((value) => value + 1);
      onDataChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">طابور مراجعة العائلات</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                قارن الأصول وأرقام المنتجات قبل اعتماد علاقة التجميع.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              الافتراضي يعرض المرشحات فقط
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_220px]">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => {
                  setLoading(true);
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="pr-9"
                placeholder="بحث بالاسم أو SKU أو مفتاح المصدر"
                aria-label="بحث في العائلات"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setLoading(true);
                setStatus(value as FamilyReviewStatus | "ALL");
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="تصفية حسب حالة العائلة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CANDIDATE">مرشحة</SelectItem>
                <SelectItem value="APPROVED">معتمدة</SelectItem>
                <SelectItem value="REJECTED">مرفوضة</SelectItem>
                <SelectItem value="ALL">كل الحالات</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={categoryId}
              onValueChange={(value) => {
                setLoading(true);
                setCategoryId(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="تصفية حسب الفئة">
                <SelectValue placeholder="كل الفئات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل الفئات</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.nameAr} ({category.familyCount || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="جار تحميل العائلات">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-80 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : families.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <Check className="h-8 w-8 text-emerald-600" aria-hidden="true" />
            <p className="mt-3 font-semibold text-slate-900">لا توجد نتائج ضمن هذه التصفية</p>
            <p className="mt-1 text-sm text-slate-500">غيّر الحالة أو الفئة أو عبارة البحث.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {families.map((family) => (
            <Card key={family.id} className="overflow-hidden border-slate-200/80 shadow-sm">
              <CardContent className="space-y-4 p-4">
                <FamilyImages family={family} />
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-950">{family.nameAr}</h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500" dir="ltr">
                        {family.nameEn}
                      </p>
                    </div>
                    <StatusBadge status={family.reviewStatus} />
                  </div>
                  <p className="text-xs text-slate-500">{family.category.nameAr}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-md bg-slate-100 px-2 py-1">{family._count.items} منتجات</span>
                    <span className="rounded-md bg-slate-100 px-2 py-1">{family._count.assets} صور</span>
                  </div>
                </div>
                <p className="min-h-10 text-xs leading-5 text-slate-500">
                  {STATUS_COPY[family.reviewStatus].description}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDetailId(family.id)}>
                    <Eye />
                    فحص التفاصيل
                    <ArrowUpRight />
                  </Button>
                  <DecisionButtons
                    family={family}
                    updating={updatingId === family.id}
                    onStatusChange={(nextStatus) => updateStatus(family, nextStatus)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pagination && (
        <Pagination
          value={pagination}
          onPageChange={(nextPage) => {
            setLoading(true);
            setPage(nextPage);
          }}
        />
      )}

      <FamilyDetailDialog
        key={detailId || "closed"}
        familyId={detailId}
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        updating={updatingId === detailId}
        onStatusChange={updateStatus}
        onDataChanged={() => {
          setReloadVersion((value) => value + 1);
          onDataChanged();
        }}
      />
    </div>
  );
}
