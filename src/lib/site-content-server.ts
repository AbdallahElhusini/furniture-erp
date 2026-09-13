import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import {
  SITE_CONTENT_DEFINITIONS,
  resolveHomePageContent,
  resolveSiteMediaSlots,
  resolveStorefrontDictionaries,
  resolveStorefrontPageContent,
  type SiteContentRecord,
} from "@/lib/site-content-registry";

export const SITE_CONTENT_CACHE_TAG = "site-content";

const registeredKeys = SITE_CONTENT_DEFINITIONS.map(
  (definition) => definition.key,
);

const getCachedSiteContentRecords = unstable_cache(
  async (): Promise<SiteContentRecord[]> =>
    prisma.siteContent.findMany({
      where: { key: { in: registeredKeys } },
      select: {
        key: true,
        group: true,
        type: true,
        label: true,
        valueAr: true,
        valueEn: true,
        mediaUrl: true,
        altAr: true,
        altEn: true,
        linkUrl: true,
        metadata: true,
        isActive: true,
        sortOrder: true,
      },
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { key: "asc" }],
    }),
  ["registered-site-content-v2"],
  { tags: [SITE_CONTENT_CACHE_TAG], revalidate: 300 },
);

export async function getSiteContentRecords(): Promise<SiteContentRecord[]> {
  try {
    return await getCachedSiteContentRecords();
  } catch (error) {
    // Content overrides must never make the public storefront unavailable.
    console.error("Unable to load site content overrides; using defaults.", error);
    return [];
  }
}

export async function getStorefrontDictionariesWithContent() {
  const records = await getSiteContentRecords();
  return resolveStorefrontDictionaries(records);
}

export async function getHomePageContentWithMedia() {
  const records = await getSiteContentRecords();
  return {
    contentByLocale: resolveHomePageContent(records),
    media: resolveSiteMediaSlots(records),
  };
}

export async function getStorefrontPageContent() {
  const records = await getSiteContentRecords();
  return resolveStorefrontPageContent(records);
}

export async function getStorefrontPageContentWithMedia() {
  const records = await getSiteContentRecords();
  return {
    contentByLocale: resolveStorefrontPageContent(records),
    media: resolveSiteMediaSlots(records),
  };
}
