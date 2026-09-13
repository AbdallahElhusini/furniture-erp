import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Layers3,
  Search,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { EditorialHomeHero } from "@/components/storefront/home/EditorialHomeHero";
import { EditorialMotionMedia } from "@/components/storefront/home/EditorialMotionMedia";
import { ScrollProcessHero } from "@/components/storefront/home/ScrollProcessHero";
import { ProductCard } from "@/components/storefront/ProductCard";
import {
  approvedCatalogAssetWhere,
  approvedSafeCatalogAssetUrls,
  catalogPublicationWhere,
  isProductionCatalog,
} from "@/lib/catalog-publication";
import { prisma } from "@/lib/db";
import {
  formatStorefrontNumber,
  pickStorefrontText,
} from "@/lib/i18n/storefront";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import { getStorefrontLocale } from "@/lib/i18n/storefront-server";
import { buildStorefrontMetadata } from "@/lib/seo";
import { absoluteSiteUrl, serializeJsonLd } from "@/lib/site";
import { getHomePageContentWithMedia } from "@/lib/site-content-server";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, { contentByLocale }] = await Promise.all([
    getStorefrontLocale(),
    getHomePageContentWithMedia(),
  ]);
  const title = contentByLocale[locale].metadataTitle;
  const description = contentByLocale[locale].metadataDescription;

  return {
    ...buildStorefrontMetadata({
      locale,
      path: "/",
      title,
      description,
    }),
    // Home titles already include the HATAB name in managed content.
    title: { absolute: title },
  };
}

const categoryFeatures = [
  { slug: "executive-desks", sku: "EXE-0001", previewImage: "/uploads/catalog/EXE-0001.png", tone: "bg-[#ede8df]" },
  { slug: "bench-workstations", sku: "WOR-0001", previewImage: "/uploads/catalog/WOR-0001.png", tone: "bg-[#e9ede7]" },
  { slug: "task-ergonomic-seating", sku: "CHA-MES-0001", previewImage: "/uploads/catalog/CHA-MES-0001.png", tone: "bg-[#eeeae5]" },
  { slug: "meeting-conference-tables", sku: "MEE-0001", previewImage: "/uploads/catalog/MEE-0001.png", tone: "bg-[#e8e5df]" },
  { slug: "lounge-sofas", sku: "SOF-0001", previewImage: "/uploads/catalog/SOF-0001.jpg", tone: "bg-[#eee9e1]" },
  { slug: "cabinets-storage", sku: "CAB-0001", previewImage: "/uploads/catalog/CAB-0001.png", tone: "bg-[#e8ece8]" },
] as const;

const spaceStories = [
  {
    mediaKey: "home.space.executive.image",
    href: "/catalog?tags=executive-office",
    sku: "EXE-0001",
    previewImage: "/uploads/catalog/EXE-0001.png",
    className: "lg:col-span-7",
  },
  {
    mediaKey: "home.space.open.image",
    href: "/catalog?tags=open-office",
    sku: "WOR-0001",
    previewImage: "/uploads/catalog/WOR-0001.png",
    className: "lg:col-span-5",
  },
  {
    mediaKey: "home.space.meeting.image",
    href: "/catalog?tags=meeting-space",
    sku: "MEE-0001",
    previewImage: "/uploads/catalog/MEE-0001.png",
    className: "lg:col-span-5",
  },
  {
    mediaKey: "home.space.reception.image",
    href: "/catalog?tags=reception",
    sku: "COU-0001",
    previewImage: "/uploads/catalog/COU-0001.png",
    className: "lg:col-span-7",
  },
] as const;

const editorialSkus = [
  "EXE-0001",
  "WOR-0001",
  "CHA-MES-0001",
  "MEE-0001",
  "SOF-0001",
  "CAB-0001",
] as const;

function objectPositionFromMetadata(
  metadata: string | undefined,
  fallback = "50% 50%",
) {
  if (!metadata) return fallback;
  try {
    const value = (JSON.parse(metadata) as { objectPosition?: unknown })
      .objectPosition;
    return typeof value === "string" && value.length <= 64 ? value : fallback;
  } catch {
    return fallback;
  }
}

