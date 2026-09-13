export type FamilyReviewStatus = "CANDIDATE" | "APPROVED" | "REJECTED";
export type ContentStatus = "NEEDS_REVIEW" | "READY" | "VERIFIED";
export type AssetReviewStatus = "NEEDS_REVIEW" | "APPROVED" | "REJECTED";
export type AssetRole = "PRIMARY" | "GALLERY" | "DETAIL" | "LIFESTYLE";

export interface CategoryOption {
  id: number;
  nameAr: string;
  nameEn: string;
  itemCount: number;
  familyCount?: number;
}

export interface TagGroupOption {
  id: number;
  key: string;
  nameAr: string;
  nameEn: string;
  tags: Array<{
    id: number;
    slug: string;
    nameAr: string;
    nameEn: string;
  }>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface OverviewData {
  generatedAt: string;
  catalog: {
    total: number;
    averageCompleteness: number;
    contentStatuses: Record<ContentStatus, number>;
    scoreBands: {
      CRITICAL: number;
      INCOMPLETE: number;
      COMPLETE: number;
    };
    missing: {
      IDENTITY: number;
      DESCRIPTION: number;
      DIMENSIONS: number;
      MATERIAL: number;
      SUPPLIER: number;
    };
  };
  families: Record<FamilyReviewStatus, number>;
  assets: {
    total: number;
    duplicates: number;
    needsReview: number;
  };
  categories: CategoryOption[];
}

export interface AssetPreview {
  id: number;
  url: string;
  altAr: string | null;
  altEn: string | null;
  role: string;
}

export interface FamilySummary {
  id: number;
  nameAr: string;
  nameEn: string;
  slug: string;
  sourceKey: string;
  reviewStatus: FamilyReviewStatus;
  createdAt: string;
  updatedAt: string;
  category: { id: number; nameAr: string; nameEn: string };
  _count: { items: number; assets: number };
  assets: AssetPreview[];
  items: Array<{
    id: number;
    sku: string;
    nameAr: string;
    nameEn: string;
    completenessScore: number;
  }>;
}

export interface FamilyDetail
  extends Omit<FamilySummary, "_count" | "assets" | "items"> {
  items: Array<{
    id: number;
    sku: string;
    nameAr: string;
    nameEn: string;
    completenessScore: number;
    contentStatus: ContentStatus;
  }>;
  assets: Array<
    AssetPreview & {
      reviewStatus: string;
      duplicateOfId: number | null;
      duplicateOf: { id: number; url: string } | null;
    }
  >;
}

export interface QueueItem {
  id: number;
  sku: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  dimensions: string | null;
  material: string | null;
  color: string | null;
  specifications: string | null;
  sellingPrice: number;
  leadTimeDays: number;
  supplierId: number | null;
  completenessScore: number;
  contentStatus: ContentStatus;
  lastReviewedAt: string | null;
  updatedAt: string;
  category: { id: number; nameAr: string; nameEn: string };
  supplier: { id: number; name: string } | null;
  assetCount: number;
  previewAsset: {
    id: number;
    url: string;
    altAr: string | null;
    altEn: string | null;
    reviewStatus: string;
  } | null;
  missingFields: string[];
  tags: Array<{
    id: number;
    slug: string;
    nameAr: string;
    nameEn: string;
    group: { id: number; key: string; nameAr: string; nameEn: string };
  }>;
}

export interface ReviewAsset {
  id: number;
  url: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  role: AssetRole;
  sortOrder: number;
  altAr: string | null;
  altEn: string | null;
  reviewStatus: AssetReviewStatus;
  duplicateOfId: number | null;
  createdAt: string;
  duplicateOf: { id: number; url: string } | null;
  catalogItem: {
    id: number;
    sku: string;
    nameAr: string;
    nameEn: string;
    completenessScore: number;
    contentStatus: ContentStatus;
    category: { id: number; nameAr: string; nameEn: string };
  } | null;
  family: {
    id: number;
    nameAr: string;
    nameEn: string;
    reviewStatus: FamilyReviewStatus;
  } | null;
}

export interface ApiErrorShape {
  code?: string;
  message: string;
  fields?: Record<string, string>;
}

export type ApiEnvelope<T> =
  | { ok: true; data: T; meta?: { pagination?: PaginationMeta } }
  | { ok: false; error: ApiErrorShape };
