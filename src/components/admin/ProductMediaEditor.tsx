"use client";

import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Film,
  ImageIcon,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  inferProductMediaKind,
  isRemoteProductMediaSource,
  isSafeProductMediaSource,
  normalizeProductMediaList,
  type ProductMediaKind,
  type ProductMediaRole,
} from "@/lib/product-media";
import { cn } from "@/lib/utils";

export interface EditableProductMedia {
  id?: number;
  url: string;
  kind: ProductMediaKind;
  mimeType?: string | null;
  role?: ProductMediaRole;
  sortOrder?: number;
  altAr?: string | null;
  altEn?: string | null;
  reviewStatus?: string | null;
  duplicateOfId?: number | null;
}

interface ProductMediaEditorProps {
  value: EditableProductMedia[];
  onChange: (media: EditableProductMedia[]) => void;
}

function previewKind(item: EditableProductMedia): ProductMediaKind {
  return inferProductMediaKind(item.url, item.mimeType) || item.kind;
}

function ProductMediaPreview({ item, index }: { item: EditableProductMedia; index: number }) {
  const kind = previewKind(item);
  const safe = isSafeProductMediaSource(item.url, kind);
  if (!safe) {
    return (
      <div className="grid h-full w-full place-items-center text-slate-300">
        {kind === "VIDEO" ? <Film className="h-7 w-7" aria-hidden="true" /> : <ImageIcon className="h-7 w-7" aria-hidden="true" />}
      </div>
    );
  }
  if (kind === "VIDEO") {
    return (
      <video
        src={item.url}
        controls
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        aria-label={item.altAr || `معاينة فيديو المنتج ${index + 1}`}
      >
        متصفحك لا يدعم تشغيل الفيديو.
      </video>
    );
  }
  return (
    <Image
      src={item.url}
      alt={item.altAr || `معاينة صورة المنتج ${index + 1}`}
      fill
      sizes="180px"
      className="object-contain p-2"
      unoptimized={isRemoteProductMediaSource(item.url)}
    />
  );
}

