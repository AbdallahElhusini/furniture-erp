import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getCurrentStorefrontDictionary } from "@/lib/i18n/storefront-server";
import { buildStorefrontMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, dictionary } = await getCurrentStorefrontDictionary();

  return buildStorefrontMetadata({
    locale,
    path: "/quote",
    title: dictionary.quote.metadataTitle,
    description: dictionary.quote.metadataDescription,
    index: false,
    follow: false,
  });
}

export default function QuoteLayout({ children }: { children: ReactNode }) {
  return children;
}
