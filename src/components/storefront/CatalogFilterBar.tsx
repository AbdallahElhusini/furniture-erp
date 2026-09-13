"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  CircleDollarSign,
  Palette,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  formatSellingPrice,
  getPriceBand,
  PRICE_BANDS,
  type PriceBandSlug,
} from "@/lib/catalog-commerce";
import {
  formatStorefrontNumber,
  interpolateStorefrontMessage,
  pickStorefrontText,
} from "@/lib/i18n/storefront";
import { STOREFRONT_PAGE_CONTENT_DEFAULTS, type StorefrontPageContent } from "@/lib/storefront-content-defaults";
import { cn } from "@/lib/utils";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";

interface CategoryOption {
  id: number;
  nameAr: string;
  nameEn: string;
  slug: string;
  _count?: { items: number };
}

interface TagOption {
  id: number;
  slug: string;
  nameAr: string;
  nameEn: string;
  _count?: { items: number };
}

interface TagGroupOption {
  id: number;
  key: string;
  nameAr: string;
  nameEn: string;
  tags: TagOption[];
}

interface CatalogFilterBarProps {
  categories: CategoryOption[];
  tagGroups?: TagGroupOption[];
  currentCategory?: string;
  currentCollection?: { slug: string; nameAr: string; nameEn: string } | null;
  currentStyle?: {
    slug: string;
    name: { ar: string; en: string };
  } | null;
  styleCollections?: readonly {
    slug: string;
    name: { ar: string; en: string };
    tagline: { ar: string; en: string };
  }[];
  currentPrice?: PriceBandSlug;
  priceBandCounts?: readonly { slug: string; count: number }[];
  priceSummary?: {
    pricedCount: number;
    requestOnlyCount: number;
    min: number | null;
    max: number | null;
  };
  currentSearch?: string;
  currentSort?: string;
  totalProducts: number;
  content?: StorefrontPageContent["catalogFilter"];
}

