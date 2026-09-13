import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { readPrivilegedApiSession, requireApiSession } from '@/lib/api-auth';
import { catalogPublicationWhere } from '@/lib/catalog-publication';
import { collectionCoverExists } from '@/lib/collection-cover';
import { validateCollection } from '@/lib/collection-publication';

export const dynamic = 'force-dynamic';

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

const CREATE_FIELDS = new Set([
  'type', 'nameAr', 'nameEn', 'slug', 'description', 'descriptionAr',
  'descriptionEn', 'image', 'isDraft', 'isActive', 'sortOrder',
]);

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || null : null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const session = readPrivilegedApiSession(request);
    const publicationWhere = catalogPublicationWhere();
    
    const where: Prisma.CollectionWhereInput = {};
    if (type) where.type = type;
    if (!session) {
      where.isDraft = false;
      where.isActive = true;
      where.items = { some: publicationWhere };
    }

    const collections = session
      ? await prisma.collection.findMany({
          where,
          include: { _count: { select: { items: { where: { isActive: true } } } } },
          orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        })
      : await prisma.collection.findMany({
          where,
          select: {
            id: true,
            type: true,
            nameAr: true,
            nameEn: true,
            slug: true,
            descriptionAr: true,
            descriptionEn: true,
            image: true,
            sortOrder: true,
            _count: { select: { items: { where: publicationWhere } } },
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        });

    return NextResponse.json(collections);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const body = payload as Record<string, unknown>;
    const unknownFields = Object.keys(body).filter((field) => !CREATE_FIELDS.has(field));
    if (unknownFields.length > 0) {
      return NextResponse.json({ error: `Unsupported fields: ${unknownFields.join(', ')}` }, { status: 400 });
    }

    const type = typeof body.type === 'string' ? body.type.trim().toUpperCase() : 'STYLE';
    const nameAr = optionalText(body.nameAr, 160) || '';
    const nameEn = optionalText(body.nameEn, 160) || '';
    const slug = (optionalText(body.slug, 160) || '').toLowerCase();
    const descriptionAr = optionalText(body.descriptionAr, 2_000) || optionalText(body.description, 2_000);
    const descriptionEn = optionalText(body.descriptionEn, 2_000);
    const image = optionalText(body.image, 1_000);
    const isDraft = typeof body.isDraft === 'boolean' ? body.isDraft : true;
    const requestedActive = typeof body.isActive === 'boolean' ? body.isActive : false;
    const isActive = isDraft ? false : requestedActive;
    const parsedSortOrder = Number(body.sortOrder ?? 0);
    const sortOrder = Number.isSafeInteger(parsedSortOrder) ? parsedSortOrder : 0;
    const validationErrors = validateCollection({
      type,
      nameAr,
      nameEn,
      slug,
      descriptionAr,
      image,
      isDraft,
      isActive,
      activeItemCount: 0,
    });
    if (!isDraft && isActive && image && !(await collectionCoverExists(image))) {
      validationErrors.push('ملف صورة الغلاف غير موجود داخل مجلد الموقع.');
    }
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors[0], errors: validationErrors }, { status: 422 });
    }

    const collection = await prisma.collection.create({
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
      }
    });

    return NextResponse.json(collection, { status: 201 });
  } catch (error: unknown) {
    if (errorCode(error) === 'P2002') {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}
