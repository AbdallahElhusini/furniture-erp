import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import {
  calculateCatalogCompleteness,
  catalogContentStatus,
} from "@/lib/catalog-quality";
import {
  approvedSafeProductMediaAssets,
} from "@/lib/catalog-publication";
import { isSafeProductMediaSource } from "@/lib/product-media";
import {
  errorResponse,
  isAssetReviewStatus,
  isAssetRole,
  parseRouteId,
  readJsonObject,
  successResponse,
  type AssetReviewStatus,
  type AssetRole,
} from "@/app/api/data-quality/_shared";

const REVIEW_ACTIONS = ["APPROVE", "REJECT", "REOPEN"] as const;
type ReviewAction = (typeof REVIEW_ACTIONS)[number];

const TRANSITIONS: Record<
  AssetReviewStatus,
  Partial<Record<ReviewAction, AssetReviewStatus>>
> = {
  NEEDS_REVIEW: { APPROVE: "APPROVED", REJECT: "REJECTED" },
  APPROVED: { REOPEN: "NEEDS_REVIEW" },
  REJECTED: { REOPEN: "NEEDS_REVIEW" },
};

function normalizeAlt(value: unknown) {
  if (value === null) return { ok: true as const, value: null };
  if (typeof value !== "string") {
    return { ok: false as const, error: "Alt text must be text or null." };
  }
  const trimmed = value.trim();
  if (trimmed.length > 300) {
    return { ok: false as const, error: "Alt text must not exceed 300 characters." };
  }
  return { ok: true as const, value: trimmed || null };
}

function isExpectedAlt(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 300);
}

