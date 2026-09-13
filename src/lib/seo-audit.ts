import "server-only";

import {
  approvedCatalogAssetWhere,
  catalogPublicationWhere,
  hasPublishableCatalogAsset,
} from "@/lib/catalog-publication";
import { isCatalogSeoReady, isGenericCatalogName } from "@/lib/catalog-quality";
import { prisma } from "@/lib/db";
import { STYLE_COLLECTIONS } from "@/lib/style-collections";
import { getSiteUrl, hasPublicSiteUrl } from "@/lib/site";

export type SeoOpportunityKind = "CATEGORY" | "STYLE" | "COLLECTION" | "TAG";

export interface SeoOpportunity {
  key: string;
  kind: SeoOpportunityKind;
  labelAr: string;
  labelEn: string;
  path?: string;
  productCount: number;
  coverageScore: number;
  state: "INDEXABLE" | "CONTENT_GAP";
  noteAr: string;
  noteEn: string;
}

export interface SeoAuditIssue {
  key: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  count: number;
  titleAr: string;
  titleEn: string;
  actionAr: string;
  actionEn: string;
}

function nonEmpty(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function coverageScore(input: {
  count: number;
  bilingual: boolean;
  visual: boolean;
  descriptive: boolean;
}): number {
  return Math.min(
    100,
    Math.min(45, input.count * 3)
      + (input.bilingual ? 20 : 0)
      + (input.visual ? 15 : 0)
      + (input.descriptive ? 20 : 0),
  );
}

export async function getSeoAuditSnapshot() {
  const publicationWhere = catalogPublicationWhere();
  const [products, categories, collections, tagGroups, contentRecords, portfolioCount] = await Promise.all([
    prisma.catalogItem.findMany({
      where: publicationWhere,
      select: {
        id: true,
        sku: true,
        nameAr: true,
        nameEn: true,
        descriptionAr: true,
        descriptionEn: true,
        sellingPrice: true,
        completenessScore: true,
        contentStatus: true,
        category: { select: { slug: true, nameAr: true, nameEn: true } },
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
    }),
    prisma.category.findMany({
      where: {
        isActive: true,
        parentId: { not: null },
        items: { some: publicationWhere },
      },
      select: {
        id: true,
        slug: true,
        nameAr: true,
        nameEn: true,
        image: true,
        _count: { select: { items: { where: publicationWhere } } },
      },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    }),
    prisma.collection.findMany({
      where: {
        isActive: true,
        isDraft: false,
        items: { some: publicationWhere },
      },
      select: {
        id: true,
        slug: true,
        nameAr: true,
        nameEn: true,
        descriptionAr: true,
        descriptionEn: true,
        image: true,
        _count: { select: { items: { where: publicationWhere } } },
      },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    }),
    prisma.tagGroup.findMany({
      where: { tags: { some: { items: { some: publicationWhere } } } },
      select: {
        id: true,
        key: true,
        nameAr: true,
        nameEn: true,
        tags: {
          where: { items: { some: publicationWhere } },
          select: {
            id: true,
            slug: true,
            nameAr: true,
            nameEn: true,
            _count: { select: { items: { where: publicationWhere } } },
          },
          orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    }),
    prisma.siteContent.findMany({
      where: { isActive: true },
      select: {
        key: true,
        type: true,
        valueAr: true,
        valueEn: true,
        mediaUrl: true,
        altAr: true,
        altEn: true,
      },
    }),
    prisma.portfolioProject.count(),
  ]);

  const productIdsBySku = new Map(products.map((product) => [product.sku, product.id]));
  const categoryVisuals = new Set(products.filter((product) => hasPublishableCatalogAsset(product.assets)).map((product) => product.category.slug));
  const seoReadyProducts = products.filter(isCatalogSeoReady);
  const missingDescriptionAr = products.filter((product) => !nonEmpty(product.descriptionAr)).length;
  const missingDescriptionEn = products.filter((product) => !nonEmpty(product.descriptionEn)).length;
  const genericNames = products.filter(isGenericCatalogName).length;
  const missingBilingualMedia = products.filter((product) => !hasPublishableCatalogAsset(product.assets)).length;
  const requestOnlyProducts = products.filter((product) => Number(product.sellingPrice) <= 0).length;
  const untranslatedContent = contentRecords.filter((record) =>
    !["IMAGE", "VIDEO", "BANNER"].includes(record.type)
      && (!nonEmpty(record.valueAr) || !nonEmpty(record.valueEn)),
  ).length;
  const missingMediaAlt = contentRecords.filter((record) =>
    ["IMAGE", "BANNER"].includes(record.type)
      && nonEmpty(record.mediaUrl)
      && (!nonEmpty(record.altAr) || !nonEmpty(record.altEn)),
  ).length;

  const opportunities: SeoOpportunity[] = [
    ...categories.map((category): SeoOpportunity => ({
      key: `category:${category.slug}`,
      kind: "CATEGORY",
      labelAr: category.nameAr,
      labelEn: category.nameEn,
      path: `/catalog?category=${encodeURIComponent(category.slug)}`,
      productCount: category._count.items,
      coverageScore: coverageScore({
        count: category._count.items,
        bilingual: nonEmpty(category.nameAr) && nonEmpty(category.nameEn),
        visual: nonEmpty(category.image) || categoryVisuals.has(category.slug),
        descriptive: false,
      }),
      state: "INDEXABLE",
      noteAr: "صفحة فئة قانونية للفهرسة؛ أضف وصفاً تحريرياً فريداً عند إضافة حقل وصف للفئات.",
      noteEn: "Indexable category page; add unique editorial copy when category description fields are introduced.",
    })),
    ...STYLE_COLLECTIONS.map((style): SeoOpportunity => {
      const count = style.skus.filter((sku) => productIdsBySku.has(sku)).length;
      return {
        key: `style:${style.slug}`,
        kind: "STYLE",
        labelAr: style.name.ar,
        labelEn: style.name.en,
        path: `/catalog?style=${encodeURIComponent(style.slug)}`,
        productCount: count,
        coverageScore: coverageScore({ count, bilingual: true, visual: true, descriptive: true }),
        state: "INDEXABLE",
        noteAr: "تحرير أسلوبي منسق بمحتوى ثنائي اللغة وروابط إلى قطع حقيقية.",
        noteEn: "Coordinated style edit with bilingual copy and links to real catalog pieces.",
      };
    }),
    ...collections.map((collection): SeoOpportunity => ({
      key: `collection:${collection.slug}`,
      kind: "COLLECTION",
      labelAr: collection.nameAr,
      labelEn: collection.nameEn,
      path: `/catalog?collection=${encodeURIComponent(collection.slug)}`,
      productCount: collection._count.items,
      coverageScore: coverageScore({
        count: collection._count.items,
        bilingual: nonEmpty(collection.nameAr) && nonEmpty(collection.nameEn),
        visual: nonEmpty(collection.image),
        descriptive: nonEmpty(collection.descriptionAr) && nonEmpty(collection.descriptionEn),
      }),
      state: "INDEXABLE",
      noteAr: "تشكيلة منشورة؛ اكتمال الوصف والصورة يقوي وضوح الموضوع.",
      noteEn: "Published collection; complete descriptions and imagery improve topical clarity.",
    })),
    ...tagGroups.flatMap((group) => group.tags.map((tag): SeoOpportunity => ({
      key: `tag:${tag.slug}`,
      kind: "TAG",
      labelAr: `${tag.nameAr} · ${group.nameAr}`,
      labelEn: `${tag.nameEn} · ${group.nameEn}`,
      productCount: tag._count.items,
      coverageScore: coverageScore({
        count: tag._count.items,
        bilingual: nonEmpty(tag.nameAr) && nonEmpty(tag.nameEn),
        visual: false,
        descriptive: false,
      }),
      state: "CONTENT_GAP",
      noteAr: "الوسم فلتر غير مفهرس حالياً. أنشئ صفحة موضوع مستقلة فقط إذا أمكن إضافة شرح فريد واختيار واضح.",
      noteEn: "This tag is currently a noindex filter. Create a dedicated topic page only when it can carry unique guidance and a clear selection.",
    }))),
  ].sort((left, right) => {
    if (left.state !== right.state) return left.state === "CONTENT_GAP" ? -1 : 1;
    return right.productCount - left.productCount || right.coverageScore - left.coverageScore;
  });

  const issues = ([
    {
      key: "seo-readiness",
      severity: "HIGH",
      count: products.length - seoReadyProducts.length,
      titleAr: "منتجات منشورة غير جاهزة للفهرسة",
      titleEn: "Published products not SEO-ready",
      actionAr: "ارفع حالة المحتوى إلى READY أو VERIFIED ودرجة الاكتمال إلى 80 فأعلى بعد المراجعة.",
      actionEn: "After review, set content to READY or VERIFIED and completeness to at least 80.",
    },
    {
      key: "media-alt",
      severity: "HIGH",
      count: missingBilingualMedia,
      titleAr: "منتجات بلا صورة معتمدة ووصف بديل ثنائي اللغة",
      titleEn: "Products without approved bilingual image alt text",
      actionAr: "اعتمد صورة منتج آمنة وأضف وصفاً بديلاً عربياً وإنجليزياً يصف القطعة نفسها.",
      actionEn: "Approve a safe product image and add Arabic and English alt text describing the actual piece.",
    },
    {
      key: "description-ar",
      severity: "MEDIUM",
      count: missingDescriptionAr,
      titleAr: "أوصاف المنتجات العربية الناقصة",
      titleEn: "Missing Arabic product descriptions",
      actionAr: "أضف وصفاً واقعياً يوضح الاستخدام والخامة والمقاس المسجل دون ادعاءات غير موثقة.",
      actionEn: "Add factual copy covering recorded use, material and dimensions without unsupported claims.",
    },
    {
      key: "description-en",
      severity: "MEDIUM",
      count: missingDescriptionEn,
      titleAr: "أوصاف المنتجات الإنجليزية الناقصة",
      titleEn: "Missing English product descriptions",
      actionAr: "أكمل النسخة الإنجليزية لتكون صفحة اللغة مستقلة ومفهومة.",
      actionEn: "Complete the English copy so the locale page is independently useful.",
    },
    {
      key: "generic-names",
      severity: "MEDIUM",
      count: genericNames,
      titleAr: "أسماء منتجات عامة أو مشتقة من الكود",
      titleEn: "Generic or SKU-derived product names",
      actionAr: "استبدل الاسم العام باسم وصفي مميز مع إبقاء SKU كمعرّف منفصل.",
      actionEn: "Replace generic names with distinct descriptive names while retaining SKU as the identifier.",
    },
    {
      key: "site-translations",
      severity: "MEDIUM",
      count: untranslatedContent,
      titleAr: "حقول محتوى الموقع غير مكتملة اللغة",
      titleEn: "Incomplete bilingual site-content fields",
      actionAr: "أكمل النص في اللغتين قبل نشر التغيير.",
      actionEn: "Complete both language versions before publishing the change.",
    },
    {
      key: "site-media-alt",
      severity: "MEDIUM",
      count: missingMediaAlt,
      titleAr: "صور تحريرية بلا وصف بديل كامل",
      titleEn: "Editorial images missing complete alt text",
      actionAr: "أضف وصفاً بديلاً للصور المعلوماتية، واترك الزخارف فقط بلا وصف عند كونها زخرفية فعلاً.",
      actionEn: "Describe informative imagery in both languages; leave alt empty only for genuinely decorative media.",
    },
    {
      key: "request-price",
      severity: "LOW",
      count: requestOnlyProducts,
      titleAr: "منتجات بسعر عند الطلب",
      titleEn: "Products priced on request",
      actionAr: "ليست مشكلة فهرسة. أضف السعر فقط بعد التحقق التجاري؛ لا تنشئ Offer في البيانات المنظمة بدونه.",
      actionEn: "Not an indexation defect. Add prices only after commercial verification; do not emit an Offer without one.",
    },
  ] satisfies SeoAuditIssue[]).filter((issue) => issue.count > 0);

  return {
    generatedAt: new Date(),
    metrics: {
      publishedProducts: products.length,
      seoReadyProducts: seoReadyProducts.length,
      indexableCategories: categories.length,
      indexableStyles: STYLE_COLLECTIONS.length,
      publishedCollections: collections.length,
      topicGaps: opportunities.filter((opportunity) => opportunity.state === "CONTENT_GAP" && opportunity.productCount >= 3).length,
      internalPortfolioRecords: portfolioCount,
      siteUrlConfigured: hasPublicSiteUrl(),
      resolvedSiteUrl: getSiteUrl().toString(),
    },
    issues,
    opportunities,
  };
}
