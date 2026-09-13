import type { Prisma } from "@prisma/client";
import {
  inferProductMediaKind,
  isSafeProductMediaSource,
  type ProductMediaKind,
} from "./product-media.ts";

const SAFE_LOCAL_RASTER_ASSET =
  /^\/(?:uploads\/catalog|images)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:avif|gif|jpe?g|png|webp)$/i;

export interface CatalogAssetReviewInput {
  url: string;
  mimeType?: string | null;
  role?: string | null;
  sortOrder?: number | null;
  reviewStatus?: string | null;
  duplicateOfId?: number | null;
  altAr?: string | null;
  altEn?: string | null;
}

export type SafeCatalogMediaAsset<T extends CatalogAssetReviewInput> = T & {
  kind: ProductMediaKind;
};

export interface CatalogPublicationFilter {
  isActive: true;
  category: { isActive: true };
  contentStatus?: "VERIFIED";
}

export const approvedCatalogAssetWhere = {
  duplicateOfId: null,
  reviewStatus: "APPROVED",
} satisfies Prisma.ProductAssetWhereInput;

export function isProductionCatalog(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}

export function catalogPublicationWhere(
  nodeEnv = process.env.NODE_ENV,
): CatalogPublicationFilter {
  return {
    isActive: true,
    category: { isActive: true },
    ...(isProductionCatalog(nodeEnv) ? { contentStatus: "VERIFIED" as const } : {}),
  };
}

export function isSafeCatalogAssetUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  if (
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return false;
  }
  return SAFE_LOCAL_RASTER_ASSET.test(value);
}

export function approvedSafeCatalogAssets<T extends CatalogAssetReviewInput>(
  assets: readonly T[],
): T[] {
  return assets.filter(
    (asset) =>
      asset.reviewStatus === "APPROVED" &&
      asset.duplicateOfId == null &&
      isSafeCatalogAssetUrl(asset.url),
  );
}

export function safeProductMediaAssets<T extends CatalogAssetReviewInput>(
  assets: readonly T[],
): SafeCatalogMediaAsset<T>[] {
  return assets
    .filter((asset) => asset.duplicateOfId == null && isSafeProductMediaSource(asset.url))
    .map((asset) => ({
      ...asset,
      kind: inferProductMediaKind(asset.url, asset.mimeType) as ProductMediaKind,
    }))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
}

export function approvedSafeProductMediaAssets<T extends CatalogAssetReviewInput>(
  assets: readonly T[],
): SafeCatalogMediaAsset<T>[] {
  return safeProductMediaAssets(assets).filter((asset) => asset.reviewStatus === "APPROVED");
}

export function approvedSafeCatalogAssetUrls(
  assets: readonly CatalogAssetReviewInput[],
): string[] {
  return Array.from(
    new Set(approvedSafeCatalogAssets(assets).map((asset) => asset.url)),
  );
}

export function hasPublishableCatalogAsset(
  assets: readonly CatalogAssetReviewInput[],
): boolean {
  return approvedSafeProductMediaAssets(assets).some(
    (asset) =>
      asset.kind === "IMAGE" &&
      Boolean(asset.altAr?.trim()) &&
      Boolean(asset.altEn?.trim()),
  );
}
