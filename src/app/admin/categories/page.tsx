"use client";

import React, { useCallback, useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Edit, Trash2, Plus, ArrowUp, ArrowDown, Check, X, AlertTriangle, FolderTree, ImageIcon } from 'lucide-react';

interface Category {
  id: number;
  parentId: number | null;
  nameAr: string;
  nameEn: string;
  slug: string;
  image: string | null;
  sortOrder: number;
  isActive: boolean;
  parent?: Pick<Category, 'id' | 'nameAr' | 'nameEn' | 'slug'> | null;
  _count?: {
    items: number;
  };
}

const SAFE_CATEGORY_IMAGE = /^\/(?:uploads\/catalog|images)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:avif|gif|jpe?g|png|webp)$/i;

function isSafeCategoryImagePath(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      !value.includes('..') &&
      !value.includes('\\') &&
      !value.includes('%') &&
      !value.includes('?') &&
      !value.includes('#') &&
      SAFE_CATEGORY_IMAGE.test(value)
  );
}

async function requestCategories(): Promise<Category[]> {
  const res = await fetch('/api/categories');
  if (!res.ok) throw new Error('فشل في تحميل الفئات');
  const data = await res.json() as Category[];
  return data.sort((a, b) => a.sortOrder - b.sortOrder);
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState<Partial<Category>>({
    nameAr: '',
    nameEn: '',
    slug: '',
    parentId: null,
    image: null,
    isActive: true,
    sortOrder: 0
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setCategories(await requestCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void requestCategories()
      .then((data) => {
        if (!active) return;
        setCategories(data);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'حدث خطأ غير متوقع');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };

  const handleNameEnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nameEn = e.target.value;
    setFormData(prev => ({
      ...prev,
      nameEn,
      slug: prev.slug === generateSlug(prev.nameEn || '') ? generateSlug(nameEn) : prev.slug
    }));
  };

  const openAddDialog = () => {
    setEditingId(null);
    setFormData({
      nameAr: '',
      nameEn: '',
      slug: '',
      parentId: null,
      image: null,
      isActive: true,
      sortOrder: categories.length > 0 ? Math.max(...categories.map(c => c.sortOrder)) + 1 : 0
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingId(category.id);
    setFormData({
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      slug: category.slug,
      parentId: category.parentId,
      image: category.image,
      isActive: category.isActive,
      sortOrder: category.sortOrder
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openDeleteDialog = (category: Category) => {
    setDeletingCategory(category);
    setDeleteError(null);
    setIsDeleteOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nameAr || !formData.nameEn) {
      return; // Basic validation
    }

    try {
      setIsSubmitting(true);
      setFormError(null);
      const url = editingId ? `/api/categories/${editingId}` : '/api/categories';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'فشل في حفظ الفئة');
      }
      
      await fetchCategories();
      setIsFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الفئة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const parentOptions = categories.filter(
    (category) => category.parentId === null && category.id !== editingId
  );
  const previewImage = isSafeCategoryImagePath(formData.image) ? formData.image : null;

  const handleDelete = async () => {
    if (!deletingCategory) return;

    try {
      setIsSubmitting(true);
      setDeleteError(null);
      const res = await fetch(`/api/categories/${deletingCategory.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'لا يمكن حذف هذه الفئة لوجود منتجات مرتبطة بها');
      }
      
      await fetchCategories();
      setIsDeleteOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحذف');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (category: Category) => {
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      if (!res.ok) throw new Error('فشل في تحديث الحالة');
      
      setCategories(categories.map(c => 
        c.id === category.id ? { ...c, isActive: !c.isActive } : c
      ));
    } catch (err) {
      console.error(err);
    }
  };

  const moveCategory = async (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === categories.length - 1)
    ) return;

    const newCategories = [...categories];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap sortOrders
    const currentSort = newCategories[index].sortOrder;
    const targetSort = newCategories[targetIndex].sortOrder;
    
    newCategories[index] = { ...newCategories[index], sortOrder: targetSort };
    newCategories[targetIndex] = { ...newCategories[targetIndex], sortOrder: currentSort };
    
    // Sort array by new sortOrder
    newCategories.sort((a, b) => a.sortOrder - b.sortOrder);
    setCategories(newCategories);

    // Persist changes
    try {
      await Promise.all([
        fetch(`/api/categories/${newCategories[index].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: newCategories[index].sortOrder }),
        }),
        fetch(`/api/categories/${newCategories[targetIndex].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: newCategories[targetIndex].sortOrder }),
        })
      ]);
    } catch (err) {
      console.error('Failed to update sort order', err);
      fetchCategories(); // Revert on error
    }
  };

  return (
    <div className="p-6 md:p-8 w-full max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen text-slate-900" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">إدارة الفئات والتصنيفات</h1>
          <p className="text-slate-500 mt-1 text-sm">إدارة أقسام المنتجات في المتجر</p>
        </div>
        <Button 
          onClick={openAddDialog}
          className="bg-[#0f172a] hover:bg-slate-800 text-white shadow-sm transition-all"
        >
          <Plus className="ml-2 h-4 w-4" /> فئة جديدة
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">جاري التحميل...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">{error}</div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
              <Plus size={24} />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">لا توجد فئات</h3>
            <p className="text-slate-500 mb-4 text-sm">ابدأ بإضافة أول فئة للمنتجات</p>
            <Button onClick={openAddDialog} variant="outline" className="border-slate-300">إضافة فئة</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow>
                  <TableHead className="text-right w-24">الترتيب</TableHead>
                  <TableHead className="text-right w-24">الصورة</TableHead>
                  <TableHead className="text-right">اسم الفئة</TableHead>
                  <TableHead className="text-right">الفئة الرئيسية</TableHead>
                  <TableHead className="text-left font-sans" dir="ltr">Category Name</TableHead>
                  <TableHead className="text-left font-sans text-slate-400" dir="ltr">Slug</TableHead>
                  <TableHead className="text-center w-24">المنتجات</TableHead>
                  <TableHead className="text-center w-24">الحالة</TableHead>
                  <TableHead className="text-left w-32">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category, index) => (
                  <TableRow key={category.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <button 
                          onClick={() => moveCategory(index, 'up')}
                          disabled={index === 0}
                          className="text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <span className="text-xs font-medium text-slate-500">{category.sortOrder}</span>
                        <button 
                          onClick={() => moveCategory(index, 'down')}
                          disabled={index === categories.length - 1}
                          className="text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="relative h-12 w-16 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                        {isSafeCategoryImagePath(category.image) ? (
                          <Image
                            src={category.image}
                            alt={`صورة ${category.nameAr}`}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-slate-400">
                            <ImageIcon className="h-4 w-4" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{category.nameAr}</TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {category.parent ? (
                        <span className="inline-flex items-center gap-1.5">
                          <FolderTree className="h-3.5 w-3.5" aria-hidden="true" />
                          {category.parent.nameAr}
                        </span>
                      ) : (
                        <span className="text-slate-400">رئيسية</span>
                      )}
                    </TableCell>
                    <TableCell className="font-sans text-left text-slate-600" dir="ltr">{category.nameEn}</TableCell>
                    <TableCell className="font-sans text-left text-slate-400 text-sm" dir="ltr">{category.slug}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                        {category._count?.items || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <button 
                        onClick={() => toggleActive(category)}
                        className="focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 rounded-full p-1 transition-transform active:scale-95"
                      >
                        {category.isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0 flex gap-1 items-center px-2 shadow-none cursor-pointer">
                            <Check className="h-3 w-3" /> نشط
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500 border-slate-300 hover:bg-slate-100 flex gap-1 items-center px-2 cursor-pointer">
                            <X className="h-3 w-3" /> معطل
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openEditDialog(category)}
                          className="h-8 w-8 text-slate-500 hover:text-[#c5a975] hover:bg-[#c5a975]/10"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openDeleteDialog(category)}
                          className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">
              {editingId ? 'تعديل الفئة' : 'إضافة فئة جديدة'}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              أدخل تفاصيل الفئة هنا. اضغط على حفظ عند الانتهاء.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid gap-2">
              <Label htmlFor="nameAr" className="text-right text-slate-700 font-medium">الاسم بالعربية <span className="text-red-500">*</span></Label>
              <Input
                id="nameAr"
                value={formData.nameAr}
                onChange={(e) => setFormData(prev => ({ ...prev, nameAr: e.target.value }))}
                className="border-slate-300 focus-visible:ring-[#c5a975]"
                placeholder="مثال: غرف نوم"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nameEn" className="text-left font-sans text-slate-700 font-medium" dir="ltr">Name in English <span className="text-red-500">*</span></Label>
              <Input
                id="nameEn"
                value={formData.nameEn}
                onChange={handleNameEnChange}
                className="border-slate-300 focus-visible:ring-[#c5a975] text-left font-sans"
                placeholder="e.g. Bedrooms"
                dir="ltr"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug" className="text-left font-sans text-slate-700 font-medium" dir="ltr">URL Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                className="border-slate-300 focus-visible:ring-[#c5a975] text-left font-sans bg-slate-50"
                dir="ltr"
              />
              <p className="text-xs text-slate-500" dir="ltr">Only lowercase letters, numbers, and hyphens.</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="parentId" className="text-slate-700 font-medium">الفئة الرئيسية</Label>
              <select
                id="parentId"
                value={formData.parentId ?? ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  parentId: e.target.value ? Number(e.target.value) : null,
                }))}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#c5a975] focus:ring-2 focus:ring-[#c5a975]/25"
              >
                <option value="">فئة رئيسية مستقلة</option>
                {parentOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nameAr} — {category.nameEn}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-slate-500">
                اختر فئة رئيسية للتصنيفات الفرعية، أو اتركها مستقلة لإنشاء قسم رئيسي.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="image" className="text-slate-700 font-medium">صورة بانر الفئة</Label>
              <Input
                id="image"
                value={formData.image || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
                className="border-slate-300 font-mono text-left text-xs focus-visible:ring-[#c5a975]"
                placeholder="/images/editorial/category-banner.webp"
                dir="ltr"
              />
              <p className="text-xs leading-5 text-slate-500">
                مسار محلي آمن داخل <span dir="ltr" className="font-mono">/images</span> أو <span dir="ltr" className="font-mono">/uploads/catalog</span>.
              </p>
              {formData.image && !previewImage && (
                <p className="text-xs font-medium text-red-600">المسار غير صالح أو امتداد الصورة غير مدعوم.</p>
              )}
              {previewImage && (
                <div className="relative mt-1 aspect-[16/7] overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                  <Image
                    src={previewImage}
                    alt="معاينة بانر الفئة"
                    fill
                    sizes="460px"
                    className="object-cover"
                  />
                  <span className="absolute bottom-2 right-2 rounded bg-slate-950/75 px-2 py-1 text-[10px] font-medium text-white">
                    معاينة البانر
                  </span>
                </div>
              )}
            </div>

            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}
            
            <div className="flex items-center space-x-2 space-x-reverse pt-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-[#0f172a] focus:ring-[#0f172a]"
              />
              <Label htmlFor="isActive" className="text-slate-700 font-medium cursor-pointer">
                فئة نشطة (تظهر للعملاء)
              </Label>
            </div>
          </div>
          <DialogFooter className="sm:justify-start gap-2">
            <Button 
              type="button" 
              onClick={handleSave} 
              disabled={isSubmitting || !formData.nameAr || !formData.nameEn || Boolean(formData.image && !previewImage)}
              className="bg-[#0f172a] hover:bg-slate-800 text-white"
            >
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsFormOpen(false)}
              className="border-slate-300 text-slate-700"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[425px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              تأكيد الحذف
            </DialogTitle>
            <DialogDescription className="text-slate-600 pt-2 text-base">
              هل أنت متأكد من رغبتك في حذف الفئة <span className="font-bold text-slate-900">{deletingCategory?.nameAr}</span>؟
            </DialogDescription>
          </DialogHeader>
          
          {deleteError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mt-2 border border-red-100">
              {deleteError}
            </div>
          )}
          
          <div className="bg-amber-50 p-3 rounded-md text-sm text-amber-800 mt-2 border border-amber-200">
            ملاحظة: لا يمكن حذف الفئة إذا كان هناك منتجات مرتبطة بها. 
            عدد المنتجات الحالي: {deletingCategory?._count?.items || 0}
          </div>

          <DialogFooter className="sm:justify-start gap-2 mt-4">
            <Button 
              type="button" 
              variant="destructive" 
              onClick={handleDelete}
              disabled={isSubmitting || (deletingCategory?._count?.items || 0) > 0}
            >
              {isSubmitting ? 'جاري الحذف...' : 'نعم، احذف الفئة'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsDeleteOpen(false)}
              className="border-slate-300"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
