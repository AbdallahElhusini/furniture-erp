import "server-only";

import { cookies, headers } from "next/headers";
import {
  getStorefrontDictionary,
  resolveStorefrontLocale,
  STOREFRONT_LOCALE_COOKIE,
  type StorefrontDictionary,
  type StorefrontLocale,
} from "./storefront";
import { STOREFRONT_LOCALE_HEADER } from "./storefront-paths";

export async function getStorefrontLocale(): Promise<StorefrontLocale> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const routedLocale = requestHeaders.get(STOREFRONT_LOCALE_HEADER);
  if (routedLocale === "ar" || routedLocale === "en") return routedLocale;
  return resolveStorefrontLocale(
    cookieStore.get(STOREFRONT_LOCALE_COOKIE)?.value,
  );
}

export async function getCurrentStorefrontDictionary(): Promise<{
  locale: StorefrontLocale;
  dictionary: StorefrontDictionary;
}> {
  const locale = await getStorefrontLocale();
  return { locale, dictionary: getStorefrontDictionary(locale) };
}