async function recalculateLinkedItem(catalogItemId: number | null) {
  if (!catalogItemId) return;
  const item = await prisma.catalogItem.findUnique({
    where: { id: catalogItemId },
    select: {
      id: true,
      sku: true,
      categoryId: true,
      nameAr: true,
      nameEn: true,
      dimensions: true,
      material: true,
      color: true,
      specifications: true,
      sellingPrice: true,
      leadTimeDays: true,
      supplierId: true,
      descriptionAr: true,
      descriptionEn: true,
      assets: {
        select: {
          url: true,
          altAr: true,
          altEn: true,
          reviewStatus: true,
          duplicateOfId: true,
        },
      },
    },
  });
  if (!item) return;

  const approvedAssets = approvedSafeProductMediaAssets(item.assets).filter(
    (asset) => asset.kind === "IMAGE",
  );
  const reviewedAltCount = approvedAssets.filter(
    (asset) =>
      Boolean(asset.altAr?.trim()) &&
      Boolean(asset.altEn?.trim()),
  ).length;
  const completenessScore = calculateCatalogCompleteness({
    ...item,
    imageCount: approvedAssets.length,
    reviewedAltCount,
  });
  const contentStatus = catalogContentStatus({
    sku: item.sku,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    completenessScore,
  });
  await prisma.catalogItem.update({
    where: { id: item.id },
    data: { completenessScore, contentStatus, lastReviewedAt: null },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = requireApiSession(request, ["ADMIN", "MANAGER"]);
  if (unauthorized) return unauthorized;

  try {
    const { id: rawId } = await params;
    const id = parseRouteId(rawId);
    if (!id) return errorResponse(400, "INVALID_ASSET_ID", "The asset ID is invalid.");

    const body = await readJsonObject(request);
    if (!body) return errorResponse(400, "INVALID_JSON", "A JSON object is required.");
    const allowedKeys = new Set([
      "altAr",
      "altEn",
      "role",
      "reviewAction",
      "expectedAltAr",
      "expectedAltEn",
      "expectedRole",
      "expectedStatus",
    ]);
    const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
      return errorResponse(
        400,
        "UNKNOWN_FIELDS",
        "The request contains fields that cannot be edited here.",
        Object.fromEntries(unknownKeys.map((key) => [key, "Field is not allowed."])),
      );
    }
    if (!isAssetReviewStatus(body.expectedStatus)) {
      return errorResponse(
        422,
        "INVALID_EXPECTED_STATUS",
        "expectedStatus must match the status shown in the workbench.",
      );
    }
    if (!("expectedAltAr" in body) || !isExpectedAlt(body.expectedAltAr)) {
      return errorResponse(
        422,
        "INVALID_EXPECTED_ALT_AR",
        "expectedAltAr must match the Arabic alt text shown in the workbench.",
      );
    }
    if (!("expectedAltEn" in body) || !isExpectedAlt(body.expectedAltEn)) {
      return errorResponse(
        422,
        "INVALID_EXPECTED_ALT_EN",
        "expectedAltEn must match the English alt text shown in the workbench.",
      );
    }
    if (!isAssetRole(body.expectedRole)) {
      return errorResponse(
        422,
        "INVALID_EXPECTED_ROLE",
        "expectedRole must match the role shown in the workbench.",
      );
    }

    const current = await prisma.productAsset.findUnique({
      where: { id },
      select: {
        id: true,
        catalogItemId: true,
        url: true,
        altAr: true,
        altEn: true,
        role: true,
        reviewStatus: true,
        duplicateOfId: true,
      },
    });
    if (!current) return errorResponse(404, "ASSET_NOT_FOUND", "The asset was not found.");
    if (
      current.reviewStatus !== body.expectedStatus ||
      current.altAr !== body.expectedAltAr ||
      current.altEn !== body.expectedAltEn ||
      current.role !== body.expectedRole
    ) {
      return errorResponse(
        409,
        "STALE_ASSET_STATE",
        "This asset changed in another session. Reload before saving.",
      );
    }

    const expectedState = {
      id,
      altAr: body.expectedAltAr,
      altEn: body.expectedAltEn,
      role: body.expectedRole,
      reviewStatus: body.expectedStatus,
    };

    if (body.reviewAction !== undefined) {
      if (
        typeof body.reviewAction !== "string" ||
        !REVIEW_ACTIONS.includes(body.reviewAction as ReviewAction)
      ) {
        return errorResponse(422, "INVALID_REVIEW_ACTION", "Unknown asset review action.");
      }
      if (Object.keys(body).some((key) => ["altAr", "altEn", "role"].includes(key))) {
        return errorResponse(
          400,
          "MIXED_OPERATION",
          "Save asset metadata before changing its review status.",
        );
      }

      const reviewAction = body.reviewAction as ReviewAction;
      const nextStatus = TRANSITIONS[current.reviewStatus as AssetReviewStatus][reviewAction];
      if (!nextStatus) {
        return errorResponse(
          409,
          "INVALID_STATUS_TRANSITION",
          "Approved or rejected assets must be reopened before the opposite decision.",
        );
      }
      if (reviewAction === "APPROVE" && (!current.altAr?.trim() || !current.altEn?.trim())) {
        return errorResponse(
          422,
          "ALT_TEXT_REQUIRED",
          "Arabic and English alt text are required before approval.",
          {
            ...(!current.altAr?.trim() ? { altAr: "Arabic alt text is required." } : {}),
            ...(!current.altEn?.trim() ? { altEn: "English alt text is required." } : {}),
          },
        );
      }
      if (
        reviewAction === "APPROVE" &&
        (current.duplicateOfId !== null || !isSafeProductMediaSource(current.url))
      ) {
        return errorResponse(
          422,
          "UNSAFE_ASSET",
          "Only non-duplicate, validated product image or video sources can be approved for publication.",
        );
      }

      const result = await prisma.productAsset.updateMany({
        where: expectedState,
        data: { reviewStatus: nextStatus },
      });
      if (result.count === 0) {
        return errorResponse(
          409,
          "STALE_ASSET_STATE",
          "This asset changed in another session. Reload before deciding.",
        );
      }
    } else {
      const fields: Record<string, string> = {};
      const data: { altAr?: string | null; altEn?: string | null; role?: AssetRole; reviewStatus: string } = {
        reviewStatus: "NEEDS_REVIEW",
      };

      if ("altAr" in body) {
        const normalized = normalizeAlt(body.altAr);
        if (normalized.ok) data.altAr = normalized.value;
        else fields.altAr = normalized.error;
      }
      if ("altEn" in body) {
        const normalized = normalizeAlt(body.altEn);
        if (normalized.ok) data.altEn = normalized.value;
        else fields.altEn = normalized.error;
      }
      if ("role" in body) {
        if (isAssetRole(body.role)) data.role = body.role;
        else fields.role = "Role must be PRIMARY, GALLERY, DETAIL, or LIFESTYLE.";
      }
      if (!("altAr" in body) && !("altEn" in body) && !("role" in body)) {
        return errorResponse(400, "EMPTY_UPDATE", "No editable asset fields were supplied.");
      }
      if (Object.keys(fields).length > 0) {
        return errorResponse(422, "VALIDATION_FAILED", "Some asset fields are invalid.", fields);
      }

      const result = await prisma.productAsset.updateMany({
        where: expectedState,
        data,
      });
      if (result.count === 0) {
        return errorResponse(
          409,
          "STALE_ASSET_STATE",
          "This asset changed in another session. Reload before saving.",
        );
      }
      if (data.role === "PRIMARY" && current.catalogItemId) {
        await prisma.productAsset.updateMany({
          where: { catalogItemId: current.catalogItemId, id: { not: id }, role: "PRIMARY" },
          data: { role: "GALLERY", reviewStatus: "NEEDS_REVIEW" },
        });
      }
    }

    await recalculateLinkedItem(current.catalogItemId);
    const updated = await prisma.productAsset.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        altAr: true,
        altEn: true,
        role: true,
        reviewStatus: true,
        duplicateOfId: true,
        catalogItem: {
          select: { id: true, sku: true, completenessScore: true, contentStatus: true },
        },
      },
    });
    return successResponse(updated);
  } catch (error) {
    console.error("Error updating product asset review:", error);
    return errorResponse(500, "ASSET_UPDATE_FAILED", "Unable to update the asset.");
  }
}
