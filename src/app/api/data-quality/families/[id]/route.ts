import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import {
  errorResponse,
  familyIdentityErrors,
  parseRouteId,
  readJsonObject,
  successResponse,
} from "@/app/api/data-quality/_shared";

export async function GET(
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

    const family = await prisma.productFamily.findUnique({
      where: { id },
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
        items: {
          select: {
            id: true,
            sku: true,
            nameAr: true,
            nameEn: true,
            completenessScore: true,
            contentStatus: true,
          },
          orderBy: { sku: "asc" },
        },
        assets: {
          select: {
            id: true,
            url: true,
            altAr: true,
            altEn: true,
            role: true,
            reviewStatus: true,
            duplicateOfId: true,
            duplicateOf: { select: { id: true, url: true } },
          },
          orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
        },
      },
    });

    if (!family) {
      return errorResponse(404, "FAMILY_NOT_FOUND", "The product family was not found.");
    }

    return successResponse(family);
  } catch (error) {
    console.error("Error fetching product family detail:", error);
    return errorResponse(500, "FAMILY_DETAIL_FAILED", "Unable to load the family detail.");
  }
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
      return errorResponse(400, "INVALID_FAMILY_ID", "The product family ID is invalid.");
    }

    const body = await readJsonObject(request);
    if (!body) return errorResponse(400, "INVALID_JSON", "A JSON object is required.");

    const allowedKeys = new Set(["nameAr", "nameEn", "slug", "expectedUpdatedAt"]);
    const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
      return errorResponse(
        400,
        "UNKNOWN_FIELDS",
        "Only family names and slug can be edited here.",
        Object.fromEntries(unknownKeys.map((key) => [key, "Field is not allowed."])),
      );
    }
    if (
      typeof body.nameAr !== "string" ||
      typeof body.nameEn !== "string" ||
      typeof body.slug !== "string" ||
      typeof body.expectedUpdatedAt !== "string"
    ) {
      return errorResponse(
        422,
        "FAMILY_IDENTITY_REQUIRED",
        "nameAr, nameEn, slug, and expectedUpdatedAt are required.",
      );
    }

    const identity = {
      nameAr: body.nameAr.trim(),
      nameEn: body.nameEn.trim(),
      slug: body.slug.trim(),
    };
    const fields = familyIdentityErrors(identity);
    if (Object.keys(fields).length > 0) {
      return errorResponse(
        422,
        "FAMILY_IDENTITY_NOT_PUBLIC_SAFE",
        "Replace internal candidate labels before approval.",
        fields,
      );
    }

    const expectedUpdatedAt = new Date(body.expectedUpdatedAt);
    if (Number.isNaN(expectedUpdatedAt.getTime())) {
      return errorResponse(422, "INVALID_VERSION", "expectedUpdatedAt is invalid.");
    }

    const duplicateSlug = await prisma.productFamily.findFirst({
      where: { slug: identity.slug, id: { not: id } },
      select: { id: true },
    });
    if (duplicateSlug) {
      return errorResponse(
        409,
        "FAMILY_SLUG_EXISTS",
        "This family slug is already in use.",
        { slug: "Choose a unique slug." },
      );
    }

    const result = await prisma.productFamily.updateMany({
      where: { id, updatedAt: expectedUpdatedAt },
      data: { ...identity, reviewStatus: "CANDIDATE" },
    });
    if (result.count === 0) {
      const exists = await prisma.productFamily.findUnique({ where: { id }, select: { id: true } });
      return exists
        ? errorResponse(
            409,
            "STALE_FAMILY",
            "This family changed in another session. Reload before saving.",
          )
        : errorResponse(404, "FAMILY_NOT_FOUND", "The product family was not found.");
    }

    const updated = await prisma.productFamily.findUnique({
      where: { id },
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
      },
    });
    return successResponse(updated);
  } catch (error) {
    console.error("Error updating product family identity:", error);
    return errorResponse(500, "FAMILY_UPDATE_FAILED", "Unable to update the family identity.");
  }
}
