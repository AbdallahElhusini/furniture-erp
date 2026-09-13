import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import {
  calculateCatalogCompleteness,
  catalogContentStatus,
  isGenericCatalogName,
} from "@/lib/catalog-quality";
import {
  approvedSafeCatalogAssets,
  hasPublishableCatalogAsset,
} from "@/lib/catalog-publication";
import {
  errorResponse,
  parseRouteId,
  readJsonObject,
  successResponse,
} from "@/app/api/data-quality/_shared";

const EDITABLE_FIELDS = [
  "nameAr",
  "nameEn",
  "descriptionAr",
  "descriptionEn",
  "dimensions",
  "material",
  "color",
  "specifications",
  "sellingPrice",
  "leadTimeDays",
] as const;

const REVIEW_ACTIONS = ["VERIFY", "RETURN_TO_REVIEW"] as const;
type ReviewAction = (typeof REVIEW_ACTIONS)[number];
type EditableField = (typeof EDITABLE_FIELDS)[number];

interface CatalogUpdateData {
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  dimensions?: string | null;
  material?: string | null;
  color?: string | null;
  specifications?: string | null;
  sellingPrice?: number;
  leadTimeDays?: number;
  completenessScore?: number;
  contentStatus?: "NEEDS_REVIEW" | "READY" | "VERIFIED";
  lastReviewedAt?: Date | null;
}

const STRING_LIMITS: Record<
  Exclude<EditableField, "sellingPrice" | "leadTimeDays">,
  number
> = {
  nameAr: 160,
  nameEn: 160,
  descriptionAr: 5_000,
  descriptionEn: 5_000,
  dimensions: 255,
  material: 255,
  color: 255,
  specifications: 10_000,
};

function normalizedOptionalString(
  value: unknown,
  maximum: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Must be text or null." };
  const trimmed = value.trim();
  if (trimmed.length > maximum) {
    return { ok: false, error: `Must not exceed ${maximum} characters.` };
  }
  return { ok: true, value: trimmed || null };
}

