"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpLeft, ArrowUpRight, Layers3, Ruler, Sparkles } from "lucide-react";
import { AddToQuoteButton } from "./AddToQuoteButton";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";
import {
  formatSellingPrice,
  hasSellingPrice,
} from "@/lib/catalog-commerce";
import { isGenericCatalogName, parseCatalogImages } from "@/lib/catalog-quality";
import { isSafeCatalogAssetUrl } from "@/lib/catalog-publication";
import { interpolateStorefrontMessage, pickStorefrontText } from "@/lib/i18n/storefront";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import { isRemoteProductMediaSource, isSafeProductMediaSource } from "@/lib/product-media";
import { STOREFRONT_PAGE_CONTENT_DEFAULTS, type StorefrontPageContent } from "@/lib/storefront-content-defaults";
import { cn } from "@/lib/utils";

export interface ProductCardProps {
  item: {
    id: number;
    nameAr: string;
    nameEn: string;
    sku: string;
    dimensions?: string | null;
    material?: string | null;
    color?: string | null;
    images?: string | null;
    isFeatured?: boolean;
    sellingPrice?: number | null;
    category?: {
      nameAr: string;
      slug: string;
      nameEn?: string;
    } | null;
    supplier?: {
      name: string;
    } | null;
  };
  featuredBadge?: boolean;
  priority?: boolean;
  approvedAssetUrls?: string[];
  allowLegacyImages?: boolean;
  sequence?: number;
  layout?: "standard" | "feature";
  content?: StorefrontPageContent["productCard"];
  addToQuoteContent?: StorefrontPageContent["addToQuote"];
}

