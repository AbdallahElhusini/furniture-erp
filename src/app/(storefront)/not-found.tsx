import { StorefrontNotFoundView } from "@/components/storefront/StorefrontNotFoundView";
import { getStorefrontLocale } from "@/lib/i18n/storefront-server";
import { getStorefrontPageContent } from "@/lib/site-content-server";

export default async function StorefrontNotFound() {
  const [locale, content] = await Promise.all([getStorefrontLocale(), getStorefrontPageContent()]);
  return <StorefrontNotFoundView locale={locale} content={content[locale].notFound} />;
}
