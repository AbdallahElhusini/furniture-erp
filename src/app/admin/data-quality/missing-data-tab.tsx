"use client";

import Image from "next/image";
import { FormEvent, useDeferredValue, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  ImageIcon,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError, apiRequest, errorMessage, isAbortError } from "./client";
import { Pagination } from "./pagination";
import type {
  CategoryOption,
  ContentStatus,
  PaginationMeta,
  QueueItem,
  TagGroupOption,
} from "./types";

const CONTENT_STATUS_COPY: Record<
  ContentStatus,
  { label: string; className: string }
> = {
  NEEDS_REVIEW: {
    label: "يحتاج مراجعة",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  READY: {
    label: "جاهز للتحقق",
    className: "border-blue-200 bg-blue-50 text-blue-800",
  },
  VERIFIED: {
    label: "تم التحقق",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
};

const MISSING_COPY: Record<string, string> = {
  IDENTITY: "هوية حقيقية",
  DESCRIPTION_AR: "وصف عربي",
  DESCRIPTION_EN: "وصف إنجليزي",
  DIMENSIONS: "الأبعاد",
  MATERIAL: "الخامة",
  COLOR: "اللون",
  SPECIFICATIONS: "المواصفات",
  PRICE: "السعر",
  LEAD_TIME: "مدة التوريد",
  SUPPLIER: "المورد",
  MEDIA: "الصور",
  MEDIA_REVIEW: "مراجعة الصور",
};

interface EditorDraft {
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  dimensions: string;
  material: string;
  color: string;
  specifications: string;
  sellingPrice: string;
  leadTimeDays: string;
  tagIds: number[];
}

const OPTIONAL_TEXT_FIELDS = [
  "descriptionAr",
  "descriptionEn",
  "dimensions",
  "material",
  "color",
  "specifications",
] as const;

function draftFromItem(item: QueueItem): EditorDraft {
  return {
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    descriptionAr: item.descriptionAr || "",
    descriptionEn: item.descriptionEn || "",
    dimensions: item.dimensions || "",
    material: item.material || "",
    color: item.color || "",
    specifications: item.specifications || "",
    sellingPrice: String(item.sellingPrice),
    leadTimeDays: String(item.leadTimeDays),
    tagIds: item.tags.map((tag) => tag.id),
  };
}

function scoreTone(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return (
    <Badge variant="outline" className={CONTENT_STATUS_COPY[status].className}>
      {CONTENT_STATUS_COPY[status].label}
    </Badge>
  );
}

function buildPatch(item: QueueItem, draft: EditorDraft) {
  const patch: Record<string, string | number | number[] | null> = {};
  const trimmedNameAr = draft.nameAr.trim();
  const trimmedNameEn = draft.nameEn.trim();
  if (trimmedNameAr !== item.nameAr) patch.nameAr = trimmedNameAr;
  if (trimmedNameEn !== item.nameEn) patch.nameEn = trimmedNameEn;

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const nextValue = draft[field].trim() || null;
    if (nextValue !== item[field]) patch[field] = nextValue;
  }

  const sellingPrice = Number(draft.sellingPrice);
  const leadTimeDays = Number(draft.leadTimeDays);
  if (sellingPrice !== item.sellingPrice) patch.sellingPrice = sellingPrice;
  if (leadTimeDays !== item.leadTimeDays) patch.leadTimeDays = leadTimeDays;

  const currentTagIds = item.tags.map((tag) => tag.id).sort((a, b) => a - b);
  const nextTagIds = [...draft.tagIds].sort((a, b) => a - b);
  if (currentTagIds.join(",") !== nextTagIds.join(",")) patch.tagIds = nextTagIds;

  return patch;
}

function ItemEditorDialog({
  item,
  open,
  onOpenChange,
  onSaved,
  tagGroups,
}: {
  item: QueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
  tagGroups: TagGroupOption[];
}) {
  const [draft, setDraft] = useState<EditorDraft>(() => draftFromItem(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const setField = (field: keyof EditorDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const toggleTag = (tagId: number, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      tagIds: checked
        ? [...new Set([...current.tagIds, tagId])]
        : current.tagIds.filter((id) => id !== tagId),
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!draft.nameAr.trim() || !draft.nameEn.trim()) {
      setFieldErrors({
        ...(!draft.nameAr.trim() ? { nameAr: "الاسم العربي مطلوب." } : {}),
        ...(!draft.nameEn.trim() ? { nameEn: "الاسم الإنجليزي مطلوب." } : {}),
      });
      return;
    }
    if (
      !Number.isFinite(Number(draft.sellingPrice)) ||
      Number(draft.sellingPrice) < 0
    ) {
      setFieldErrors({ sellingPrice: "أدخل سعراً صحيحاً يساوي صفراً أو أكثر." });
      return;
    }
    if (
      !Number.isSafeInteger(Number(draft.leadTimeDays)) ||
      Number(draft.leadTimeDays) < 0
    ) {
      setFieldErrors({ leadTimeDays: "أدخل عدداً صحيحاً من الأيام." });
      return;
    }
    if (draft.specifications.trim()) {
      try {
        const parsed: unknown = JSON.parse(draft.specifications);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setFieldErrors({ specifications: "يجب أن تكون المواصفات كائن JSON صالحاً." });
          return;
        }
      } catch {
        setFieldErrors({ specifications: "صيغة JSON غير صالحة." });
        return;
      }
    }

    const patch = buildPatch(item, draft);
    if (Object.keys(patch).length === 0) {
      setError("لم تتغير أي قيمة.");
      return;
    }

    setSaving(true);
    try {
      await apiRequest(`/api/data-quality/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, expectedUpdatedAt: item.updatedAt }),
      });
      onSaved("حُفظت الحقائق المدخلة وأُعيد احتساب مؤشر الاكتمال.");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>تحرير بيانات {item.sku}</DialogTitle>
          <DialogDescription>
            أدخل معلومات متحققة فقط. لا تضف قياسات أو خامات أو وعود توريد تقديرية.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-6">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`nameAr-${item.id}`}>الاسم العربي</Label>
              <Input
                id={`nameAr-${item.id}`}
                value={draft.nameAr}
                maxLength={160}
                onChange={(event) => setField("nameAr", event.target.value)}
                aria-invalid={Boolean(fieldErrors.nameAr)}
              />
              {fieldErrors.nameAr && <p className="text-xs text-rose-600">{fieldErrors.nameAr}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`nameEn-${item.id}`}>الاسم الإنجليزي</Label>
              <Input
                id={`nameEn-${item.id}`}
                value={draft.nameEn}
                maxLength={160}
                dir="ltr"
                className="text-left"
                onChange={(event) => setField("nameEn", event.target.value)}
                aria-invalid={Boolean(fieldErrors.nameEn)}
              />
              {fieldErrors.nameEn && <p className="text-xs text-rose-600">{fieldErrors.nameEn}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`descriptionAr-${item.id}`}>الوصف العربي</Label>
              <Textarea
                id={`descriptionAr-${item.id}`}
                value={draft.descriptionAr}
                maxLength={5_000}
                rows={5}
                onChange={(event) => setField("descriptionAr", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`descriptionEn-${item.id}`}>الوصف الإنجليزي</Label>
              <Textarea
                id={`descriptionEn-${item.id}`}
                value={draft.descriptionEn}
                maxLength={5_000}
                rows={5}
                dir="ltr"
                className="text-left"
                onChange={(event) => setField("descriptionEn", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`dimensions-${item.id}`}>الأبعاد</Label>
              <Input
                id={`dimensions-${item.id}`}
                value={draft.dimensions}
                maxLength={255}
                placeholder="مثال موثق: 120 × 60 × 75 سم"
                onChange={(event) => setField("dimensions", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`material-${item.id}`}>الخامة</Label>
              <Input
                id={`material-${item.id}`}
                value={draft.material}
                maxLength={255}
                onChange={(event) => setField("material", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`color-${item.id}`}>اللون / التشطيب</Label>
              <Input
                id={`color-${item.id}`}
                value={draft.color}
                maxLength={255}
                onChange={(event) => setField("color", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`sellingPrice-${item.id}`}>سعر البيع (ج.م)</Label>
              <Input
                id={`sellingPrice-${item.id}`}
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                value={draft.sellingPrice}
                dir="ltr"
                className="text-left"
                onChange={(event) => setField("sellingPrice", event.target.value)}
                aria-invalid={Boolean(fieldErrors.sellingPrice)}
              />
              {fieldErrors.sellingPrice && (
                <p className="text-xs text-rose-600">{fieldErrors.sellingPrice}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`leadTimeDays-${item.id}`}>مدة التوريد (يوم)</Label>
              <Input
                id={`leadTimeDays-${item.id}`}
                type="number"
                min="0"
                max="3650"
                step="1"
                value={draft.leadTimeDays}
                dir="ltr"
                className="text-left"
                onChange={(event) => setField("leadTimeDays", event.target.value)}
                aria-invalid={Boolean(fieldErrors.leadTimeDays)}
              />
              {fieldErrors.leadTimeDays && (
                <p className="text-xs text-rose-600">{fieldErrors.leadTimeDays}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`specifications-${item.id}`}>المواصفات المنظمة (JSON)</Label>
            <Textarea
              id={`specifications-${item.id}`}
              value={draft.specifications}
              maxLength={10_000}
              rows={5}
              dir="ltr"
              className="font-mono text-left text-xs"
              placeholder='{"verifiedKey":"verified value"}'
              onChange={(event) => setField("specifications", event.target.value)}
              aria-invalid={Boolean(fieldErrors.specifications)}
            />
            {fieldErrors.specifications && (
              <p className="text-xs text-rose-600">{fieldErrors.specifications}</p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <Label>وسوم الاكتشاف المنضبطة</Label>
              <p className="mt-1 text-xs text-slate-500">
                اختر من القاموس الحالي فقط؛ لا تُنشأ وسوم حرة من هذا المحرر.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {tagGroups.map((group) => (
                <div key={group.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-800">{group.nameAr}</p>
                  <div className="space-y-2.5">
                    {group.tags.map((tag) => {
                      const checked = draft.tagIds.includes(tag.id);
                      return (
                        <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleTag(tag.id, value === true)}
                          />
                          <span>{tag.nameAr}</span>
                          <span className="text-[11px] text-slate-400" dir="ltr">{tag.nameEn}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <p>
              الحفظ يعيد حساب الاكتمال ويزيل حالة «تم التحقق» عند تغيير المحتوى. التحقق
              النهائي خطوة منفصلة ومتاحة فقط عند اكتمال 80% فأكثر مع اسم غير عام.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              حفظ وإعادة الاحتساب
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MissingDataTab({
  categories,
  refreshVersion,
  onDataChanged,
}: {
  categories: CategoryOption[];
  refreshVersion: number;
  onDataChanged: () => void;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [apiCategories, setApiCategories] = useState<CategoryOption[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroupOption[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("UNVERIFIED");
  const [scoreBand, setScoreBand] = useState("ALL");
  const [missing, setMissing] = useState("ALL");
  const [categoryId, setCategoryId] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const availableCategories = categories.length > 0 ? categories : apiCategories;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "25",
      status,
      scoreBand,
      missing,
    });
    if (categoryId !== "ALL") params.set("categoryId", categoryId);
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());

    apiRequest<{ items: QueueItem[]; categories: CategoryOption[]; tagGroups: TagGroupOption[] }>(
      `/api/data-quality/items?${params}`,
      { signal: controller.signal },
    )
      .then(({ data, pagination: nextPagination }) => {
        setItems(data.items);
        setApiCategories(data.categories);
        setTagGroups(data.tagGroups);
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
  }, [categoryId, deferredSearch, missing, page, refreshVersion, scoreBand, status]);

  const performReviewAction = async (
    item: QueueItem,
    reviewAction: "VERIFY" | "RETURN_TO_REVIEW",
  ) => {
    setUpdatingId(item.id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/data-quality/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewAction, expectedUpdatedAt: item.updatedAt }),
      });
      setNotice(
        reviewAction === "VERIFY"
          ? `تم التحقق من ${item.sku}.`
          : `أُعيد ${item.sku} إلى مسار المراجعة.`,
      );
      onDataChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setUpdatingId(null);
    }
  };

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setLoading(true);
    setter(value);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">طابور استكمال الحقائق</CardTitle>
          <p className="text-sm leading-6 text-slate-500">
            يبدأ بالمنتجات غير المتحققة والأقل اكتمالاً. كل حقل يُحفظ من مصدر موثوق فقط.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative md:col-span-2 xl:col-span-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => {
                  setLoading(true);
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="pr-9"
                placeholder="اسم أو SKU"
                aria-label="بحث في المنتجات"
              />
            </div>
            <Select value={status} onValueChange={(value) => updateFilter(setStatus, value)}>
              <SelectTrigger aria-label="تصفية حسب حالة المحتوى"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UNVERIFIED">غير متحقق فقط</SelectItem>
                <SelectItem value="NEEDS_REVIEW">يحتاج مراجعة</SelectItem>
                <SelectItem value="READY">جاهز للتحقق</SelectItem>
                <SelectItem value="VERIFIED">تم التحقق</SelectItem>
                <SelectItem value="ALL">كل الحالات</SelectItem>
              </SelectContent>
            </Select>
            <Select value={scoreBand} onValueChange={(value) => updateFilter(setScoreBand, value)}>
              <SelectTrigger aria-label="تصفية حسب الاكتمال"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل نسب الاكتمال</SelectItem>
                <SelectItem value="CRITICAL">حرج: أقل من 50%</SelectItem>
                <SelectItem value="INCOMPLETE">50% – 79%</SelectItem>
                <SelectItem value="COMPLETE">80% فأكثر</SelectItem>
              </SelectContent>
            </Select>
            <Select value={missing} onValueChange={(value) => updateFilter(setMissing, value)}>
              <SelectTrigger aria-label="تصفية حسب الحقل المفقود"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل الفجوات</SelectItem>
                <SelectItem value="DESCRIPTION">الوصف</SelectItem>
                <SelectItem value="DIMENSIONS">الأبعاد</SelectItem>
                <SelectItem value="MATERIAL">الخامة</SelectItem>
                <SelectItem value="COLOR">اللون</SelectItem>
                <SelectItem value="SPECIFICATIONS">المواصفات</SelectItem>
                <SelectItem value="SUPPLIER">المورد</SelectItem>
                <SelectItem value="MEDIA">الصور</SelectItem>
                <SelectItem value="PRICE">السعر</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryId} onValueChange={(value) => updateFilter(setCategoryId, value)}>
              <SelectTrigger aria-label="تصفية حسب الفئة"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل الفئات</SelectItem>
                {availableCategories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.nameAr} ({category.itemCount})
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

      <Card className="overflow-hidden border-slate-200/80 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-72 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-slate-400" aria-label="جار تحميل المنتجات" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden="true" />
              <p className="mt-3 font-semibold text-slate-900">لا توجد منتجات مطابقة</p>
              <p className="mt-1 text-sm text-slate-500">جرّب توسيع التصفية أو اختر حالة أخرى.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="min-w-52">المنتج</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead className="min-w-44">الفجوات</TableHead>
                  <TableHead className="min-w-32">الاكتمال</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">الإجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                          {item.previewAsset ? (
                            <Image
                              src={item.previewAsset.url}
                              alt={item.previewAsset.altAr || item.nameAr}
                              fill
                              sizes="48px"
                              className="object-contain p-1"
                              unoptimized
                            />
                          ) : (
                            <ImageIcon className="absolute inset-0 m-auto h-4 w-4 text-slate-300" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-52 truncate font-medium text-slate-900">{item.nameAr}</p>
                          <p className="mt-1 font-mono text-[11px] text-slate-500" dir="ltr">{item.sku}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{item.category.nameAr}</TableCell>
                    <TableCell>
                      <div className="flex max-w-64 flex-wrap gap-1">
                        {item.missingFields.slice(0, 4).map((field) => (
                          <Badge key={field} variant="secondary" className="font-normal">
                            {MISSING_COPY[field] || field}
                          </Badge>
                        ))}
                        {item.missingFields.length > 4 && (
                          <Badge variant="outline">+{item.missingFields.length - 4}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-800">{item.completenessScore}%</span>
                        </div>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${scoreTone(item.completenessScore)}`}
                            style={{ width: `${item.completenessScore}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><ContentStatusBadge status={item.contentStatus} /></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setSelectedItem(item)}>
                          <Edit3 />
                          تحرير
                        </Button>
                        {item.contentStatus === "READY" && (
                          <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-700 hover:bg-emerald-800"
                            disabled={updatingId === item.id}
                            onClick={() => performReviewAction(item, "VERIFY")}
                          >
                            {updatingId === item.id ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                            تحقق
                          </Button>
                        )}
                        {item.contentStatus === "VERIFIED" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={updatingId === item.id}
                            onClick={() => performReviewAction(item, "RETURN_TO_REVIEW")}
                          >
                            {updatingId === item.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                            إعادة فتح
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pagination && (
        <Pagination
          value={pagination}
          onPageChange={(nextPage) => {
            setLoading(true);
            setPage(nextPage);
          }}
        />
      )}

      {selectedItem && (
        <ItemEditorDialog
          key={selectedItem.id}
          item={selectedItem}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedItem(null);
          }}
          onSaved={(message) => {
            setNotice(message);
            onDataChanged();
          }}
          tagGroups={tagGroups}
        />
      )}
    </div>
  );
}
