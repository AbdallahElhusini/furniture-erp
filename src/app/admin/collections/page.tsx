"use client";

import React, { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Search, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSafeCollectionImagePath } from "@/lib/collection-publication";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CollectionType = "STYLE" | "SET" | "SPACE" | "CAMPAIGN";

interface Collection {
  id: string;
  type: CollectionType;
  nameAr: string;
  nameEn: string;
  slug: string;
  description?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  image?: string;
  isDraft: boolean;
  isActive: boolean;
  _count?: {
    items: number;
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "حدث خطأ ما";
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Collection>>({
    type: "STYLE",
    nameAr: "",
    nameEn: "",
    slug: "",
    description: "",
    image: "",
    isDraft: true,
    isActive: false,
  });

  const fetchCollections = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/collections");
      if (!res.ok) throw new Error("فشل في جلب المجموعات");
      const data = await res.json();
      setCollections(data);
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/collections")
      .then(async (response) => {
        if (!response.ok) throw new Error("فشل في جلب المجموعات");
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setCollections(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) setError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenDialog = (collection?: Collection) => {
    setSaveError(null);
    if (collection) {
      setEditingCollection(collection);
      setFormData({
        type: collection.type,
        nameAr: collection.nameAr,
        nameEn: collection.nameEn,
        slug: collection.slug,
        description: collection.description || "",
        descriptionAr: collection.descriptionAr || "",
        descriptionEn: collection.descriptionEn || "",
        image: collection.image || "",
        isDraft: collection.isDraft,
        isActive: collection.isActive,
      });
    } else {
      setEditingCollection(null);
      setFormData({
        type: "STYLE",
        nameAr: "",
        nameEn: "",
        slug: "",
        description: "",
        image: "",
        isDraft: true,
        isActive: false,
      });
    }
    setIsDialogOpen(true);
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleNameEnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData((prev) => ({
      ...prev,
      nameEn: val,
      slug: prev.slug && editingCollection ? prev.slug : generateSlug(val),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const url = editingCollection
        ? `/api/collections/${editingCollection.id}`
        : "/api/collections";
      const method = editingCollection ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const payload = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "فشل في حفظ المجموعة");

      await fetchCollections();
      setIsDialogOpen(false);
    } catch (error: unknown) {
      setSaveError(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه المجموعة؟")) return;
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("فشل في حذف المجموعة");
      await fetchCollections();
    } catch (error: unknown) {
      alert(errorMessage(error));
    }
  };

  const filteredCollections = collections.filter(
    (c) =>
      c.nameAr.includes(searchQuery) ||
      c.nameEn.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const publicationChecks = [
    { label: "اسم عربي وإنجليزي واضحان", ready: Boolean(formData.nameAr?.trim() && formData.nameEn?.trim()) },
    { label: "رابط إنجليزي صالح", ready: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formData.slug || "") },
    { label: "وصف عربي من 20 حرفاً على الأقل", ready: (formData.descriptionAr || formData.description || "").trim().length >= 20 },
    { label: "صورة محلية معتمدة", ready: isSafeCollectionImagePath(formData.image) },
    { label: "منتج نشط واحد على الأقل", ready: (editingCollection?._count?.items || 0) > 0 },
  ];
  const readyCheckCount = publicationChecks.filter((check) => check.ready).length;
  const readinessAnnouncement = readyCheckCount === publicationChecks.length
    ? "المجموعة مستوفية لكل متطلبات النشر الظاهرة."
    : `اكتمل ${readyCheckCount} من ${publicationChecks.length} من متطلبات النشر.`;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">إدارة المجموعات والأطقم</h1>
          <p className="text-slate-500 text-sm mt-1">قم بإدارة تشكيلات وأطقم المنتجات</p>
        </div>
        <Button 
          onClick={() => handleOpenDialog()} 
          className="bg-[#9C3B40] hover:bg-[#7a2e32] text-white gap-2"
        >
          <Plus className="h-4 w-4" />
          مجموعة جديدة
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="البحث بالاسم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#9C3B40]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-12 text-red-500 gap-2">
            <AlertCircle className="h-8 w-8" />
            <p>{error}</p>
            <Button variant="outline" onClick={fetchCollections} className="mt-4">
              إعادة المحاولة
            </Button>
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="text-center p-12 text-slate-500">
            لا توجد مجموعات مطابقة للبحث.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow>
                <TableHead className="text-right font-semibold">النوع</TableHead>
                <TableHead className="text-right font-semibold">اسم المجموعة</TableHead>
                <TableHead className="text-right font-semibold">Name</TableHead>
                <TableHead className="text-right font-semibold">الرابط</TableHead>
                <TableHead className="text-right font-semibold">المنتجات النشطة</TableHead>
                <TableHead className="text-right font-semibold">الحالة</TableHead>
                <TableHead className="text-right font-semibold w-[100px]">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCollections.map((collection) => (
                <TableRow key={collection.id}>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      "font-medium",
                      collection.type === 'STYLE' ? "text-blue-700 bg-blue-50 border-blue-200" : "text-purple-700 bg-purple-50 border-purple-200"
                    )}>
                      {collection.type === 'STYLE' ? 'تشكيلة' : collection.type === 'SET' ? 'طقم' : collection.type === 'SPACE' ? 'مساحة' : 'حملة'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{collection.nameAr}</TableCell>
                  <TableCell className="text-slate-600">{collection.nameEn}</TableCell>
                  <TableCell className="text-slate-500 text-sm" dir="ltr">{collection.slug}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                      {collection._count?.items || 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn(
                      "font-normal border-0",
                      !collection.isDraft && collection.isActive
                        ? "bg-emerald-100 text-emerald-700" 
                        : collection.isDraft ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
                    )}>
                      {collection.isDraft ? 'مسودة' : collection.isActive ? 'منشور' : 'غير نشط'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-blue-600"
                        onClick={() => handleOpenDialog(collection)}
                        aria-label={`تعديل مجموعة ${collection.nameAr}`}
                      >
                        <Edit className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-red-600"
                        onClick={() => handleDelete(collection.id)}
                        aria-label={`حذف مجموعة ${collection.nameAr}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {editingCollection ? "تعديل المجموعة" : "إضافة مجموعة جديدة"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="type">النوع</Label>
              <Select
                value={formData.type}
                onValueChange={(val: CollectionType) => setFormData({ ...formData, type: val })}
                dir="rtl"
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STYLE">تشكيلة (Style)</SelectItem>
                  <SelectItem value="SET">طقم (Set)</SelectItem>
                  <SelectItem value="SPACE">مساحة (Space)</SelectItem>
                  <SelectItem value="CAMPAIGN">حملة (Campaign)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="nameAr">الاسم (عربي)</Label>
              <Input
                id="nameAr"
                value={formData.nameAr}
                onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                placeholder="أدخل الاسم بالعربية"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="nameEn">الاسم (إنجليزي)</Label>
              <Input
                id="nameEn"
                value={formData.nameEn}
                onChange={handleNameEnChange}
                placeholder="أدخل الاسم بالإنجليزية"
                dir="ltr"
                className="text-left"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">الرابط (Slug)</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="رابط-المجموعة"
                dir="ltr"
                className="text-left"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="descriptionAr">الوصف (عربي)</Label>
              <Textarea
                id="descriptionAr"
                value={formData.descriptionAr || formData.description || ''}
                onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value, description: e.target.value })}
                placeholder="أدخل وصف المجموعة بالعربية (اختياري)"
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="descriptionEn">الوصف (إنجليزي)</Label>
              <Textarea
                id="descriptionEn"
                value={formData.descriptionEn || ''}
                onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
                placeholder="Optional English description"
                rows={3}
                dir="ltr"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="image">مسار صورة الغلاف</Label>
              <Input
                id="image"
                value={formData.image || ""}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                placeholder="/uploads/catalog/collection-cover.webp"
                dir="ltr"
                className="text-left font-mono text-sm"
              />
              <p className="text-xs leading-5 text-slate-500">
                استخدم صورة محلية موثقة داخل <span dir="ltr">/uploads/catalog</span> أو <span dir="ltr">/images</span>؛ الروابط الخارجية لا تُنشر.
              </p>
            </div>

            <div className="flex items-center justify-between mt-2">
              <Label htmlFor="isDraft" className="cursor-pointer">حالة النشر</Label>
              <Select
                value={formData.isDraft ? "draft" : formData.isActive ? "published" : "inactive"}
                onValueChange={(val) => setFormData({
                  ...formData,
                  isDraft: val === "draft",
                  isActive: val === "published",
                })}
                dir="rtl"
              >
                <SelectTrigger id="isDraft" className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="published">منشور</SelectItem>
                  <SelectItem value="inactive">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.isActive && !formData.isDraft ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="قائمة جاهزية النشر">
                <p className="mb-3 text-sm font-semibold text-slate-900">جاهزية النشر</p>
                <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
                  {readinessAnnouncement}
                </p>
                <ul className="space-y-2 text-sm">
                  {publicationChecks.map((check) => (
                    <li key={check.label} className={cn("flex items-center gap-2", check.ready ? "text-emerald-700" : "text-amber-700")}>
                      <span aria-hidden="true">{check.ready ? "✓" : "○"}</span>
                      {check.label}
                    </li>
                  ))}
                </ul>
                {!editingCollection ? (
                  <p className="mt-3 text-xs leading-5 text-slate-600">أنشئ المجموعة كمسودة أولاً، ثم اربط المنتجات بها من إدارة الكتالوج قبل النشر.</p>
                ) : null}
              </div>
            ) : null}

            {saveError ? (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            ) : null}
          </div>

          <DialogFooter className="sm:justify-start gap-2 flex-row-reverse">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !formData.nameAr || !formData.nameEn || !formData.slug}
              className="bg-[#9C3B40] hover:bg-[#7a2e32] text-white"
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
