import type { BilingualLabel } from "@/lib/catalog-commerce";
import { STOREFRONT_PAGE_CONTENT_DEFAULTS } from "@/lib/storefront-content-defaults";

export type StyleCollectionMood =
  | "classic"
  | "natural"
  | "smart"
  | "contemporary"
  | "dynamic";

export interface StyleCollectionDefinition {
  slug: string;
  name: BilingualLabel;
  tagline: BilingualLabel;
  description: BilingualLabel;
  criteria: BilingualLabel;
  mood: StyleCollectionMood;
  /**
   * Existing catalog records, deliberately selected as a complementary edit.
   * The storefront always intersects these identifiers with its publication gate.
   */
  skus: readonly string[];
}

function styleText(slug: string, field: "name" | "tagline" | "description" | "criteria"): BilingualLabel {
  return {
    ar: STOREFRONT_PAGE_CONTENT_DEFAULTS.ar.styles[slug][field],
    en: STOREFRONT_PAGE_CONTENT_DEFAULTS.en.styles[slug][field],
  };
}

export const STYLE_COLLECTIONS = [
  {
    slug: "classic",
    name: styleText("classic", "name"),
    tagline: styleText("classic", "tagline"),
    description: styleText("classic", "description"),
    criteria: styleText("classic", "criteria"),
    mood: "classic",
    skus: ["EXD-001", "CHR-002", "SHL-001", "MTG-001", "ACC-001"],
  },
  {
    slug: "boho-natural",
    name: styleText("boho-natural", "name"),
    tagline: styleText("boho-natural", "tagline"),
    description: styleText("boho-natural", "description"),
    criteria: styleText("boho-natural", "criteria"),
    mood: "natural",
    skus: ["DSK-002", "SFA-002", "STR-003", "MTG-001", "PRT-003"],
  },
  {
    slug: "smart",
    name: styleText("smart", "name"),
    tagline: styleText("smart", "tagline"),
    description: styleText("smart", "description"),
    criteria: styleText("smart", "criteria"),
    mood: "smart",
    skus: ["EXD-003", "CHR-001", "STR-002", "MTG-002", "ACC-002"],
  },
  {
    slug: "contemporary",
    name: styleText("contemporary", "name"),
    tagline: styleText("contemporary", "tagline"),
    description: styleText("contemporary", "description"),
    criteria: styleText("contemporary", "criteria"),
    mood: "contemporary",
    skus: ["EXD-002", "CHR-003", "STR-002", "MTG-002", "PRT-002"],
  },
  {
    slug: "dynamic",
    name: styleText("dynamic", "name"),
    tagline: styleText("dynamic", "tagline"),
    description: styleText("dynamic", "description"),
    criteria: styleText("dynamic", "criteria"),
    mood: "dynamic",
    skus: ["DSK-003", "CHR-001", "STR-001", "MTG-001", "PRT-003"],
  },
] as const satisfies readonly StyleCollectionDefinition[];

export type StyleCollectionSlug = (typeof STYLE_COLLECTIONS)[number]["slug"];

export function getStyleCollection(
  value?: string | null,
): (typeof STYLE_COLLECTIONS)[number] | undefined {
  if (!value) return undefined;
  return STYLE_COLLECTIONS.find((style) => style.slug === value);
}

export function getStyleSkuUniverse(): string[] {
  return Array.from(new Set(STYLE_COLLECTIONS.flatMap((style) => style.skus)));
}
