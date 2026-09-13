"use client";

import Image from "next/image";
import { FormEvent, useDeferredValue, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Edit3,
  ImageIcon,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { inferProductMediaKind } from "@/lib/product-media";
import { ApiRequestError, apiRequest, errorMessage, isAbortError } from "./client";
import { Pagination } from "./pagination";
import type {
  AssetReviewStatus,
  AssetRole,
  PaginationMeta,
  ReviewAsset,
} from "./types";

function AssetPreviewVisual({ asset, sizes }: { asset: ReviewAsset; sizes: string }) {
  const label = asset.altAr || asset.catalogItem?.nameAr || "وسيط منتج";
  if (inferProductMediaKind(asset.url, asset.mimeType) === "VIDEO") {
    return (
      <video
        src={asset.url}
        controls
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-contain p-2"
        aria-label={label}
      >
        متصفحك لا يدعم تشغيل الفيديو.
      </video>
    );
  }
  return <Image src={asset.url} alt={label} fill sizes={sizes} className="object-contain p-3" unoptimized />;
}

const STATUS_COPY: Record<AssetReviewStatus, { label: string; className: string }> = {
  NEEDS_REVIEW: {
    label: "تحتاج مراجعة",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  APPROVED: {
    label: "معتمدة",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  REJECTED: {
    label: "مرفوضة",
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
};

const ROLE_COPY: Record<AssetRole, string> = {
  PRIMARY: "رئيسية",
  GALLERY: "معرض",
  DETAIL: "تفاصيل",
  LIFESTYLE: "مشهد استخدام",
};

function AssetStatusBadge({ status }: { status: AssetReviewStatus }) {
  return (
    <Badge variant="outline" className={STATUS_COPY[status].className}>
      {STATUS_COPY[status].label}
    </Badge>
  );
}

function AssetEditorDialog({
  asset,
  onOpenChange,
  onSaved,
}: {
  asset: ReviewAsset;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const [altAr, setAltAr] = useState(asset.altAr || "");
  const [altEn, setAltEn] = useState(asset.altEn || "");
  const [role, setRole] = useState<AssetRole>(asset.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutate = async (body: Record<string, unknown>, successMessage: string) => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await apiRequest(`/api/data-quality/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          expectedAltAr: asset.altAr,
          expectedAltEn: asset.altEn,
          expectedRole: asset.role,
          expectedStatus: asset.reviewStatus,
        }),
      });
      onSaved(successMessage);
      onOpenChange(false);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.fields) {
        setFieldErrors(requestError.fields);
      }
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const saveMetadata = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    const nextAltAr = altAr.trim() || null;
    const nextAltEn = altEn.trim() || null;
    if (nextAltAr !== asset.altAr) patch.altAr = nextAltAr;
    if (nextAltEn !== asset.altEn) patch.altEn = nextAltEn;
    if (role !== asset.role) patch.role = role;
    if (Object.keys(patch).length === 0) {
      setError("لم تتغير أي قيمة.");
      return;
    }
    void mutate(
      patch,
      "حُفظ وصف الصورة ودورها، وأُعيدت إلى المراجعة مع تحديث اكتمال المنتج.",
    );
  };

  const normalizedAltAr = altAr.trim() || null;
  const normalizedAltEn = altEn.trim() || null;
  const metadataDirty =
    normalizedAltAr !== asset.altAr ||
    normalizedAltEn !== asset.altEn ||
    role !== asset.role;
  const persistedAltMissing = !asset.altAr?.trim() || !asset.altEn?.trim();
  const decisionDisabled = saving || metadataDirty;
  const approveDisabled = decisionDisabled || persistedAltMissing;
  const approvalBlockReason = metadataDirty
    ? "احفظ تغييرات الوصف والدور أولاً"
    : persistedAltMissing
      ? "احفظ النصين البديلين أولاً"
      : undefined;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>مراجعة الأصل #{asset.id}</DialogTitle>
          <DialogDescription>
            صف ما يظهر فعلياً في الصورة. الرفض يغيّر حالة المراجعة فقط ولا يحذف الملف.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <AssetPreviewVisual asset={asset} sizes="260px" />
            </div>
            <div className="flex flex-wrap gap-2">
              <AssetStatusBadge status={asset.reviewStatus} />
              <Badge variant="secondary">{ROLE_COPY[asset.role]}</Badge>
              {asset.duplicateOfId && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                  <Copy /> نسخة من #{asset.duplicateOfId}
                </Badge>
              )}
            </div>
            <p className="break-all text-[11px] leading-5 text-slate-400" dir="ltr">{asset.url}</p>
          </div>

          <form onSubmit={saveMetadata} className="space-y-5">
            {error && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {error}
              </div>
            )}
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">المنتج المرتبط</p>
              <p className="mt-1 font-semibold text-slate-900">
                {asset.catalogItem?.nameAr || "غير مرتبط بمنتج"}
              </p>
              {asset.catalogItem && (
                <p className="mt-1 font-mono text-xs text-slate-500" dir="ltr">{asset.catalogItem.sku}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`asset-alt-ar-${asset.id}`}>النص البديل العربي</Label>
              <Textarea
                id={`asset-alt-ar-${asset.id}`}
                value={altAr}
                maxLength={300}
                rows={3}
                onChange={(event) => setAltAr(event.target.value)}
                aria-invalid={Boolean(fieldErrors.altAr)}
                placeholder="وصف مختصر ودقيق لما يظهر في الصورة"
              />
              {fieldErrors.altAr && <p className="text-xs text-rose-600">{fieldErrors.altAr}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`asset-alt-en-${asset.id}`}>النص البديل الإنجليزي</Label>
              <Textarea
                id={`asset-alt-en-${asset.id}`}
                value={altEn}
                maxLength={300}
                rows={3}
                dir="ltr"
                className="text-left"
                onChange={(event) => setAltEn(event.target.value)}
                aria-invalid={Boolean(fieldErrors.altEn)}
                placeholder="A concise, factual description of the image"
              />
              {fieldErrors.altEn && <p className="text-xs text-rose-600">{fieldErrors.altEn}</p>}
            </div>
            <div className="space-y-2">
              <Label>دور الصورة</Label>
              <Select value={role} onValueChange={(value) => setRole(value as AssetRole)}>
                <SelectTrigger aria-label="دور الصورة"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIMARY">رئيسية</SelectItem>
                  <SelectItem value="GALLERY">معرض</SelectItem>
                  <SelectItem value="DETAIL">تفاصيل</SelectItem>
                  <SelectItem value="LIFESTYLE">مشهد استخدام</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
              <p>
                حفظ أي تعديل يعيد الصورة والمنتج إلى المراجعة. الاعتماد يتطلب وصفاً عربياً
                وإنجليزياً، ولا يزيل النسخ المكررة تلقائياً.
              </p>
            </div>

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                إغلاق
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline" disabled={saving || !metadataDirty}>
                  {saving ? <Loader2 className="animate-spin" /> : <Edit3 />}
                  حفظ الوصف والدور
                </Button>
                {asset.reviewStatus === "NEEDS_REVIEW" ? (
                  <>
                    <Button
                      type="button"
                      className="bg-emerald-700 hover:bg-emerald-800"
                      disabled={approveDisabled}
                      title={approvalBlockReason}
                      onClick={() => void mutate({ reviewAction: "APPROVE" }, "تم اعتماد الصورة وتحديث اكتمال المنتج.")}
                    >
                      <Check /> اعتماد
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      disabled={decisionDisabled}
                      title={metadataDirty ? "احفظ تغييرات الوصف والدور أولاً" : undefined}
                      onClick={() => void mutate({ reviewAction: "REJECT" }, "رُفضت الصورة من دون حذفها.")}
                    >
                      <X /> رفض
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={decisionDisabled}
                    title={metadataDirty ? "احفظ تغييرات الوصف والدور أولاً" : undefined}
                    onClick={() => void mutate({ reviewAction: "REOPEN" }, "أُعيدت الصورة إلى المراجعة.")}
                  >
                    <RotateCcw /> إعادة فتح
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssetsTab({
  refreshVersion,
  onDataChanged,
}: {
  refreshVersion: number;
  onDataChanged: () => void;
}) {
  const [assets, setAssets] = useState<ReviewAsset[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("NEEDS_REVIEW");
  const [role, setRole] = useState("ALL");
  const [alt, setAlt] = useState("ALL");
  const [duplicate, setDuplicate] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReviewAsset | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "24",
      status,
      role,
      alt,
      duplicate,
    });
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());

    apiRequest<{ assets: ReviewAsset[] }>(`/api/data-quality/assets?${params}`, {
      signal: controller.signal,
    })
      .then(({ data, pagination: nextPagination }) => {
        setAssets(data.assets);
        setPagination(nextPagination || null);
        setError(null);
        if (nextPagination && page > nextPagination.pageCount) setPage(nextPagination.pageCount);
      })
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError)) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [alt, deferredSearch, duplicate, page, refreshVersion, role, status]);

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setLoading(true);
    setter(value);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">طابور مراجعة الوسائط</CardTitle>
          <p className="text-sm leading-6 text-slate-500">
            راجع الوصف البديل والدور والنسخ المطابقة قبل إتاحة الصورة للواجهة العامة.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative md:col-span-2 xl:col-span-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                value={search}
                className="pr-9"
                placeholder="SKU أو اسم المنتج"
                aria-label="بحث في الصور"
                onChange={(event) => {
                  setLoading(true);
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select value={status} onValueChange={(value) => updateFilter(setStatus, value)}>
              <SelectTrigger aria-label="حالة مراجعة الصورة"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NEEDS_REVIEW">تحتاج مراجعة</SelectItem>
                <SelectItem value="APPROVED">معتمدة</SelectItem>
                <SelectItem value="REJECTED">مرفوضة</SelectItem>
                <SelectItem value="ALL">كل الحالات</SelectItem>
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={(value) => updateFilter(setRole, value)}>
              <SelectTrigger aria-label="دور الصورة"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل الأدوار</SelectItem>
                <SelectItem value="PRIMARY">رئيسية</SelectItem>
                <SelectItem value="GALLERY">معرض</SelectItem>
                <SelectItem value="DETAIL">تفاصيل</SelectItem>
                <SelectItem value="LIFESTYLE">مشهد استخدام</SelectItem>
              </SelectContent>
            </Select>
            <Select value={alt} onValueChange={(value) => updateFilter(setAlt, value)}>
              <SelectTrigger aria-label="اكتمال النص البديل"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل النصوص البديلة</SelectItem>
                <SelectItem value="MISSING">نص مفقود</SelectItem>
                <SelectItem value="COMPLETE">النصان مكتملان</SelectItem>
              </SelectContent>
            </Select>
            <Select value={duplicate} onValueChange={(value) => updateFilter(setDuplicate, value)}>
              <SelectTrigger aria-label="حالة التكرار"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">الأصول والنسخ</SelectItem>
                <SelectItem value="ORIGINAL">الأصول فقط</SelectItem>
                <SelectItem value="DUPLICATE">النسخ المطابقة فقط</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="جار تحميل الصور">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-80 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : assets.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <ImageIcon className="h-9 w-9 text-slate-300" aria-hidden="true" />
            <p className="mt-3 font-semibold text-slate-900">لا توجد صور مطابقة</p>
            <p className="mt-1 text-sm text-slate-500">غيّر عوامل التصفية لعرض طابور آخر.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden border-slate-200/80 shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                  <AssetPreviewVisual asset={asset} sizes="(max-width: 768px) 50vw, 260px" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <AssetStatusBadge status={asset.reviewStatus} />
                  <Badge variant="secondary">{ROLE_COPY[asset.role]}</Badge>
                  {asset.duplicateOfId && <Badge variant="outline" className="border-amber-200 text-amber-800"><Copy /> نسخة</Badge>}
                </div>
                <div className="min-h-16">
                  <p className="truncate text-sm font-semibold text-slate-900">{asset.catalogItem?.nameAr || "أصل غير مرتبط"}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500" dir="ltr">{asset.catalogItem?.sku || `asset-${asset.id}`}</p>
                  <p className="mt-1 text-xs text-slate-500">{asset.catalogItem?.category.nameAr}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                  {asset.altAr || "لا يوجد نص بديل عربي بعد."}
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={() => setSelected(asset)}>
                  <Edit3 /> مراجعة الأصل
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pagination && (
        <Pagination value={pagination} onPageChange={(nextPage) => { setLoading(true); setPage(nextPage); }} />
      )}

      {selected && (
        <AssetEditorDialog
          key={selected.id}
          asset={selected}
          onOpenChange={(open) => { if (!open) setSelected(null); }}
          onSaved={(message) => {
            setNotice(message);
            onDataChanged();
          }}
        />
      )}
    </div>
  );
}
