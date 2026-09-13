import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { readPrivilegedApiSession, requireApiSession } from '@/lib/api-auth';
import { catalogPublicationWhere } from '@/lib/catalog-publication';
import { isSafeCollectionImagePath } from '@/lib/collection-publication';

export const dynamic = 'force-dynamic';

function errorDetails(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function parseOptionalParentId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parentId = Number(value);
  return Number.isInteger(parentId) && parentId > 0 ? parentId : Number.NaN;
}

// GET /api/categories - Fetch all categories with item counts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active');
    const leafOnly = searchParams.get('leaf');
    const session = readPrivilegedApiSession(request);
    const publicationWhere = catalogPublicationWhere();

    const whereClause: Prisma.CategoryWhereInput = session ? {} : { isActive: true };
    if (!session || activeOnly === 'true') {
      whereClause.isActive = true;
    }
    if (leafOnly === 'true') {
      whereClause.parentId = { not: null };
    }

    const categories = session
      ? await prisma.category.findMany({
          where: whereClause,
          include: {
            parent: { select: { id: true, nameAr: true, nameEn: true, slug: true } },
            _count: { select: { items: true } },
          },
          orderBy: { sortOrder: 'asc' },
        })
      : await prisma.category.findMany({
          where: whereClause,
          select: {
            id: true,
            parentId: true,
            nameAr: true,
            nameEn: true,
            slug: true,
            image: true,
            sortOrder: true,
            parent: { select: { id: true, nameAr: true, nameEn: true, slug: true } },
            _count: { select: { items: { where: publicationWhere } } },
          },
          orderBy: { sortOrder: 'asc' },
        });

    return NextResponse.json(categories);
  } catch (error: unknown) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

// POST /api/categories - Create new category
export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const { nameAr, nameEn, slug, image, parentId: rawParentId, sortOrder, isActive } = body;

    if (!nameAr || !nameEn) {
      return NextResponse.json(
        { error: 'nameAr and nameEn are required fields' },
        { status: 400 }
      );
    }

    const parentId = parseOptionalParentId(rawParentId);
    if (Number.isNaN(parentId)) {
      return NextResponse.json({ error: 'parentId must be a positive category ID or null' }, { status: 400 });
    }

    if (parentId !== null) {
      const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { id: true } });
      if (!parent) {
        return NextResponse.json({ error: 'Parent category not found' }, { status: 400 });
      }
    }

    const normalizedImage = typeof image === 'string' ? image.trim() : '';
    if (normalizedImage && !isSafeCollectionImagePath(normalizedImage)) {
      return NextResponse.json(
        { error: 'image must be a local image under /images or /uploads/catalog' },
        { status: 400 }
      );
    }

    // Auto-generate slug if not provided
    const generatedSlug = slug
      ? slug.trim().toLowerCase().replace(/\s+/g, '-')
      : nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    // Check slug uniqueness
    const existingCategory = await prisma.category.findUnique({
      where: { slug: generatedSlug },
    });

    if (existingCategory) {
      return NextResponse.json(
        { error: `Category with slug "${generatedSlug}" already exists` },
        { status: 400 }
      );
    }

    // Get next sortOrder if not provided
    let finalSortOrder = sortOrder !== undefined ? parseInt(String(sortOrder), 10) : 0;
    if (sortOrder === undefined) {
      const maxSort = await prisma.category.aggregate({
        _max: { sortOrder: true },
      });
      finalSortOrder = (maxSort._max.sortOrder || 0) + 1;
    }

    const newCategory = await prisma.category.create({
      data: {
        nameAr,
        nameEn,
        slug: generatedSlug,
        parentId,
        image: normalizedImage || null,
        sortOrder: finalSortOrder,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
      include: {
        parent: { select: { id: true, nameAr: true, nameEn: true, slug: true } },
        _count: {
          select: { items: true },
        },
      },
    });

    return NextResponse.json(newCategory, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating category:', error);
    return NextResponse.json(
      { error: 'Failed to create category', details: errorDetails(error) },
      { status: 500 }
    );
  }
}
