"use client";

import { useId, useRef, useState, type PointerEvent } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Film, ImageOff } from "lucide-react";
import { formatStorefrontNumber, interpolateStorefrontMessage } from "@/lib/i18n/storefront";
import { isRemoteProductMediaSource, type ProductMediaKind } from "@/lib/product-media";
import { STOREFRONT_PAGE_CONTENT_DEFAULTS, type StorefrontPageContent } from "@/lib/storefront-content-defaults";
import { cn } from "@/lib/utils";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";

export interface ProductGalleryMedia {
  url: string;
  kind: ProductMediaKind;
  mimeType?: string | null;
  altAr?: string | null;
  altEn?: string | null;
}

interface ProductGalleryProps {
  media: readonly ProductGalleryMedia[];
  productName: string;
  content?: StorefrontPageContent["gallery"];
}

const MEDIA_COPY = {
  ar: {
    image: "صورة المنتج",
    video: "فيديو المنتج",
    videoShort: "فيديو",
    previous: "عرض الوسيط السابق",
    next: "عرض الوسيط التالي",
    thumbnails: "صور وفيديوهات المنتج المصغرة",
    mediaOf: "وسيط {current} من {total}",
    selectImage: "عرض صورة المنتج {current} من {total}",
    selectVideo: "عرض فيديو المنتج {current} من {total}",
    unsupportedVideo: "متصفحك لا يدعم تشغيل هذا الفيديو.",
  },
  en: {
    image: "Product image",
    video: "Product video",
    videoShort: "Video",
    previous: "View previous media",
    next: "View next media",
    thumbnails: "Product image and video thumbnails",
    mediaOf: "Media {current} of {total}",
    selectImage: "View product image {current} of {total}",
    selectVideo: "View product video {current} of {total}",
    unsupportedVideo: "Your browser does not support this video.",
  },
} as const;

