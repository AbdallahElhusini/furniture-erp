import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers3,
  Palette,
  Ruler,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ProductDetailActions } from "@/components/storefront/ProductDetailActions";
import { ProductGallery, type ProductGalleryMedia } from "@/components/storefront/ProductGallery";
import {
  isCatalogSeoReady,
  isGenericCatalogName,
  parseCatalogImages,
} from "@/lib/catalog-quality";
import {
  approvedCatalogAssetWhere,
  approvedSafeCatalogAssetUrls,
  approvedSafeProductMediaAssets,
  catalogPublicationWhere,
  isProductionCatalog,
  safeProductMediaAssets,
} from "@/lib/catalog-publication";
import { prisma } from "@/lib/db";
import {
  formatStorefrontNumber,
  interpolateStorefrontMessage,
  pickStorefrontText,
  type StorefrontLocale,
} from "@/lib/i18n/storefront";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import { getStorefrontLocale } from "@/lib/i18n/storefront-server";
import { isSafeProductMediaSource, mimeTypeForProductMedia } from "@/lib/product-media";
import { buildStorefrontMetadata } from "@/lib/seo";
import { getStorefrontPageContent } from "@/lib/site-content-server";
import { STOREFRONT_PAGE_CONTENT_DEFAULTS, type StorefrontPageContent } from "@/lib/storefront-content-defaults";
import { absoluteSiteUrl, serializeJsonLd } from "@/lib/site";

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export const revalidate = 60;

const PRODUCT_COPY = STOREFRONT_PAGE_CONTENT_DEFAULTS;

const SPECIFICATION_LABEL_KEYS: Readonly<Record<string, keyof StorefrontPageContent["product"]["specificationLabels"]>> = {
  dimensions: "dimensions", dimension: "dimensions", "الأبعاد": "dimensions", "المقاس": "dimensions",
  material: "material", materials: "materials", "الخامة": "material", "الخامات": "materials",
  color: "color", colour: "color", "اللون": "color", finish: "finish", "التشطيب": "finish",
  weight: "weight", "الوزن": "weight", warranty: "warranty", "الضمان": "warranty", origin: "origin", "بلد المنشأ": "origin",
};

function localizedSpecificationLabel(key: string, copy: StorefrontPageContent["product"]): string {
  const labelKey = SPECIFICATION_LABEL_KEYS[key.trim().toLowerCase()];
  return labelKey ? copy.specificationLabels[labelKey] : key;
}

function localizedProductName(
  locale: StorefrontLocale,
  input: {
    sku?: string | null;
    nameAr?: string | null;
    nameEn?: string | null;
    categoryNameAr?: string | null;
    categoryNameEn?: string | null;
  },
  fallbackOfficePiece?: string,
): string {
  const officePiece = fallbackOfficePiece || PRODUCT_COPY[locale].product.officePiece;
  const categoryName = pickStorefrontText(locale, input.categoryNameAr, input.categoryNameEn) || officePiece;
  if (isGenericCatalogName(input)) {
    const sku = input.sku?.trim();
    return sku ? `${categoryName} · ${sku}` : categoryName;
  }
  return pickStorefrontText(locale, input.nameAr, input.nameEn) || input.sku?.trim() || officePiece;
}

function formatIndexedNumber(value: number, locale: StorefrontLocale, minimumDigits = 2): string {
  const zero = locale === "ar" ? "٠" : "0";
  return formatStorefrontNumber(value, locale).padStart(minimumDigits, zero);
}

function parseSpecifications(value: string | null): Array<[string, string]> {
  if (!value?.trim()) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

    return Object.entries(parsed)
      .filter(([, entry]) => entry !== null && entry !== undefined && String(entry).trim().length > 0)
      .map(([key, entry]) => [key, String(entry)]);
  } catch {
    return [];
  }
}

function parseProductId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

