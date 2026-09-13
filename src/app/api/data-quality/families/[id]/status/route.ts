import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import {
  errorResponse,
  familyIdentityErrors,
  isFamilyReviewStatus,
  parseRouteId,
  readJsonObject,
  successResponse,
  type FamilyReviewStatus,
} from "@/app/api/data-quality/_shared";

const ALLOWED_TRANSITIONS: Record<FamilyReviewStatus, readonly FamilyReviewStatus[]> = {
  CANDIDATE: ["APPROVED", "REJECTED"],
  APPROVED: ["CANDIDATE"],
  REJECTED: ["CANDIDATE"],
};

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
      return errorResponse(400, "INVALID_FAMILY_ID", "The product family ID is invalid.");
    }

    const body = await readJsonObject(request);
    if (!body) {
      return errorResponse(400, "INVALID_JSON", "A JSON object is required.");
    }
    const unknownKeys = Object.keys(body).filter(
      (key) => key !== "reviewStatus" && key !== "expectedStatus",
    );
    if (unknownKeys.length > 0) {
      return errorResponse(
        400,
        "UNKNOWN_FIELDS",
        "Only reviewStatus and expectedStatus are accepted.",
        Object.fromEntries(unknownKeys.map((key) => [key, "Field is not allowed."])),
      );
    }
    if (!isFamilyReviewStatus(body.reviewStatus)) {
      return errorResponse(
        422,
        "INVALID_REVIEW_STATUS",
        "reviewStatus must be CANDIDATE, APPROVED, or REJECTED.",
      );
    }
    if (!isFamilyReviewStatus(body.expectedStatus)) {
      return errorResponse(
        422,
        "INVALID_EXPECTED_STATUS",
        "expectedStatus must match the status currently shown in the workbench.",
      );
    }

    const reviewStatus = body.reviewStatus;
    const expectedStatus = body.expectedStatus;
    if (!ALLOWED_TRANSITIONS[expectedStatus].includes(reviewStatus)) {
      return errorResponse(
        409,
        "INVALID_STATUS_TRANSITION",
        "Approved or rejected families must return to candidate before the opposite decision.",
      );
    }

    if (reviewStatus === "APPROVED") {
      const identity = await prisma.productFamily.findUnique({
        where: { id },
        select: { nameAr: true, nameEn: true, slug: true },
      });
      if (!identity) {
        return errorResponse(404, "FAMILY_NOT_FOUND", "The product family was not found.");
      }
      const fields = familyIdentityErrors(identity);
      if (Object.keys(fields).length > 0) {
        return errorResponse(
          422,
          "FAMILY_IDENTITY_NOT_PUBLIC_SAFE",
          "Replace internal candidate labels before approving this family.",
          fields,
        );
      }
    }

    const result = await prisma.productFamily.updateMany({
      where: { id, reviewStatus: expectedStatus },
      data: { reviewStatus },
    });

    if (result.count === 0) {
      const current = await prisma.productFamily.findUnique({
        where: { id },
        select: { reviewStatus: true },
      });
      if (!current) {
        return errorResponse(404, "FAMILY_NOT_FOUND", "The product family was not found.");
      }
      return errorResponse(
        409,
        "STALE_REVIEW_STATE",
        "This family was changed in another session. Reload it before deciding.",
      );
    }

    const updated = await prisma.productFamily.findUnique({
      where: { id },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        reviewStatus: true,
        updatedAt: true,
        _count: { select: { items: true, assets: true } },
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("Error updating family review status:", error);
    return errorResponse(500, "FAMILY_STATUS_FAILED", "Unable to update the family status.");
  }
}
