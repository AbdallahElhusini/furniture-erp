import type { StorefrontLocale } from "@/lib/i18n/storefront";

const INTERNAL_URL_BASE = "https://hatab.local";

export const STOREFRONT_LOCALE_HEADER = "x-hatab-storefront-locale";

function normalizeInternalPath(path: string): URL {
  const normalized = path.trim() || "/";
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return new URL(withLeadingSlash, INTERNAL_URL_BASE);
}

export function stripStorefrontLocalePrefix(pathname: string): string {
  if (pathname === "/en") return "/";
  return pathname.startsWith("/en/") ? pathname.slice(3) || "/" : pathname;
}

export function localizedStorefrontPath(
  locale: StorefrontLocale,
  path: string,
): string {
  const parsed = normalizeInternalPath(path);
  const unprefixedPath = stripStorefrontLocalePrefix(parsed.pathname);
  parsed.pathname = locale === "en"
    ? unprefixedPath === "/" ? "/en" : `/en${unprefixedPath}`
    : unprefixedPath;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function storefrontLanguageAlternates(path: string) {
  return {
    ar: localizedStorefrontPath("ar", path),
    en: localizedStorefrontPath("en", path),
    "x-default": localizedStorefrontPath("ar", path),
  } as const;
}
