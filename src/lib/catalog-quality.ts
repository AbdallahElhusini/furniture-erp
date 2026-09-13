export interface CatalogCompletenessInput {
  sku?: string | null;
  categoryId?: number | null;
  nameAr?: string | null;
  nameEn?: string | null;
  dimensions?: string | null;
  material?: string | null;
  color?: string | null;
  specifications?: string | null;
  sellingPrice?: number | null;
  leadTimeDays?: number | null;
  supplierId?: number | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  imageCount?: number;
  reviewedAltCount?: number;
}

export type CatalogSpecificationsResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** Accept only a bounded JSON object, while allowing null/blank to clear it. */
export function normalizeCatalogSpecifications(
  value: unknown,
  maximumBytes = 10_000,
): CatalogSpecificationsResult {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }

  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return { ok: false, error: "specifications must contain valid JSON" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "specifications must be a JSON object" };
  }

  try {
    const normalized = JSON.stringify(parsed);
    if (new TextEncoder().encode(normalized).byteLength > maximumBytes) {
      return { ok: false, error: `specifications must not exceed ${maximumBytes} bytes` };
    }
    return { ok: true, value: normalized };
  } catch {
    return { ok: false, error: "specifications must be JSON serializable" };
  }
}

export function parseCatalogImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()));
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [];
  } catch {
    return [];
  }
}

export function isGenericCatalogName(input: Pick<CatalogCompletenessInput, 'sku' | 'nameAr' | 'nameEn'>): boolean {
  const sku = input.sku?.trim();
  if (!sku) return true;
  const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(?:Product|منتج)\\s+${escapedSku}$`, 'i');
  return pattern.test(input.nameAr?.trim() || '') || pattern.test(input.nameEn?.trim() || '');
}

export function catalogDisplayName(input: Pick<CatalogCompletenessInput, 'sku' | 'nameAr' | 'nameEn'> & { categoryNameAr?: string | null }): string {
  if (!isGenericCatalogName(input)) return input.nameAr?.trim() || input.sku?.trim() || 'قطعة مكتبية';

  const categoryName = input.categoryNameAr?.trim() || 'قطعة مكتبية';
  const sku = input.sku?.trim();
  return sku ? `${categoryName} · ${sku}` : categoryName;
}

export function calculateCatalogCompleteness(input: CatalogCompletenessInput): number {
  const imageCount = input.imageCount || 0;
  const reviewedAltCount = input.reviewedAltCount || 0;
  let score = 0;

  if (input.sku?.trim()) score += 10;
  if (input.categoryId) score += 10;
  if (input.nameAr?.trim() && input.nameEn?.trim() && !isGenericCatalogName(input)) score += 10;

  if (imageCount >= 1) score += 15;
  if (imageCount >= 3) score += 5;
  if (imageCount > 0 && reviewedAltCount === imageCount) score += 5;

  if (input.dimensions?.trim()) score += 5;
  if (input.material?.trim()) score += 5;
  if (input.color?.trim()) score += 4;
  if (input.specifications?.trim() && input.specifications !== '{}') score += 6;

  if (Number(input.sellingPrice) > 0) score += 5;
  if (Number(input.leadTimeDays) > 0) score += 5;
  if (input.supplierId) score += 5;

  if (input.descriptionAr?.trim()) score += 4;
  if (input.descriptionEn?.trim()) score += 3;
  if (!isGenericCatalogName(input)) score += 3;

  return Math.min(score, 100);
}

export function catalogContentStatus(input: Pick<CatalogCompletenessInput, 'sku' | 'nameAr' | 'nameEn'> & { completenessScore: number }): 'READY' | 'NEEDS_REVIEW' {
  return !isGenericCatalogName(input) && input.completenessScore >= 80 ? 'READY' : 'NEEDS_REVIEW';
}

export function isCatalogSeoReady(input: {
  contentStatus?: string | null;
  completenessScore?: number | null;
}): boolean {
  return (
    (input.contentStatus === 'READY' || input.contentStatus === 'VERIFIED') &&
    Number(input.completenessScore) >= 80
  );
}
