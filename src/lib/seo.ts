import type { Metadata } from "next";
import type { StorefrontLocale } from "@/lib/i18n/storefront";
import {
  localizedStorefrontPath,
  storefrontLanguageAlternates,
} from "@/lib/i18n/storefront-paths";
import { absoluteSiteUrl, isSearchIndexingEnabled } from "@/lib/site";

export const SEO_CORE_TERMS = {
  ar: [
    "أثاث مكتبي",
    "تجهيز مكاتب",
    "مكاتب إدارية",
    "كراسي مكتبية",
    "محطات عمل",
    "طاولات اجتماعات",
    "تخزين مكتبي",
    "حلول مساحات العمل",
  ],
  en: [
    "office furniture",
    "office fit out furniture",
    "executive desks",
    "office chairs",
    "workstations",
    "meeting tables",
    "office storage",
    "workspace furniture solutions",
  ],
} as const satisfies Readonly<Record<StorefrontLocale, readonly string[]>>;

export function normalizeSeoDescription(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > maxLength * 0.65 ? lastSpace : undefined).trim()}…`;
}

export function uniqueSeoKeywords(
  locale: StorefrontLocale,
  values: readonly (string | null | undefined)[] = [],
): string[] {
  return Array.from(
    new Set(
      [...values, ...SEO_CORE_TERMS[locale]]
        .map((value) => value?.replace(/\s+/g, " ").trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 18);
}

interface StorefrontMetadataInput {
  locale: StorefrontLocale;
  path: string;
  title: string;
  description: string;
  keywords?: readonly (string | null | undefined)[];
  index?: boolean;
  follow?: boolean;
  image?: string;
  type?: "website" | "article";
}

export function buildStorefrontMetadata({
  locale,
  path,
  title,
  description,
  keywords = [],
  index = true,
  follow = true,
  image,
  type = "website",
}: StorefrontMetadataInput): Metadata {
  const canonical = localizedStorefrontPath(locale, path);
  const normalizedDescription = normalizeSeoDescription(description);
  const images = image ? [{ url: image }] : undefined;
  const indexingEnabled = isSearchIndexingEnabled();
  const effectiveIndex = index && indexingEnabled;
  const effectiveFollow = follow && indexingEnabled;

  return {
    title,
    description: normalizedDescription,
    keywords: uniqueSeoKeywords(locale, keywords),
    alternates: {
      canonical,
      languages: storefrontLanguageAlternates(path),
    },
    robots: {
      index: effectiveIndex,
      follow: effectiveFollow,
      googleBot: {
        index: effectiveIndex,
        follow: effectiveFollow,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type,
      locale: locale === "ar" ? "ar_EG" : "en_US",
      alternateLocale: [locale === "ar" ? "en_US" : "ar_EG"],
      siteName: "HATAB Office Furniture",
      url: canonical,
      title,
      description: normalizedDescription,
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: normalizedDescription,
      images: image ? [image] : undefined,
    },
  };
}

export interface SeoBreadcrumbItem {
  name: string;
  path?: string;
}

export function buildBreadcrumbJsonLd(
  locale: StorefrontLocale,
  items: readonly SeoBreadcrumbItem[],
) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path
        ? { item: absoluteSiteUrl(localizedStorefrontPath(locale, item.path)) }
        : {}),
    })),
  };
}

export interface SeoListItem {
  name: string;
  path: string;
  image?: string;
}

export function buildItemListJsonLd(
  locale: StorefrontLocale,
  items: readonly SeoListItem[],
) {
  return {
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteSiteUrl(localizedStorefrontPath(locale, item.path)),
      name: item.name,
      ...(item.image ? { image: absoluteSiteUrl(item.image) } : {}),
    })),
  };
}
