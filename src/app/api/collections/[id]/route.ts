import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import { collectionCoverExists } from "@/lib/collection-cover";
import { validateCollection } from "@/lib/collection-publication";

const EDITABLE_FIELDS = new Set([
  "type",
  "nameAr",
  "nameEn",
  "slug",
  "description",
  "descriptionAr",
  "descriptionEn",
  "image",
  "isDraft",
  "isActive",
  "sortOrder",
]);

function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

function optionalText(value: unknown, fallback: string | null, maxLength: number): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  return typeof value === "string" ? value.trim().slice(0, maxLength) || null : fallback;
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await props.params;
    const collectionId = parseId(id);
    if (collectionId === null) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const existing = await prisma.collection.findUnique({
      where: { id: collectionId },
      include: { _count: { select: { items: { where: { isActive: true } } } } },
    });
    if (!existing) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const body = payload as Record<string, unknown>;
    const unknownFields = Object.keys(body).filter((field) => !EDITABLE_FIELDS.has(field));
    if (unknownFields.length > 0) {
      return NextResponse.json({ error: `Unsupported fields: ${unknownFields.join(", ")}` }, { status: 400 });
    }

    const type = typeof body.type === "string" ? body.type.trim().toUpperCase() : existing.type;
    const nameAr = optionalText(body.nameAr, existing.nameAr, 160) || "";
    const nameEn = optionalText(body.nameEn, existing.nameEn, 160) || "";
    const slug = optionalText(body.slug, existing.slug, 160)?.toLowerCase() || "";
    const descriptionAr = optionalText(body.descriptionAr, existing.descriptionAr || existing.description, 2_000);
    const descriptionEn = optionalText(body.descriptionEn, existing.descriptionEn, 2_000);
    const image = optionalText(body.image, existing.image, 1_000);
    const isDraft = typeof body.isDraft === "boolean" ? body.isDraft : existing.isDraft;
    const requestedActive = typeof body.isActive === "boolean" ? body.isActive : existing.isActive;
    const isActive = isDraft ? false : requestedActive;
    const parsedSortOrder = body.sortOrder === undefined ? existing.sortOrder : Number(body.sortOrder);
    const sortOrder = Number.isSafeInteger(parsedSortOrder) ? parsedSortOrder : existing.sortOrder;

    const validationErrors = validateCollection({
      type,
      nameAr,
      nameEn,
      slug,
      descriptionAr,
      image,
      isDraft,
      isActive,
      activeItemCount: existing._count.items,
    });
    if (!isDraft && isActive && image && !(await collectionCoverExists(image))) {
      validationErrors.push("ملف صورة الغلاف غير موجود داخل مجلد الموقع.");
    }
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors[0], errors: validationErrors }, { status: 422 });
    }

    const collection = await prisma.collection.update({
      where: { id: collectionId },
      data: {
        type,
        nameAr,
        nameEn,
        slug,
        description: descriptionAr,
        descriptionAr,
        descriptionEn,
        image,
        isDraft,
        isActive,
        sortOrder,
      },
      include: { _count: { select: { items: true } } },
    });

    return NextResponse.json(collection);
  } catch (error: unknown) {
    if (errorCode(error) === "P2002") {
      return NextResponse.json({ error: "الرابط مستخدم بالفعل." }, { status: 409 });
    }
    console.error("Failed to update collection", error);
    return NextResponse.json({ error: "Failed to update collection" }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await props.params;
    const collectionId = parseId(id);
    if (collectionId === null) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const existing = await prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

    await prisma.collection.delete({ where: { id: collectionId } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to delete collection", error);
    return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 });
  }
}
