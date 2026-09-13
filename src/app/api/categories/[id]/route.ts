import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { readPrivilegedApiSession, requireApiSession } from '@/lib/api-auth';
import { catalogPublicationWhere } from '@/lib/catalog-publication';
import { isSafeCollectionImagePath } from '@/lib/collection-publication';

function parseOptionalParentId(value: unknown): number | null {
  if (value === null || value === '') return null;
  const parentId = Number(value);
  return Number.isInteger(parentId) && parentId > 0 ? parentId : Number.NaN;
}

async function parentAssignmentCreatesCycle(categoryId: number, parentId: number): Promise<boolean> {
  const visited = new Set<number>();
  let currentId: number | null = parentId;

  while (currentId !== null) {
    if (currentId === categoryId || visited.has(currentId)) return true;
    visited.add(currentId);
    const current: { parentId: number | null } | null = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!current) return false;
    currentId = current.parentId;
  }

  return false;
}

// GET /api/categories/[id] - Fetch single category
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const categoryId = parseInt(id, 10);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const session = readPrivilegedApiSession(request);
    const category = session
      ? await prisma.category.findUnique({
          where: { id: categoryId },
          include: {
            parent: { select: { id: true, nameAr: true, nameEn: true, slug: true } },
            _count: { select: { items: true } },
          },
        })
      : await prisma.category.findUnique({
          where: { id: categoryId, isActive: true },
          select: {
            id: true,
            parentId: true,
            nameAr: true,
            nameEn: true,
            slug: true,
            image: true,
            sortOrder: true,
            _count: { select: { items: { where: catalogPublicationWhere() } } },
          },
        });

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    return NextResponse.json(category);
  } catch (error: unknown) {
    console.error('Error fetching category:', error);
    return NextResponse.json({ error: 'Failed to fetch category' }, { status: 500 });
  }
}

// PUT /api/categories/[id] - Update category
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const categoryId = parseInt(id, 10);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existing = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const body = await request.json();
    const { nameAr, nameEn, slug, image, parentId: rawParentId, sortOrder, isActive } = body;

    let parentId: number | null | undefined;
    if (rawParentId !== undefined) {
      parentId = parseOptionalParentId(rawParentId);
      if (Number.isNaN(parentId)) {
        return NextResponse.json({ error: 'parentId must be a positive category ID or null' }, { status: 400 });
      }
      if (parentId !== null) {
        const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { id: true } });
        if (!parent) {
          return NextResponse.json({ error: 'Parent category not found' }, { status: 400 });
        }
        if (await parentAssignmentCreatesCycle(categoryId, parentId)) {
          return NextResponse.json({ error: 'A category cannot be nested under itself or one of its descendants' }, { status: 400 });
        }
      }
    }

    let normalizedImage: string | null | undefined;
    if (image !== undefined) {
      normalizedImage = typeof image === 'string' ? image.trim() || null : null;
      if (normalizedImage && !isSafeCollectionImagePath(normalizedImage)) {
        return NextResponse.json(
          { error: 'image must be a local image under /images or /uploads/catalog' },
          { status: 400 }
        );
      }
    }

    // Check slug conflict if slug changed
    if (slug && slug !== existing.slug) {
      const slugConflict = await prisma.category.findUnique({
        where: { slug },
      });
      if (slugConflict) {
        return NextResponse.json(
          { error: `Category with slug "${slug}" already exists` },
          { status: 400 }
        );
      }
    }

    const updatedCategory = await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(nameAr !== undefined && { nameAr }),
        ...(nameEn !== undefined && { nameEn }),
        ...(slug !== undefined && { slug }),
        ...(parentId !== undefined && { parentId }),
        ...(normalizedImage !== undefined && { image: normalizedImage }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(String(sortOrder), 10) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      include: {
        parent: { select: { id: true, nameAr: true, nameEn: true, slug: true } },
        _count: {
          select: { items: true },
        },
      },
    });

    return NextResponse.json(updatedCategory);
  } catch (error: unknown) {
    console.error('Error updating category:', error);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

// DELETE /api/categories/[id] - Delete category (only if no items)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const categoryId = parseInt(id, 10);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existing = await prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    if (existing._count.items > 0) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف هذا التصنيف لأنه يحتوي على ${existing._count.items} منتج. يرجى نقل أو حذف المنتجات أولاً.`,
          itemCount: existing._count.items,
        },
        { status: 400 }
      );
    }

    await prisma.category.delete({
      where: { id: categoryId },
    });

    return NextResponse.json({
      success: true,
      message: 'تم حذف التصنيف بنجاح',
    });
  } catch (error: unknown) {
    console.error('Error deleting category:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
