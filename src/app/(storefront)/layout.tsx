import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer } from "@/components/storefront/Footer";
import { Navbar } from "@/components/storefront/Navbar";
import { ProjectTray } from "@/components/storefront/ProjectTray";
import { QuoteCartProvider } from "@/components/storefront/QuoteCartProvider";
import { StorefrontI18nProvider } from "@/components/storefront/i18n/StorefrontI18nProvider";
import { StorefrontSkipLink } from "@/components/storefront/i18n/StorefrontSkipLink";
import { StorefrontAnalytics } from "@/components/storefront/StorefrontAnalytics";
import { getStorefrontLocale } from "@/lib/i18n/storefront-server";
import { getStorefrontDictionariesWithContent } from "@/lib/site-content-server";
import { buildStorefrontMetadata } from "@/lib/seo";

const storefrontMetadataCopy = {
  ar: {
    title: "HATAB | أثاث مكتبي وحلول مساحات العمل",
    description: "أثاث مكتبي منسق للمكاتب الإدارية ومحطات العمل وقاعات الاجتماعات، مع لوحة مشروع لطلب عرض مخصص.",
  },
  en: {
    title: "HATAB | Office Furniture & Workspace Solutions",
    description: "Coordinated office furniture for executive offices, workstations and meeting spaces, with a project board for tailored quote requests.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale();
  const copy = storefrontMetadataCopy[locale];
  return buildStorefrontMetadata({
    locale,
    path: "/",
    title: copy.title,
    description: copy.description,
  });
}

export default async function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [locale, dictionaries] = await Promise.all([
    getStorefrontLocale(),
    getStorefrontDictionariesWithContent(),
  ]);

  return (
    <QuoteCartProvider>
      <StorefrontI18nProvider
        initialLocale={locale}
        initialDictionaries={dictionaries}
        className="isolate flex min-h-screen flex-col bg-[var(--bg-primary)] font-sans text-[var(--text-primary)]"
      >
        <StorefrontAnalytics />
        <StorefrontSkipLink />
        <Navbar />
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <Footer />
        <ProjectTray />
      </StorefrontI18nProvider>
    </QuoteCartProvider>
  );
}