function LocalOrRemoteImage({
  src,
  alt,
  thumbnail = false,
}: {
  src: string;
  alt: string;
  thumbnail?: boolean;
}) {
  const className = thumbnail
    ? "h-full w-full object-contain p-2.5"
    : "motion-enter-scale h-full w-full object-contain p-[8%] drop-shadow-[0_26px_22px_rgba(48,35,25,0.13)] motion-reduce:animate-none motion-reduce:transform-none";

  if (isRemoteProductMediaSource(src)) {
    return (
      // The media allow-list is validated server-side; native img keeps approved HTTPS hosts usable without a build-time host list.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading={thumbnail ? "lazy" : "eager"}
        decoding="async"
        referrerPolicy="no-referrer"
        className={className}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      loading={thumbnail ? "lazy" : "eager"}
      fetchPriority={thumbnail ? "auto" : "high"}
      sizes={thumbnail ? "96px" : "(max-width: 1024px) 94vw, 58vw"}
      className={className}
    />
  );
}

export function ProductGallery({ media, productName, content }: ProductGalleryProps) {
  const { locale, direction } = useStorefrontI18n();
  const copy = content || STOREFRONT_PAGE_CONTENT_DEFAULTS[locale].gallery;
  const mediaCopy = MEDIA_COPY[locale];
  const [activeIndex, setActiveIndex] = useState(0);
  const mediaId = useId();
  const depthLayerRef = useRef<HTMLDivElement>(null);

  if (media.length === 0) {
    return (
      <div className="editorial-crosshair relative flex aspect-[1.05/1] w-full flex-col items-center justify-center overflow-hidden rounded-[var(--shape-frame)] border border-border-strong bg-white text-center">
        <div className="pointer-events-none absolute inset-5 border border-border-subtle" aria-hidden="true" />
        <span className="pointer-events-none absolute left-5 top-4 font-mono text-[9px] font-bold tracking-[0.18em] text-text-soft" dir={direction}>
          {copy.pendingLabel}
        </span>
        <span className="pointer-events-none absolute bottom-5 right-5 font-mono text-[9px] tracking-[0.16em] text-text-soft" dir={direction}>
          {interpolateStorefrontMessage(copy.coordinate, { x: formatStorefrontNumber(0, locale), y: formatStorefrontNumber(0, locale) })}
        </span>
        <span className="relative inline-flex h-20 w-20 items-center justify-center rounded-[var(--shape-control)] border border-border-subtle bg-surface-raised/75 text-text-soft shadow-contact">
          <ImageOff className="h-8 w-8" strokeWidth={1.25} aria-hidden="true" />
        </span>
        <p className="relative mt-5 text-sm font-semibold text-text-muted">{copy.pendingTitle}</p>
        <p className="relative mt-1 max-w-64 text-xs leading-6 text-text-soft">
          {copy.pendingBody}
        </p>
      </div>
    );
  }

  const safeIndex = Math.min(activeIndex, media.length - 1);
  const activeMedia = media[safeIndex];
  const activeAlt = (locale === "ar" ? activeMedia.altAr : activeMedia.altEn)?.trim()
    || (locale === "ar" ? activeMedia.altEn : activeMedia.altAr)?.trim()
    || productName;
  const activeKindLabel = activeMedia.kind === "VIDEO" ? mediaCopy.video : mediaCopy.image;

  const resetDepth = () => {
    const layer = depthLayerRef.current;
    if (!layer) return;
    layer.style.removeProperty("--gallery-rotate-x");
    layer.style.removeProperty("--gallery-rotate-y");
    layer.style.removeProperty("--gallery-shift-x");
    layer.style.removeProperty("--gallery-shift-y");
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (
      activeMedia.kind === "VIDEO"
      || event.pointerType !== "mouse"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const layer = depthLayerRef.current;
    if (!layer) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    layer.style.setProperty("--gallery-rotate-x", `${(-y * 1.8).toFixed(2)}deg`);
    layer.style.setProperty("--gallery-rotate-y", `${(x * 2.4).toFixed(2)}deg`);
    layer.style.setProperty("--gallery-shift-x", `${(x * 0.22).toFixed(2)}rem`);
    layer.style.setProperty("--gallery-shift-y", `${(y * 0.12).toFixed(2)}rem`);
  };

  const selectPrevious = () => {
    resetDepth();
    setActiveIndex((current) => (current - 1 + media.length) % media.length);
  };

  const selectNext = () => {
    resetDepth();
    setActiveIndex((current) => (current + 1) % media.length);
  };

  const counterValues = {
    current: formatStorefrontNumber(safeIndex + 1, locale),
    total: formatStorefrontNumber(media.length, locale),
  };

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <figure
        className="group editorial-crosshair stage-perspective relative aspect-[1.05/1] w-full overflow-hidden rounded-[var(--shape-frame)] border border-border-strong bg-white shadow-stage"
        onPointerMove={handlePointerMove}
        onPointerLeave={resetDepth}
      >
        <span className="pointer-events-none absolute left-5 top-4 z-10 font-mono text-[9px] font-bold tracking-[0.18em] text-text-soft" dir={direction}>
          {activeKindLabel} / {formatStorefrontNumber(safeIndex + 1, locale).padStart(2, locale === "ar" ? "٠" : "0")}
        </span>
        <span className="pointer-events-none absolute bottom-5 right-5 z-10 font-mono text-[9px] tracking-[0.16em] text-text-soft" dir={direction}>
          {interpolateStorefrontMessage(copy.coordinate, { x: formatStorefrontNumber(42.18, locale), y: formatStorefrontNumber(19.04, locale) })}
        </span>
        {activeMedia.kind === "IMAGE" && (
          <span className="pointer-events-none absolute inset-x-[19%] bottom-[9%] h-[9%] rounded-[50%] bg-walnut-900/15 blur-2xl transition-[inset,opacity] duration-700 ease-premium group-hover:inset-x-[17%] group-hover:opacity-80 motion-reduce:transition-none" />
        )}

        <div
          id={mediaId}
          ref={depthLayerRef}
          className="absolute inset-0 motion-transform will-change-transform motion-reduce:transform-none"
          style={{
            transform:
              "translate3d(var(--gallery-shift-x, 0), var(--gallery-shift-y, 0), 0) rotateX(var(--gallery-rotate-x, 0deg)) rotateY(var(--gallery-rotate-y, 0deg))",
          }}
        >
          {activeMedia.kind === "VIDEO" ? (
            <video
              key={activeMedia.url}
              controls
              playsInline
              preload="metadata"
              aria-label={`${mediaCopy.video}: ${activeAlt}`}
              className="h-full w-full bg-white object-contain px-[3%] pb-[3%] pt-[8%]"
            >
              <source src={activeMedia.url} type={activeMedia.mimeType || undefined} />
              {mediaCopy.unsupportedVideo}
            </video>
          ) : (
            <LocalOrRemoteImage key={activeMedia.url} src={activeMedia.url} alt={activeAlt} />
          )}
        </div>

        {media.length > 1 && (
          <>
            <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between" dir={direction}>
              <button
                type="button"
                onClick={selectPrevious}
                className="grid size-11 place-items-center rounded-[var(--shape-control)] border border-white/80 bg-white/78 text-text-strong shadow-contact backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none"
                aria-label={mediaCopy.previous}
                aria-controls={mediaId}
              >
                {locale === "ar" ? (
                  <ChevronRight className="size-4.5" aria-hidden="true" />
                ) : (
                  <ChevronLeft className="size-4.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={selectNext}
                className="grid size-11 place-items-center rounded-[var(--shape-control)] border border-white/80 bg-white/78 text-text-strong shadow-contact backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none"
                aria-label={mediaCopy.next}
                aria-controls={mediaId}
              >
                {locale === "ar" ? (
                  <ChevronLeft className="size-4.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-4.5" aria-hidden="true" />
                )}
              </button>
            </div>

            <figcaption
              className="absolute bottom-4 left-4 z-10 rounded-[var(--shape-control)] border border-white/80 bg-white/78 px-3.5 py-2 text-[11px] font-bold text-text-muted shadow-contact backdrop-blur-md"
              aria-live="polite"
            >
              {interpolateStorefrontMessage(mediaCopy.mediaOf, counterValues)}
            </figcaption>
          </>
        )}
      </figure>

      {media.length > 1 && (
        <ul className="flex gap-2.5 overflow-x-auto pb-2 custom-scrollbar" aria-label={mediaCopy.thumbnails}>
          {media.map((item, index) => {
            const isActive = safeIndex === index;
            const itemCounterValues = {
              current: formatStorefrontNumber(index + 1, locale),
              total: formatStorefrontNumber(media.length, locale),
            };
            const selectLabel = item.kind === "VIDEO" ? mediaCopy.selectVideo : mediaCopy.selectImage;

            return (
              <li key={`${item.url}:${index}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    resetDepth();
                    setActiveIndex(index);
                  }}
                  className={cn(
                    "relative h-20 w-20 overflow-hidden rounded-[var(--shape-control)] border bg-white transition-[opacity,transform,border-color,box-shadow] duration-300 sm:h-24 sm:w-24",
                    isActive
                      ? "border-primary/55 opacity-100 shadow-[0_0_0_3px_rgba(134,54,61,0.08)]"
                      : "border-border-subtle opacity-[0.55] hover:-translate-y-0.5 hover:border-primary/30 hover:opacity-100 motion-reduce:transform-none",
                  )}
                  aria-label={interpolateStorefrontMessage(selectLabel, itemCounterValues)}
                  aria-pressed={isActive}
                  aria-controls={mediaId}
                >
                  {item.kind === "VIDEO" ? (
                    <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-forest-950 text-white">
                      <Film className="size-5" strokeWidth={1.5} aria-hidden="true" />
                      <span className="text-[9px] font-bold uppercase tracking-[0.12em]">{mediaCopy.videoShort}</span>
                    </span>
                  ) : (
                    <LocalOrRemoteImage src={item.url} alt="" thumbnail />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
