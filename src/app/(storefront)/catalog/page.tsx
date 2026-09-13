import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import {
  ArrowUpLeft,
  ArrowUpRight,
  CircleDollarSign,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Palette,
  SearchX,
  SlidersHorizontal,
} from "lucide-react";
import { CatalogFilterBar } from "@/components/storefront/CatalogFilterBar";
import { ProductCard } from "@/components/storefront/ProductCard";
import {
  approvedCatalogAssetWhere,
  approvedSafeCatalogAssetUrls,
  catalogPublicationWhere,
  isProductionCatalog,
} from "@/lib/catalog-publication";
import { isSafeCollectionImagePath } from "@/lib/collection-publication";
import {
  getPriceBand,
  PRICE_BANDS,
  priceBandWhere,
} from "@/lib/catalog-commerce";
import { prisma } from "@/lib/db";
import {
  formatStorefrontNumber,
  interpolateStorefrontMessage,
  pickStorefrontText,
} from "@/lib/i18n/storefront";
import { getStorefrontLocale } from "@/lib/i18n/storefront-server";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import type { ResolvedSiteMediaSlot } from "@/lib/site-content-registry";
import {
  getStorefrontDictionariesWithContent,
  getStorefrontPageContent,
  getStorefrontPageContentWithMedia,
} from "@/lib/site-content-server";
import {
  getCategoryEditorialVisual,
  getStyleEditorialVisual,
  STOREFRONT_EDITORIAL_MEDIA,
} from "@/lib/storefront-visuals";
import {
  getStyleCollection,
  STYLE_COLLECTIONS,
} from "@/lib/style-collections";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildStorefrontMetadata,
} from "@/lib/seo";
import { absoluteSiteUrl, serializeJsonLd } from "@/lib/site";

interface CatalogPageProps {
  searchParams: Promise<{
    category?: string;
    collection?: string;
    tag?: string;
    tags?: string | string[];
    search?: string;
    sort?: string;
    page?: string;
    price?: string;
    style?: string;
  }>;
}

export const revalidate = 60;

const PAGE_SIZE = 24;
const catalogSorts = ["recommended", "newest", "name"] as const;
type CatalogSort = (typeof catalogSorts)[number];

const SAFE_OBJECT_POSITION = /^(?:(?:left|center|right|top|bottom)|(?:(?:100|\d{1,2})(?:\.\d+)?%))(?:\s+(?:(?:left|center|right|top|bottom)|(?:(?:100|\d{1,2})(?:\.\d+)?%)))?$/;

function mediaObjectPosition(metadata: string | undefined, fallback: string): string {
  if (!metadata) return fallback;

  try {
    const parsed = JSON.parse(metadata) as { objectPosition?: unknown };
    return typeof parsed.objectPosition === "string" && SAFE_OBJECT_POSITION.test(parsed.objectPosition.trim())
      ? parsed.objectPosition.trim()
      : fallback;
  } catch {
    return fallback;
  }
}

function localizedMediaAlt(
  locale: "ar" | "en",
  slot: ResolvedSiteMediaSlot | undefined,
  fallback: string,
): string {
  return (locale === "ar" ? slot?.altAr : slot?.altEn)?.trim() || fallback;
}

function normalizeSort(value?: string): CatalogSort {
  return catalogSorts.includes(value as CatalogSort) ? (value as CatalogSort) : "recommended";
}

