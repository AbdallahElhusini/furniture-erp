import {
  storefrontDictionaries,
  type StorefrontDictionary,
  type StorefrontLocale,
} from "@/lib/i18n/storefront";
import {
  HOME_PAGE_CONTENT_DEFAULTS,
  type HomePageContentByLocale,
} from "@/lib/home-content-defaults";
import {
  STOREFRONT_PAGE_CONTENT_DEFAULTS,
  type StorefrontPageContent,
} from "@/lib/storefront-content-defaults";
import {
  CATEGORY_EDITORIAL_VISUALS,
  HOME_SPACE_VISUALS,
  STOREFRONT_EDITORIAL_MEDIA,
  STYLE_EDITORIAL_VISUALS,
} from "@/lib/storefront-visuals";

export type RegisteredSiteContentType =
  | "TEXT"
  | "TEXTAREA"
  | "LINK"
  | "IMAGE"
  | "VIDEO"
  | "BANNER";

export interface SiteContentDefinition {
  key: string;
  group: string;
  type: RegisteredSiteContentType;
  label: string;
  valueAr?: string;
  valueEn?: string;
  mediaUrl?: string;
  altAr?: string;
  altEn?: string;
  linkUrl?: string;
  metadata?: string;
  sortOrder: number;
}

export interface SiteContentRecord {
  key: string;
  group: string;
  type: string;
  label: string;
  valueAr: string | null;
  valueEn: string | null;
  mediaUrl: string | null;
  altAr: string | null;
  altEn: string | null;
  linkUrl: string | null;
  metadata: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ResolvedSiteMediaSlot {
  key: string;
  type: "IMAGE" | "VIDEO" | "BANNER";
  url?: string;
  altAr?: string;
  altEn?: string;
  metadata?: string;
}

const NON_EDITABLE_PATH_SEGMENTS = new Set(["href", "slug", "value", "apiErrors"]);
const MEDIA_PATH_PREFIXES = ["/images/", "/media/", "/uploads/"] as const;
const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shouldRegisterTextPath(path: readonly string[]): boolean {
  return !path.some((segment) => NON_EDITABLE_PATH_SEGMENTS.has(segment));
}

function contentTypeFor(value: string): RegisteredSiteContentType {
  return value.length > 96 ? "TEXTAREA" : "TEXT";
}

function groupFor(prefix: string, path: readonly string[]): string {
  return `${prefix}.${path[0] || "general"}`;
}

function registerLocalizedStrings(
  prefix: "dictionary" | "home" | "storefront",
  arabicValue: unknown,
  englishValue: unknown,
  path: string[],
  output: SiteContentDefinition[],
) {
  if (typeof arabicValue === "string" && typeof englishValue === "string") {
    if (!shouldRegisterTextPath(path)) return;
    const sortOrder = output.length;
    output.push({
      key: `${prefix}.${path.join(".")}`,
      group: groupFor(prefix, path),
      type: contentTypeFor(`${arabicValue}${englishValue}`),
      label: path.join(" / "),
      valueAr: arabicValue,
      valueEn: englishValue,
      sortOrder,
    });
    return;
  }

  if (Array.isArray(arabicValue) && Array.isArray(englishValue)) {
    const length = Math.min(arabicValue.length, englishValue.length);
    for (let index = 0; index < length; index += 1) {
      registerLocalizedStrings(
        prefix,
        arabicValue[index],
        englishValue[index],
        [...path, String(index)],
        output,
      );
    }
    return;
  }

  if (!isObject(arabicValue) || !isObject(englishValue)) return;
  for (const key of Object.keys(arabicValue)) {
    if (!(key in englishValue)) continue;
    registerLocalizedStrings(
      prefix,
      arabicValue[key],
      englishValue[key],
      [...path, key],
      output,
    );
  }
}

const textDefinitions: SiteContentDefinition[] = [];
registerLocalizedStrings(
  "dictionary",
  storefrontDictionaries.ar,
  storefrontDictionaries.en,
  [],
  textDefinitions,
);
registerLocalizedStrings(
  "home",
  HOME_PAGE_CONTENT_DEFAULTS.ar,
  HOME_PAGE_CONTENT_DEFAULTS.en,
  [],
  textDefinitions,
);
registerLocalizedStrings(
  "storefront",
  STOREFRONT_PAGE_CONTENT_DEFAULTS.ar,
  STOREFRONT_PAGE_CONTENT_DEFAULTS.en,
  [],
  textDefinitions,
);

const mediaDefinitions: SiteContentDefinition[] = [
  {
    key: "global.logo",
    group: "media.global",
    type: "IMAGE",
    label: "الشعار الرئيسي",
    mediaUrl: "/images/brand/hatab-wordmark.png",
    altAr: "شعار حطب للأثاث المكتبي",
    altEn: "HATAB Office Furniture logo",
    sortOrder: 10_000,
  },
  {
    key: "home.hero.image",
    group: "media.home",
    type: "BANNER",
    label: "غلاف الهيرو · نفهم المساحة",
    mediaUrl: "/images/editorial/home-hero.webp",
    altAr: "مساحة مكتب متكاملة بأثاث حطب المكتبي",
    altEn: "A complete workspace furnished by HATAB Office Furniture",
    metadata: JSON.stringify({ objectPosition: "50% 50%" }),
    sortOrder: 10_000,
  },
  {
    key: "home.hero.stage.design.image",
    group: "media.home",
    type: "BANNER",
    label: "غلاف الهيرو · نصمّم المنظومة",
    mediaUrl: "/images/editorial/project-consultation.webp",
    altAr: "فريق حطب يراجع مخططاً لتصميم مساحة عمل",
    altEn: "The HATAB team reviewing a workspace design plan",
    metadata: JSON.stringify({ objectPosition: "50% 50%" }),
    sortOrder: 10_001,
  },
  {
    key: "home.hero.stage.craft.image",
    group: "media.home",
    type: "BANNER",
    label: "غلاف الهيرو · نصنع كل تفصيلة",
    mediaUrl: "/images/editorial/mesh-detail.webp",
    altAr: "تفاصيل خامة وتشطيب مقعد مكتبي من حطب",
    altEn: "Material and finish detail of a HATAB office chair",
    metadata: JSON.stringify({ objectPosition: "64% 50%" }),
    sortOrder: 10_002,
  },
  {
    key: "home.hero.stage.smart.image",
    group: "media.home",
    type: "BANNER",
    label: "غلاف الهيرو · نفعّل مكتباً أذكى",
    mediaUrl: "/images/editorial/smart-workspace.webp",
    altAr: "مساحة عمل ذكية ومتكاملة جاهزة للاستخدام",
    altEn: "A complete smart workspace ready for use",
    metadata: JSON.stringify({ objectPosition: "50% 50%" }),
    sortOrder: 10_003,
  },
  {
    key: "home.process.video",
    group: "media.home",
    type: "VIDEO",
    label: "فيلم مراحل العمل",
    mediaUrl: "/media/hatab-process-scroll-alpha.webm",
    sortOrder: 10_001,
  },
  {
    key: "home.process.poster",
    group: "media.home",
    type: "IMAGE",
    label: "صورة غلاف فيلم مراحل العمل",
    mediaUrl: "/media/hatab-process-poster-alpha.png",
    sortOrder: 10_002,
  },
  {
    key: "catalog.hero.image",
    group: "media.catalog",
    type: "BANNER",
    label: "صورة غلاف الكتالوج",
    mediaUrl: STOREFRONT_EDITORIAL_MEDIA.catalogHero.src,
    altAr: STOREFRONT_EDITORIAL_MEDIA.catalogHero.altAr,
    altEn: STOREFRONT_EDITORIAL_MEDIA.catalogHero.altEn,
    metadata: JSON.stringify({
      objectPosition: STOREFRONT_EDITORIAL_MEDIA.catalogHero.objectPosition,
    }),
    sortOrder: 10_003,
  },
  {
    key: "collections.hero.image",
    group: "media.collections",
    type: "BANNER",
    label: "صورة غلاف التشكيلات",
    mediaUrl: STOREFRONT_EDITORIAL_MEDIA.collectionsHero.src,
    altAr: STOREFRONT_EDITORIAL_MEDIA.collectionsHero.altAr,
    altEn: STOREFRONT_EDITORIAL_MEDIA.collectionsHero.altEn,
    metadata: JSON.stringify({
      objectPosition: STOREFRONT_EDITORIAL_MEDIA.collectionsHero.objectPosition,
    }),
    sortOrder: 10_004,
  },
  {
    key: "collections.motion.video",
    group: "media.collections",
    type: "VIDEO",
    label: "فيلم حركة المقاعد في غلاف التشكيلات",
    mediaUrl: STOREFRONT_EDITORIAL_MEDIA.collectionsMotionVideo,
    sortOrder: 10_005,
  },
  {
    key: "portfolio.hero.image",
    group: "media.portfolio",
    type: "BANNER",
    label: "صورة غلاف معرض المشروعات",
    mediaUrl: STOREFRONT_EDITORIAL_MEDIA.portfolioHero.src,
    altAr: STOREFRONT_EDITORIAL_MEDIA.portfolioHero.altAr,
    altEn: STOREFRONT_EDITORIAL_MEDIA.portfolioHero.altEn,
    metadata: JSON.stringify({
      objectPosition: STOREFRONT_EDITORIAL_MEDIA.portfolioHero.objectPosition,
    }),
    sortOrder: 10_006,
  },
  {
    key: "portfolio.ctaBanner.image",
    group: "media.portfolio",
    type: "BANNER",
    label: "صورة دعوة بدء المشروع",
    mediaUrl: STOREFRONT_EDITORIAL_MEDIA.portfolioCta.src,
    altAr: STOREFRONT_EDITORIAL_MEDIA.portfolioCta.altAr,
    altEn: STOREFRONT_EDITORIAL_MEDIA.portfolioCta.altEn,
    metadata: JSON.stringify({
      objectPosition: STOREFRONT_EDITORIAL_MEDIA.portfolioCta.objectPosition,
    }),
    sortOrder: 10_007,
  },
  {
    key: "home.motion.video",
    group: "media.home",
    type: "VIDEO",
    label: "فيلم دراسة حركة المقعد",
    mediaUrl: STOREFRONT_EDITORIAL_MEDIA.homeMotionVideo,
    sortOrder: 10_008,
  },
  {
    key: "home.motion.poster",
    group: "media.home",
    type: "IMAGE",
    label: "صورة غلاف دراسة الحركة",
    mediaUrl: STOREFRONT_EDITORIAL_MEDIA.homeMotionPoster,
    altAr: "مقعد عمل مصمم حول حركة المستخدم",
    altEn: "A task chair designed around user movement",
    sortOrder: 10_009,
  },
  ...[
    ["executive", "المكتب التنفيذي"],
    ["open", "مساحات العمل المفتوحة"],
    ["meeting", "غرف الاجتماعات"],
    ["reception", "الاستقبال والانتظار"],
  ].map(([id, label], index): SiteContentDefinition => {
    const fallback = HOME_SPACE_VISUALS[id as keyof typeof HOME_SPACE_VISUALS];
    return {
      key: `home.space.${id}.image`,
      group: "media.home",
      type: "BANNER",
      label: `صورة مساحة: ${label}`,
      mediaUrl: fallback.src,
      altAr: fallback.altAr,
      altEn: fallback.altEn,
      metadata: JSON.stringify({ objectPosition: fallback.objectPosition }),
      sortOrder: 10_010 + index,
    };
  }),
  ...[
    ["executive-desks", "المكاتب التنفيذية"],
    ["bench-workstations", "محطات العمل"],
    ["task-ergonomic-seating", "المقاعد المكتبية"],
    ["meeting-conference-tables", "طاولات الاجتماعات"],
    ["lounge-sofas", "الجلوس والاستقبال"],
    ["cabinets-storage", "التخزين"],
  ].map(([id, label], index): SiteContentDefinition => {
    const fallback = CATEGORY_EDITORIAL_VISUALS[id];
    return {
      key: `home.category.${id}.image`,
      group: "media.home",
      type: "IMAGE",
      label: `صورة فئة: ${label}`,
      mediaUrl: fallback?.src,
      altAr: fallback?.altAr,
      altEn: fallback?.altEn,
      metadata: fallback
        ? JSON.stringify({ objectPosition: fallback.objectPosition })
        : undefined,
      sortOrder: 10_020 + index,
    };
  }),
  ...([
    [
      "work-surface",
      "سطح العمل",
      CATEGORY_EDITORIAL_VISUALS["operative-desks"],
    ],
    [
      "seating",
      "المقعد",
      CATEGORY_EDITORIAL_VISUALS["task-ergonomic-seating"],
    ],
    [
      "storage",
      "التخزين",
      CATEGORY_EDITORIAL_VISUALS["cabinets-storage"],
    ],
  ] as const).map(([id, label, fallback], index): SiteContentDefinition => ({
    key: `home.coordination.${id}.image`,
    group: "media.home",
    type: "IMAGE",
    label: `صورة التنسيق: ${label}`,
    mediaUrl: fallback.src,
    altAr: fallback.altAr,
    altEn: fallback.altEn,
    metadata: JSON.stringify({ objectPosition: fallback.objectPosition }),
    sortOrder: 10_030 + index,
  })),
  ...Object.entries(CATEGORY_EDITORIAL_VISUALS).map(
    ([slug, fallback], index): SiteContentDefinition => ({
      key: `catalog.category.${slug}.banner`,
      group: "media.catalog",
      type: "BANNER",
      label: `بانر فئة الكتالوج: ${slug}`,
      mediaUrl: fallback.src,
      altAr: fallback.altAr,
      altEn: fallback.altEn,
      metadata: JSON.stringify({ objectPosition: fallback.objectPosition }),
      sortOrder: 10_100 + index,
    }),
  ),
  ...Object.entries(STYLE_EDITORIAL_VISUALS).map(
    ([slug, fallback], index): SiteContentDefinition => ({
      key: `collections.style.${slug}.image`,
      group: "media.collections",
      type: "BANNER",
      label: `صورة التشكيلة البصرية: ${slug}`,
      mediaUrl: fallback.src,
      altAr: fallback.altAr,
      altEn: fallback.altEn,
      metadata: JSON.stringify({ objectPosition: fallback.objectPosition }),
      sortOrder: 10_200 + index,
    }),
  ),
];

export const SITE_CONTENT_DEFINITIONS: readonly SiteContentDefinition[] =
  Object.freeze([...textDefinitions, ...mediaDefinitions]);

export const SITE_CONTENT_DEFINITION_BY_KEY = new Map(
  SITE_CONTENT_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export const SITE_CONTENT_GROUPS = Array.from(
  new Set(SITE_CONTENT_DEFINITIONS.map((definition) => definition.group)),
);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setPath(root: unknown, path: readonly string[], value: string) {
  let cursor = root as Record<string, unknown> | unknown[];
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const next = Array.isArray(cursor)
      ? cursor[Number(segment)]
      : cursor[segment];
    if (!isObject(next)) return;
    cursor = next as Record<string, unknown> | unknown[];
  }

  const leaf = path[path.length - 1];
  if (!leaf) return;
  if (Array.isArray(cursor)) cursor[Number(leaf)] = value;
  else cursor[leaf] = value;
}

function activeRecordMap(records: readonly SiteContentRecord[]) {
  return new Map(records.filter((record) => record.isActive).map((record) => [record.key, record]));
}

function localizedRecordValue(
  record: SiteContentRecord | undefined,
  locale: StorefrontLocale,
): string | undefined {
  const value = locale === "ar" ? record?.valueAr : record?.valueEn;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveStorefrontDictionaries(
  records: readonly SiteContentRecord[],
): Record<StorefrontLocale, StorefrontDictionary> {
  const result = clone(storefrontDictionaries) as Record<StorefrontLocale, StorefrontDictionary>;
  const recordMap = activeRecordMap(records);

  for (const definition of SITE_CONTENT_DEFINITIONS) {
    if (!definition.key.startsWith("dictionary.")) continue;
    const path = definition.key.slice("dictionary.".length).split(".");
    for (const locale of ["ar", "en"] as const) {
      const value = localizedRecordValue(recordMap.get(definition.key), locale);
      if (value !== undefined) setPath(result[locale], path, value);
    }
  }

  return result;
}

export function resolveHomePageContent(
  records: readonly SiteContentRecord[],
): HomePageContentByLocale {
  const result = clone(HOME_PAGE_CONTENT_DEFAULTS);
  const recordMap = activeRecordMap(records);

  for (const definition of SITE_CONTENT_DEFINITIONS) {
    if (!definition.key.startsWith("home.") || definition.type === "IMAGE" || definition.type === "VIDEO" || definition.type === "BANNER") continue;
    const path = definition.key.slice("home.".length).split(".");
    for (const locale of ["ar", "en"] as const) {
      const value = localizedRecordValue(recordMap.get(definition.key), locale);
      if (value !== undefined) setPath(result[locale], path, value);
    }
  }

  return result;
}

export function resolveStorefrontPageContent(
  records: readonly SiteContentRecord[],
): Record<StorefrontLocale, StorefrontPageContent> {
  const result = clone(STOREFRONT_PAGE_CONTENT_DEFAULTS);
  const recordMap = activeRecordMap(records);

  for (const definition of SITE_CONTENT_DEFINITIONS) {
    if (!definition.key.startsWith("storefront.")) continue;
    const path = definition.key.slice("storefront.".length).split(".");
    for (const locale of ["ar", "en"] as const) {
      const value = localizedRecordValue(recordMap.get(definition.key), locale);
      if (value !== undefined) setPath(result[locale], path, value);
    }
  }

  return result;
}

function extensionOf(pathname: string): string {
  const cleanPath = pathname.split(/[?#]/, 1)[0].toLowerCase();
  const dotIndex = cleanPath.lastIndexOf(".");
  return dotIndex >= 0 ? cleanPath.slice(dotIndex) : "";
}

export function isSafeSiteMediaPath(
  value: string | null | undefined,
  type: "IMAGE" | "VIDEO" | "BANNER",
): value is string {
  if (!value || value.length > 1_000 || !value.startsWith("/")) return false;
  if (value.startsWith("//") || value.includes("\\") || value.includes("..")) return false;
  if (!MEDIA_PATH_PREFIXES.some((prefix) => value.startsWith(prefix))) return false;
  const extension = extensionOf(value);
  return type === "VIDEO" ? VIDEO_EXTENSIONS.has(extension) : IMAGE_EXTENSIONS.has(extension);
}

export function isSafeSiteLink(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      value.length <= 500 &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\") &&
      !value.includes(".."),
  );
}

export function resolveSiteMediaSlots(
  records: readonly SiteContentRecord[],
): Record<string, ResolvedSiteMediaSlot> {
  const recordMap = activeRecordMap(records);
  const result: Record<string, ResolvedSiteMediaSlot> = {};

  for (const definition of SITE_CONTENT_DEFINITIONS) {
    if (!(definition.type === "IMAGE" || definition.type === "VIDEO" || definition.type === "BANNER")) continue;
    const record = recordMap.get(definition.key);
    const candidate = record?.mediaUrl || definition.mediaUrl;
    const url = isSafeSiteMediaPath(candidate, definition.type) ? candidate : undefined;
    result[definition.key] = {
      key: definition.key,
      type: definition.type,
      url,
      altAr: record?.altAr?.trim() || definition.altAr,
      altEn: record?.altEn?.trim() || definition.altEn,
      metadata: record?.metadata || definition.metadata,
    };
  }

  return result;
}