function validateFields(body: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const data: CatalogUpdateData = {};

  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];

    if (field === "sellingPrice") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1_000_000_000
      ) {
        errors[field] = "Must be a number between 0 and 1,000,000,000.";
      } else {
        data.sellingPrice = value;
      }
      continue;
    }

    if (field === "leadTimeDays") {
      if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > 3_650
      ) {
        errors[field] = "Must be a whole number between 0 and 3,650.";
      } else {
        data.leadTimeDays = value;
      }
      continue;
    }

    const normalized = normalizedOptionalString(value, STRING_LIMITS[field]);
    if (!normalized.ok) {
      errors[field] = normalized.error;
      continue;
    }

    if ((field === "nameAr" || field === "nameEn") && !normalized.value) {
      errors[field] = "A product name cannot be empty.";
      continue;
    }

    if (field === "specifications" && normalized.value) {
      try {
        const parsed: unknown = JSON.parse(normalized.value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          errors[field] = "Specifications must be a valid JSON object.";
          continue;
        }
        data.specifications = JSON.stringify(parsed);
      } catch {
        errors[field] = "Specifications must be valid JSON.";
      }
      continue;
    }

    switch (field) {
      case "nameAr":
        data.nameAr = normalized.value as string;
        break;
      case "nameEn":
        data.nameEn = normalized.value as string;
        break;
      case "descriptionAr":
        data.descriptionAr = normalized.value;
        break;
      case "descriptionEn":
        data.descriptionEn = normalized.value;
        break;
      case "dimensions":
        data.dimensions = normalized.value;
        break;
      case "material":
        data.material = normalized.value;
        break;
      case "color":
        data.color = normalized.value;
        break;
    }
  }

  return { data, errors };
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
    if (!id) {
      return errorResponse(400, "INVALID_ITEM_ID", "The catalog item ID is invalid.");
    }

    const body = await readJsonObject(request);
    if (!body) {
      return errorResponse(400, "INVALID_JSON", "A JSON object is required.");
    }

    const allowedKeys = new Set<string>([
      ...EDITABLE_FIELDS,
      "tagIds",
      "reviewAction",
      "expectedUpdatedAt",
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

    if (typeof body.expectedUpdatedAt !== "string") {
      return errorResponse(
        422,
        "INVALID_EXPECTED_UPDATED_AT",
        "expectedUpdatedAt must match the version shown in the workbench.",
      );
    }
    const expectedUpdatedAt = new Date(body.expectedUpdatedAt);
    if (Number.isNaN(expectedUpdatedAt.getTime())) {
      return errorResponse(
        422,
        "INVALID_EXPECTED_UPDATED_AT",
        "expectedUpdatedAt must be a valid timestamp.",
      );
    }

    const reviewAction = body.reviewAction;
    if (
      reviewAction !== undefined &&
      (typeof reviewAction !== "string" ||
        !REVIEW_ACTIONS.includes(reviewAction as ReviewAction))
    ) {
      return errorResponse(400, "INVALID_REVIEW_ACTION", "Unknown review action.");
    }

    const fieldKeys = EDITABLE_FIELDS.filter((field) => field in body);
    const hasTagIds = "tagIds" in body;
    if ((fieldKeys.length > 0 || hasTagIds) && reviewAction !== undefined) {
      return errorResponse(
        400,
        "MIXED_OPERATION",
        "Save content changes before changing the review status.",
      );
    }
    if (fieldKeys.length === 0 && !hasTagIds && reviewAction === undefined) {
      return errorResponse(400, "EMPTY_UPDATE", "No editable fields were supplied.");
    }

    const { data: validatedData, errors } = validateFields(body);
    if (Object.keys(errors).length > 0) {
      return errorResponse(422, "VALIDATION_FAILED", "Some fields are invalid.", errors);
    }

    let tagIds: number[] | undefined;
    if (hasTagIds) {
      if (
        !Array.isArray(body.tagIds) ||
        body.tagIds.length > 50 ||
        body.tagIds.some((value) => !Number.isSafeInteger(value) || Number(value) < 1)
      ) {
        return errorResponse(
          422,
          "INVALID_TAGS",
          "tagIds must be an array of up to 50 positive integer IDs.",
          { tagIds: "Select tags from the controlled vocabulary." },
        );
      }
      tagIds = [...new Set(body.tagIds as number[])];
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      const current = await tx.catalogItem.findUnique({
        where: { id },
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
          completenessScore: true,
          contentStatus: true,
          updatedAt: true,
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

      if (!current) return { kind: "NOT_FOUND" } as const;
      if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        return { kind: "STALE" } as const;
      }

      if (tagIds !== undefined) {
        const existingTagCount = await tx.tag.count({ where: { id: { in: tagIds } } });
        if (existingTagCount !== tagIds.length) {
          return { kind: "UNKNOWN_TAGS" } as const;
        }
      }

      const merged = { ...current, ...validatedData };
      const approvedAssets = approvedSafeCatalogAssets(current.assets);
      const reviewedAltCount = approvedAssets.filter(
        (asset) => Boolean(asset.altAr?.trim()) && Boolean(asset.altEn?.trim()),
      ).length;
      const completenessScore = calculateCatalogCompleteness({
        sku: merged.sku,
        categoryId: merged.categoryId,
        nameAr: merged.nameAr,
        nameEn: merged.nameEn,
        dimensions: merged.dimensions,
        material: merged.material,
        color: merged.color,
        specifications: merged.specifications,
        sellingPrice: merged.sellingPrice,
        leadTimeDays: merged.leadTimeDays,
        supplierId: merged.supplierId,
        descriptionAr: merged.descriptionAr,
        descriptionEn: merged.descriptionEn,
        imageCount: approvedAssets.length,
        reviewedAltCount,
      });
      const calculatedStatus = catalogContentStatus({
        sku: merged.sku,
        nameAr: merged.nameAr,
        nameEn: merged.nameEn,
        completenessScore,
      });
      validatedData.completenessScore = completenessScore;

      if (reviewAction === "VERIFY") {
        if (!hasPublishableCatalogAsset(current.assets)) {
          return { kind: "PUBLISHABLE_ASSET_REQUIRED" } as const;
        }
        if (completenessScore < 80 || isGenericCatalogName(merged)) {
          return { kind: "NOT_READY" } as const;
        }
        validatedData.contentStatus = "VERIFIED";
        validatedData.lastReviewedAt = new Date();
      } else if (reviewAction === "RETURN_TO_REVIEW") {
        validatedData.contentStatus = calculatedStatus;
        validatedData.lastReviewedAt = null;
      } else {
        validatedData.contentStatus = calculatedStatus;
        validatedData.lastReviewedAt = null;
      }

      const scalarUpdateData: Prisma.CatalogItemUpdateManyMutationInput = {
        ...validatedData,
      };
      const claim = await tx.catalogItem.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data: scalarUpdateData,
      });
      if (claim.count === 0) return { kind: "STALE" } as const;

      if (tagIds !== undefined) {
        await tx.catalogItem.update({
          where: { id },
          data: { tags: { set: tagIds.map((tagId) => ({ id: tagId })) } },
        });
      }

      const updated = await tx.catalogItem.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          sku: true,
          nameAr: true,
          nameEn: true,
          completenessScore: true,
          contentStatus: true,
          lastReviewedAt: true,
          updatedAt: true,
        },
      });
      return { kind: "UPDATED", updated } as const;
    });

    if (transactionResult.kind === "NOT_FOUND") {
      return errorResponse(404, "ITEM_NOT_FOUND", "The catalog item was not found.");
    }
    if (transactionResult.kind === "STALE") {
      return errorResponse(
        409,
        "STALE_ITEM_STATE",
        "This catalog item changed in another session. Reload before saving.",
      );
    }
    if (transactionResult.kind === "UNKNOWN_TAGS") {
      return errorResponse(
        422,
        "UNKNOWN_TAGS",
        "One or more selected tags do not exist.",
        { tagIds: "Reload the controlled tag list and try again." },
      );
    }
    if (transactionResult.kind === "PUBLISHABLE_ASSET_REQUIRED") {
      return errorResponse(
        422,
        "PUBLISHABLE_ASSET_REQUIRED",
        "Verify at least one safe, non-duplicate product asset with Arabic and English alt text first.",
      );
    }
    if (transactionResult.kind === "NOT_READY") {
      return errorResponse(
        422,
        "ITEM_NOT_READY",
        "Only non-generic products with at least 80% completeness can be verified.",
      );
    }

    return successResponse(transactionResult.updated);
  } catch (error) {
    console.error("Error updating catalog item quality:", error);
    return errorResponse(500, "ITEM_UPDATE_FAILED", "Unable to update the catalog item.");
  }
}
