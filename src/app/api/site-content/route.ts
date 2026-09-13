import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { SITE_CONTENT_CACHE_TAG } from "@/lib/site-content-server";
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readBoundedJson,
} from "@/lib/public-request-security";
import {
  SITE_CONTENT_DEFINITIONS,
  SITE_CONTENT_DEFINITION_BY_KEY,
  isSafeSiteLink,
  isSafeSiteMediaPath,
  type RegisteredSiteContentType,
  type SiteContentDefinition,
} from "@/lib/site-content-registry";

export const dynamic = "force-dynamic";

const MAX_UPDATE_ENTRIES = 500;
const MAX_UPDATE_BODY_BYTES = 1024 * 1024;

class ContentValidationError extends Error {}

interface NormalizedContentUpdate {
  key: string;
  definition: SiteContentDefinition;
  valueAr: string | null;
  valueEn: string | null;
  mediaUrl: string | null;
  altAr: string | null;
  altEn: string | null;
  linkUrl: string | null;
  metadata: string | null;
  isActive: boolean;
}

function nullableString(
  value: unknown,
  field: string,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ContentValidationError(`${field} must be a string or null.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximumLength) {
    throw new ContentValidationError(
      `${field} must not exceed ${maximumLength} characters.`,
    );
  }
  return normalized;
}

function normalizeMetadata(value: unknown, key: string): string | null {
  const source = nullableString(value, `${key}.metadata`, 4_000);
  if (!source) return null;
  try {
    const parsed = JSON.parse(source) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Metadata must be an object.");
    }
    return JSON.stringify(parsed);
  } catch {
    throw new ContentValidationError(`${key}.metadata must contain a JSON object.`);
  }
}

function isMediaType(
  type: RegisteredSiteContentType,
): type is "IMAGE" | "VIDEO" | "BANNER" {
  return type === "IMAGE" || type === "VIDEO" || type === "BANNER";
}

function normalizeEntry(value: unknown): NormalizedContentUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContentValidationError("Each content entry must be an object.");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.key !== "string") {
    throw new ContentValidationError("Each content entry requires a key.");
  }
  const definition = SITE_CONTENT_DEFINITION_BY_KEY.get(input.key);
  if (!definition) {
    throw new ContentValidationError(`Unregistered content key: ${input.key}`);
  }

  const textLimit = definition.type === "TEXT" ? 300 : 4_000;
  const valueAr = nullableString(input.valueAr, `${definition.key}.valueAr`, textLimit);
  const valueEn = nullableString(input.valueEn, `${definition.key}.valueEn`, textLimit);
  const altAr = nullableString(input.altAr, `${definition.key}.altAr`, 300);
  const altEn = nullableString(input.altEn, `${definition.key}.altEn`, 300);
  const rawMediaUrl = nullableString(
    input.mediaUrl,
    `${definition.key}.mediaUrl`,
    1_000,
  );
  const rawLinkUrl = nullableString(
    input.linkUrl,
    `${definition.key}.linkUrl`,
    500,
  );

  if (rawMediaUrl && !isMediaType(definition.type)) {
    throw new ContentValidationError(`${definition.key} is not a media slot.`);
  }
  if (
    rawMediaUrl &&
    isMediaType(definition.type) &&
    !isSafeSiteMediaPath(rawMediaUrl, definition.type)
  ) {
    throw new ContentValidationError(
      `${definition.key}.mediaUrl must be a same-origin image or video under /images, /media, or /uploads.`,
    );
  }
  if (rawLinkUrl && !isSafeSiteLink(rawLinkUrl)) {
    throw new ContentValidationError(
      `${definition.key}.linkUrl must be a same-origin path.`,
    );
  }
  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    throw new ContentValidationError(`${definition.key}.isActive must be boolean.`);
  }

  return {
    key: definition.key,
    definition,
    valueAr,
    valueEn,
    mediaUrl: rawMediaUrl,
    altAr,
    altEn,
    linkUrl: rawLinkUrl,
    metadata: normalizeMetadata(input.metadata, definition.key),
    isActive: input.isActive !== false,
  };
}

function hasOverride(record: {
  valueAr: string | null;
  valueEn: string | null;
  mediaUrl: string | null;
  altAr: string | null;
  altEn: string | null;
  linkUrl: string | null;
  metadata: string | null;
  isActive: boolean;
}) {
  return (
    !record.isActive ||
    Boolean(
      record.valueAr ||
        record.valueEn ||
        record.mediaUrl ||
        record.altAr ||
        record.altEn ||
        record.linkUrl ||
        record.metadata,
    )
  );
}

export async function GET(request: NextRequest) {
  const authorization = await requireLiveAdminSession(request, ["ADMIN"]);
  if (authorization.response) return authorization.response;

  try {
    const records = await prisma.siteContent.findMany({
      where: {
        key: { in: SITE_CONTENT_DEFINITIONS.map((definition) => definition.key) },
      },
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { key: "asc" }],
    });
    const recordByKey = new Map(records.map((record) => [record.key, record]));

    return NextResponse.json({
      entries: SITE_CONTENT_DEFINITIONS.map((definition) => {
        const record = recordByKey.get(definition.key);
        return {
          key: definition.key,
          group: definition.group,
          type: definition.type,
          label: definition.label,
          valueAr: record?.valueAr ?? null,
          valueEn: record?.valueEn ?? null,
          mediaUrl: record?.mediaUrl ?? null,
          altAr: record?.altAr ?? null,
          altEn: record?.altEn ?? null,
          linkUrl: record?.linkUrl ?? null,
          metadata: record?.metadata ?? null,
          isActive: record?.isActive ?? true,
          sortOrder: definition.sortOrder,
          defaultValueAr: definition.valueAr ?? null,
          defaultValueEn: definition.valueEn ?? null,
          defaultMediaUrl: definition.mediaUrl ?? null,
          defaultAltAr: definition.altAr ?? null,
          defaultAltEn: definition.altEn ?? null,
          defaultLinkUrl: definition.linkUrl ?? null,
          defaultMetadata: definition.metadata ?? null,
          customized: record ? hasOverride(record) : false,
        };
      }),
    });
  } catch (error) {
    console.error("Unable to load registered site content.", error);
    return NextResponse.json(
      { error: "تعذّر تحميل محتوى الموقع." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const authorization = await requireLiveAdminSession(request, ["ADMIN"]);
  if (authorization.response) return authorization.response;

  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.startsWith("application/json")) {
      return NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 415 },
      );
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(request, MAX_UPDATE_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          { error: "حجم تحديث المحتوى أكبر من الحد المسموح." },
          { status: 413 },
        );
      }
      if (error instanceof InvalidJsonBodyError) {
        return NextResponse.json(
          { error: "بيانات JSON غير صحيحة." },
          { status: 400 },
        );
      }
      throw error;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ContentValidationError("Request body must be an object.");
    }
    const entriesValue = (payload as Record<string, unknown>).entries;
    if (!Array.isArray(entriesValue) || entriesValue.length === 0) {
      throw new ContentValidationError("At least one content entry is required.");
    }
    if (entriesValue.length > MAX_UPDATE_ENTRIES) {
      throw new ContentValidationError(
        `A maximum of ${MAX_UPDATE_ENTRIES} entries can be updated at once.`,
      );
    }

    const normalized = entriesValue.map(normalizeEntry);
    if (new Set(normalized.map((entry) => entry.key)).size !== normalized.length) {
      throw new ContentValidationError("Duplicate content keys are not allowed.");
    }

    const existing = await prisma.siteContent.findMany({
      where: { key: { in: normalized.map((entry) => entry.key) } },
    });
    const existingByKey = new Map(existing.map((record) => [record.key, record]));

    await prisma.$transaction(async (transaction) => {
      for (const entry of normalized) {
        const canonicalData = {
          group: entry.definition.group,
          type: entry.definition.type,
          label: entry.definition.label,
          valueAr: entry.valueAr,
          valueEn: entry.valueEn,
          mediaUrl: entry.mediaUrl,
          altAr: entry.altAr,
          altEn: entry.altEn,
          linkUrl: entry.linkUrl,
          metadata: entry.metadata,
          isActive: entry.isActive,
          sortOrder: entry.definition.sortOrder,
        };
        await transaction.siteContent.upsert({
          where: { key: entry.key },
          create: { key: entry.key, ...canonicalData },
          update: canonicalData,
        });
      }

      await transaction.dataTransferJob.create({
        data: {
          kind: "CONTENT_UPDATE",
          scope: "CONTENT",
          module: "SITE_CONTENT",
          status: "SUCCESS",
          rowCount: normalized.length,
          updatedCount: normalized.length,
          actorId: authorization.user.id,
          actorEmail: authorization.user.email,
          completedAt: new Date(),
          errors: "[]",
          summary: JSON.stringify({
            keys: normalized.map((entry) => entry.key),
            groups: Array.from(
              new Set(normalized.map((entry) => entry.definition.group)),
            ),
          }),
          changes: {
            create: normalized.map((entry) => ({
              module: "SITE_CONTENT",
              recordKey: entry.key,
              action: existingByKey.has(entry.key) ? "UPDATE" : "INSERT",
              beforeData: existingByKey.has(entry.key)
                ? JSON.stringify(existingByKey.get(entry.key))
                : null,
              afterData: JSON.stringify({
                key: entry.key,
                valueAr: entry.valueAr,
                valueEn: entry.valueEn,
                mediaUrl: entry.mediaUrl,
                altAr: entry.altAr,
                altEn: entry.altEn,
                linkUrl: entry.linkUrl,
                metadata: entry.metadata,
                isActive: entry.isActive,
              }),
              actorId: authorization.user.id,
              actorEmail: authorization.user.email,
            })),
          },
        },
      });
    });

    revalidateTag(SITE_CONTENT_CACHE_TAG, { expire: 0 });
    revalidatePath("/", "layout");

    return NextResponse.json({ success: true, updatedCount: normalized.length });
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Unable to update registered site content.", error);
    return NextResponse.json(
      { error: "تعذّر حفظ محتوى الموقع." },
      { status: 500 },
    );
  }
}
