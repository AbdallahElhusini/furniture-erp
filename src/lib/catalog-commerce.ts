import type { Prisma } from "@prisma/client";
import type { StorefrontLocale } from "@/lib/i18n/storefront";

export type BilingualLabel = Readonly<{
  ar: string;
  en: string;
}>;

export const PRICE_BANDS = [
  {
    slug: "under-3000",
    label: { ar: "حتى ٣٬٠٠٠ ج.م", en: "Up to EGP 3,000" },
    minExclusive: 0,
    maxInclusive: 3_000,
  },
  {
    slug: "3000-7000",
    label: { ar: "٣٬٠٠٠ — ٧٬٠٠٠ ج.م", en: "EGP 3,000 — 7,000" },
    minExclusive: 3_000,
    maxInclusive: 7_000,
  },
  {
    slug: "7000-15000",
    label: { ar: "٧٬٠٠٠ — ١٥٬٠٠٠ ج.م", en: "EGP 7,000 — 15,000" },
    minExclusive: 7_000,
    maxInclusive: 15_000,
  },
  {
    slug: "over-15000",
    label: { ar: "أكثر من ١٥٬٠٠٠ ج.م", en: "Above EGP 15,000" },
    minExclusive: 15_000,
  },
  {
    slug: "request-only",
    label: { ar: "السعر حسب الطلب", en: "Price on request" },
    requestOnly: true,
  },
] as const;

export type PriceBandSlug = (typeof PRICE_BANDS)[number]["slug"];
export type PriceBand = (typeof PRICE_BANDS)[number];

export function getPriceBand(value?: string | null): PriceBand | undefined {
  if (!value) return undefined;
  return PRICE_BANDS.find((band) => band.slug === value);
}

export function priceBandWhere(
  band?: PriceBand,
): Prisma.CatalogItemWhereInput | undefined {
  if (!band) return undefined;
  if (band.slug === "request-only") {
    return { sellingPrice: { lte: 0 } };
  }

  return {
    sellingPrice: {
      gt: band.minExclusive,
      ...("maxInclusive" in band ? { lte: band.maxInclusive } : {}),
    },
  };
}

export function hasSellingPrice(value?: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function formatSellingPrice(
  value: number,
  locale: StorefrontLocale | "ar-EG" | "en-EG" = "ar",
): string {
  const numberLocale = locale === "ar" ? "ar-EG" : locale === "en" ? "en-EG" : locale;
  return new Intl.NumberFormat(numberLocale, {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}