export default async function HomePage() {
  const [locale, { contentByLocale, media }] = await Promise.all([
    getStorefrontLocale(),
    getHomePageContentWithMedia(),
  ]);
  const copy = contentByLocale[locale];
  const ForwardArrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const publicationWhere = catalogPublicationWhere();
  const productionCatalog = isProductionCatalog();
  const homeSkus = Array.from(new Set([
    ...editorialSkus,
    ...categoryFeatures.map((category) => category.sku),
    ...spaceStories.map((story) => story.sku),
  ]));
  const [categoryRows, productRows, productCount, leafCategoryCount, tagCount] = await Promise.all([
    prisma.category.findMany({
      where: {
        isActive: true,
        slug: { in: categoryFeatures.map((category) => category.slug) },
        items: { some: publicationWhere },
      },
      include: {
        _count: { select: { items: { where: publicationWhere } } },
      },
    }),
    prisma.catalogItem.findMany({
      where: { ...publicationWhere, sku: { in: homeSkus } },
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
    }),
    prisma.catalogItem.count({ where: publicationWhere }),
    prisma.category.count({
      where: { isActive: true, parentId: { not: null }, items: { some: publicationWhere } },
    }),
    prisma.tag.count({ where: { items: { some: publicationWhere } } }),
  ]);

  const categoriesBySlug = new Map(categoryRows.map((category) => [category.slug, category]));
  const featuredProducts = editorialSkus
    .map((sku) => productRows.find((product) => product.sku === sku))
    .filter((product): product is (typeof productRows)[number] => Boolean(product));
  const productBySku = new Map(featuredProducts.map((product) => [product.sku, product]));
  for (const product of productRows) productBySku.set(product.sku, product);
  const approvedUrlsFor = (product: (typeof productRows)[number] | undefined) =>
    product ? approvedSafeCatalogAssetUrls(product.assets) : [];
  const imageFor = (
    product: (typeof productRows)[number] | undefined,
    previewImage: string,
  ) => approvedUrlsFor(product)[0] || (!productionCatalog ? previewImage : undefined);
  const mediaImageFor = (
    key: string,
    product: (typeof productRows)[number] | undefined,
    previewImage: string,
  ) => media[key]?.url || imageFor(product, previewImage);
  const mediaAltFor = (key: string, fallback: string) =>
    (locale === "ar" ? media[key]?.altAr : media[key]?.altEn) || fallback;
  const mediaObjectPosition = (key: string, fallback = "50% 50%") =>
    objectPositionFromMetadata(media[key]?.metadata, fallback);
  const executiveProduct = productBySku.get("EXE-0001");
  const executiveImage = imageFor(executiveProduct, "/uploads/catalog/EXE-0001.png");
  const chairProduct = productBySku.get("CHA-MES-0001");
  const chairImage = imageFor(chairProduct, "/uploads/catalog/CHA-MES-0001.png");
  const executiveHref = executiveProduct
    ? `/product/${executiveProduct.id}`
    : "/catalog?category=executive-desks";
  const chairHref = chairProduct
    ? `/product/${chairProduct.id}`
    : "/catalog?category=task-ergonomic-seating";
  const coordinationPieces = [
    {
      number: "01",
      label: copy.coordinationLabels[0],
      image: media["home.coordination.work-surface.image"]?.url || executiveImage,
      mediaKey: "home.coordination.work-surface.image",
      href: executiveHref,
      className: "col-span-12 min-h-64 sm:col-span-7 sm:row-span-2 sm:min-h-[34rem]",
    },
    {
      number: "02",
      label: copy.coordinationLabels[1],
      image: media["home.coordination.seating.image"]?.url || chairImage,
      mediaKey: "home.coordination.seating.image",
      href: chairHref,
      className: "col-span-7 min-h-52 sm:col-span-5 sm:min-h-[16.5rem]",
    },
    {
      number: "03",
      label: copy.coordinationLabels[2],
      image: mediaImageFor(
        "home.coordination.storage.image",
        productBySku.get("CAB-0001"),
        "/uploads/catalog/CAB-0001.png",
      ),
      mediaKey: "home.coordination.storage.image",
      href: productBySku.get("CAB-0001")
        ? `/product/${productBySku.get("CAB-0001")?.id}`
        : "/catalog?category=cabinets-storage",
      className: "col-span-5 min-h-52 sm:col-span-5 sm:min-h-[16.5rem]",
    },
  ];
  const hasPublishedProof = productCount > 0 || leafCategoryCount > 0 || tagCount > 0;
  const proofItems = hasPublishedProof
    ? [
        { value: formatStorefrontNumber(productCount, locale), label: copy.proofPublished[0] },
        { value: formatStorefrontNumber(leafCategoryCount, locale), label: copy.proofPublished[1] },
        { value: formatStorefrontNumber(tagCount, locale), label: copy.proofPublished[2] },
      ]
    : copy.proofFallback.map(([value, label]) => ({ value, label }));
  const processVideoSrc =
    media["home.process.video"]?.url ||
    "/media/hatab-process-scroll-alpha.webm";
  const heroStageDefinitions = [
    {
      key: "home.hero.image",
      fallback: "/images/editorial/home-hero.webp",
      altAr: "مساحة مكتب متكاملة بأثاث حطب المكتبي",
      altEn: "A complete workspace furnished by HATAB Office Furniture",
    },
    {
      key: "home.hero.stage.design.image",
      fallback: "/images/editorial/project-consultation.webp",
      altAr: "فريق حطب يراجع مخططاً لتصميم مساحة عمل",
      altEn: "The HATAB team reviewing a workspace design plan",
    },
    {
      key: "home.hero.stage.craft.image",
      fallback: "/images/editorial/mesh-detail.webp",
      altAr: "تفاصيل خامة وتشطيب مقعد مكتبي من حطب",
      altEn: "Material and finish detail of a HATAB office chair",
    },
    {
      key: "home.hero.stage.smart.image",
      fallback: "/images/editorial/smart-workspace.webp",
      altAr: "مساحة عمل ذكية ومتكاملة جاهزة للاستخدام",
      altEn: "A complete smart workspace ready for use",
    },
  ] as const;
  const heroMedia = heroStageDefinitions.map((stage) => ({
    src: media[stage.key]?.url || stage.fallback,
    alt: mediaAltFor(stage.key, locale === "ar" ? stage.altAr : stage.altEn),
    objectPosition: mediaObjectPosition(stage.key),
  }));
  const localizedHomePath = localizedStorefrontPath(locale, "/");
  const organizationHomePath = localizedStorefrontPath("ar", "/");
  const localizedCatalogPath = localizedStorefrontPath(locale, "/catalog");
  const homeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${absoluteSiteUrl(organizationHomePath)}#organization`,
        name: copy.organizationName,
        url: absoluteSiteUrl(organizationHomePath),
        logo: absoluteSiteUrl(media["global.logo"]?.url || "/images/brand/hatab-wordmark.png"),
      },
      {
        "@type": "WebSite",
        "@id": `${absoluteSiteUrl(localizedHomePath)}#website`,
        name: copy.organizationName,
        url: absoluteSiteUrl(localizedHomePath),
        inLanguage: locale,
        potentialAction: {
          "@type": "SearchAction",
          target: `${absoluteSiteUrl(localizedCatalogPath)}?search={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <div className="overflow-x-clip bg-bg-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(homeJsonLd) }}
      />
      <EditorialHomeHero
        locale={locale}
        content={copy.hero}
        media={heroMedia}
      />

      <section className="editorial-band border-y border-white/10">
        <div className="editorial-shell grid grid-cols-1 divide-y divide-white/12 sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-y-0">
          {proofItems.map((stat, index) => (
            <div key={stat.label} className="relative px-6 py-8 sm:px-8 sm:py-10">
              <span className="text-[10px] font-bold text-white/35" dir="ltr">{String(index + 1).padStart(2, "0")}</span>
              <p className="mt-5 text-3xl font-semibold text-[var(--text-inverse)] sm:text-4xl">{stat.value}</p>
              <p className="mt-2 max-w-xs text-xs leading-5 text-[var(--text-inverse-muted)]">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-shell">
          <div className="mb-11 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <span className="editorial-kicker">{copy.spacesKicker}</span>
              <h2 className="editorial-heading mt-5 max-w-4xl text-text-primary">
                {copy.spacesTitle}
              </h2>
            </div>
            <Link href={localizedStorefrontPath(locale, "/catalog")} className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-dark">
              {copy.spacesLink}
              <ForwardArrow className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            {spaceStories.map((space, index) => {
              const image = mediaImageFor(
                space.mediaKey,
                productBySku.get(space.sku),
                space.previewImage,
              );
              const story = copy.spaceStories[index];
              const title = story.title;
              const eyebrow = story.eyebrow;
              const storyCopy = story.copy;
              return (
                <Link
                  key={space.sku}
                  href={localizedStorefrontPath(locale, space.href)}
                  className={`group relative min-h-[390px] overflow-hidden rounded-[var(--shape-sm)] border border-[var(--border-ink)] bg-[var(--surface-editorial)] ${space.className}`}
                >
                  <span className="absolute right-5 top-5 z-20 border border-white/35 bg-[var(--surface-paper)]/84 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-[var(--forest-950)] backdrop-blur-md" dir="ltr">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {image ? (
                    <Image
                      src={image}
                      alt={mediaAltFor(space.mediaKey, title)}
                      fill
                      sizes={index % 3 === 0 ? "(max-width: 1024px) 100vw, 58vw" : "(max-width: 1024px) 100vw, 42vw"}
                      className="object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.025]"
                      style={{ objectPosition: mediaObjectPosition(space.mediaKey) }}
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-primary/15">
                      <Layers3 className="h-20 w-20" strokeWidth={0.9} aria-hidden="true" />
                    </span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-ink)]/90 via-[var(--surface-ink)]/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 text-white sm:p-8">
                    <div>
                      <p className="mb-2 text-[10px] font-bold text-[var(--brass-300)]">{eyebrow}</p>
                      <h3 className="text-2xl font-semibold sm:text-3xl">{title}</h3>
                      <p className="mt-2 max-w-md text-sm font-light leading-6 text-white/66">{storyCopy}</p>
                    </div>
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-[var(--shape-xs)] border border-white/20 bg-white/8 transition-transform duration-500 group-hover:-translate-x-1 sm:inline-flex">
                      <ForwardArrow className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="chair-motion"
        className="border-y border-[var(--border-ink)] bg-[var(--surface-paper)]"
        aria-label={copy.motionKicker}
      >
        <div className="editorial-shell py-5 sm:py-8">
          <div className="grid overflow-hidden border border-[var(--border-ink)] bg-[#f6f6f4] lg:grid-cols-[1.28fr_0.72fr]">
            <div className="relative min-h-[20rem] border-b border-[var(--border-ink)] lg:min-h-[34rem] lg:border-b-0 lg:border-e">
              <EditorialMotionMedia
                videoSrc={media["home.motion.video"]?.url}
                posterSrc={
                  media["home.motion.poster"]?.url ||
                  "/images/editorial/sit-stand-motion.webp"
                }
                alt={mediaAltFor(
                  "home.motion.poster",
                  copy.motionTitle,
                )}
              />
              <span className="absolute bottom-4 start-4 z-10 border border-[var(--forest-950)]/14 bg-white/82 px-3 py-2 text-[10px] font-bold tracking-[0.12em] text-[var(--forest-950)] backdrop-blur-md sm:bottom-6 sm:start-6">
                HATAB / HUMAN MOTION
              </span>
            </div>

            <div className="flex flex-col justify-between px-6 py-8 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
              <div>
                <span className="editorial-kicker">{copy.motionKicker}</span>
                <h2 className="mt-5 text-[clamp(2.2rem,4vw,4.8rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-[var(--forest-950)]">
                  {copy.motionTitle}
                </h2>
                <p className="mt-6 max-w-lg text-sm leading-7 text-text-secondary sm:text-base">
                  {copy.motionBody}
                </p>
                <Link
                  href={localizedStorefrontPath(locale, "/catalog?category=task-ergonomic-seating")}
                  className="architectural-action mt-8 border border-[var(--forest-950)]/20 bg-white text-sm font-bold text-[var(--forest-950)] hover:bg-[var(--surface-ink)] hover:text-white"
                >
                  {copy.motionLink}
                  <ForwardArrow className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

              <p
                className="mt-14 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--forest-950)]/12 pt-5 text-[10px] font-bold tracking-[0.12em] text-[var(--forest-950)]/55"
                aria-label={copy.marqueeLabel}
              >
                {copy.marquee.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="editorial-section border-y border-[var(--border-ink)] bg-[var(--surface-editorial)]">
        <div className="editorial-shell">
          <div className="mb-10 text-center">
            <span className="editorial-kicker">{copy.catalogKicker}</span>
            <h2 className="editorial-heading mx-auto mt-5 max-w-5xl">{copy.catalogTitle}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-text-secondary sm:text-base">
              {copy.catalogBody}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {categoryFeatures.map((feature) => {
              const category = categoriesBySlug.get(feature.slug);
              if (!category) return null;
              const mediaKey = `home.category.${feature.slug}.image`;
              const image = mediaImageFor(
                mediaKey,
                productBySku.get(feature.sku),
                feature.previewImage,
              );
              const categoryName = pickStorefrontText(locale, category.nameAr, category.nameEn);

              return (
                <Link
                  key={feature.slug}
                  href={localizedStorefrontPath(locale, `/catalog?category=${feature.slug}`)}
                  className="editorial-card group p-2"
                >
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--shape-xs)] bg-[var(--surface-paper)]">
                    {image ? (
                      <Image
                        src={image}
                        alt={mediaAltFor(mediaKey, categoryName)}
                        fill
                        sizes="(max-width: 768px) 45vw, 16vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.025]"
                        style={{ objectPosition: mediaObjectPosition(mediaKey) }}
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-primary/20">
                        <Layers3 className="h-9 w-9" strokeWidth={1.1} aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <div className="px-2.5 pb-3 pt-3">
                    <h3 className="text-sm font-semibold leading-5 text-text-primary group-hover:text-primary">{categoryName}</h3>
                    <p className="mt-1 text-[11px] text-text-secondary">{formatStorefrontNumber(category._count.items, locale)} {copy.piece}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="architectural-banner py-[clamp(4.5rem,8vw,8rem)]">
        <div className="editorial-shell grid items-center gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div className="relative z-10">
            <div className="architectural-divider max-w-xs" dir="ltr">COORDINATION / 01—03</div>
            <span className="editorial-kicker mt-8">{copy.coordinationKicker}</span>
            <h2 className="editorial-heading mt-5 max-w-3xl">
              {copy.coordinationTitle}
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-text-secondary sm:text-base">
              {copy.coordinationBody}
            </p>
            <Link
              href={localizedStorefrontPath(locale, "/collections")}
              className="architectural-action mt-8 border border-[var(--forest-950)]/24 bg-[var(--surface-paper)] text-sm font-bold text-[var(--forest-950)] transition-colors hover:bg-[var(--surface-ink)] hover:text-white"
            >
              {copy.coordinationLink}
              <ForwardArrow className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -inset-5 border border-[var(--forest-950)]/10" aria-hidden="true" />
            <div className="pointer-events-none absolute -left-5 -top-5 size-2 bg-[var(--oxblood-700)]" aria-hidden="true" />
            <div className="grid grid-cols-12 items-end gap-2.5 sm:gap-3">
              {coordinationPieces.map((piece, index) => (
                <Link
                  key={piece.number}
                  href={localizedStorefrontPath(locale, piece.href)}
                  className={`group relative overflow-hidden border border-[var(--forest-950)]/16 bg-[var(--surface-paper)] shadow-[0_24px_70px_-52px_rgba(20,36,28,0.72)] ${piece.className}`}
                >
                  <span className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-[var(--forest-950)]/10 bg-[var(--surface-paper)]/86 px-3 py-2 text-[10px] font-bold text-[var(--forest-950)] backdrop-blur-md sm:px-4">
                    <span>{piece.label}</span>
                    <span dir="ltr">{piece.number}</span>
                  </span>
                  {piece.image ? (
                    <Image
                      src={piece.image}
                      alt={mediaAltFor(piece.mediaKey, piece.label)}
                      fill
                      sizes={index === 0 ? "(max-width: 640px) 92vw, 38vw" : "(max-width: 640px) 48vw, 24vw"}
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]"
                      style={{ objectPosition: mediaObjectPosition(piece.mediaKey) }}
                    />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-[var(--forest-950)]/18">
                      <Layers3 className="h-12 w-12" strokeWidth={0.8} aria-hidden="true" />
                    </span>
                  )}
                  <span className="absolute bottom-3 left-3 grid size-8 place-items-center rounded-[var(--shape-xs)] border border-[var(--forest-950)]/15 bg-white/72 text-[var(--forest-950)] opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
                    <ForwardArrow className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="editorial-section bg-[var(--surface-paper)]">
        <div className="editorial-shell">
          <div className="mb-11 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <span className="editorial-kicker">{copy.picksKicker}</span>
              <h2 className="editorial-heading mt-5 max-w-4xl">{copy.picksTitle}</h2>
            </div>
            <Link href={localizedStorefrontPath(locale, "/catalog")} className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-dark">
              {copy.picksLink}
              <ForwardArrow className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                item={product}
                featuredBadge={false}
                approvedAssetUrls={approvedUrlsFor(product)}
                allowLegacyImages={!productionCatalog}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="editorial-band editorial-section border-y border-white/10">
        <div className="editorial-shell overflow-hidden rounded-[var(--shape-panel)] border border-white/12 bg-white/[0.035]">
          <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
            <div className="liquid-surface p-8 sm:p-12 lg:p-16">
              <span className="text-[11px] font-bold text-[var(--brass-300)]">{copy.journeyKicker}</span>
              <h2 className="editorial-heading mt-5 max-w-2xl">
                {copy.journeyTitle}
              </h2>
              <p className="mt-5 max-w-lg text-sm font-light leading-7 text-white/62 sm:text-base">
                {copy.journeyBody}
              </p>
              <Link
                href={localizedStorefrontPath(locale, "/quote")}
                className="architectural-action mt-8 bg-[var(--surface-paper)] text-sm font-bold text-[var(--forest-950)] transition-transform hover:-translate-y-0.5"
              >
                {copy.journeyLink}
                <ForwardArrow className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <ol className="grid border-t border-white/10 sm:grid-cols-3 lg:border-r lg:border-t-0">
              {[
                { number: "01", icon: Search, title: copy.journeySteps[0][0], copy: copy.journeySteps[0][1] },
                { number: "02", icon: SlidersHorizontal, title: copy.journeySteps[1][0], copy: copy.journeySteps[1][1] },
                { number: "03", icon: Send, title: copy.journeySteps[2][0], copy: copy.journeySteps[2][1] },
              ].map((step) => (
                <li key={step.number} className="group relative min-h-64 border-b border-white/10 p-7 last:border-b-0 sm:border-b-0 sm:border-l sm:last:border-l-0 lg:min-h-full lg:p-8">
                  <div className="flex items-center justify-between">
                    <span className="text-xs tracking-[0.18em] text-white/35">{step.number}</span>
                    <step.icon className="h-5 w-5 text-[var(--brass-300)]" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <div className="mt-16 lg:mt-28">
                    <h3 className="text-xl font-semibold">{step.title}</h3>
                    <p className="mt-3 text-sm font-light leading-6 text-white/55">{step.copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <ScrollProcessHero
        videoSrc={processVideoSrc}
        fallbackVideoSrc={
          processVideoSrc.endsWith(".webm")
            ? "/media/hatab-process-scroll.mp4"
            : undefined
        }
        posterSrc={media["home.process.poster"]?.url || "/media/hatab-process-poster-alpha.png"}
        content={contentByLocale}
      />

      <section className="border-t border-[var(--border-ink)] bg-[var(--surface-sage-soft)] py-20 sm:py-24">
        <div className="editorial-shell flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-primary">
              <Layers3 className="h-4 w-4" aria-hidden="true" />
              {copy.projectKicker}
            </span>
            <h2 className="editorial-heading mt-4 max-w-4xl text-text-primary">
              {copy.projectTitle}
            </h2>
            <p className="mt-4 text-sm leading-7 text-text-secondary sm:text-base">
              {copy.projectBody}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href={localizedStorefrontPath(locale, "/catalog")} className="architectural-action border border-primary/20 bg-white/55 text-sm font-bold text-primary hover:bg-white">
              {copy.backCatalog}
            </Link>
            <Link href={localizedStorefrontPath(locale, "/quote")} className="architectural-action hover-shine bg-primary text-sm font-bold text-white hover:bg-primary-dark">
              {copy.openProject}
              <ForwardArrow className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