interface ProductMediaAssetRow {
  id?: number;
  url: string;
  mimeType?: string | null;
  role?: string | null;
  sortOrder?: number | null;
  altAr?: string | null;
  altEn?: string | null;
  reviewStatus?: string | null;
  duplicateOfId?: number | null;
}

function buildProductGalleryMedia(
  assets: readonly ProductMediaAssetRow[],
  legacyImages: unknown,
  productionCatalog: boolean,
): ProductGalleryMedia[] {
  const reviewableAssets = productionCatalog
    ? approvedSafeProductMediaAssets(assets)
    : safeProductMediaAssets(
        assets.filter(
          (asset) => asset.reviewStatus === "APPROVED" || asset.reviewStatus === "NEEDS_REVIEW",
        ),
      );
  const orderedAssets = [...reviewableAssets].sort((left, right) => {
    const leftPrimary = left.kind === "IMAGE" && left.role === "PRIMARY" ? 0 : 1;
    const rightPrimary = right.kind === "IMAGE" && right.role === "PRIMARY" ? 0 : 1;
    return leftPrimary - rightPrimary
      || Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
      || Number(left.id || 0) - Number(right.id || 0);
  });
  const seen = new Set<string>();
  const media: ProductGalleryMedia[] = [];

  for (const asset of orderedAssets) {
    if (seen.has(asset.url)) continue;
    seen.add(asset.url);
    const normalizedMimeType = asset.mimeType?.trim().toLowerCase();
    const mimeTypeMatchesKind = normalizedMimeType?.startsWith(
      asset.kind === "VIDEO" ? "video/" : "image/",
    );
    media.push({
      url: asset.url,
      kind: asset.kind,
      mimeType: mimeTypeMatchesKind
        ? normalizedMimeType
        : mimeTypeForProductMedia(asset.url, asset.kind),
      altAr: asset.altAr,
      altEn: asset.altEn,
    });
  }

  if (!productionCatalog) {
    for (const image of parseCatalogImages(legacyImages)) {
      if (seen.has(image) || !isSafeProductMediaSource(image, "IMAGE")) continue;
      seen.add(image);
      media.push({
        url: image,
        kind: "IMAGE",
        mimeType: mimeTypeForProductMedia(image, "IMAGE"),
        altAr: null,
        altEn: null,
      });
    }
  }

  return media;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const [locale, content] = await Promise.all([getStorefrontLocale(), getStorefrontPageContent()]);
  const copy = content[locale].product;
  const { id } = await params;
  const productId = parseProductId(id);
  if (productId === null) return { title: copy.notFound };
  const productionCatalog = isProductionCatalog();

  const product = await prisma.catalogItem.findUnique({
    where: { id: productId, ...catalogPublicationWhere() },
    select: {
      sku: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      images: true,
      contentStatus: true,
      completenessScore: true,
      category: { select: { nameAr: true, nameEn: true } },
      assets: {
        where: productionCatalog
          ? approvedCatalogAssetWhere
          : { duplicateOfId: null, reviewStatus: { in: ["APPROVED", "NEEDS_REVIEW"] } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          url: true,
          mimeType: true,
          role: true,
          sortOrder: true,
          reviewStatus: true,
          duplicateOfId: true,
          altAr: true,
          altEn: true,
        },
      },
    },
  });

  if (!product) return { title: copy.notFound };
  const name = localizedProductName(locale, {
    ...product,
    categoryNameAr: product.category.nameAr,
    categoryNameEn: product.category.nameEn,
  }, copy.officePiece);
  const description = pickStorefrontText(locale, product.descriptionAr, product.descriptionEn) || interpolateStorefrontMessage(copy.metaDescription, { name });
  const image = buildProductGalleryMedia(product.assets, product.images, productionCatalog)
    .find((item) => item.kind === "IMAGE");
  const isSeoReady = isCatalogSeoReady(product);
  const metadata = buildStorefrontMetadata({
    locale,
    path: `/product/${productId}`,
    title: name,
    description,
    keywords: [
      name,
      product.sku,
      product.category.nameAr,
      product.category.nameEn,
    ],
    index: isSeoReady,
    follow: true,
    image: image?.url,
  });
  if (!image) return metadata;

  const imageAlt = (locale === "ar" ? image.altAr : image.altEn)?.trim()
    || (locale === "ar" ? image.altEn : image.altAr)?.trim()
    || name;
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      images: [{ url: image.url, alt: imageAlt }],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const [locale, content] = await Promise.all([getStorefrontLocale(), getStorefrontPageContent()]);
  const pageContent = content[locale];
  const copy = pageContent.product;
  const DirectionalChevron = locale === "ar" ? ChevronLeft : ChevronRight;
  const ForwardArrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const publicationWhere = catalogPublicationWhere();
  const productionCatalog = isProductionCatalog();
  const { id } = await params;
  const productId = parseProductId(id);
  if (productId === null) notFound();

  const product = await prisma.catalogItem.findUnique({
    where: { id: productId, ...publicationWhere },
    include: {
      category: true,
      collections: { where: { isActive: true, isDraft: false } },
      tags: { include: { group: true }, orderBy: { sortOrder: "asc" } },
      assets: {
        where: productionCatalog
          ? approvedCatalogAssetWhere
          : { duplicateOfId: null, reviewStatus: { in: ["APPROVED", "NEEDS_REVIEW"] } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          url: true,
          mimeType: true,
          role: true,
          sortOrder: true,
          altAr: true,
          altEn: true,
          reviewStatus: true,
          duplicateOfId: true,
        },
      },
      family: { select: { id: true, nameAr: true, nameEn: true, reviewStatus: true } },
    },
  });

  if (!product) notFound();

  const categoryName = pickStorefrontText(locale, product.category.nameAr, product.category.nameEn) || copy.officePiece;
  const displayName = localizedProductName(locale, {
    sku: product.sku,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    categoryNameAr: product.category.nameAr,
    categoryNameEn: product.category.nameEn,
  }, copy.officePiece);
  const alternateName = !isGenericCatalogName(product)
    ? pickStorefrontText(locale === "ar" ? "en" : "ar", product.nameAr, product.nameEn)
    : "";
  const showAlternateName = Boolean(alternateName && alternateName !== displayName);
  const productMedia = buildProductGalleryMedia(product.assets, product.images, productionCatalog);
  const productImages = productMedia
    .filter((item) => item.kind === "IMAGE")
    .map((item) => item.url);
  const specifications = parseSpecifications(product.specifications);
  const localizedProductPath = localizedStorefrontPath(locale, `/product/${product.id}`);
  const localizedHomePath = localizedStorefrontPath(locale, "/");
  const localizedCatalogPath = localizedStorefrontPath(locale, "/catalog");
  const localizedCategoryPath = localizedStorefrontPath(
    locale,
    `/catalog?category=${encodeURIComponent(product.category.slug)}`,
  );
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${absoluteSiteUrl(localizedProductPath)}#product`,
    url: absoluteSiteUrl(localizedProductPath),
    name: displayName,
    sku: product.sku,
    category: categoryName,
    description: pickStorefrontText(locale, product.descriptionAr, product.descriptionEn) || interpolateStorefrontMessage(copy.schemaDescription, { category: categoryName }),
    image: productImages.map(absoluteSiteUrl),
    inLanguage: locale,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: copy.home, item: absoluteSiteUrl(localizedHomePath) },
      { "@type": "ListItem", position: 2, name: copy.catalog, item: absoluteSiteUrl(localizedCatalogPath) },
      {
        "@type": "ListItem",
        position: 3,
        name: categoryName,
        item: absoluteSiteUrl(localizedCategoryPath),
      },
      { "@type": "ListItem", position: 4, name: displayName, item: absoluteSiteUrl(localizedProductPath) },
    ],
  };

  const relatedProductsPromise = prisma.catalogItem.findMany({
    where: {
      ...publicationWhere,
      categoryId: product.categoryId,
      id: { not: product.id },
    },
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
    orderBy: [{ displayOrder: "asc" }, { completenessScore: "desc" }, { isFeatured: "desc" }, { createdAt: "desc" }],
    take: 4,
  });

  const familyProductsPromise = product.family?.reviewStatus === "APPROVED"
    ? prisma.catalogItem.findMany({
        where: { ...publicationWhere, familyId: product.family.id, id: { not: product.id } },
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
        orderBy: [{ displayOrder: "asc" }, { completenessScore: "desc" }, { sku: "asc" }],
        take: 6,
      })
    : Promise.resolve([]);

  const setCollections = product.collections.filter((collection) => collection.type === "SET");
  const setCollectionIds = setCollections.map((collection) => collection.id);
  const setProductsPromise = setCollectionIds.length > 0
    ? prisma.catalogItem.findMany({
        where: {
          ...publicationWhere,
          collections: { some: { id: { in: setCollectionIds } } },
          id: { not: product.id },
        },
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
        orderBy: [{ displayOrder: "asc" }, { completenessScore: "desc" }, { sku: "asc" }],
        take: 8,
      })
    : Promise.resolve([]);

  const [relatedProducts, familyProducts, setProducts] = await Promise.all([
    relatedProductsPromise,
    familyProductsPromise,
    setProductsPromise,
  ]);

  return (
    <main className="architectural-line-field min-h-screen bg-surface-editorial pb-24 pt-6 sm:pt-9">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />

      <div className="editorial-shell">
        <nav
          aria-label={copy.breadcrumb}
          className="mb-6 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-2 text-xs text-text-muted custom-scrollbar sm:mb-8"
        >
          <Link href={localizedHomePath} className="transition-colors hover:text-primary">{copy.home}</Link>
          <DirectionalChevron className="size-3 shrink-0" aria-hidden="true" />
          <Link href={localizedCatalogPath} className="transition-colors hover:text-primary">{copy.catalog}</Link>
          <DirectionalChevron className="size-3 shrink-0" aria-hidden="true" />
          <Link href={localizedStorefrontPath(locale, `/catalog?category=${product.category.slug}`)} className="transition-colors hover:text-primary">
            {categoryName}
          </Link>
          <DirectionalChevron className="size-3 shrink-0" aria-hidden="true" />
          <span aria-current="page" className="max-w-56 truncate font-bold text-primary">{displayName}</span>
        </nav>

        <section className="architectural-panel editorial-crosshair relative mb-20 shadow-raised sm:mb-28" aria-labelledby="product-title">
          <span
            className="pointer-events-none absolute -left-14 top-20 hidden text-[10rem] font-black leading-none text-walnut-900/[0.025] xl:block"
            aria-hidden="true"
          >
            HATAB
          </span>

          <div className="flex min-h-10 items-center justify-between gap-4 border-b border-border-subtle bg-surface-paper/80 px-4 font-mono text-[9px] font-bold tracking-[0.16em] text-text-soft sm:px-6" dir="ltr">
            <span>{copy.objectLabel} {formatIndexedNumber(product.id, locale, 3)}</span>
            <span>{copy.catalogueLocation}</span>
          </div>

          <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.18fr)_minmax(24rem,0.82fr)]" dir="ltr">
            <div className="min-w-0 p-3 sm:p-5 lg:p-7" dir={locale === "ar" ? "rtl" : "ltr"}>
              <ProductGallery media={productMedia} productName={displayName} content={pageContent.gallery} />
            </div>

            <header className="flex min-w-0 flex-col border-t border-border-subtle bg-surface-paper px-5 py-7 sm:px-8 sm:py-9 lg:border-l lg:border-t-0 lg:px-9 lg:py-10 xl:px-11" dir={locale === "ar" ? "rtl" : "ltr"}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={localizedStorefrontPath(locale, `/catalog?category=${product.category.slug}`)} className="editorial-chip transition-colors hover:border-primary/35 hover:text-primary">
                  {categoryName}
                </Link>
                {product.isFeatured && (
                  <span className="editorial-chip border-brass-500/35 bg-brass-100/70 text-brass-700">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {copy.selected}
                  </span>
                )}
              </div>

              <h1 id="product-title" className="editorial-heading mt-8 text-text-strong">
                {displayName}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
                {showAlternateName && (
                  <span dir={locale === "ar" ? "ltr" : "rtl"} className="display-title-latin font-medium text-text-body">
                    {alternateName}
                  </span>
                )}
                <span dir="ltr" className="font-bold tracking-[0.12em] text-text-soft">{product.sku}</span>
              </div>

              <p className="text-pretty mt-7 text-sm leading-8 text-text-muted sm:text-base">
                {pickStorefrontText(locale, product.descriptionAr, product.descriptionEn) || interpolateStorefrontMessage(copy.fallbackDescription, { category: categoryName })}
              </p>

              {(product.dimensions || product.material || product.color) && (
                <>
                  <div className="architectural-divider mt-7" aria-hidden="true">{copy.materialData}</div>
                  <dl className="mt-4 grid gap-2.5">
                  {product.dimensions && (
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--shape-control)] border border-border-subtle bg-surface-editorial/65 px-3.5 py-3">
                      <dt className="inline-flex items-center gap-2 text-xs font-bold text-text-muted">
                        <span className="grid size-8 place-items-center rounded-[var(--shape-xs)] border border-border-subtle bg-surface-paper text-accent shadow-contact">
                          <Ruler className="size-3.5" aria-hidden="true" />
                        </span>
                        {copy.dimensions}
                      </dt>
                      <dd dir="ltr" className="min-w-0 text-left text-sm font-bold text-text-strong">{product.dimensions}</dd>
                    </div>
                  )}
                  {product.material && (
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--shape-control)] border border-border-subtle bg-surface-editorial/65 px-3.5 py-3">
                      <dt className="inline-flex items-center gap-2 text-xs font-bold text-text-muted">
                        <span className="grid size-8 place-items-center rounded-[var(--shape-xs)] border border-border-subtle bg-surface-paper text-accent shadow-contact">
                          <Layers3 className="size-3.5" aria-hidden="true" />
                        </span>
                        {copy.material}
                      </dt>
                      <dd className="min-w-0 text-sm font-bold leading-6 text-text-strong">{product.material}</dd>
                    </div>
                  )}
                  {product.color && (
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--shape-control)] border border-border-subtle bg-surface-editorial/65 px-3.5 py-3">
                      <dt className="inline-flex items-center gap-2 text-xs font-bold text-text-muted">
                        <span className="grid size-8 place-items-center rounded-[var(--shape-xs)] border border-border-subtle bg-surface-paper text-accent shadow-contact">
                          <Palette className="size-3.5" aria-hidden="true" />
                        </span>
                        {copy.color}
                      </dt>
                      <dd className="min-w-0 text-sm font-bold leading-6 text-text-strong">{product.color}</dd>
                    </div>
                  )}
                  </dl>
                </>
              )}

              {(product.tags.length > 0 || product.collections.length > 0) && (
                <div className="mt-6 flex flex-wrap gap-2" aria-label={copy.traitsLabel}>
                  {product.tags.map((tag) => (
                    <Link
                      key={tag.id}
                      href={localizedStorefrontPath(locale, `/catalog?tags=${tag.slug}`)}
                      className="editorial-chip border-border-subtle bg-transparent text-text-muted transition-colors hover:border-primary/30 hover:text-primary"
                      title={pickStorefrontText(locale, tag.group.nameAr, tag.group.nameEn)}
                    >
                      {pickStorefrontText(locale, tag.nameAr, tag.nameEn)}
                    </Link>
                  ))}
                  {product.collections.map((collection) => (
                    <span key={collection.id} className="editorial-chip border-forest-700/15 bg-forest-100/65 text-forest-800">
                      {pickStorefrontText(locale, collection.nameAr, collection.nameEn)}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-8 lg:mt-auto lg:pt-9">
                <ProductDetailActions
                  catalogItemId={product.id}
                  name={displayName}
                  content={pageContent.productActions}
                  quantityContent={pageContent.quantity}
                  details={{
                    nameEn: !isGenericCatalogName(product) ? product.nameEn : undefined,
                    sku: product.sku,
                    category: categoryName,
                    dimensions: product.dimensions || undefined,
                    material: product.material || undefined,
                    color: product.color || undefined,
                    image: productImages[0],
                  }}
                />
              </div>

              <ul className="mt-6 grid gap-2 border-t border-border-subtle pt-5 text-xs leading-6 text-text-muted sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {copy.assurances.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-[0.2rem] bg-forest-100 text-forest-800">
                      <Check className="size-2.5" aria-hidden="true" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </header>
          </div>
        </section>

        <section
          className="editorial-band editorial-crosshair stage-grid stage-noise mb-24 overflow-hidden rounded-[var(--shape-panel)] border border-black/20 shadow-stage sm:mb-32 [--stage-grid-line:rgba(255,253,248,0.035)] [--stage-grid-size:5rem]"
          aria-labelledby="product-specifications"
        >
          <div className="grid lg:grid-cols-[0.38fr_0.62fr]">
            <div className="relative p-7 sm:p-10 lg:p-12 xl:p-14">
              <span className="editorial-index border-brass-300/55 text-brass-300">{formatIndexedNumber(2, locale)}</span>
              <ScanLine className="mt-12 size-7 text-brass-300" strokeWidth={1.35} aria-hidden="true" />
              <h2 id="product-specifications" className="mt-6 max-w-md text-3xl font-semibold leading-[1.15] text-white sm:text-5xl">
                {copy.detailsTitle}
              </h2>
              <p className="mt-5 max-w-md text-sm font-light leading-8 text-white/60">
                {copy.detailsBody}
              </p>
            </div>

            <div className="border-t border-white/10 bg-white/[0.025] lg:border-r lg:border-t-0">
              {specifications.length > 0 ? (
                <dl className="grid sm:grid-cols-2">
                  {specifications.map(([key, value], index) => (
                    <div
                      key={key}
                      className="min-h-40 border-b border-white/10 p-6 sm:p-8 sm:odd:border-l lg:min-h-48"
                    >
                      <div className="flex items-center gap-3">
                        <span className="editorial-index size-7 min-h-7 min-w-7 border-white/20 text-white/45">
                          {formatIndexedNumber(index + 1, locale)}
                        </span>
                        <dt className="text-xs font-bold text-white/48">{localizedSpecificationLabel(key, copy)}</dt>
                      </div>
                      <dd className="mt-7 text-base leading-8 text-white/88">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <ol className="grid min-h-full sm:grid-cols-3">
                  {copy.specificationFallbacks.map((item, index) => (
                    <li key={item.title} className="min-h-56 border-b border-white/10 p-6 sm:border-l sm:border-b-0 sm:p-8 sm:last:border-l-0 lg:min-h-80">
                      <span className="editorial-index border-white/20 text-white/45">
                        {formatIndexedNumber(index + 1, locale)}
                      </span>
                      <h3 className="mt-12 text-xl font-semibold text-white">{item.title}</h3>
                      <p className="mt-4 text-xs font-light leading-7 text-white/52">{item.copy}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>

        {familyProducts.length > 0 && (
          <section className="mb-24 border-t border-border-strong pt-16 sm:mb-32 sm:pt-24" aria-labelledby="product-family-heading">
            <div className="grid gap-10 lg:grid-cols-[0.3fr_0.7fr] lg:gap-14">
              <header>
                <span className="editorial-index text-primary">{formatIndexedNumber(3, locale)}</span>
                <span className="editorial-kicker mt-7">{copy.sameFamily}</span>
                <h2 id="product-family-heading" className="mt-4 text-3xl font-semibold leading-tight text-text-strong sm:text-5xl">
                  {pickStorefrontText(locale, product.family?.nameAr, product.family?.nameEn)}
                </h2>
                <p className="mt-5 max-w-sm text-sm leading-7 text-text-muted">
                  {copy.familyBody}
                </p>
              </header>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {familyProducts.map((familyProduct) => (
                  <ProductCard
                    key={familyProduct.id}
                    item={familyProduct}
                    featuredBadge={false}
                    approvedAssetUrls={approvedSafeCatalogAssetUrls(familyProduct.assets)}
                    allowLegacyImages={!productionCatalog}
                    content={pageContent.productCard}
                    addToQuoteContent={pageContent.addToQuote}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {setProducts.length > 0 && (
          <section
            className="architectural-banner editorial-crosshair mb-24 rounded-[var(--shape-panel)] p-5 shadow-raised sm:mb-32 sm:p-9 lg:p-12"
            aria-labelledby="product-set-heading"
          >
            <div className="mb-10 grid gap-7 border-b border-forest-900/15 pb-9 lg:grid-cols-[0.7fr_0.3fr] lg:items-end">
              <div>
                <span className="editorial-kicker text-forest-900">{copy.coordinated}</span>
                <h2 id="product-set-heading" className="mt-4 text-4xl font-semibold leading-tight text-forest-950 sm:text-6xl">
                  {copy.completeSet}
                </h2>
              </div>
              <div className={locale === "ar" ? "lg:text-left" : "lg:text-right"}>
                {setCollections.map((collection) => (
                  <span key={collection.id} className="editorial-chip mb-2 me-2 border-forest-900/20 bg-white/45 text-forest-900">
                    {pickStorefrontText(locale, collection.nameAr, collection.nameEn)}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {setProducts.map((setProduct) => (
                <ProductCard
                  key={setProduct.id}
                  item={setProduct}
                  featuredBadge={false}
                  approvedAssetUrls={approvedSafeCatalogAssetUrls(setProduct.assets)}
                  allowLegacyImages={!productionCatalog}
                  content={pageContent.productCard}
                  addToQuoteContent={pageContent.addToQuote}
                />
              ))}
            </div>
          </section>
        )}

        {relatedProducts.length > 0 && (
          <section className="border-t border-border-strong pt-16 sm:pt-24" aria-labelledby="related-products-heading">
            <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <span className="editorial-kicker">{copy.discoverMore}</span>
                <h2 id="related-products-heading" className="mt-4 text-4xl font-semibold leading-tight text-text-strong sm:text-6xl">
                  {copy.sameCategory}
                </h2>
              </div>
              <Link
                href={localizedStorefrontPath(locale, `/catalog?category=${product.category.slug}`)}
                className="architectural-action inline-flex min-h-11 items-center gap-2 self-start rounded-[var(--shape-control)] border border-border-strong bg-surface-paper px-5 text-sm font-bold text-primary shadow-contact transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-subtle motion-reduce:transform-none sm:self-auto"
              >
                {interpolateStorefrontMessage(copy.allCategory, { category: categoryName })}
                <ForwardArrow className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((relatedProduct) => (
                <ProductCard
                  key={relatedProduct.id}
                  item={relatedProduct}
                  featuredBadge={false}
                  approvedAssetUrls={approvedSafeCatalogAssetUrls(relatedProduct.assets)}
                  allowLegacyImages={!productionCatalog}
                  content={pageContent.productCard}
                  addToQuoteContent={pageContent.addToQuote}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
