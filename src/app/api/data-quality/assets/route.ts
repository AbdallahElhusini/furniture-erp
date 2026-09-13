import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import {
  ASSET_REVIEW_STATUSES,
  ASSET_ROLES,
  errorResponse,
  parsePositiveInteger,
  successResponse,
  type AssetReviewStatus,
  type AssetRole,
} from "@/app/api/data-quality/_shared";

const ALT_FILTERS = ["ALL", "MISSING", "COMPLETE"] as const;
const DUPLICATE_FILTERS = ["ALL", "ORIGINAL", "DUPLICATE"] as const;

export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request, ["ADMIN", "MANAGER"]);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = request.nextUrl;
    const page = parsePositiveInteger(searchParams.get("page"), 1, 100_000);
    const pageSize = parsePositiveInteger(searchParams.get("pageSize"), 24, 60);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "NEEDS_REVIEW").toUpperCase();
    const role = (searchParams.get("role") || "ALL").toUpperCase();
    const alt = (searchParams.get("alt") || "ALL").toUpperCase();
    const duplicate = (searchParams.get("duplicate") || "ALL").toUpperCase();

    if (page === null || pageSize === null) {
      return errorResponse(
        400,
        "INVALID_PAGINATION",
        "page must be positive and pageSize must be between 1 and 60.",
      );
    }
    if (search.length > 100) {
      return errorResponse(400, "INVALID_SEARCH", "search cannot exceed 100 characters.");
    }
    if (
      status !== "ALL" &&
      !ASSET_REVIEW_STATUSES.includes(status as AssetReviewStatus)
    ) {
      return errorResponse(400, "INVALID_STATUS", "Unknown asset review status.");
    }
    if (role !== "ALL" && !ASSET_ROLES.includes(role as AssetRole)) {
      return errorResponse(400, "INVALID_ROLE", "Unknown asset role.");
    }
    if (!ALT_FILTERS.includes(alt as (typeof ALT_FILTERS)[number])) {
      return errorResponse(400, "INVALID_ALT_FILTER", "Unknown alt-text filter.");
    }
    if (!DUPLICATE_FILTERS.includes(duplicate as (typeof DUPLICATE_FILTERS)[number])) {
      return errorResponse(400, "INVALID_DUPLICATE_FILTER", "Unknown duplicate filter.");
    }

    const filters: Prisma.ProductAssetWhereInput[] = [];
    if (status !== "ALL") filters.push({ reviewStatus: status });
    if (role !== "ALL") filters.push({ role });
    if (alt === "MISSING") {
      filters.push({ OR: [{ altAr: null }, { altAr: "" }, { altEn: null }, { altEn: "" }] });
    } else if (alt === "COMPLETE") {
      filters.push({
        AND: [
          { altAr: { not: null } },
          { altAr: { not: "" } },
          { altEn: { not: null } },
          { altEn: { not: "" } },
        ],
      });
    }
    if (duplicate === "ORIGINAL") filters.push({ duplicateOfId: null });
    if (duplicate === "DUPLICATE") filters.push({ duplicateOfId: { not: null } });
    if (search) {
      filters.push({
        OR: [
          { url: { contains: search } },
          { catalogItem: { sku: { contains: search } } },
          { catalogItem: { nameAr: { contains: search } } },
          { catalogItem: { nameEn: { contains: search } } },
          { family: { nameAr: { contains: search } } },
          { family: { nameEn: { contains: search } } },
        ],
      });
    }
    const where: Prisma.ProductAssetWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [total, assets] = await prisma.$transaction([
      prisma.productAsset.count({ where }),
      prisma.productAsset.findMany({
        where,
        select: {
          id: true,
          url: true,
          mimeType: true,
          width: true,
          height: true,
          bytes: true,
          role: true,
          sortOrder: true,
          altAr: true,
          altEn: true,
          reviewStatus: true,
          duplicateOfId: true,
          createdAt: true,
          duplicateOf: { select: { id: true, url: true } },
          catalogItem: {
            select: {
              id: true,
              sku: true,
              nameAr: true,
              nameEn: true,
              completenessScore: true,
              contentStatus: true,
              category: { select: { id: true, nameAr: true, nameEn: true } },
            },
          },
          family: {
            select: { id: true, nameAr: true, nameEn: true, reviewStatus: true },
          },
        },
        orderBy: [{ duplicateOfId: "desc" }, { createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    return successResponse(
      { assets },
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
    console.error("Error fetching asset review queue:", error);
    return errorResponse(500, "ASSET_QUEUE_FAILED", "Unable to load the asset review queue.");
  }
}
