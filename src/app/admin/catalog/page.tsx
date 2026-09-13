"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProductMediaEditor, type EditableProductMedia } from '@/components/admin/ProductMediaEditor';
import { parseCatalogImages } from '@/lib/catalog-quality';
import {
  inferProductMediaKind,
  isRemoteProductMediaSource,
  isSafeProductMediaSource,
  normalizeProductMediaList,
} from '@/lib/product-media';
import { cn, formatCurrency } from '@/lib/utils';
import { Search, Plus, Star, Edit, Trash2, LayoutGrid, Package, FolderInput, Activity, FileWarning, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';

interface Category {
  id: number;
  nameAr: string;
  nameEn: string;
  slug: string;
  _count?: { items: number };
}

interface Supplier {
  id: number;
  name: string;
}

interface CatalogItem {
  id: number;
  categoryId: number;
  supplierId?: number | null;
  nameAr: string;
  nameEn: string;
  sku: string;
  descriptionAr?: string | null;
  costPrice: number;
  sellingPrice: number;
  leadTimeDays: number;
  dimensions?: string | null;
  material?: string | null;
  color?: string | null;
  images: string;
  isActive: boolean;
  isFeatured: boolean;
  displayOrder: number;
  completenessScore: number;
  contentStatus: 'NEEDS_REVIEW' | 'READY' | 'VERIFIED';
  category: Category;
  supplier?: Supplier | null;
  collections?: { id: number; nameAr: string; type: string }[];
  assets?: Array<{
    id: number;
    url: string;
    mimeType?: string | null;
    role: 'PRIMARY' | 'GALLERY' | 'DETAIL' | 'LIFESTYLE';
    sortOrder: number;
    altAr?: string | null;
    altEn?: string | null;
    reviewStatus?: string | null;
    duplicateOfId?: number | null;
  }>;
}

function editableMediaForItem(item: CatalogItem): EditableProductMedia[] {
  const structured = (item.assets || [])
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((asset): EditableProductMedia[] => {
      const kind = inferProductMediaKind(asset.url, asset.mimeType);
      return kind ? [{ ...asset, kind }] : [];
    });
  if (structured.length > 0) return structured;
  return parseCatalogImages(item.images).map((url, index) => ({
    url,
    kind: 'IMAGE',
    role: index === 0 ? 'PRIMARY' : 'GALLERY',
    sortOrder: index,
    altAr: '',
    altEn: '',
    reviewStatus: 'NEEDS_REVIEW',
    duplicateOfId: null,
  }));
}

export default function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allCollections, setAllCollections] = useState<{id: number, nameAr: string, type: string}[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0, featured: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  
  // Dialogs state
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [itemsToDelete, setItemsToDelete] = useState<number[]>([]);
  const [itemsToMove, setItemsToMove] = useState<number[]>([]);
  const [targetCategory, setTargetCategory] = useState('');
  const [mediaDraft, setMediaDraft] = useState<EditableProductMedia[]>([]);
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Form state for product
  const [formData, setFormData] = useState<Partial<CatalogItem> & { collectionIds?: number[] }>({
    isActive: true,
    isFeatured: false,
    costPrice: 0,
    sellingPrice: 0,
    leadTimeDays: 7,
    collectionIds: []
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
      setIsLoading(true);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/categories?active=true&leaf=true'),
      fetch('/api/suppliers?active=true'),
      fetch('/api/collections'),
    ])
      .then(async ([categoriesRes, suppliersRes, collectionsRes]) => {
        const [categoryData, supplierData, collectionData] = await Promise.all([
          categoriesRes.ok ? categoriesRes.json() : [],
          suppliersRes.ok ? suppliersRes.json() : [],
          collectionsRes.ok ? collectionsRes.json() : [],
        ]);
        if (!cancelled) {
          setCategories(categoryData);
          setSuppliers(supplierData);
          setAllCollections(collectionData);
        }
      })
      .catch((error) => console.error('Error fetching filter data:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const queryParams = new URLSearchParams();
    queryParams.append('isActive', statusFilter);
    queryParams.append('page', page.toString());
    queryParams.append('pageSize', '50');
    if (categoryFilter !== 'all') queryParams.append('category', categoryFilter);
    if (supplierFilter !== 'all') queryParams.append('supplierId', supplierFilter);
    if (debouncedSearch) queryParams.append('search', debouncedSearch);

    fetch(`/api/catalog?${queryParams.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Catalog request failed');
        return response.json();
      })
      .then((data) => {
        setItems(data.items);
        setPagination(data.pagination);
        setSummary(data.summary);
        setSelectedItems([]);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Error fetching catalog items:', error);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [categoryFilter, statusFilter, debouncedSearch, supplierFilter, page, refreshKey]);

  const refreshCatalog = () => {
    setIsLoading(true);
    setRefreshKey((value) => value + 1);
  };

  const handleSaveProduct = async () => {
    const validation = normalizeProductMediaList(mediaDraft);
    if (!validation.ok) {
      setProductFormError(validation.errors[0]);
      return;
    }
    try {
      setIsSavingProduct(true);
      setProductFormError(null);
      const method = editingItem ? 'PUT' : 'POST';
      const url = editingItem ? `/api/catalog/${editingItem.id}` : '/api/catalog';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, media: validation.media })
      });
      
      if (res.ok) {
        setIsProductDialogOpen(false);
        refreshCatalog();
      } else {
        const data = await res.json().catch(() => ({}));
        const details = Array.isArray(data.details) ? data.details[0] : data.details;
        setProductFormError(details || data.error || 'تعذر حفظ المنتج. راجع البيانات وحاول مرة أخرى.');
      }
    } catch (error) {
      setProductFormError(error instanceof Error ? error.message : 'تعذر حفظ المنتج.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleDelete = async () => {
    if (itemsToDelete.length === 0) return;
    try {
      const res = await fetch(`/api/catalog/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: itemsToDelete })
      });
      if (res.ok) {
        setIsDeleteDialogOpen(false);
        setItemsToDelete([]);
        setSelectedItems([]);
        refreshCatalog();
      }
    } catch (error) {
      console.error('Error deleting items:', error);
    }
  };

  const handleMoveProducts = async () => {
    if (itemsToMove.length === 0 || !targetCategory) return;
    try {
      for (const id of itemsToMove) {
        await fetch(`/api/catalog/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId: parseInt(targetCategory) })
        });
      }
      setIsMoveDialogOpen(false);
      setItemsToMove([]);
      setTargetCategory('');
      refreshCatalog();
    } catch (error) {
      console.error('Error moving items:', error);
    }
  };

  const toggleFeatured = async (id: number, currentStatus: boolean) => {
    try {
      await fetch(`/api/catalog/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: !currentStatus })
      });
      refreshCatalog();
    } catch (error) {
      console.error('Error toggling featured:', error);
    }
  };

  const toggleActive = async (id: number, currentStatus: boolean) => {
    try {
      await fetch(`/api/catalog/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      refreshCatalog();
    } catch (error) {
      console.error('Error toggling active:', error);
    }
  };

  const moveProductOrder = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const current = items[index];
    const target = items[targetIndex];
    const currentOrder = current.displayOrder;
    const targetOrder = target.displayOrder;
    const nextItems = [...items];
    nextItems[index] = { ...current, displayOrder: targetOrder };
    nextItems[targetIndex] = { ...target, displayOrder: currentOrder };
    [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];
    setItems(nextItems);

    try {
      const responses = await Promise.all([
        fetch(`/api/catalog/${current.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayOrder: targetOrder }),
        }),
        fetch(`/api/catalog/${target.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayOrder: currentOrder }),
        }),
      ]);
      if (responses.some((response) => !response.ok)) throw new Error('Failed to persist display order');
    } catch (orderError) {
      console.error(orderError);
      refreshCatalog();
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(items.map(i => i.id));
    } else {
      setSelectedItems([]);
    }
  };

  const toggleSelectItem = (id: number) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter(i => i !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  const openEditDialog = (item: CatalogItem) => {
    setEditingItem(item);
    setFormData({ 
      ...item,
      collectionIds: item.collections?.map(c => c.id) || []
    });
    setMediaDraft(editableMediaForItem(item));
    setProductFormError(null);
    setIsProductDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingItem(null);
    setFormData({
      isActive: true,
      isFeatured: false,
      costPrice: 0,
      sellingPrice: 0,
      leadTimeDays: 7,
      sku: `PRD-${Math.floor(Math.random() * 10000)}`,
      collectionIds: []
    });
    setMediaDraft([]);
    setProductFormError(null);
    setIsProductDialogOpen(true);
  };

  // Stats
  const totalCount = summary.total;
  const activeCount = summary.active;
  const featuredCount = summary.featured;
  const inactiveCount = summary.inactive;
  const mediaDraftIsValid = normalizeProductMediaList(mediaDraft).ok;

  return (
    <div className="p-8 space-y-8 bg-slate-50 min-h-screen text-slate-900 font-sans" dir="rtl">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-[#c5a975]" />
            إدارة المنتجات والكتالوج
          </h1>
          <p className="text-slate-500 mt-1">إضافة، تعديل، نقل، وتسعير منتجات الأثاث المكتبي</p>
        </div>
        <Button onClick={openNewDialog} className="bg-[#0f172a] hover:bg-slate-800 text-white gap-2">
          <Plus className="w-4 h-4" />
          منتج جديد +
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500">إجمالي المنتجات</p>
            <p className="text-xl font-bold text-slate-900">{totalCount}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500">نشط</p>
            <p className="text-xl font-bold text-slate-900">{activeCount}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-yellow-50 rounded-lg text-yellow-600">
            <Star className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500">مميز</p>
            <p className="text-xl font-bold text-slate-900">{featuredCount}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 rounded-lg text-rose-600">
            <FileWarning className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500">غير نشط</p>
            <p className="text-xl font-bold text-slate-900">{inactiveCount}</p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-center">
        <div className="flex flex-wrap lg:flex-nowrap gap-4 flex-1 w-full">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="البحث بالاسم، SKU، أو الخامة..." 
              className="pr-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setPage(1); setIsLoading(true); }}>
            <SelectTrigger className="w-full lg:w-[180px]">
              <SelectValue placeholder="كل الفئات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.slug}>{c.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); setIsLoading(true); }}>
            <SelectTrigger className="w-full lg:w-[150px]">
              <SelectValue placeholder="حالة المنتج" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="inactive">غير نشط</SelectItem>
              <SelectItem value="featured">مميز</SelectItem>
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={(value) => { setSupplierFilter(value); setPage(1); setIsLoading(true); }}>
            <SelectTrigger className="w-full lg:w-[150px]">
              <SelectValue placeholder="المورد" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الموردين</SelectItem>
              {suppliers.map(s => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedItems.length > 0 && (
        <div className="bg-slate-900 text-white p-3 rounded-lg flex items-center justify-between animate-in slide-in-from-top-4">
          <span className="text-sm font-medium px-2">تم تحديد {selectedItems.length} منتجات</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="text-slate-900 border-white bg-white hover:bg-slate-100" onClick={() => {
              setItemsToMove(selectedItems);
              setIsMoveDialogOpen(true);
            }}>
              <FolderInput className="w-4 h-4 ml-2" />
              نقل
            </Button>
            <Button size="sm" variant="destructive" onClick={() => {
              setItemsToDelete(selectedItems);
              setIsDeleteDialogOpen(true);
            }}>
              <Trash2 className="w-4 h-4 ml-2" />
              حذف
            </Button>
          </div>
        </div>
      )}

      {/* Product Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-100">
            <TableRow>
              <TableHead className="w-10">
                <input 
                  type="checkbox" 
                  className="rounded border-slate-300"
                  checked={items.length > 0 && selectedItems.length === items.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </TableHead>
              <TableHead className="font-semibold text-slate-700 text-center whitespace-nowrap">ترتيب العرض</TableHead>
              <TableHead className="font-semibold text-slate-700 whitespace-nowrap">صورة</TableHead>
              <TableHead className="font-semibold text-slate-700 whitespace-nowrap">كود SKU</TableHead>
              <TableHead className="font-semibold text-slate-700 min-w-[200px]">اسم المنتج</TableHead>
              <TableHead className="font-semibold text-slate-700 whitespace-nowrap">الفئة</TableHead>
              <TableHead className="font-semibold text-slate-700 whitespace-nowrap">المورد</TableHead>
              <TableHead className="font-semibold text-slate-700 whitespace-nowrap">التكلفة</TableHead>
              <TableHead className="font-semibold text-slate-700 whitespace-nowrap">البيع</TableHead>
              <TableHead className="font-semibold text-slate-700 whitespace-nowrap">الخصم %</TableHead>
              <TableHead className="font-semibold text-slate-700 whitespace-nowrap">هامش الربح</TableHead>
              <TableHead className="font-semibold text-slate-700 whitespace-nowrap">التصنيع</TableHead>
              <TableHead className="font-semibold text-slate-700 text-center whitespace-nowrap">اكتمال البيانات</TableHead>
              <TableHead className="font-semibold text-slate-700 text-center whitespace-nowrap">الحالة</TableHead>
              <TableHead className="font-semibold text-slate-700 text-center whitespace-nowrap">مميز</TableHead>
              <TableHead className="font-semibold text-slate-700 text-center whitespace-nowrap">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={16} className="text-center py-12 text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <Activity className="w-8 h-8 animate-spin text-slate-300 mb-2" />
                    جاري التحميل...
                  </div>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={16} className="text-center py-12 text-slate-500">لا توجد منتجات تطابق البحث</TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => {
                const margin = item.sellingPrice - item.costPrice;
                const marginPercent = item.costPrice > 0 ? ((margin / item.costPrice) * 100).toFixed(1) : '0';
                
                return (
                  <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="text-center">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveProductOrder(index, -1)}
                          disabled={index === 0}
                          aria-label="تحريك المنتج لأعلى"
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <span className="min-w-8 font-mono text-xs text-slate-500" dir="ltr">{item.displayOrder}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveProductOrder(index, 1)}
                          disabled={index === items.length - 1}
                          aria-label="تحريك المنتج لأسفل"
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="p-2">
                      {(() => {
                        let img = null;
                        if (item.images) {
                           try {
                             const parsed = JSON.parse(item.images);
                             if (Array.isArray(parsed) && parsed.length > 0) img = parsed[0];
                           } catch {}
                        }
                        return isSafeProductMediaSource(img, 'IMAGE') ? (
                          <div className="relative w-12 h-12 rounded bg-slate-100 overflow-hidden flex items-center justify-center">
                            <Image
                              src={img}
                              alt={item.sku}
                              fill
                              sizes="48px"
                              className="object-cover"
                              unoptimized={isRemoteProductMediaSource(img)}
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-[10px]">
                            -
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className="font-mono text-xs text-slate-600 bg-slate-50">{item.sku}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{item.nameAr}</div>
                      <div className="text-xs text-slate-500">{item.nameEn}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <button 
                        onClick={() => {
                          setItemsToMove([item.id]);
                          setIsMoveDialogOpen(true);
                        }}
                        className="text-sm text-slate-700 hover:text-[#c5a975] hover:underline flex items-center gap-1"
                      >
                        {item.category?.nameAr || '-'}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 whitespace-nowrap">{item.supplier?.name || '-'}</TableCell>
                    <TableCell className="text-sm font-medium text-slate-700 whitespace-nowrap">
                      {formatCurrency(item.costPrice)}
                    </TableCell>
                    <TableCell className="text-sm font-bold text-slate-900 whitespace-nowrap">
                      {formatCurrency(item.sellingPrice)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <Badge variant="outline" className="bg-slate-50 text-slate-600">% {marginPercent}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="text-sm font-medium text-emerald-600" dir="ltr">
                        +{formatCurrency(margin)}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 whitespace-nowrap">{item.leadTimeDays} يوم</TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <Badge variant="outline" className={cn(
                        "font-mono",
                        item.completenessScore >= 80
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : item.completenessScore >= 50
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                      )}>
                        {item.completenessScore}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <Badge className={cn(
                        "font-normal cursor-pointer", 
                        item.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )} onClick={() => toggleActive(item.id, item.isActive)}>
                        {item.isActive ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <button onClick={() => toggleFeatured(item.id, item.isFeatured)} className={cn("transition-colors", item.isFeatured ? "text-yellow-500" : "text-slate-300 hover:text-yellow-400")}>
                        <Star className={cn("w-5 h-5", item.isFeatured && "fill-current")} />
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)} className="h-8 w-8 text-slate-500 hover:text-blue-600">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => {
                          setItemsToDelete([item.id]);
                          setIsDeleteDialogOpen(true);
                        }} className="h-8 w-8 text-slate-500 hover:text-rose-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-slate-500">
            عرض {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} من {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => { setIsLoading(true); setPage((value) => Math.max(1, value - 1)); }}>
              <ChevronRight className="ml-1 h-4 w-4" /> السابق
            </Button>
            <span className="px-2 text-sm text-slate-600">{pagination.page} / {pagination.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages || isLoading} onClick={() => { setIsLoading(true); setPage((value) => Math.min(pagination.totalPages, value + 1)); }}>
              التالي <ChevronLeft className="mr-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Product Dialog */}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="max-w-5xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#0f172a]">
              {editingItem ? 'تعديل منتج' : 'إضافة منتج جديد'}
            </DialogTitle>
            <DialogDescription>
              أدخل تفاصيل المنتج ليتم إضافته للكتالوج وعرضه في النظام.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>اسم المنتج (عربي) *</Label>
                <Input 
                  value={formData.nameAr || ''} 
                  onChange={e => setFormData({...formData, nameAr: e.target.value})} 
                  placeholder="مكتب مدير خشب زان"
                />
              </div>

              <div className="space-y-2">
                <Label>اسم المنتج (إنجليزي) *</Label>
                <Input 
                  value={formData.nameEn || ''} 
                  onChange={e => setFormData({...formData, nameEn: e.target.value})} 
                  placeholder="Executive Beech Wood Desk"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label>كود الصنف (SKU) *</Label>
                <Input 
                  value={formData.sku || ''} 
                  onChange={e => setFormData({...formData, sku: e.target.value})} 
                  placeholder="مثال: DESK-001"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label>الفئة *</Label>
                <Select value={formData.categoryId?.toString() || ''} onValueChange={(v) => setFormData({...formData, categoryId: parseInt(v)})}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الفئة" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>المورد</Label>
                <Select value={formData.supplierId?.toString() || 'none'} onValueChange={(v) => setFormData({...formData, supplierId: v === 'none' ? null : parseInt(v)})}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المورد (اختياري)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مورد محدد</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {allCollections && allCollections.length > 0 && (
                <div className="space-y-2 border border-slate-100 p-3 rounded-md bg-slate-50">
                  <Label className="text-primary font-bold mb-2 block">المجموعات والأطقم المرتبطة</Label>
                  <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-1">
                    {allCollections.map(c => {
                      const isChecked = formData.collectionIds?.includes(c.id) || false;
                      return (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input 
                            type="checkbox"
                            className="rounded border-slate-300 accent-primary"
                            checked={isChecked}
                            onChange={(e) => {
                              const currentIds = formData.collectionIds || [];
                              if (e.target.checked) {
                                setFormData({ ...formData, collectionIds: [...currentIds, c.id] });
                              } else {
                                setFormData({ ...formData, collectionIds: currentIds.filter(id => id !== c.id) });
                              }
                            }}
                          />
                          <span className={isChecked ? "font-medium text-primary" : "text-slate-600"}>{c.nameAr}</span>
                          <Badge variant="outline" className="text-[10px] scale-75 origin-right">{c.type}</Badge>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-6 mt-4">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4 rounded border-slate-300 text-[#0f172a] focus:ring-[#0f172a]" />
                  <Label htmlFor="isActive" className="cursor-pointer">منتج نشط</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <input type="checkbox" id="isFeatured" checked={formData.isFeatured} onChange={e => setFormData({...formData, isFeatured: e.target.checked})} className="w-4 h-4 rounded border-slate-300 text-[#c5a975] focus:ring-[#c5a975]" />
                  <Label htmlFor="isFeatured" className="cursor-pointer">عرض كمنتج مميز</Label>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>سعر التكلفة (ج.م)</Label>
                  <Input 
                    type="number" 
                    value={formData.costPrice || 0} 
                    onChange={e => setFormData({...formData, costPrice: parseFloat(e.target.value)})} 
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>سعر البيع (ج.م)</Label>
                  <Input 
                    type="number" 
                    value={formData.sellingPrice || 0} 
                    onChange={e => setFormData({...formData, sellingPrice: parseFloat(e.target.value)})} 
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-500">هامش الربح المتوقع:</span>
                  <span className="font-bold text-emerald-600" dir="ltr">
                    +{formatCurrency((formData.sellingPrice || 0) - (formData.costPrice || 0))}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, ((formData.sellingPrice || 0) - (formData.costPrice || 0)) / (formData.costPrice || 1) * 100)}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>فترة التصنيع (بالأيام)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.leadTimeDays || 7}
                    onChange={e => setFormData({...formData, leadTimeDays: parseInt(e.target.value)})}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>ترتيب العرض</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.displayOrder ?? ''}
                    onChange={e => setFormData({...formData, displayOrder: e.target.value === '' ? undefined : parseInt(e.target.value)})}
                    placeholder="تلقائي"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label>الأبعاد</Label>
                  <Input value={formData.dimensions || ''} onChange={e => setFormData({...formData, dimensions: e.target.value})} placeholder="120x60x75 cm" dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>الخامة</Label>
                  <Input value={formData.material || ''} onChange={e => setFormData({...formData, material: e.target.value})} placeholder="خشب زان" />
                </div>
                <div className="space-y-2">
                  <Label>اللون</Label>
                  <Input value={formData.color || ''} onChange={e => setFormData({...formData, color: e.target.value})} placeholder="بني غامق" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>الوصف (عربي)</Label>
                <Textarea 
                  value={formData.descriptionAr || ''} 
                  onChange={e => setFormData({...formData, descriptionAr: e.target.value})} 
                  placeholder="وصف تفصيلي للمنتج..."
                  rows={3}
                />
              </div>
            </div>

            <ProductMediaEditor value={mediaDraft} onChange={setMediaDraft} />
          </div>

          {productFormError && (
            <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {productFormError}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              onClick={handleSaveProduct}
              disabled={isSavingProduct || !mediaDraftIsValid}
              className="bg-[#0f172a] hover:bg-slate-800 text-white"
            >
              {isSavingProduct ? 'جاري الحفظ...' : 'حفظ المنتج'}
            </Button>
            <Button variant="outline" onClick={() => setIsProductDialogOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Product Dialog */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>نقل المنتجات ({itemsToMove.length})</DialogTitle>
            <DialogDescription>
              اختر الفئة الجديدة لنقل المنتجات المحددة إليها.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>الفئة الجديدة</Label>
            <Select value={targetCategory} onValueChange={setTargetCategory}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="اختر الفئة..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={handleMoveProducts} disabled={!targetCategory} className="bg-[#0f172a] text-white">
              تأكيد النقل
            </Button>
            <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-rose-600 flex items-center gap-2">
              <FileWarning className="w-5 h-5" />
              تأكيد الحذف
            </DialogTitle>
            <DialogDescription>
              هل أنت متأكد من رغبتك في حذف هذا المنتج؟ سيتم تعطيل المنتج ولن يظهر في الكتالوج العام.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start mt-4">
            <Button variant="destructive" onClick={handleDelete}>
              نعم، احذف المنتج
            </Button>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
