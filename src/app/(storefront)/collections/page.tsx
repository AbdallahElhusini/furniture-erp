import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Layers3,
  Plus,
} from "lucide-react";
import { EditorialMotionMedia } from "@/components/storefront/home/EditorialMotionMedia";
import {
  approvedCatalogAssetWhere,
  approvedSafeCatalogAssetUrls,
  catalogPublicationWhere,
  isProductionCatalog,
  isSafeCatalogAssetUrl,
} from "@/lib/catalog-publication";
import { formatSellingPrice, hasSellingPrice } from "@/lib/catalog-commerce";
import { parseCatalogImages } from "@/lib/catalog-quality";
import { isSafeCollectionImagePath } from "@/lib/collection-publication";
import { prisma } from "@/lib/db";
import {
  formatStorefrontNumber,
  interpolateStorefrontMessage,
  pickStorefrontText,
} from "@/lib/i18n/storefront";
import { getStorefrontLocale } from "@/lib/i18n/storefront-server";
import { getStorefrontPageContent, getStorefrontPageContentWithMedia } from "@/lib/site-content-server";
import {
  getStyleEditorialVisual,
  STOREFRONT_EDITORIAL_MEDIA,
} from "@/lib/storefront-visuals";
import { getStyleSkuUniverse, STYLE_COLLECTIONS } from "@/lib/style-collections";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildStorefrontMetadata,
} from "@/lib/seo";
import { absoluteSiteUrl, serializeJsonLd } from "@/lib/site";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, content] = await Promise.all([getStorefrontLocale(), getStorefrontPageContent()]);
  const { metaTitle: title, metaDescription: description } = content[locale].collections;
  return buildStorefrontMetadata({
    locale,
    path: "/collections",
    title,
    description,
    keywords: STYLE_COLLECTIONS.map((style) => pickStorefrontText(locale, style.name.ar, style.name.en)),
  });
}

const POSITION_KEYWORDS = new Set(["left", "center", "right", "top", "bottom"]);

function isObjectPositionToken(value: string) {
  if (POSITION_KEYWORDS.has(value)) return true;
  if (!/^\d{1,3}(?:\.\d+)?%$/.test(value)) return false;
  const percentage = Number(value.slice(0, -1));
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;
}

function getObjectPosition(metadata: string | undefined, fallback = "50% 50%") {
  if (!metadata) return fallback;

  try {
    const parsed = JSON.parse(metadata) as { objectPosition?: unknown };
    if (typeof parsed.objectPosition !== "string") return fallback;
    const tokens = parsed.objectPosition.trim().split(/\s+/);
    return tokens.length >= 1 && tokens.length <= 2 && tokens.every(isObjectPositionToken)
      ? tokens.join(" ")
      : fallback;
  } catch {
    return fallback;
  }
}

function getCatalogImage(
  product: {
    images: string;
    assets: {
      url: string;
      reviewStatus: string;
      duplicateOfId: number | null;
      altAr: string | null;
      altEn: string | null;
    }[];
  },
  allowLegacyImages: boolean,
) {
  const approved = approvedSafeCatalogAssetUrls(product.assets)[0];
  if (approved) return approved;
  if (!allowLegacyImages) return undefined;
  return parseCatalogImages(product.images).find(isSafeCatalogAssetUrl);
}

