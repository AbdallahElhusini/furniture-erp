import { NextResponse } from "next/server";

export const FAMILY_REVIEW_STATUSES = [
  "CANDIDATE",
  "APPROVED",
  "REJECTED",
] as const;

export const CONTENT_STATUSES = [
  "NEEDS_REVIEW",
  "READY",
  "VERIFIED",
] as const;

export const ASSET_REVIEW_STATUSES = [
  "NEEDS_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;

export const ASSET_ROLES = ["PRIMARY", "GALLERY", "DETAIL", "LIFESTYLE"] as const;

export type FamilyReviewStatus = (typeof FAMILY_REVIEW_STATUSES)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type AssetReviewStatus = (typeof ASSET_REVIEW_STATUSES)[number];
export type AssetRole = (typeof ASSET_ROLES)[number];

export function successResponse<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
      },
    },
    { status },
  );
}

export function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number | null {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return null;
  }

  return parsed;
}

export function parseRouteId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isFamilyReviewStatus(
  value: unknown,
): value is FamilyReviewStatus {
  return (
    typeof value === "string" &&
    FAMILY_REVIEW_STATUSES.includes(value as FamilyReviewStatus)
  );
}

export function isContentStatus(value: unknown): value is ContentStatus {
  return (
    typeof value === "string" &&
    CONTENT_STATUSES.includes(value as ContentStatus)
  );
}

export function isAssetReviewStatus(
  value: unknown,
): value is AssetReviewStatus {
  return (
    typeof value === "string" &&
    ASSET_REVIEW_STATUSES.includes(value as AssetReviewStatus)
  );
}

export function isAssetRole(value: unknown): value is AssetRole {
  return typeof value === "string" && ASSET_ROLES.includes(value as AssetRole);
}

export function familyIdentityErrors(input: {
  nameAr: string;
  nameEn: string;
  slug: string;
}) {
  const fields: Record<string, string> = {};
  const nameAr = input.nameAr.trim();
  const nameEn = input.nameEn.trim();
  const slug = input.slug.trim();

  if (nameAr.length < 3 || nameAr.length > 160) {
    fields.nameAr = "Arabic name must contain 3 to 160 characters.";
  } else if (/(?:مرشح|مرشحة|مؤقت|تجريبي|عنصر\s*نائب)/i.test(nameAr)) {
    fields.nameAr = "Replace the internal candidate label with a public-facing name.";
  }

  if (nameEn.length < 3 || nameEn.length > 160) {
    fields.nameEn = "English name must contain 3 to 160 characters.";
  } else if (/\b(?:candidate|placeholder|temporary|draft)\b/i.test(nameEn)) {
    fields.nameEn = "Replace the internal candidate label with a public-facing name.";
  }

  if (slug.length < 3 || slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fields.slug = "Slug must use 3 to 120 lowercase letters, numbers, and single hyphens.";
  } else if (/^(?:single|candidate|placeholder|temporary|draft|import|batch)-/i.test(slug)) {
    fields.slug = "Replace the internal candidate slug with a public-facing slug.";
  }

  return fields;
}