export async function generateMetadata({ searchParams }: CatalogPageProps): Promise<Metadata> {
  const [params, locale, content] = await Promise.all([searchParams, getStorefrontLocale(), getStorefrontPageContent()]);
  const copy = content[locale].catalog;
  const categorySlug = params.category?.trim();
  const collectionSlug = params.collection?.trim();
  const style = getStyleCollection(params.style?.trim());
  const priceBand = getPriceBand(params.price?.trim());
  const [category, collection] = await Promise.all([
    categorySlug
      ? prisma.category.findFirst({
          where: {
            slug: categorySlug,
            isActive: true,
            parentId: { not: null },
            items: { some: catalogPublicationWhere() },
          },
          select: { nameAr: true, nameEn: true, slug: true, image: true },
        })
      : Promise.resolve(null),
    collectionSlug
      ? prisma.collection.findFirst({
          where: {
            slug: collectionSlug,
            isActive: true,
            isDraft: false,
            items: { some: catalogPublicationWhere() },
          },
          select: { nameAr: true, nameEn: true, slug: true, descriptionAr: true, descriptionEn: true, image: true },
        })
      : Promise.resolve(null),
  ]);

  if (categorySlug && !category) {
    const legacyCategory = await prisma.categoryRedirect.findUnique({
      where: { fromSlug: categorySlug },
      select: { category: { select: { isActive: true, parentId: true } } },
    });
    if (!legacyCategory?.category.isActive || !legacyCategory.category.parentId) notFound();
  }
  if (collectionSlug && !collection) notFound();
  if (params.style && !style) notFound();
  if (params.price && !priceBand) notFound();

  const categoryName = category ? pickStorefrontText(locale, category.nameAr, category.nameEn) : "";
  const collectionName = collection ? pickStorefrontText(locale, collection.nameAr, collection.nameEn) : "";
  const styleName = style ? content[locale].styles[style.slug]?.name || pickStorefrontText(locale, style.name.ar, style.name.en) : "";
  const title = collectionName || styleName || categoryName || copy.metaTitle;
  const description = (collection ? pickStorefrontText(locale, collection.descriptionAr, collection.descriptionEn) : "")
    || (style ? content[locale].styles[style.slug]?.description || pickStorefrontText(locale, style.description.ar, style.description.en) : "")
    || (category
      ? interpolateStorefrontMessage(copy.categoryMetaDescription, { category: categoryName })
      : copy.metaDescription);
  const canonicalParams = new URLSearchParams();
  if (collection) canonicalParams.set("collection", collection.slug);
  else if (style) canonicalParams.set("style", style.slug);
  else if (category) canonicalParams.set("category", category.slug);
  const canonicalQuery = canonicalParams.toString();
  const canonicalPath = canonicalQuery ? `/catalog?${canonicalQuery}` : "/catalog";
  const hasTags = Boolean(params.tag || params.tags);
  const hasNonCanonicalFacets = Boolean(
    params.search
    || params.sort
    || params.price
    || hasTags
    || (params.page && params.page !== "1")
    || [Boolean(categorySlug), Boolean(collectionSlug), Boolean(style)].filter(Boolean).length > 1
    || (categorySlug && !category)
    || (collectionSlug && !collection)
    || (params.style && !style),
  );

  const candidateImage = collection?.image || category?.image;
  const image = candidateImage && isSafeCollectionImagePath(candidateImage)
    ? candidateImage
    : undefined;

  return buildStorefrontMetadata({
    locale,
    path: canonicalPath,
    title,
    description,
    keywords: [categoryName, collectionName, styleName],
    index: !hasNonCanonicalFacets,
    image,
  });
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const publicationWhere = catalogPublicationWhere();
  const productionCatalog = isProductionCatalog();
  const [params, locale, dictionaries, resolvedContent] = await Promise.all([
    searchParams,
    getStorefrontLocale(),
    getStorefrontDictionariesWithContent(),
    getStorefrontPageContentWithMedia(),
  ]);
  const content = resolvedContent.contentByLocale;
  const media = resolvedContent.media;
  const dictionary = dictionaries[locale];
  const pageContent = content[locale];
  const copy = pageContent.catalog;
  const ForwardArrow = locale === "ar" ? ArrowUpLeft : ArrowUpRight;
  const PreviousIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = locale === "ar" ? ChevronLeft : ChevronRight;
  const BreadcrumbIcon = locale === "ar" ? ChevronLeft : ChevronRight;
  const categorySlug = params.category?.trim();
  const collectionSlug = params.collection?.trim();
  const requestedStyle = params.style?.trim();
  const currentStyle = getStyleCollection(requestedStyle);
  const resolvedStyleCollections = STYLE_COLLECTIONS.map((style) => ({
    ...style,
    name: { ar: content.ar.styles[style.slug]?.name || style.name.ar, en: content.en.styles[style.slug]?.name || style.name.en },
    tagline: { ar: content.ar.styles[style.slug]?.tagline || style.tagline.ar, en: content.en.styles[style.slug]?.tagline || style.tagline.en },
  }));
  const requestedPrice = params.price?.trim();
  const currentPriceBand = getPriceBand(requestedPrice);
  const legacyTag = params.tag?.trim();
  const searchTerm = params.search?.trim().slice(0, 80);
  const sort = normalizeSort(params.sort);
  const requestedPage = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const rawTags = Array.isArray(params.tags) ? params.tags : params.tags ? [params.tags] : [];
  if (legacyTag) rawTags.push(legacyTag);
  const requestedTags = Array.from(new Set(rawTags.map((tag) => tag.trim()).filter(Boolean)));

  const [categories, tagGroups, currentCollection, pricedRange, requestOnlyCount, priceBandCounts] = await Promise.all([
    prisma.category.findMany({
      where: {
        isActive: true,
        parentId: { not: null },
        items: { some: publicationWhere },
      },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      include: {
        _count: { select: { items: { where: publicationWhere } } },
      },
    }),
    prisma.tagGroup.findMany({
      where: { tags: { some: { items: { some: publicationWhere } } } },
      orderBy: { sortOrder: "asc" },
      include: {
        tags: {
          where: { items: { some: publicationWhere } },
          orderBy: { sortOrder: "asc" },
          include: {
            _count: { select: { items: { where: publicationWhere } } },
          },
        },
      },
    }),
    collectionSlug
      ? prisma.collection.findFirst({
          where: {
            slug: collectionSlug,
            isActive: true,
            isDraft: false,
            items: { some: publicationWhere },
          },
          select: { id: true, slug: true, nameAr: true, nameEn: true, descriptionAr: true, descriptionEn: true, image: true },
        })
      : Promise.resolve(null),
    prisma.catalogItem.aggregate({
      where: { ...publicationWhere, sellingPrice: { gt: 0 } },
      _min: { sellingPrice: true },
      _max: { sellingPrice: true },
      _count: { sellingPrice: true },
    }),
    prisma.catalogItem.count({
      where: { ...publicationWhere, sellingPrice: { lte: 0 } },
    }),
    Promise.all(
      PRICE_BANDS.map(async (band) => ({
        slug: band.slug,
        count: await prisma.catalogItem.count({
          where: { ...publicationWhere, ...priceBandWhere(band) },
        }),
      })),
    ),
  ]);

  const currentCategory = categorySlug
    ? categories.find((category) => category.slug === categorySlug) || null
    : null;

  if (categorySlug && !currentCategory) {
    const legacyCategory = await prisma.categoryRedirect.findUnique({
      where: { fromSlug: categorySlug },
      include: { category: true },
    });

    if (legacyCategory?.category.isActive) {
      const canonicalParams = new URLSearchParams();
      canonicalParams.set("category", legacyCategory.category.slug);
      if (collectionSlug) canonicalParams.set("collection", collectionSlug);
      if (currentStyle) canonicalParams.set("style", currentStyle.slug);
      if (currentPriceBand) canonicalParams.set("price", currentPriceBand.slug);
      for (const tag of requestedTags) canonicalParams.append("tags", tag);
      if (searchTerm) canonicalParams.set("search", searchTerm);
      if (sort !== "recommended") canonicalParams.set("sort", sort);
      if (requestedPage > 1) canonicalParams.set("page", String(requestedPage));
      redirect(localizedStorefrontPath(locale, `/catalog?${canonicalParams.toString()}`));
    }
    notFound();
  }

  if (collectionSlug && !currentCollection) {
    notFound();
  }

  if ((requestedStyle && !currentStyle) || (requestedPrice && !currentPriceBand)) {
    notFound();
  }

  const validTagSlugs = new Set(tagGroups.flatMap((group) => group.tags.map((tag) => tag.slug)));
  const selectedTags = requestedTags.filter((tag) => validTagSlugs.has(tag));
  if (selectedTags.length !== requestedTags.length) notFound();
  const whereClause: Prisma.CatalogItemWhereInput = { ...publicationWhere };
  const andFilters: Prisma.CatalogItemWhereInput[] = [];

  if (categorySlug) whereClause.categoryId = currentCategory?.id || -1;
  if (currentCollection) {
    whereClause.collections = {
      some: { id: currentCollection.id, isActive: true, isDraft: false },
    };
  }
  if (currentStyle) {
    andFilters.push({ sku: { in: [...currentStyle.skus] } });
  }
  const currentPriceWhere = priceBandWhere(currentPriceBand);
  if (currentPriceWhere) andFilters.push(currentPriceWhere);

  for (const group of tagGroups) {
    const groupTags = group.tags
      .filter((tag) => selectedTags.includes(tag.slug))
      .map((tag) => tag.slug);
    if (groupTags.length > 0) {
      andFilters.push({ tags: { some: { slug: { in: groupTags } } } });
    }
  }

  if (searchTerm) {
    const terms = searchTerm.split(/\s+/).filter(Boolean).slice(0, 8);
    andFilters.push(
      ...terms.map((term): Prisma.CatalogItemWhereInput => ({
        OR: [
          { nameAr: { contains: term } },
          { nameEn: { contains: term } },
          { sku: { contains: term } },
          { descriptionAr: { contains: term } },
          { descriptionEn: { contains: term } },
          { material: { contains: term } },
          { color: { contains: term } },
          { category: { OR: [{ nameAr: { contains: term } }, { nameEn: { contains: term } }] } },
          { family: { OR: [{ nameAr: { contains: term } }, { nameEn: { contains: term } }] } },
          { tags: { some: { OR: [{ nameAr: { contains: term } }, { nameEn: { contains: term } }] } } },
        ],
      })),
    );
  }

  if (andFilters.length > 0) whereClause.AND = andFilters;

  const orderBy: Prisma.CatalogItemOrderByWithRelationInput[] =
    sort === "newest"
      ? [{ createdAt: "desc" }, { id: "desc" }]
      : sort === "name"
        ? [{ [locale === "ar" ? "nameAr" : "nameEn"]: "asc" }, { sku: "asc" }]
        : [{ displayOrder: "asc" }, { isFeatured: "desc" }, { completenessScore: "desc" }, { createdAt: "desc" }, { id: "desc" }];

  const matchingCount = await prisma.catalogItem.count({ where: whereClause });
  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  if (requestedPage > totalPages) notFound();
  if (
    matchingCount === 0
    && !searchTerm
    && !currentPriceBand
    && selectedTags.length === 0
    && (currentCategory || currentCollection || currentStyle)
  ) {
    notFound();
  }
  const page = Math.min(requestedPage, totalPages);

  const products = await prisma.catalogItem.findMany({
    where: whereClause,
    include: {
      category: { select: { nameAr: true, nameEn: true, slug: true } },
      assets: {
        where: approvedCatalogAssetWhere,
        orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
        select: {
          url: true,
          reviewStatus: true,
          duplicateOfId: true,
          altAr: true,
          altEn: true,
        },
      },
    },
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const totalCount = categories.reduce((sum, category) => sum + category._count.items, 0);
  const pageHref = (targetPage: number) => {
    const nextParams = new URLSearchParams();
    if (categorySlug) nextParams.set("category", categorySlug);
    if (collectionSlug) nextParams.set("collection", collectionSlug);
    if (currentStyle) nextParams.set("style", currentStyle.slug);
    if (currentPriceBand) nextParams.set("price", currentPriceBand.slug);
    for (const tag of selectedTags) nextParams.append("tags", tag);
    if (searchTerm) nextParams.set("search", searchTerm);
    if (sort !== "recommended") nextParams.set("sort", sort);
    if (targetPage > 1) nextParams.set("page", String(targetPage));
    const query = nextParams.toString();
    return query ? `/catalog?${query}` : "/catalog";
  };
  const categoryHref = (targetCategory?: string) => {
    const nextParams = new URLSearchParams();
    if (targetCategory) nextParams.set("category", targetCategory);
    if (collectionSlug) nextParams.set("collection", collectionSlug);
    if (currentStyle) nextParams.set("style", currentStyle.slug);
    if (currentPriceBand) nextParams.set("price", currentPriceBand.slug);
    for (const tag of selectedTags) nextParams.append("tags", tag);
    if (searchTerm) nextParams.set("search", searchTerm);
    if (sort !== "recommended") nextParams.set("sort", sort);
    const query = nextParams.toString();
    return query ? `/catalog?${query}` : "/catalog";
  };
  const currentCategoryName = currentCategory
    ? pickStorefrontText(locale, currentCategory.nameAr, currentCategory.nameEn)
    : "";
  const currentCollectionName = currentCollection
    ? pickStorefrontText(locale, currentCollection.nameAr, currentCollection.nameEn)
    : "";
  const currentCollectionDescription = currentCollection
    ? pickStorefrontText(locale, currentCollection.descriptionAr, currentCollection.descriptionEn)
    : "";
  const currentStyleName = currentStyle
    ? pageContent.styles[currentStyle.slug]?.name || pickStorefrontText(locale, currentStyle.name.ar, currentStyle.name.en)
    : "";

  const canonicalFacetCount = [Boolean(currentCategory), Boolean(currentCollection), Boolean(currentStyle)].filter(Boolean).length;
  const isIndexableCatalogView = !searchTerm
    && sort === "recommended"
    && !currentPriceBand
    && selectedTags.length === 0
    && page === 1
    && canonicalFacetCount <= 1;
  const primaryCanonicalParams = new URLSearchParams();
  if (currentCollection) primaryCanonicalParams.set("collection", currentCollection.slug);
  else if (currentStyle) primaryCanonicalParams.set("style", currentStyle.slug);
  else if (currentCategory) primaryCanonicalParams.set("category", currentCategory.slug);
  const primaryCanonicalQuery = primaryCanonicalParams.toString();
  const primaryCanonicalPath = primaryCanonicalQuery ? `/catalog?${primaryCanonicalQuery}` : "/catalog";

  const catalogHeroFallback = STOREFRONT_EDITORIAL_MEDIA.catalogHero;
  const catalogHeroSlot = media["catalog.hero.image"];
  let heroSrc = catalogHeroSlot?.url || catalogHeroFallback.src;
  let heroAlt = localizedMediaAlt(
    locale,
    catalogHeroSlot,
    locale === "ar" ? catalogHeroFallback.altAr : catalogHeroFallback.altEn,
  );
  let heroObjectPosition = mediaObjectPosition(
    catalogHeroSlot?.metadata,
    catalogHeroFallback.objectPosition,
  );

  if (currentCategory) {
    const categoryFallback = getCategoryEditorialVisual(currentCategory.slug);
    const categorySlot = media[`catalog.category.${currentCategory.slug}.banner`];
    const categoryImage = currentCategory.image;

    if (categoryImage && isSafeCollectionImagePath(categoryImage)) {
      heroSrc = categoryImage;
      heroAlt = currentCategoryName;
      heroObjectPosition = categoryFallback?.objectPosition || "50% 50%";
    } else if (categorySlot?.url) {
      heroSrc = categorySlot.url;
      heroAlt = localizedMediaAlt(
        locale,
        categorySlot,
        currentCategoryName || (locale === "ar" ? categoryFallback?.altAr || "" : categoryFallback?.altEn || ""),
      );
      heroObjectPosition = mediaObjectPosition(
        categorySlot.metadata,
        categoryFallback?.objectPosition || "50% 50%",
      );
    }
  }

  if (currentStyle) {
    const styleFallback = getStyleEditorialVisual(currentStyle.slug);
    const styleSlot = media[`collections.style.${currentStyle.slug}.image`];
    if (styleSlot?.url) {
      heroSrc = styleSlot.url;
      heroAlt = localizedMediaAlt(
        locale,
        styleSlot,
        currentStyleName || (locale === "ar" ? styleFallback?.altAr || "" : styleFallback?.altEn || ""),
      );
      heroObjectPosition = mediaObjectPosition(
        styleSlot.metadata,
        styleFallback?.objectPosition || "50% 50%",
      );
    }
  }

  const collectionImage = currentCollection?.image;
  if (currentCollection && collectionImage && isSafeCollectionImagePath(collectionImage)) {
    heroSrc = collectionImage;
    heroAlt = currentCollectionName;
    heroObjectPosition = "50% 50%";
  }

  const pageTitle = currentCollectionName || currentStyleName || currentCategoryName || copy.title;
  const breadcrumbItems = [
    { name: dictionary.common.home, path: "/" },
    { name: dictionary.common.catalog, path: "/catalog" },
    ...(currentCategory ? [{ name: currentCategoryName }] : []),
    ...(currentCollection ? [{ name: currentCollectionName }] : []),
    ...(currentStyle ? [{ name: currentStyleName }] : []),
  ];
  const catalogJsonLd = isIndexableCatalogView
    ? {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "CollectionPage",
            "@id": `${absoluteSiteUrl(localizedStorefrontPath(locale, primaryCanonicalPath))}#webpage`,
            url: absoluteSiteUrl(localizedStorefrontPath(locale, primaryCanonicalPath)),
            name: pageTitle,
            description: currentCollectionDescription
              || (currentStyle
                ? pageContent.styles[currentStyle.slug]?.description || pickStorefrontText(locale, currentStyle.description.ar, currentStyle.description.en)
                : currentCategory
                  ? interpolateStorefrontMessage(copy.categoryBody, { category: currentCategoryName })
                  : copy.body),
            inLanguage: locale,
            mainEntity: { "@id": `${absoluteSiteUrl(localizedStorefrontPath(locale, primaryCanonicalPath))}#items` },
          },
          {
            "@id": `${absoluteSiteUrl(localizedStorefrontPath(locale, primaryCanonicalPath))}#breadcrumbs`,
            ...buildBreadcrumbJsonLd(locale, breadcrumbItems),
          },
          {
            "@id": `${absoluteSiteUrl(localizedStorefrontPath(locale, primaryCanonicalPath))}#items`,
            ...buildItemListJsonLd(locale, products.map((product) => ({
              name: pickStorefrontText(locale, product.nameAr, product.nameEn),
              path: `/product/${product.id}`,
              image: approvedSafeCatalogAssetUrls(product.assets)[0],
            }))),
          },
        ],
      }
    : null;

  return (
    <div className="min-h-screen bg-surface-editorial pb-24">
      {catalogJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(catalogJsonLd) }}
        />
      )}
      <header className="border-b border-border-subtle bg-surface-editorial">
        <div className="editorial-shell py-7 sm:py-10 lg:py-14">
          <nav aria-label={copy.breadcrumb} className="mb-5 flex flex-wrap items-center gap-2 text-[11px] font-medium text-text-muted sm:mb-7">
            <Link href={localizedStorefrontPath(locale, "/")} className="rounded-full transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{dictionary.common.home}</Link>
            <BreadcrumbIcon className="h-3 w-3" aria-hidden="true" />
            <span className={!currentCategory ? "font-bold text-text-strong" : ""}>{dictionary.common.catalog}</span>
            {currentCategory && (
              <>
                <BreadcrumbIcon className="h-3 w-3" aria-hidden="true" />
                <span className="font-bold text-text-strong">{currentCategoryName}</span>
              </>
            )}
            {currentCollection && (
              <>
                <BreadcrumbIcon className="h-3 w-3" aria-hidden="true" />
                <span className="font-bold text-text-strong">{currentCollectionName}</span>
              </>
            )}
            {currentStyle && (
              <>
                <BreadcrumbIcon className="h-3 w-3" aria-hidden="true" />
                <span className="font-bold text-text-strong">{currentStyleName}</span>
              </>
            )}
          </nav>

          <div className="editorial-frame grid overflow-hidden bg-surface-paper lg:grid-cols-[minmax(0,0.76fr)_minmax(0,1.24fr)]">
            <div className="flex min-h-[24rem] flex-col justify-center px-6 py-10 sm:min-h-[27rem] sm:px-10 sm:py-12 lg:min-h-[32rem] lg:px-12 xl:px-14">
              <span className="editorial-kicker">{copy.kicker}</span>
              <h1 className="editorial-heading mt-5 max-w-3xl text-text-strong">
                {currentCollectionName || currentStyleName || currentCategoryName || (searchTerm ? copy.searchResults : copy.title)}
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-7 text-text-body sm:text-base sm:leading-8">
                {currentCollection
                  ? currentCollectionDescription || interpolateStorefrontMessage(copy.collectionBody, { collection: currentCollectionName })
                  : currentStyle
                  ? pageContent.styles[currentStyle.slug]?.description || pickStorefrontText(locale, currentStyle.description.ar, currentStyle.description.en)
                  : currentCategory
                  ? interpolateStorefrontMessage(copy.categoryBody, { category: currentCategoryName })
                  : copy.body}
              </p>
              <div className="mt-8 flex items-center gap-3 border-t border-border-subtle pt-5 text-[10px] leading-5 text-text-muted">
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{copy.summaryHint}</span>
              </div>
            </div>

            <div className="relative min-h-[19rem] overflow-hidden border-t border-border-subtle sm:min-h-[25rem] lg:min-h-[32rem] lg:border-s lg:border-t-0">
              <Image
                src={heroSrc}
                alt={heroAlt}
                fill
                priority
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover"
                style={{ objectPosition: heroObjectPosition }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" aria-hidden="true" />
              <aside
                className="absolute inset-x-4 bottom-4 border border-white/55 bg-surface-paper/92 px-5 py-4 shadow-[0_18px_45px_-30px_rgba(15,27,21,0.8)] backdrop-blur-md sm:inset-x-auto sm:bottom-5 sm:end-5 sm:w-[17rem]"
                aria-label={copy.resultsSummary}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[9px] font-bold tracking-[0.18em] text-text-soft">{copy.curatedIndex}</span>
                    <p className="mt-2 text-3xl font-semibold leading-none text-text-strong">
                      {formatStorefrontNumber(matchingCount, locale)}
                    </p>
                    <p className="mt-2 text-[11px] text-text-muted">{copy.matches}</p>
                  </div>
                  <span className="grid size-10 place-items-center border border-border-subtle bg-surface-editorial text-primary" aria-hidden="true">
                    <Grid2X2 className="h-4 w-4" strokeWidth={1.4} />
                  </span>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </header>

      <section className="editorial-band border-b border-white/10" aria-labelledby="catalog-category-rail-heading">
        <div className="editorial-shell py-5 sm:py-6">
          <div className="mb-4 flex items-center justify-between gap-5">
            <div className="flex items-center gap-3">
              <span className="editorial-index" aria-hidden="true">01</span>
              <h2 id="catalog-category-rail-heading" className="text-sm font-semibold">{copy.startCategory}</h2>
            </div>
            <Link href={localizedStorefrontPath(locale, "/catalog")} className="hidden items-center gap-2 text-[10px] font-bold text-white/55 transition-colors hover:text-white sm:inline-flex">
              {copy.allProducts} <ForwardArrow className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <nav aria-label={copy.categoriesLabel} className="flex snap-x gap-2.5 overflow-x-auto pb-2 custom-scrollbar">
            <Link
              href={categoryHref()}
              aria-current={!currentCategory ? "page" : undefined}
              className={`flex min-h-11 shrink-0 snap-start items-center gap-3 rounded-[0.2rem] border px-4 text-xs font-bold transition-colors ${!currentCategory ? "border-white bg-white text-surface-ink" : "border-white/15 text-white/65 hover:border-white/35 hover:text-white"}`}
            >
              <span dir="ltr" className="text-[9px] opacity-55">00</span>
              {copy.all}
              <span className="text-[9px] opacity-50">{formatStorefrontNumber(totalCount, locale)}</span>
            </Link>
            {categories.map((category, index) => {
              const active = currentCategory?.slug === category.slug;
              return (
                <Link
                  key={category.id}
                  href={categoryHref(category.slug)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 shrink-0 snap-start items-center gap-3 rounded-[0.2rem] border px-4 text-xs font-bold transition-colors ${active ? "border-white bg-white text-surface-ink" : "border-white/15 text-white/65 hover:border-white/35 hover:text-white"}`}
                >
                  <span dir="ltr" className="text-[9px] opacity-55">{String(index + 1).padStart(2, "0")}</span>
                  {pickStorefrontText(locale, category.nameAr, category.nameEn)}
                  <span className="text-[9px] opacity-50">{formatStorefrontNumber(category._count.items, locale)}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <div className="editorial-shell flex min-h-screen flex-col gap-8 py-9 lg:flex-row lg:gap-10 lg:py-14">
        <aside className="w-full shrink-0 self-start lg:sticky lg:top-28 lg:max-h-[calc(100vh-8.5rem)] lg:w-[19rem] lg:overflow-y-auto lg:pl-2 custom-scrollbar">
          <CatalogFilterBar
            categories={categories}
            tagGroups={tagGroups}
            currentCategory={categorySlug}
            currentCollection={currentCollection}
            currentStyle={resolvedStyleCollections.find((style) => style.slug === currentStyle?.slug)}
            styleCollections={resolvedStyleCollections}
            content={pageContent.catalogFilter}
            currentPrice={currentPriceBand?.slug}
            priceBandCounts={priceBandCounts}
            priceSummary={{
              pricedCount: pricedRange._count.sellingPrice,
              requestOnlyCount,
              min: pricedRange._min.sellingPrice,
              max: pricedRange._max.sellingPrice,
            }}
            currentSearch={searchTerm}
            currentSort={sort}
            totalProducts={totalCount}
          />
        </aside>

        <div className="min-w-0 flex-1 pb-16">
          <div className="editorial-frame mb-6 flex flex-col justify-between gap-5 bg-surface-paper p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex min-w-0 items-center gap-4 text-sm text-text-muted">
              <span className="editorial-index shrink-0 text-text-strong" aria-hidden="true">02</span>
              <div className="min-w-0">
              {searchTerm ? (
                  <p className="truncate">
                    {copy.searchResultsFor} <strong className="mx-1 font-bold text-text-strong">“{searchTerm}”</strong>
                  </p>
              ) : (
                  <p className="font-semibold text-text-strong">{currentCollectionName || currentStyleName || currentCategoryName || copy.allProducts}</p>
              )}
                <p className="mt-1 text-[11px] text-text-soft">{interpolateStorefrontMessage(copy.resultCount, { count: formatStorefrontNumber(matchingCount, locale) })}</p>
                {(currentStyle || currentPriceBand) && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-text-muted">
                    {currentStyle && <span className="inline-flex items-center gap-1.5"><Palette className="h-3 w-3" aria-hidden="true" />{currentStyleName}</span>}
                    {currentPriceBand && <span className="inline-flex items-center gap-1.5"><CircleDollarSign className="h-3 w-3" aria-hidden="true" />{pageContent.catalogFilter.priceBandLabels[currentPriceBand.slug] || pickStorefrontText(locale, currentPriceBand.label.ar, currentPriceBand.label.en)}</span>}
                  </div>
                )}
              </div>
            </div>
            {matchingCount > 0 && (
              <span className="editorial-chip shrink-0 border-border-subtle text-text-muted">
                {interpolateStorefrontMessage(copy.pageCount, { page: formatStorefrontNumber(page, locale), total: formatStorefrontNumber(totalPages, locale) })}
              </span>
            )}
          </div>

          {products.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    item={product}
                    priority={index < 3}
                    approvedAssetUrls={approvedSafeCatalogAssetUrls(product.assets)}
                    allowLegacyImages={!productionCatalog}
                    sequence={(page - 1) * PAGE_SIZE + index + 1}
                    layout={index === 0 ? "feature" : "standard"}
                    content={pageContent.productCard}
                    addToQuoteContent={pageContent.addToQuote}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <nav aria-label={copy.pagesLabel} className="mt-14 flex items-center justify-center gap-2 border-t border-border-subtle pt-8">
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)} className="editorial-chip min-h-11 px-5 transition-colors hover:bg-surface-ink hover:text-white">
                      <PreviousIcon className="h-4 w-4" aria-hidden="true" /> {copy.previous}
                    </Link>
                  ) : (
                    <span className="editorial-chip min-h-11 px-5 opacity-35" aria-disabled="true">
                      <PreviousIcon className="h-4 w-4" aria-hidden="true" /> {copy.previous}
                    </span>
                  )}
                  <span className="min-w-16 text-center text-xs font-bold text-text-muted">
                    {formatStorefrontNumber(page, locale)} / {formatStorefrontNumber(totalPages, locale)}
                  </span>
                  {page < totalPages ? (
                    <Link href={pageHref(page + 1)} className="editorial-chip min-h-11 px-5 transition-colors hover:bg-surface-ink hover:text-white">
                      {copy.next} <NextIcon className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="editorial-chip min-h-11 px-5 opacity-35" aria-disabled="true">
                      {copy.next} <NextIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </nav>
              )}
            </>
          ) : (
            <div className="editorial-frame grid min-h-[480px] overflow-hidden bg-surface-paper md:grid-cols-[0.72fr_1.28fr]">
              <div className="editorial-band flex min-h-56 flex-col justify-between p-7 sm:p-9">
                <span className="text-[9px] font-bold tracking-[0.2em] text-white/45">{copy.noMatchLabel}</span>
                <SearchX className="h-12 w-12 text-white/55" strokeWidth={1.1} aria-hidden="true" />
              </div>
              <div className="flex flex-col justify-center p-8 sm:p-12">
                <h2 className="editorial-heading text-text-strong">{copy.noResults}</h2>
                <p className="mt-5 max-w-md text-sm leading-7 text-text-muted">
                  {copy.noResultsBody}
                </p>
                <Link href={localizedStorefrontPath(locale, "/catalog")} className="mt-7 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-white transition-colors hover:bg-primary-dark">
                  {copy.viewAll} <ForwardArrow className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