export default async function CollectionsPage() {
  const [locale, resolved] = await Promise.all([
    getStorefrontLocale(),
    getStorefrontPageContentWithMedia(),
  ]);
  const content = resolved.contentByLocale;
  const copy = content[locale].collections;
  const heroMedia = resolved.media["collections.hero.image"];
  const motionMedia = resolved.media["collections.motion.video"];
  const heroFallback = STOREFRONT_EDITORIAL_MEDIA.collectionsHero;
  const heroImage = heroMedia?.url || heroFallback.src;
  const heroAlt =
    (locale === "ar" ? heroMedia?.altAr : heroMedia?.altEn) ||
    (locale === "ar" ? heroFallback.altAr : heroFallback.altEn);
  const heroObjectPosition = getObjectPosition(heroMedia?.metadata, heroFallback.objectPosition);
  const ForwardArrow = locale === "ar" ? ArrowUpLeft : ArrowUpRight;
  const BreadcrumbIcon = locale === "ar" ? ChevronLeft : ChevronRight;
  const publicationWhere = catalogPublicationWhere();
  const allowLegacyImages = !isProductionCatalog();
  const [collections, styleProducts] = await Promise.all([
    prisma.collection.findMany({
      where: {
        isActive: true,
        isDraft: false,
        items: { some: publicationWhere },
      },
      include: {
        _count: { select: { items: { where: publicationWhere } } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    prisma.catalogItem.findMany({
      where: {
        ...publicationWhere,
        sku: { in: getStyleSkuUniverse() },
      },
      select: {
        id: true,
        sku: true,
        nameAr: true,
        nameEn: true,
        sellingPrice: true,
        images: true,
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
    }),
  ]);

  const productsBySku = new Map(styleProducts.map((product) => [product.sku, product]));
  const styleEdits = STYLE_COLLECTIONS.map((style) => {
    const fallbackVisual = getStyleEditorialVisual(style.slug);
    const media = resolved.media[`collections.style.${style.slug}.image`];
    const name = {
      ar: content.ar.styles[style.slug]?.name || style.name.ar,
      en: content.en.styles[style.slug]?.name || style.name.en,
    };

    return {
      style: {
        ...style,
        name,
        tagline: {
          ar: content.ar.styles[style.slug]?.tagline || style.tagline.ar,
          en: content.en.styles[style.slug]?.tagline || style.tagline.en,
        },
        description: {
          ar: content.ar.styles[style.slug]?.description || style.description.ar,
          en: content.en.styles[style.slug]?.description || style.description.en,
        },
        criteria: {
          ar: content.ar.styles[style.slug]?.criteria || style.criteria.ar,
          en: content.en.styles[style.slug]?.criteria || style.criteria.en,
        },
      },
      products: style.skus
        .map((sku) => productsBySku.get(sku))
        .filter((product): product is NonNullable<typeof product> => Boolean(product)),
      image: media?.url || fallbackVisual?.src,
      imageAlt:
        (locale === "ar" ? media?.altAr : media?.altEn) ||
        (locale === "ar" ? fallbackVisual?.altAr : fallbackVisual?.altEn) ||
        pickStorefrontText(locale, name.ar, name.en),
      objectPosition: getObjectPosition(media?.metadata, fallbackVisual?.objectPosition),
    };
  });
  const canonicalUrl = absoluteSiteUrl(localizedStorefrontPath(locale, "/collections"));
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: copy.metaTitle,
        description: copy.metaDescription,
        inLanguage: locale,
        mainEntity: { "@id": `${canonicalUrl}#collection-directory` },
      },
      {
        "@id": `${canonicalUrl}#breadcrumbs`,
        ...buildBreadcrumbJsonLd(locale, [
          { name: copy.home, path: "/" },
          { name: copy.title },
        ]),
      },
      {
        "@id": `${canonicalUrl}#collection-directory`,
        ...buildItemListJsonLd(locale, [
          ...styleEdits.map(({ style, image }) => ({
            name: pickStorefrontText(locale, style.name.ar, style.name.en),
            path: `/catalog?style=${encodeURIComponent(style.slug)}`,
            image,
          })),
          ...collections.map((collection) => ({
            name: pickStorefrontText(locale, collection.nameAr, collection.nameEn),
            path: `/catalog?collection=${encodeURIComponent(collection.slug)}`,
            image: collection.image && isSafeCollectionImagePath(collection.image)
              ? collection.image
              : undefined,
          })),
        ]),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-surface-editorial pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }}
      />
      <header className="border-b border-border bg-[#f5f3ed]">
        <div className="editorial-shell py-7 sm:py-10 lg:py-14">
          <nav aria-label={copy.breadcrumb} className="mb-7 flex items-center gap-2 text-[11px] text-text-muted sm:mb-9">
            <Link href={localizedStorefrontPath(locale, "/")} className="transition-colors hover:text-primary">{copy.home}</Link>
            <BreadcrumbIcon className="h-3 w-3" aria-hidden="true" />
            <span className="font-bold text-text-strong">{copy.title}</span>
          </nav>

          <div className="relative min-h-[35rem] overflow-hidden rounded-[0.45rem] bg-surface-ink sm:min-h-[43rem] lg:min-h-[46rem]">
            <Image
              src={heroImage}
              alt={heroAlt}
              fill
              priority
              sizes="(max-width: 1536px) 94vw, 1440px"
              className="object-cover"
              style={{ objectPosition: heroObjectPosition }}
            />
            <div
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,20,15,0.04)_4%,rgba(10,20,15,0.08)_34%,rgba(10,20,15,0.84)_100%)]"
              aria-hidden="true"
            />

            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-5 sm:p-8 lg:p-10">
              <span className="max-w-[70%] rounded-[0.2rem] bg-white/92 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-primary shadow-sm backdrop-blur-sm">
                {copy.kicker}
              </span>
              <span dir="ltr" className="rounded-[0.2rem] border border-white/35 bg-surface-ink/24 px-3 py-2 text-[9px] font-bold tracking-[0.14em] text-white backdrop-blur-sm">
                01 / 05
              </span>
            </div>

            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10 lg:p-14">
              <h1 className="max-w-5xl text-[clamp(3.2rem,7vw,7rem)] font-light leading-[0.88] tracking-[-0.055em]">
                {copy.heroLead}
                <strong className="block font-extrabold">{copy.heroStrong}</strong>
              </h1>
              <p className="mt-6 max-w-2xl border-s border-white/45 ps-4 text-sm leading-7 text-white/78 sm:text-base sm:leading-8">
                {copy.heroBody}
              </p>
            </div>
          </div>

          <nav aria-label={copy.directory} className="border-x border-b border-border bg-[#fbfaf6]">
            <div className="flex items-center justify-between gap-5 border-b border-border px-4 py-3 sm:px-5">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary/60">{copy.directory}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-text-muted">{copy.coordinatedEdits}</span>
            </div>
            <ol className="grid grid-cols-2 sm:grid-cols-5">
              {styleEdits.map(({ style }, index) => (
                <li key={style.slug} className="border-e border-t border-border first:border-t-0 last:col-span-2 sm:col-span-1 sm:border-t-0">
                  <Link
                    href={`#style-${style.slug}`}
                    className="group flex min-h-20 flex-col justify-between gap-3 p-4 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <span dir="ltr" className="text-[9px] text-text-soft">{String(index + 1).padStart(2, "0")}</span>
                    <span className="flex items-end justify-between gap-3 text-xs font-bold text-text-strong">
                      <span>{pickStorefrontText(locale, style.name.ar, style.name.en)}</span>
                      <ForwardArrow className="h-3.5 w-3.5 shrink-0 text-primary/45 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </header>

      <main>
        <section className="editorial-shell py-16 sm:py-24" aria-labelledby="style-edits-heading">
          <div className="grid items-center gap-8 border-b border-border pb-12 lg:grid-cols-[minmax(0,0.72fr)_minmax(28rem,1.28fr)] lg:gap-14 lg:pb-16">
            <div>
              <span className="editorial-kicker">{copy.curatedLabel}</span>
              <h2 id="style-edits-heading" className="editorial-heading mt-4 max-w-3xl text-text-strong">
                {copy.curatedLead}
                <span className="block font-light text-text-muted">{copy.curatedStrong}</span>
              </h2>
              <p className="mt-6 max-w-xl text-sm leading-7 text-text-muted">
                {copy.curatedBody}
              </p>
            </div>

            <figure className="relative aspect-[16/8] min-h-56 overflow-hidden rounded-[0.4rem] border border-border bg-[#f6f6f3]">
              <EditorialMotionMedia
                videoSrc={motionMedia?.url}
                posterSrc={STOREFRONT_EDITORIAL_MEDIA.homeMotionPoster}
                alt={copy.curatedLead}
              />
              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-surface-ink/55 to-transparent p-4 pt-14 text-[9px] font-bold uppercase tracking-[0.14em] text-white sm:p-5">
                <span>{copy.coordinatedEdits}</span>
                <span className="hidden sm:inline">{copy.style} · <span dir="ltr">01 / 05</span></span>
              </figcaption>
            </figure>
          </div>

          <div className="mt-14 space-y-14 sm:mt-20 sm:space-y-20 lg:space-y-24">
            {styleEdits.map(({ style, products, image, imageAlt, objectPosition }, index) => (
              <article
                key={style.slug}
                id={`style-${style.slug}`}
                className="scroll-mt-24 overflow-hidden rounded-[0.45rem] border border-border bg-surface-paper"
              >
                <figure className="relative min-h-[26rem] overflow-hidden bg-[#e8e6df] sm:min-h-[34rem] lg:min-h-[39rem]">
                  {image && (
                    <Image
                      src={image}
                      alt={imageAlt}
                      fill
                      sizes="(max-width: 1536px) 94vw, 1440px"
                      className="object-cover"
                      style={{ objectPosition }}
                    />
                  )}
                  <div
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,20,15,0.02)_18%,rgba(10,20,15,0.68)_100%)]"
                    aria-hidden="true"
                  />
                  <figcaption className="absolute inset-0 flex flex-col justify-between p-5 text-white sm:p-8 lg:p-10">
                    <div className="flex items-center justify-between gap-5">
                      <span className="rounded-[0.18rem] bg-white/92 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-primary backdrop-blur-sm">
                        {copy.styleEdit}
                      </span>
                      <span dir="ltr" className="text-4xl font-light tracking-[-0.08em] text-white/75 sm:text-5xl">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <div className="max-w-4xl">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/62">
                        {copy.spacePlan} / <span dir="ltr">{String(index + 1).padStart(2, "0")}</span>
                      </p>
                      <h3 className="mt-3 text-4xl font-extrabold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                        {pickStorefrontText(locale, style.name.ar, style.name.en)}
                      </h3>
                      <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/86 sm:text-base sm:leading-8">
                        {pickStorefrontText(locale, style.tagline.ar, style.tagline.en)}
                      </p>
                    </div>
                  </figcaption>
                </figure>

                <div className={products.length > 0 ? "grid lg:grid-cols-[minmax(18rem,0.62fr)_minmax(0,1.38fr)]" : "max-w-3xl"}>
                  <div className="flex flex-col p-6 sm:p-8 lg:p-10">
                    <p className="text-sm leading-7 text-text-muted">
                      {pickStorefrontText(locale, style.description.ar, style.description.en)}
                    </p>
                    <p className="mt-6 border-t border-border pt-5 text-[10px] leading-5 text-text-muted">
                      {pickStorefrontText(locale, style.criteria.ar, style.criteria.en)}
                    </p>
                    <Link
                      href={localizedStorefrontPath(locale, `/catalog?style=${style.slug}`)}
                      className="mt-7 inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-[0.2rem] bg-primary px-5 text-xs font-bold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      {copy.explore}
                      <ForwardArrow className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>

                  {products.length > 0 && (
                    <div className="border-t border-border lg:border-s lg:border-t-0">
                      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary/60">
                          {interpolateStorefrontMessage(copy.stylePieces, {
                            style: pickStorefrontText(locale, style.name.ar, style.name.en),
                          })}
                        </span>
                        <span dir="ltr" className="text-[9px] text-text-soft">{String(products.length).padStart(2, "0")}</span>
                      </div>
                      <div className="grid grid-cols-2 xl:grid-cols-4">
                        {products.slice(0, 4).map((product) => {
                          const productImage = getCatalogImage(product, allowLegacyImages);
                          return (
                            <Link
                              key={product.id}
                              href={localizedStorefrontPath(locale, `/product/${product.id}`)}
                              className="group/product min-w-0 border-e border-border last:border-e-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                            >
                              <div className="relative aspect-[4/3] overflow-hidden border-b border-border bg-[#fbfaf7]">
                                {productImage ? (
                                  <Image
                                    src={productImage}
                                    alt={pickStorefrontText(locale, product.nameAr, product.nameEn)}
                                    fill
                                    sizes="(max-width: 640px) 47vw, (max-width: 1280px) 24vw, 16vw"
                                    className="object-contain p-4 transition-transform duration-700 group-hover/product:scale-[1.025] motion-reduce:transition-none"
                                  />
                                ) : (
                                  <span className="absolute inset-0 grid place-items-center text-primary/25">
                                    <Plus className="h-5 w-5" strokeWidth={1.2} aria-hidden="true" />
                                  </span>
                                )}
                              </div>
                              <div className="p-4">
                                <span dir="ltr" className="text-[8px] font-bold tracking-[0.12em] text-text-soft">{product.sku}</span>
                                <p className="mt-1 line-clamp-2 text-[10px] font-bold leading-4 text-text-strong">
                                  {pickStorefrontText(locale, product.nameAr, product.nameEn)}
                                </p>
                                <p className="mt-3 text-[9px] text-text-muted">
                                  {hasSellingPrice(product.sellingPrice)
                                    ? formatSellingPrice(product.sellingPrice, locale)
                                    : copy.onRequest}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-white/10 bg-surface-ink py-16 text-white sm:py-24" aria-labelledby="published-collections-heading">
          <div className="editorial-shell">
            <div className="mb-10 grid gap-5 border-b border-white/12 pb-7 lg:grid-cols-[1fr_0.48fr] lg:items-end">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">{copy.publishedLabel}</span>
                <h2 id="published-collections-heading" className="mt-4 text-4xl font-light tracking-[-0.035em] sm:text-6xl">{copy.publishedLead}<strong className="font-extrabold">{copy.publishedStrong}</strong></h2>
              </div>
              <p className="text-xs leading-6 text-white/55">{copy.publishedBody}</p>
            </div>

            {collections.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2">
                {collections.map((collection, index) => {
                  const hasImage = collection.image && isSafeCollectionImagePath(collection.image);
                  const typeLabel = copy.typeLabels[collection.type as keyof typeof copy.typeLabels] || copy.fallbackType;
                  const collectionName = pickStorefrontText(locale, collection.nameAr, collection.nameEn);
                  const collectionDescription = pickStorefrontText(
                    locale,
                    collection.descriptionAr || collection.description,
                    collection.descriptionEn || collection.description,
                  );
                  return (
                    <Link key={collection.id} href={localizedStorefrontPath(locale, `/catalog?collection=${collection.slug}`)} className="group grid min-h-72 overflow-hidden rounded-[0.35rem] border border-white/12 bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:grid-cols-[0.8fr_1.2fr]">
                      <div className="relative min-h-52 overflow-hidden border-b border-white/10 bg-white/[0.04] md:border-b-0 md:border-s">
                        {hasImage ? (
                          <Image src={collection.image!} alt={collectionName} fill sizes="(max-width: 768px) 94vw, 36vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.025] motion-reduce:transition-none" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Grid2X2 className="h-10 w-10 text-white/30" strokeWidth={1.1} aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col p-6 sm:p-8">
                        <div className="flex items-center justify-between gap-4 text-[9px] text-white/45">
                          <span dir="ltr">{String(index + 1).padStart(2, "0")} / {collection.slug}</span>
                          <span>{typeLabel}</span>
                        </div>
                        <p className="mt-8 text-[9px] font-bold uppercase tracking-[0.14em] text-white/45">{copy.collectionLabel} / <span dir="ltr">{collection.slug}</span></p>
                        <h3 className="mt-2 text-3xl font-extrabold">{collectionName}</h3>
                        {collectionDescription && <p className="mt-3 line-clamp-2 text-xs leading-6 text-white/55">{collectionDescription}</p>}
                        <span className="mt-auto flex items-center justify-between gap-4 border-t border-white/10 pt-5 text-[10px] font-bold">
                          <span>{interpolateStorefrontMessage(copy.publishedPieces, { count: formatStorefrontNumber(collection._count.items, locale) })}</span>
                          <ForwardArrow className="h-4 w-4" aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-64 items-center gap-8 rounded-[0.35rem] border border-white/12 p-7 sm:grid-cols-[auto_1fr_auto] sm:p-10">
                <span className="grid h-14 w-14 place-items-center rounded-[0.2rem] border border-white/15 text-white/55"><Layers3 className="h-6 w-6" strokeWidth={1.3} aria-hidden="true" /></span>
                <div>
                  <h3 className="text-2xl font-extrabold">{copy.emptyTitle}</h3>
                  <p className="mt-2 max-w-xl text-xs leading-6 text-white/55">{copy.emptyBody}</p>
                </div>
                <Link href={localizedStorefrontPath(locale, "/catalog")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[0.2rem] bg-white px-5 text-xs font-bold text-surface-ink">
                  {copy.fullCatalog} <ForwardArrow className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
