import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import {
  FAMILY_REVIEW_STATUSES,
  errorResponse,
  parsePositiveInteger,
  successResponse,
  type FamilyReviewStatus,
} from "@/app/api/data-quality/_shared";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request, ["ADMIN", "MANAGER"]);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = request.nextUrl;
    const page = parsePositiveInteger(searchParams.get("page"), 1, 100_000);
    const pageSize = parsePositiveInteger(searchParams.get("pageSize"), 12, 48);
    const categoryIdValue = searchParams.get("categoryId");
    const categoryId = categoryIdValue
      ? parsePositiveInteger(categoryIdValue, 1, Number.MAX_SAFE_INTEGER)
      : undefined;
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "CANDIDATE").toUpperCase();

    if (page === null || pageSize === null) {
      return errorResponse(
        400,
        "INVALID_PAGINATION",
        "page must be positive and pageSize must be between 1 and 48.",
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
      !FAMILY_REVIEW_STATUSES.includes(status as FamilyReviewStatus)
    ) {
      return errorResponse(400, "INVALID_STATUS", "Unknown family review status.");
    }

    const filters: Prisma.ProductFamilyWhereInput[] = [];
    if (status !== "ALL") filters.push({ reviewStatus: status });
    if (categoryId) filters.push({ categoryId });
    if (search) {
      filters.push({
        OR: [
          { nameAr: { contains: search } },
          { nameEn: { contains: search } },
          { sourceKey: { contains: search } },
          { items: { some: { sku: { contains: search } } } },
        ],
      });
    }
    const where: Prisma.ProductFamilyWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [total, families] = await prisma.$transaction([
      prisma.productFamily.count({ where }),
      prisma.productFamily.findMany({
        where,
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          slug: true,
          sourceKey: true,
          reviewStatus: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { id: true, nameAr: true, nameEn: true } },
          _count: { select: { items: true, assets: true } },
          assets: {
            select: { id: true, url: true, altAr: true, altEn: true, role: true },
            orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
            take: 4,
          },
          items: {
            select: {
              id: true,
              sku: true,
              nameAr: true,
              nameEn: true,
              completenessScore: true,
            },
            orderBy: { sku: "asc" },
            take: 4,
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    return successResponse(
      { families },
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
    console.error("Error fetching product families for review:", error);
    return errorResponse(500, "FAMILY_QUEUE_FAILED", "Unable to load the family review queue.");
  }
}