function urlWithParams(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function CatalogSearchField({ currentSearch, content }: { currentSearch: string; content: StorefrontPageContent["catalogFilter"] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsSnapshot = searchParams.toString();
  const [draftSearch, setDraftSearch] = useState(currentSearch);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (draftSearch.trim() === currentSearch) return;

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(paramsSnapshot);
      const term = draftSearch.trim();
      if (term) params.set("search", term);
      else params.delete("search");
      params.delete("page");
      startTransition(() => router.replace(urlWithParams(pathname, params), { scroll: false }));
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [currentSearch, draftSearch, paramsSnapshot, pathname, router]);

  return (
    <section className={cn("transition-opacity", isPending && "opacity-60")} aria-busy={isPending}>
      <label htmlFor="catalog-search" className="mb-3 flex items-center justify-between gap-3 text-xs font-bold text-text-primary">
        <span>{content.searchCatalog}</span>
        <span className="text-[9px] font-semibold tracking-[0.15em] text-text-secondary/55">{content.search}</span>
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute start-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[0.15rem] bg-[var(--forest)] text-white">
          <Search className="h-4 w-4" aria-hidden="true" />
        </span>
        <input
          id="catalog-search"
          type="search"
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder={content.searchPlaceholder}
          className="h-12 w-full rounded-[0.25rem] border border-border bg-bg-primary py-3 pe-11 ps-12 text-sm text-text-primary transition-colors placeholder:text-text-secondary/50 focus:border-primary focus:bg-bg-card focus:outline-none"
        />
        {draftSearch && (
          <button
            type="button"
            onClick={() => setDraftSearch("")}
            aria-label={content.clearSearch}
            className="absolute end-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[0.15rem] text-text-secondary transition-colors hover:bg-bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

export function CatalogFilterBar({
  tagGroups = [],
  categories,
  currentCategory,
  currentCollection,
  currentStyle,
  styleCollections = [],
  currentPrice,
  priceBandCounts = [],
  priceSummary,
  currentSearch = "",
  currentSort = "recommended",
  totalProducts,
  content,
}: CatalogFilterBarProps) {
  const { locale } = useStorefrontI18n();
  const copy = content || STOREFRONT_PAGE_CONTENT_DEFAULTS[locale].catalogFilter;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsSnapshot = searchParams.toString();
  const [isPending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  const selectedTags = useMemo(() => {
    const params = new URLSearchParams(paramsSnapshot);
    const legacyTag = params.get("tag");
    return Array.from(new Set([...params.getAll("tags"), ...(legacyTag ? [legacyTag] : [])]));
  }, [paramsSnapshot]);

  const selectedTagLabels = useMemo(() => {
    const labels = new Map(tagGroups.flatMap((group) => group.tags.map((tag) => [
      tag.slug,
      pickStorefrontText(locale, tag.nameAr, tag.nameEn),
    ] as const)));
    return selectedTags.map((slug) => ({ slug, name: labels.get(slug) || slug }));
  }, [locale, selectedTags, tagGroups]);

  const updateParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(paramsSnapshot);
    mutate(params);
    params.delete("page");
    startTransition(() => router.push(urlWithParams(pathname, params), { scroll: false }));
  };

  const chooseCategory = (slug?: string) => {
    updateParams((params) => {
      if (slug) params.set("category", slug);
      else params.delete("category");
    });
  };

  const toggleTag = (slug: string) => {
    updateParams((params) => {
      const tags = new Set(params.getAll("tags"));
      const legacyTag = params.get("tag");
      if (legacyTag) tags.add(legacyTag);
      params.delete("tag");
      params.delete("tags");

      if (tags.has(slug)) tags.delete(slug);
      else tags.add(slug);

      for (const tag of tags) params.append("tags", tag);
    });
  };

  const removeSearch = () => {
    updateParams((params) => params.delete("search"));
  };

  const removeCollection = () => {
    updateParams((params) => params.delete("collection"));
  };

  const chooseStyle = (slug?: string) => {
    updateParams((params) => {
      if (slug) params.set("style", slug);
      else params.delete("style");
    });
  };

  const choosePrice = (slug?: PriceBandSlug) => {
    updateParams((params) => {
      if (slug) params.set("price", slug);
      else params.delete("price");
    });
  };

  const clearFilters = () => {
    startTransition(() => router.push(pathname, { scroll: false }));
  };

  const hasActiveFilters = Boolean(currentCategory || currentCollection || currentStyle || currentPrice || currentSearch || selectedTags.length > 0);
  const activeCount = Number(Boolean(currentCategory)) + Number(Boolean(currentCollection)) + Number(Boolean(currentStyle)) + Number(Boolean(currentPrice)) + Number(Boolean(currentSearch)) + selectedTags.length;
  const currentCategoryOption = categories.find((category) => category.slug === currentCategory);
  const currentPriceBand = getPriceBand(currentPrice);
  const priceCounts = new Map(priceBandCounts.map((entry) => [entry.slug, entry.count]));
  const sortOptions = [
    { value: "recommended", label: copy.recommended },
    { value: "newest", label: copy.newest },
    { value: "name", label: copy.alphabetical },
  ] as const;

  return (
    <div className={cn("transition-opacity duration-300", isPending && "opacity-60")} aria-busy={isPending}>
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="mb-4 flex min-h-13 w-full items-center justify-between rounded-[0.25rem] bg-[var(--forest)] px-5 text-sm font-bold text-white shadow-[var(--shadow-soft)] lg:hidden"
        aria-expanded={mobileOpen}
        aria-controls="catalog-filter-controls"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-white/70" aria-hidden="true" />
          {copy.filterSort}
          {activeCount > 0 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-[0.15rem] bg-bg-card px-1.5 text-[10px] text-[var(--forest)]">
              {formatStorefrontNumber(activeCount, locale)}
            </span>
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", mobileOpen && "rotate-180")} aria-hidden="true" />
      </button>

      <div
        id="catalog-filter-controls"
        className={cn(
          "overflow-hidden rounded-[0.35rem] border border-border/80 bg-bg-card shadow-[var(--shadow-soft)] lg:block",
          mobileOpen ? "block" : "hidden",
        )}
      >
        <div className="flex items-center justify-between gap-4 bg-[var(--forest)] px-5 py-5 text-white">
          <div>
            <span className="text-[9px] font-bold tracking-[0.2em] text-white/50">{copy.refineLabel}</span>
            <h2 className="mt-1 text-lg font-semibold">{copy.refineTitle}</h2>
          </div>
          <span className="inline-flex min-w-11 items-center justify-center rounded-[0.15rem] border border-white/15 bg-white/8 px-3 py-2 text-xs font-bold" aria-label={interpolateStorefrontMessage(copy.activeFilters, { count: formatStorefrontNumber(activeCount, locale) })}>
            {formatStorefrontNumber(activeCount, locale)}
          </span>
        </div>

        <div className="space-y-7 p-5">
          <CatalogSearchField key={currentSearch} currentSearch={currentSearch} content={copy} />

          {hasActiveFilters && (
            <section aria-labelledby="active-filters-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 id="active-filters-heading" className="text-xs font-bold text-text-primary">{copy.selections}</h3>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 rounded-full text-[10px] font-bold text-primary hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  {copy.reset}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentCategoryOption && (
                  <button type="button" onClick={() => chooseCategory()} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-bg-secondary px-3 text-[10px] font-bold text-text-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {pickStorefrontText(locale, currentCategoryOption.nameAr, currentCategoryOption.nameEn)} <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
                {currentSearch && (
                  <button type="button" onClick={removeSearch} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-bg-secondary px-3 text-[10px] font-bold text-text-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="max-w-32 truncate">«{currentSearch}»</span> <X className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </button>
                )}
                {currentCollection && (
                  <button type="button" onClick={removeCollection} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-bg-secondary px-3 text-[10px] font-bold text-text-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="max-w-32 truncate">{pickStorefrontText(locale, currentCollection.nameAr, currentCollection.nameEn)}</span> <X className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </button>
                )}
                {currentStyle && (
                  <button type="button" onClick={() => chooseStyle()} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-[0.2rem] border border-border bg-bg-secondary px-3 text-[10px] font-bold text-text-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="max-w-32 truncate">{pickStorefrontText(locale, currentStyle.name.ar, currentStyle.name.en)}</span> <X className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </button>
                )}
                {currentPriceBand && (
                  <button type="button" onClick={() => choosePrice()} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-[0.2rem] border border-border bg-bg-secondary px-3 text-[10px] font-bold text-text-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="max-w-36 truncate">{copy.priceBandLabels[currentPriceBand.slug] || pickStorefrontText(locale, currentPriceBand.label.ar, currentPriceBand.label.en)}</span> <X className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </button>
                )}
                {selectedTagLabels.map((tag) => (
                  <button key={tag.slug} type="button" onClick={() => toggleTag(tag.slug)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-bg-secondary px-3 text-[10px] font-bold text-text-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {tag.name} <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <fieldset className="border-t border-border/70 pt-6">
            <legend className="mb-3 flex w-full items-center justify-between gap-3 text-xs font-bold text-text-primary">
              <span>{copy.sortResults}</span>
              <span className="text-[9px] font-semibold tracking-[0.15em] text-text-secondary/55">{copy.sort}</span>
            </legend>
            <div className="grid grid-cols-3 gap-1 rounded-[0.25rem] bg-bg-secondary p-1" role="group" aria-label={copy.sortResults}>
              {sortOptions.map((option) => {
                const selected = currentSort === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => updateParams((params) => {
                      if (option.value === "recommended") params.delete("sort");
                      else params.set("sort", option.value);
                    })}
                    className={cn(
                      "min-h-9 rounded-[0.15rem] px-2 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selected ? "bg-bg-card text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="border-t border-border/70 pt-6">
            <legend className="mb-4 flex w-full items-center justify-between gap-3 text-xs font-bold text-text-primary">
              <span className="inline-flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-accent" aria-hidden="true" />{copy.price}</span>
              <span className="text-[9px] font-semibold tracking-[0.15em] text-text-secondary/55">{copy.priceCurrency}</span>
            </legend>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => choosePrice()}
                aria-pressed={!currentPrice}
                className={cn(
                  "flex min-h-10 w-full items-center justify-between gap-3 rounded-[0.2rem] border px-3 text-start text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  !currentPrice ? "border-[var(--forest)] bg-[var(--forest)] font-bold text-white" : "border-transparent text-text-secondary hover:border-border hover:bg-bg-secondary hover:text-text-primary",
                )}
              >
                <span>{copy.allPriceBands}</span>
                {priceSummary && <span className="text-[9px] opacity-55">{formatStorefrontNumber(priceSummary.pricedCount + priceSummary.requestOnlyCount, locale)}</span>}
              </button>
              {PRICE_BANDS.map((band, bandIndex) => {
                const selected = currentPrice === band.slug;
                return (
                  <button
                    key={band.slug}
                    type="button"
                    onClick={() => choosePrice(band.slug)}
                    aria-pressed={selected}
                    className={cn(
                      "grid min-h-11 w-full grid-cols-[1fr_auto] items-center gap-3 rounded-[0.2rem] border px-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selected ? "border-[var(--forest)] bg-[var(--forest)] text-white" : "border-border/70 text-text-secondary hover:border-primary/35 hover:text-text-primary",
                    )}
                  >
                    <span>
                      <span className="block text-[11px] font-bold">{copy.priceBandLabels[band.slug] || pickStorefrontText(locale, band.label.ar, band.label.en)}</span>
                      <span className="mt-0.5 block text-start text-[8px] uppercase tracking-[0.05em] opacity-55">{interpolateStorefrontMessage(copy.priceBand, { index: String(bandIndex + 1).padStart(2, "0"), slug: band.slug.replace(/-/g, " ") })}</span>
                    </span>
                    <span className="text-[9px] opacity-50">{formatStorefrontNumber(priceCounts.get(band.slug) || 0, locale)}</span>
                  </button>
                );
              })}
            </div>
            {priceSummary?.min != null && priceSummary.max != null && (
              <p className="mt-3 border-s border-accent/40 ps-3 text-[9px] leading-5 text-text-secondary/65">
                {interpolateStorefrontMessage(copy.priceSummary, { min: formatSellingPrice(priceSummary.min, locale), max: formatSellingPrice(priceSummary.max, locale) })}
              </p>
            )}
          </fieldset>

          {styleCollections.length > 0 && (
            <fieldset className="border-t border-border/70 pt-6">
              <legend className="mb-4 flex w-full items-center justify-between gap-3 text-xs font-bold text-text-primary">
                <span className="inline-flex items-center gap-2"><Palette className="h-4 w-4 text-accent" aria-hidden="true" />{copy.workspaceStyle}</span>
                <span className="text-[9px] font-semibold tracking-[0.15em] text-text-secondary/55">{copy.styleEdit}</span>
              </legend>
              <div className="grid gap-1.5">
                {styleCollections.map((style, index) => {
                  const selected = currentStyle?.slug === style.slug;
                  return (
                    <button
                      key={style.slug}
                      type="button"
                      onClick={() => chooseStyle(selected ? undefined : style.slug)}
                      aria-pressed={selected}
                      className={cn(
                        "grid min-h-14 w-full grid-cols-[2rem_1fr] items-center gap-3 rounded-[0.2rem] border px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        selected ? "border-[var(--forest)] bg-[var(--forest)] text-white" : "border-border/70 text-text-secondary hover:border-primary/35 hover:bg-bg-secondary hover:text-text-primary",
                      )}
                    >
                      <span dir="ltr" className="text-[9px] font-bold tracking-[0.1em] opacity-45">{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-bold">{pickStorefrontText(locale, style.name.ar, style.name.en)}</span>
                          <span className="text-[8px] uppercase tracking-[0.08em] opacity-55">{copy.style} <span dir="ltr">{String(index + 1).padStart(2, "0")}</span></span>
                        </span>
                        <span className="mt-0.5 block truncate text-[9px] opacity-60">{pickStorefrontText(locale, style.tagline.ar, style.tagline.en)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <section className="border-t border-border/70 pt-6" aria-labelledby="catalog-category-heading">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 id="catalog-category-heading" className="text-xs font-bold text-text-primary">{copy.category}</h3>
              <span className="text-[9px] font-semibold tracking-[0.15em] text-text-secondary/55">{copy.categoryLabel}</span>
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => chooseCategory()}
                aria-pressed={!currentCategory}
                className={cn(
                    "group flex min-h-11 w-full items-center gap-3 rounded-[0.2rem] border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  !currentCategory
                    ? "border-[var(--forest)] bg-[var(--forest)] font-bold text-white"
                    : "border-transparent text-text-secondary hover:border-border hover:bg-bg-secondary hover:text-text-primary",
                )}
              >
                <span dir="ltr" className="w-7 shrink-0 text-[9px] font-bold tracking-[0.1em] opacity-50">00</span>
                <span className="min-w-0 flex-1 text-start">{copy.allProducts}</span>
                <span className="text-[10px] opacity-55">{formatStorefrontNumber(totalProducts, locale)}</span>
              </button>

              {categories.map((category, index) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => chooseCategory(category.slug)}
                  aria-pressed={currentCategory === category.slug}
                  className={cn(
                    "group flex min-h-11 w-full items-center gap-3 rounded-[0.2rem] border px-3 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    currentCategory === category.slug
                      ? "border-[var(--forest)] bg-[var(--forest)] font-bold text-white"
                      : "border-transparent text-text-secondary hover:border-border hover:bg-bg-secondary hover:text-text-primary",
                  )}
                >
                  <span dir="ltr" className="w-7 shrink-0 text-[9px] font-bold tracking-[0.1em] opacity-50">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">{pickStorefrontText(locale, category.nameAr, category.nameEn)}</span>
                  {category._count && (
                    <span className="text-[10px] opacity-55">{formatStorefrontNumber(category._count.items, locale)}</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {tagGroups.map((group, groupIndex) => {
            const visibleTags = group.tags.filter((tag) => !tag._count || tag._count.items > 0);
            if (visibleTags.length === 0) return null;

            return (
              <section key={group.id} className="border-t border-border/70 pt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold text-text-primary">{pickStorefrontText(locale, group.nameAr, group.nameEn)}</h3>
                  <span dir="ltr" className="text-[9px] font-semibold tracking-[0.12em] text-text-secondary/45">{String(groupIndex + 3).padStart(2, "0")}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {visibleTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag.slug);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.slug)}
                        aria-pressed={isSelected}
                        className={cn(
                          "group inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          isSelected
                            ? "border-primary bg-primary font-bold text-white"
                            : "border-border bg-bg-card text-text-secondary hover:border-primary/35 hover:text-text-primary",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                            isSelected ? "border-white/55 bg-white/12 text-white" : "border-border bg-bg-primary group-hover:border-primary/45",
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" aria-hidden="true" />}
                        </span>
                        <span>{pickStorefrontText(locale, tag.nameAr, tag.nameEn)}</span>
                        {tag._count && (
                          <span className="text-[9px] opacity-50">{formatStorefrontNumber(tag._count.items, locale)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <p className="border-t border-border/70 pt-5 text-[10px] leading-5 text-text-secondary/65">
            {copy.tagHint}
          </p>

          <p className="sr-only" aria-live="polite">{isPending ? copy.updating : copy.updated}</p>
        </div>
      </div>
    </div>
  );
}
