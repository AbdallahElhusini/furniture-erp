import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import { isGenericCatalogName } from "@/lib/catalog-quality";
import {
  approvedCatalogAssetWhere,
  approvedSafeCatalogAssets,
} from "@/lib/catalog-publication";
import {
  CONTENT_STATUSES,
  errorResponse,
  parsePositiveInteger,
  successResponse,
  type ContentStatus,
} from "@/app/api/data-quality/_shared";

const SCORE_BANDS = ["ALL", "CRITICAL", "INCOMPLETE", "COMPLETE"] as const;
const MISSING_FILTERS = [
  "ALL",
  "DESCRIPTION",
  "DIMENSIONS",
  "MATERIAL",
  "COLOR",
  "SPECIFICATIONS",
  "SUPPLIER",
  "MEDIA",
  "PRICE",
] as const;

type MissingFilter = (typeof MISSING_FILTERS)[number];

function missingFilterWhere(filter: MissingFilter): Prisma.CatalogItemWhereInput | null {
  switch (filter) {
    case "DESCRIPTION":
      return {
        OR: [
          { descriptionAr: null },
          { descriptionAr: "" },
          { descriptionEn: null },
          { descriptionEn: "" },
        ],
      };
    case "DIMENSIONS":
      return { OR: [{ dimensions: null }, { dimensions: "" }] };
    case "MATERIAL":
      return { OR: [{ material: null }, { material: "" }] };
    case "COLOR":
      return { OR: [{ color: null }, { color: "" }] };
    case "SPECIFICATIONS":
      return {
        OR: [
          { specifications: null },
          { specifications: "" },
          { specifications: "{}" },
        ],
      };
    case "SUPPLIER":
      return { supplierId: null };
    case "MEDIA":
      return { assets: { none: approvedCatalogAssetWhere } };
    case "PRICE":
      return { sellingPrice: { lte: 0 } };
    default:
      return null;
  }
}

