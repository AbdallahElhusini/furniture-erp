import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import { isGenericCatalogName } from "@/lib/catalog-quality";
import { errorResponse, successResponse } from "@/app/api/data-quality/_shared";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request, ["ADMIN", "MANAGER"]);
  if (unauthorized) return unauthorized;

  try {
    const [
      totalItems,
      needsReviewItems,
      readyItems,
      verifiedItems,
      criticalItems,
      incompleteItems,
      completeItems,
      candidateFamilies,
      approvedFamilies,
      rejectedFamilies,
      totalAssets,
      duplicateAssets,
      unreviewedAssets,
      completeness,
      categoryRows,
      identityRows,
      missingDescriptions,
      missingDimensions,
      missingMaterials,
      missingSuppliers,
    ] = await prisma.$transaction([
      prisma.catalogItem.count(),
      prisma.catalogItem.count({ where: { contentStatus: "NEEDS_REVIEW" } }),
      prisma.catalogItem.count({ where: { contentStatus: "READY" } }),
      prisma.catalogItem.count({ where: { contentStatus: "VERIFIED" } }),
      prisma.catalogItem.count({ where: { completenessScore: { lt: 50 } } }),
      prisma.catalogItem.count({
        where: { completenessScore: { gte: 50, lt: 80 } },
      }),
      prisma.catalogItem.count({ where: { completenessScore: { gte: 80 } } }),
      prisma.productFamily.count({ where: { reviewStatus: "CANDIDATE" } }),
      prisma.productFamily.count({ where: { reviewStatus: "APPROVED" } }),
      prisma.productFamily.count({ where: { reviewStatus: "REJECTED" } }),
      prisma.productAsset.count(),
      prisma.productAsset.count({ where: { duplicateOfId: { not: null } } }),
      prisma.productAsset.count({ where: { reviewStatus: { not: "APPROVED" } } }),
      prisma.catalogItem.aggregate({ _avg: { completenessScore: true } }),
      prisma.category.findMany({
        where: { isActive: true, items: { some: {} } },
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          _count: { select: { items: true, families: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }],
      }),
      prisma.catalogItem.findMany({
        select: { sku: true, nameAr: true, nameEn: true },
      }),
      prisma.catalogItem.count({
        where: {
          OR: [
            { descriptionAr: null },
            { descriptionAr: "" },
            { descriptionEn: null },
            { descriptionEn: "" },
          ],
        },
      }),
      prisma.catalogItem.count({
        where: { OR: [{ dimensions: null }, { dimensions: "" }] },
      }),
      prisma.catalogItem.count({
        where: { OR: [{ material: null }, { material: "" }] },
      }),
      prisma.catalogItem.count({ where: { supplierId: null } }),
    ]);

    const genericIdentityItems = identityRows.filter(isGenericCatalogName).length;

    return successResponse({
      generatedAt: new Date().toISOString(),
      catalog: {
        total: totalItems,
        averageCompleteness: Math.round(completeness._avg.completenessScore || 0),
        contentStatuses: {
          NEEDS_REVIEW: needsReviewItems,
          READY: readyItems,
          VERIFIED: verifiedItems,
        },
        scoreBands: {
          CRITICAL: criticalItems,
          INCOMPLETE: incompleteItems,
          COMPLETE: completeItems,
        },
        missing: {
          IDENTITY: genericIdentityItems,
          DESCRIPTION: missingDescriptions,
          DIMENSIONS: missingDimensions,
          MATERIAL: missingMaterials,
          SUPPLIER: missingSuppliers,
        },
      },
      families: {
        CANDIDATE: candidateFamilies,
        APPROVED: approvedFamilies,
        REJECTED: rejectedFamilies,
      },
      assets: {
        total: totalAssets,
        duplicates: duplicateAssets,
        needsReview: unreviewedAssets,
      },
      categories: categoryRows.map((category) => ({
        id: category.id,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        itemCount: category._count.items,
        familyCount: category._count.families,
      })),
    });
  } catch (error) {
    console.error("Error fetching data-quality overview:", error);
    return errorResponse(500, "OVERVIEW_FAILED", "Unable to load data-quality metrics.");
  }
}
