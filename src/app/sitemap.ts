import type { MetadataRoute } from "next";
import { parseCatalogImages } from "@/lib/catalog-quality";
import {
  approvedCatalogAssetWhere,
  approvedSafeCatalogAssetUrls,
  catalogPublicationWhere,
  isProductionCatalog,
} from "@/lib/catalog-publication";
import { prisma } from "@/lib/db";
import { absoluteSiteUrl, isSearchIndexingEnabled } from "@/lib/site";
import {
  localizedStorefrontPath,
  storefrontLanguageAlternates,
} from "@/lib/i18n/storefront-paths";
import { STYLE_COLLECTIONS } from "@/lib/style-collections";

export const revalidate = 3600;

function localizedEntries(
  path: string,
  details: Omit<MetadataRoute.Sitemap[number], "url" | "alternates"> = {},
): MetadataRoute.Sitemap {
  const alternates = storefrontLanguageAlternates(path);
  const languages = Object.fromEntries(
    Object.entries(alternates).map(([locale, localePath]) => [locale, absoluteSiteUrl(localePath)]),
  );

  return (["ar", "en"] as const).map((locale) => ({
    ...details,
    url: absoluteSiteUrl(localizedStorefrontPath(locale, path)),
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isSearchIndexingEnabled()) return [];

  const publicationWhere = catalogPublicationWhere();
  const productionCatalog = isProductionCatalog();
  const [products, categories, collections] = await Promise.all([
    prisma.catalogItem.findMany({
      where: {
        ...publicationWhere,
        ...(!productionCatalog ? { contentStatus: { in: ["READY", "VERIFIED"] } } : {}),
        completenessScore: { gte: 80 },
      },
      select: {
        id: true,
        images: true,
        updatedAt: true,
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
      orderBy: { id: "asc" },
    }),
    prisma.category.findMany({
      where: { isActive: true, parentId: { not: null }, items: { some: publicationWhere } },
      select: { slug: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.collection.findMany({
      where: { isActive: true, isDraft: false, items: { some: publicationWhere } },
      select: { slug: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    ...localizedEntries("/"),
    ...localizedEntries("/catalog"),
    ...localizedEntries("/collections"),
    ...localizedEntries("/portfolio"),
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.flatMap((category) =>
    localizedEntries(`/catalog?category=${encodeURIComponent(category.slug)}`),
  );

  const collectionEntries: MetadataRoute.Sitemap = collections.flatMap((collection) =>
    localizedEntries(`/catalog?collection=${encodeURIComponent(collection.slug)}`),
  );

  const styleEntries: MetadataRoute.Sitemap = STYLE_COLLECTIONS.flatMap((style) =>
    localizedEntries(`/catalog?style=${encodeURIComponent(style.slug)}`),
  );

  const productEntries: MetadataRoute.Sitemap = products.flatMap((product) =>
    localizedEntries(`/product/${product.id}`, {
      lastModified: product.updatedAt,
      images: Array.from(new Set([
        ...approvedSafeCatalogAssetUrls(product.assets),
        ...(!productionCatalog ? parseCatalogImages(product.images) : []),
      ])).slice(0, 4).map(absoluteSiteUrl),
    }),
  );

  return [
    ...staticEntries,
    ...categoryEntries,
    ...collectionEntries,
    ...styleEntries,
    ...productEntries,
  ];
}
