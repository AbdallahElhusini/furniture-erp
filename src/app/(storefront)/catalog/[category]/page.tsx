import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { interpolateStorefrontMessage, pickStorefrontText } from "@/lib/i18n/storefront";
import { getStorefrontLocale } from "@/lib/i18n/storefront-server";
import { getStorefrontPageContent } from "@/lib/site-content-server";

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

async function resolveCategory(slug: string) {
  const direct = await prisma.category.findUnique({ where: { slug } });
  if (direct?.isActive && direct.parentId) return direct;

  const legacy = await prisma.categoryRedirect.findUnique({
    where: { fromSlug: slug },
    include: { category: true },
  });
  return legacy?.category.isActive && legacy.category.parentId ? legacy.category : null;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: slug } = await params;
  const [locale, content] = await Promise.all([getStorefrontLocale(), getStorefrontPageContent()]);
  const copy = content[locale].catalog;
  const category = await resolveCategory(slug);
  if (!category) {
    return {
      title: copy.categoryNotFoundTitle,
    };
  }

  const name = pickStorefrontText(locale, category.nameAr, category.nameEn);

  return {
    title: interpolateStorefrontMessage(copy.categoryMetaTitle, { category: name }),
    description: interpolateStorefrontMessage(copy.categoryMetaDescription, {
      category: locale === "ar" ? `${category.nameAr} — ${category.nameEn}` : category.nameEn,
    }),
  };
}

export default async function LegacyCategoryPage({ params }: CategoryPageProps) {
  const { category: slug } = await params;
  const category = await resolveCategory(slug);
  if (!category) notFound();
  redirect(`/catalog?category=${encodeURIComponent(category.slug)}`);
}