export function ProductMediaEditor({ value, onChange }: ProductMediaEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validation = normalizeProductMediaList(value);
  const primaryImageIndex = value.findIndex((item) => previewKind(item) === "IMAGE");

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || value.length >= 24) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        const kind = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
        onChange([
          ...value,
          {
            url: data.url,
            kind,
            role: "GALLERY",
            sortOrder: value.length,
            altAr: "",
            altEn: "",
            reviewStatus: "NEEDS_REVIEW",
            duplicateOfId: null,
          },
        ]);
      } else {
        alert(data.error || "فشل رفع الملف");
      }
    } catch (error) {
      console.error("Upload failed", error);
      alert("فشل رفع الملف");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addItem = (kind: ProductMediaKind) => {
    if (value.length >= 24) return;
    onChange([
      ...value,
      {
        url: "",
        kind,
        role: "GALLERY",
        sortOrder: value.length,
        altAr: "",
        altEn: "",
        reviewStatus: "NEEDS_REVIEW",
        duplicateOfId: null,
      },
    ]);
  };

  const updateItem = (index: number, patch: Partial<EditableProductMedia>) => {
    onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((item, sortOrder) => ({ ...item, sortOrder })));
  };

  const removeItem = (index: number) => {
    onChange(value.filter((_, itemIndex) => itemIndex !== index).map((item, sortOrder) => ({ ...item, sortOrder })));
  };

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 md:col-span-2" aria-labelledby="product-media-title">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 id="product-media-title" className="font-bold text-slate-900">صور وفيديو المنتج</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            رتّب الوسائط كما ستظهر في صفحة المنتج. أول صورة تصبح الصورة الرئيسية. يُسمح بمسارات محلية موثقة أو روابط HTTPS مباشرة لصور وفيديو MP4/WebM.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 flex-wrap justify-end">
          <input
            type="file"
            accept="image/*,video/mp4,video/webm"
            className="hidden"
            ref={fileInputRef}
            onChange={handleUpload}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading || value.length >= 24}>
            <Upload className="ml-1 h-4 w-4" aria-hidden="true" /> {isUploading ? 'جاري الرفع...' : 'رفع ملف'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addItem("IMAGE")} disabled={isUploading || value.length >= 24}>
            <Plus className="ml-1 h-4 w-4" aria-hidden="true" /> صورة
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addItem("VIDEO")} disabled={isUploading || value.length >= 24}>
            <Plus className="ml-1 h-4 w-4" aria-hidden="true" /> فيديو
          </Button>
        </div>
      </div>

      {value.length === 0 ? (
        <div className="grid min-h-28 place-items-center rounded-md border border-dashed border-slate-300 bg-white text-center text-sm text-slate-400">
          أضف صورة واحدة على الأقل لبدء معرض المنتج.
        </div>
      ) : (
        <ol className="space-y-3">
          {value.map((item, index) => {
            const kind = previewKind(item);
            const safe = isSafeProductMediaSource(item.url, kind);
            return (
              <li key={item.id ? `asset-${item.id}` : `draft-${index}`} className="grid gap-4 rounded-md border border-slate-200 bg-white p-3 lg:grid-cols-[10rem_minmax(0,1fr)_2.5rem]">
                <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                  <ProductMediaPreview item={item} index={index} />
                  <span className="absolute right-2 top-2 rounded bg-slate-950/75 px-2 py-1 text-[9px] font-bold text-white">
                    {kind === "VIDEO" ? "فيديو" : index === primaryImageIndex ? "رئيسية" : "صورة"}
                  </span>
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`product-media-url-${index}`}>المصدر</Label>
                    <Input
                      id={`product-media-url-${index}`}
                      value={item.url}
                      onChange={(event) => {
                        const url = event.target.value;
                        updateItem(index, { url, kind: inferProductMediaKind(url) || item.kind });
                      }}
                      placeholder={item.kind === "VIDEO" ? "/media/product-demo.mp4" : "/images/products/product-angle.webp"}
                      className={cn("font-mono text-left text-xs", item.url && !safe && "border-rose-300 focus-visible:ring-rose-300")}
                      dir="ltr"
                    />
                    {item.url && !safe && (
                      <p className="text-xs text-rose-600">تحقق من المسار، امتداد الملف، وأن الرابط الخارجي يبدأ بـ HTTPS.</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`product-media-alt-ar-${index}`}>وصف عربي</Label>
                    <Input
                      id={`product-media-alt-ar-${index}`}
                      value={item.altAr || ""}
                      maxLength={240}
                      onChange={(event) => updateItem(index, { altAr: event.target.value })}
                      placeholder={kind === "VIDEO" ? "جولة فيديو حول المنتج" : "زاوية أمامية للمنتج"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`product-media-alt-en-${index}`}>English description</Label>
                    <Input
                      id={`product-media-alt-en-${index}`}
                      value={item.altEn || ""}
                      maxLength={240}
                      onChange={(event) => updateItem(index, { altEn: event.target.value })}
                      placeholder={kind === "VIDEO" ? "A short product video" : "Front view of the product"}
                      dir="ltr"
                    />
                  </div>
                  {item.reviewStatus && (
                    <p className="text-[11px] text-slate-400 sm:col-span-2">
                      حالة المراجعة: <span className="font-mono" dir="ltr">{item.reviewStatus}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-center gap-1 lg:flex-col">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label="تحريك الوسيط لأعلى">
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveItem(index, 1)} disabled={index === value.length - 1} aria-label="تحريك الوسيط لأسفل">
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => removeItem(index)} aria-label="حذف الوسيط">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!validation.ok && value.every((item) => item.url.trim()) && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
          {validation.errors[0]}
        </div>
      )}
    </section>
  );
}