export function ProductCard({
  item,
  featuredBadge = true,
  priority = false,
  approvedAssetUrls = [],
  allowLegacyImages = false,
  sequence,
  layout = "standard",
  content,
  addToQuoteContent,
}: ProductCardProps) {
  const { locale, dictionary } = useStorefrontI18n();
  const copy = content || STOREFRONT_PAGE_CONTENT_DEFAULTS[locale].productCard;
  const ForwardArrow = locale === "ar" ? ArrowUpLeft : ArrowUpRight;
  const approvedImageUrl = approvedAssetUrls.find(
    (url) => isSafeCatalogAssetUrl(url) || isSafeProductMediaSource(url, "IMAGE"),
  );
  const legacyImageUrl = allowLegacyImages
    ? parseCatalogImages(item.images).find((url) => isSafeProductMediaSource(url, "IMAGE"))
    : undefined;
  const imageUrl = approvedImageUrl || legacyImageUrl;
  const categoryName = pickStorefrontText(locale, item.category?.nameAr, item.category?.nameEn)
    || copy.officeFurniture;
  const sourceName = pickStorefrontText(locale, item.nameAr, item.nameEn);
  const displayName = isGenericCatalogName(item)
    ? `${categoryName} · ${item.sku}`
    : sourceName || item.sku || copy.officePiece;
  const isFeature = layout === "feature";
  const sequenceLabel = sequence ? String(sequence).padStart(2, "0") : null;

  return (
    <article
      className={cn(
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[0.4rem] border border-border/80 bg-bg-card shadow-[var(--shadow-soft)] transition-[transform,box-shadow,border-color] duration-500 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[var(--shadow-float)] motion-reduce:transition-none",
        isFeature && "md:col-span-2 md:grid md:grid-cols-[1.2fr_0.8fr] md:items-stretch",
      )}
    >
      <div
        className={cn(
          "relative m-2.5 mb-0 overflow-hidden rounded-[0.2rem] bg-bg-secondary",
          isFeature && "md:m-3 md:ml-0 md:min-h-[25rem]",
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[14%] bottom-[7%] h-[15%] rounded-[50%] bg-accent/12 blur-2xl transition-[inset,opacity] duration-700 group-hover:inset-x-[10%] group-hover:opacity-80"
        />
        <Link
          href={localizedStorefrontPath(locale, `/product/${item.id}`)}
          className={cn(
            "relative flex aspect-[1.08/1] w-full items-center justify-center overflow-hidden rounded-[0.2rem] p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:p-7",
            isFeature && "md:h-full md:min-h-[25rem] md:aspect-auto md:p-10",
          )}
          aria-label={interpolateStorefrontMessage(copy.viewNamed, { name: displayName })}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={displayName}
              fill
              unoptimized={isRemoteProductMediaSource(imageUrl)}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              sizes={isFeature
                ? "(max-width: 767px) 92vw, (max-width: 1279px) 58vw, 42vw"
                : "(max-width: 767px) 92vw, (max-width: 1279px) 44vw, 27vw"}
              className={cn(
                "object-contain p-6 mix-blend-multiply transition-transform duration-700 ease-out group-hover:scale-[1.035] motion-reduce:transition-none",
                isFeature && "md:p-10",
              )}
            />
          ) : (
            <div className="relative z-10 flex flex-col items-center gap-3 text-center text-text-secondary/55">
              <span className="grid h-16 w-16 place-items-center rounded-full border border-border bg-bg-card/70">
                <Layers3 className="h-7 w-7" strokeWidth={1.1} aria-hidden="true" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                {categoryName || copy.hatabObject}
              </span>
            </div>
          )}
        </Link>

        {sequenceLabel && (
          <span
            dir="ltr"
            className="absolute start-3 top-3 z-10 inline-flex min-w-10 items-center justify-center rounded-full border border-white/70 bg-bg-card/80 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.14em] text-text-primary shadow-sm backdrop-blur-md"
            aria-hidden="true"
          >
            {sequenceLabel}
          </span>
        )}

        {featuredBadge && item.isFeatured && (
          <span className="absolute end-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/75 bg-bg-card/82 px-2.5 py-1.5 text-[10px] font-bold text-primary shadow-sm backdrop-blur-md">
            <Sparkles className="h-3 w-3 text-[var(--brass)]" aria-hidden="true" />
            {copy.selected}
          </span>
        )}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col px-5 pb-5 pt-5", isFeature && "md:px-7 md:pb-7 md:pt-8")}>
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-border/70 pb-4">
          <Link
            href={localizedStorefrontPath(
              locale,
              item.category ? `/catalog?category=${item.category.slug}` : "/catalog",
            )}
            className="inline-flex max-w-[70%] items-center gap-2 rounded-full bg-bg-secondary px-3 py-1.5 text-[10px] font-bold text-accent-dark transition-colors hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
            <span className="truncate">{categoryName}</span>
          </Link>
          <span dir="ltr" className="shrink-0 pt-1 text-[10px] font-semibold tracking-[0.1em] text-text-secondary/60">
            {item.sku}
          </span>
        </div>

        <h3
          className={cn(
            "line-clamp-2 min-h-14 text-xl font-semibold leading-7 text-text-primary transition-colors duration-300 group-hover:text-primary",
            isFeature && "md:text-3xl md:leading-10",
          )}
        >
          <Link
            href={localizedStorefrontPath(locale, `/product/${item.id}`)}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {displayName}
          </Link>
        </h3>

        <div className="mt-5 grid grid-cols-[auto_1fr] items-end gap-3 border-y border-border/70 py-3.5">
          <span dir="ltr" className="text-[8px] font-bold tracking-[0.16em] text-text-secondary/50">
            {copy.priceCurrency}
          </span>
          {hasSellingPrice(item.sellingPrice) ? (
            <p className="text-end text-base font-bold text-text-primary" aria-label={interpolateStorefrontMessage(copy.priceLabel, { price: formatSellingPrice(item.sellingPrice, locale) })}>
              {formatSellingPrice(item.sellingPrice, locale)}
            </p>
          ) : (
            <p className="text-end">
              <span className="block text-xs font-bold text-text-primary">{copy.priceOnRequest}</span>
              <span className="mt-0.5 block text-[8px] uppercase tracking-[0.1em] text-text-secondary/55">{copy.requestPricing}</span>
            </p>
          )}
        </div>

        {(item.dimensions || item.material || item.color) && (
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-text-secondary">
            {item.dimensions && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5">
                <Ruler className="h-3 w-3 text-accent" aria-hidden="true" />
                <span dir="ltr" className="truncate">{item.dimensions}</span>
              </span>
            )}
            {item.material && (
              <span className="max-w-full truncate rounded-full border border-border/70 px-3 py-1.5">
                {item.material}
              </span>
            )}
            {!item.material && item.color && (
              <span className="max-w-full truncate rounded-full border border-border/70 px-3 py-1.5">
                {item.color}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-7">
          <Link
            href={localizedStorefrontPath(locale, `/product/${item.id}`)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full text-xs font-bold text-text-primary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {dictionary.common.viewProduct}
            <ForwardArrow className="h-4 w-4 text-primary transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none" aria-hidden="true" />
          </Link>

          <AddToQuoteButton
            catalogItemId={item.id}
            name={displayName}
            details={{
              nameEn: item.nameEn,
              sku: item.sku,
              category: categoryName,
              dimensions: item.dimensions || undefined,
              material: item.material || undefined,
              color: item.color || undefined,
              image: imageUrl,
            }}
            variant="outline"
            iconOnly
            content={addToQuoteContent}
            className="!h-11 !w-11 !border-border !bg-bg-card !text-primary !shadow-none hover:!border-primary hover:!bg-primary hover:!text-white"
          />
        </div>
      </div>
    </article>
  );
}

export default ProductCard;