function getMissingFields(item: {
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
  assets: Array<{
    url: string;
    altAr: string | null;
    altEn: string | null;
    reviewStatus: string;
    duplicateOfId: number | null;
  }>;
}) {
  const missing: string[] = [];
  const approvedAssets = approvedSafeCatalogAssets(item.assets);

  if (isGenericCatalogName(item)) missing.push("IDENTITY");
  if (!item.descriptionAr?.trim()) missing.push("DESCRIPTION_AR");
  if (!item.descriptionEn?.trim()) missing.push("DESCRIPTION_EN");
  if (!item.dimensions?.trim()) missing.push("DIMENSIONS");
  if (!item.material?.trim()) missing.push("MATERIAL");
  if (!item.color?.trim()) missing.push("COLOR");
  if (!item.specifications?.trim() || item.specifications === "{}") {
    missing.push("SPECIFICATIONS");
  }
  if (!(item.sellingPrice > 0)) missing.push("PRICE");
  if (!(item.leadTimeDays > 0)) missing.push("LEAD_TIME");
  if (!item.supplierId) missing.push("SUPPLIER");
  if (approvedAssets.length === 0) {
    missing.push("MEDIA");
  } else if (!approvedAssets.some((asset) => asset.altAr?.trim() && asset.altEn?.trim())) {
    missing.push("MEDIA_REVIEW");
  }

  return missing;
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request, ["ADMIN", "MANAGER"]);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = request.nextUrl;
    const page = parsePositiveInteger(searchParams.get("page"), 1, 100_000);
    const pageSize = parsePositiveInteger(searchParams.get("pageSize"), 25, 100);
    const categoryIdValue = searchParams.get("categoryId");
    const categoryId = categoryIdValue
      ? parsePositiveInteger(categoryIdValue, 1, Number.MAX_SAFE_INTEGER)
      : undefined;
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "UNVERIFIED").toUpperCase();
    const scoreBand = (searchParams.get("scoreBand") || "ALL").toUpperCase();
    const missing = (searchParams.get("missing") || "ALL").toUpperCase();

    if (page === null || pageSize === null) {
      return errorResponse(
        400,
        "INVALID_PAGINATION",
        "page must be positive and pageSize must be between 1 and 100.",
      );
    }
    if (categoryIdValue && categoryId === null) {
      return errorResponse(400, "INVALID_CATEGORY", "categoryId must be a positive integer.");
    }
    if (search.length > 100) {
      return errorResponse(400, "INVALID_SEARCH", "search cannot exceed 100 characters.");
    }
    if (
      status !== "ALL" &&
      status !== "UNVERIFIED" &&
      !CONTENT_STATUSES.includes(status as ContentStatus)
    ) {
      return errorResponse(400, "INVALID_STATUS", "Unknown content status filter.");
    }
    if (!SCORE_BANDS.includes(scoreBand as (typeof SCORE_BANDS)[number])) {
      return errorResponse(400, "INVALID_SCORE_BAND", "Unknown score band filter.");
    }
    if (!MISSING_FILTERS.includes(missing as MissingFilter)) {
      return errorResponse(400, "INVALID_MISSING_FILTER", "Unknown missing-data filter.");
    }

    const filters: Prisma.CatalogItemWhereInput[] = [];

    if (status === "UNVERIFIED") {
      filters.push({ contentStatus: { not: "VERIFIED" } });
    } else if (status !== "ALL") {
      filters.push({ contentStatus: status });
    }
    if (categoryId) filters.push({ categoryId });
    if (search) {
      filters.push({
        OR: [
          { sku: { contains: search } },
          { nameAr: { contains: search } },
          { nameEn: { contains: search } },
        ],
      });
    }
    if (scoreBand === "CRITICAL") {
      filters.push({ completenessScore: { lt: 50 } });
    } else if (scoreBand === "INCOMPLETE") {
      filters.push({ completenessScore: { gte: 50, lt: 80 } });
    } else if (scoreBand === "COMPLETE") {
      filters.push({ completenessScore: { gte: 80 } });
    }

    const missingWhere = missingFilterWhere(missing as MissingFilter);
    if (missingWhere) filters.push(missingWhere);

    const where: Prisma.CatalogItemWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [total, items, categories, tagGroups] = await prisma.$transaction([
      prisma.catalogItem.count({ where }),
      prisma.catalogItem.findMany({
        where,
        select: {
          id: true,
          sku: true,
          nameAr: true,
          nameEn: true,
          descriptionAr: true,
          descriptionEn: true,
          dimensions: true,
          material: true,
          color: true,
          specifications: true,
          sellingPrice: true,
          leadTimeDays: true,
          supplierId: true,
          completenessScore: true,
          contentStatus: true,
          lastReviewedAt: true,
          updatedAt: true,
          category: { select: { id: true, nameAr: true, nameEn: true } },
          supplier: { select: { id: true, name: true } },
          tags: {
            select: {
              id: true,
              slug: true,
              nameAr: true,
              nameEn: true,
              group: { select: { id: true, key: true, nameAr: true, nameEn: true } },
            },
            orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
          },
          assets: {
            select: {
              id: true,
              url: true,
              altAr: true,
              altEn: true,
              reviewStatus: true,
              duplicateOfId: true,
            },
            orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
          },
        },
        orderBy: [{ completenessScore: "asc" }, { updatedAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.category.findMany({
        where: { isActive: true, items: { some: {} } },
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          _count: { select: { items: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }],
      }),
      prisma.tagGroup.findMany({
        select: {
          id: true,
          key: true,
          nameAr: true,
          nameEn: true,
          tags: {
            select: { id: true, slug: true, nameAr: true, nameEn: true },
            orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }],
      }),
    ]);

    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    return successResponse(
      {
        items: items.map((item) => {
          const approvedAssets = approvedSafeCatalogAssets(item.assets);
          return {
            ...item,
            assetCount: approvedAssets.length,
            previewAsset: approvedAssets[0] || item.assets[0] || null,
            missingFields: getMissingFields(item),
            assets: undefined,
          };
        }),
        categories: categories.map((category) => ({
          id: category.id,
          nameAr: category.nameAr,
          nameEn: category.nameEn,
          itemCount: category._count.items,
        })),
        tagGroups,
      },
      {
        pagination: {
          page,
          pageSize,
          total,
          pageCount,
          hasNextPage: page < pageCount,
          hasPreviousPage: page > 1,
        },
      },
    );
  } catch (error) {
    console.error("Error fetching missing data items:", error);
    return errorResponse(500, "ITEM_QUEUE_FAILED", "Unable to load the data-quality queue.");
  }
}
