import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { readPrivilegedApiSession, requireApiSession } from '@/lib/api-auth';
import {
  calculateCatalogCompleteness,
  catalogContentStatus,
  normalizeCatalogSpecifications,
  parseCatalogImages,
} from '@/lib/catalog-quality';
import {
  imageUrlsFromProductMedia,
  normalizeProductMediaList,
  type NormalizedProductMedia,
} from '@/lib/product-media';
import {
  approvedCatalogAssetWhere,
  approvedSafeCatalogAssets,
  catalogPublicationWhere,
  isProductionCatalog,
} from '@/lib/catalog-publication';

export const dynamic = 'force-dynamic';

const publicCatalogSelect = {
  id: true,
  categoryId: true,
  nameAr: true,
  nameEn: true,
  sku: true,
  descriptionAr: true,
  descriptionEn: true,
  dimensions: true,
  material: true,
  color: true,
  images: true,
  displayOrder: true,
  isFeatured: true,
  category: { select: { nameAr: true, nameEn: true, slug: true } },
  tags: { select: { id: true, slug: true, nameAr: true, nameEn: true } },
  assets: {
    where: approvedCatalogAssetWhere,
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      url: true,
      width: true,
      height: true,
      mimeType: true,
      role: true,
      sortOrder: true,
      altAr: true,
      altEn: true,
      reviewStatus: true,
      duplicateOfId: true,
    },
  },
} satisfies Prisma.CatalogItemSelect;

// GET /api/catalog - Fetch catalog items. Pagination is opt-in for compatibility.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categorySlug = searchParams.get('category');
    const categoryId = searchParams.get('categoryId');
    const search = searchParams.get('search');
    const featured = searchParams.get('featured');
    const isActive = searchParams.get('isActive');
    const supplierId = searchParams.get('supplierId');
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');
    const wantsPagination = pageParam !== null || pageSizeParam !== null;
    const page = Math.max(1, Number.parseInt(pageParam || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(pageSizeParam || '50', 10) || 50));
    const session = readPrivilegedApiSession(request);

    const baseWhere: Prisma.CatalogItemWhereInput = {};

    // Filter by category slug or ID
    if (categorySlug) {
      baseWhere.category = {
        OR: [
          { slug: categorySlug },
          { redirects: { some: { fromSlug: categorySlug } } },
        ],
      };
    } else if (categoryId) {
      const parsedCategoryId = Number.parseInt(categoryId, 10);
      if (Number.isFinite(parsedCategoryId)) baseWhere.categoryId = parsedCategoryId;
    }

    if (supplierId && session) {
      const parsedSupplierId = Number.parseInt(supplierId, 10);
      if (Number.isFinite(parsedSupplierId)) baseWhere.supplierId = parsedSupplierId;
    }

    // Search in nameAr, nameEn, sku, descriptionAr, descriptionEn
    if (search && search.trim() !== '') {
      const terms = search.trim().slice(0, 80).split(/\s+/).slice(0, 8);
      baseWhere.AND = terms.map((term) => ({
        OR: [
          { nameAr: { contains: term } },
          { nameEn: { contains: term } },
          { sku: { contains: term } },
          { descriptionAr: { contains: term } },
          { descriptionEn: { contains: term } },
          { material: { contains: term } },
          { color: { contains: term } },
          { category: { OR: [{ nameAr: { contains: term } }, { nameEn: { contains: term } }] } },
          { family: { OR: [{ nameAr: { contains: term } }, { nameEn: { contains: term } }] } },
          { tags: { some: { OR: [{ nameAr: { contains: term } }, { nameEn: { contains: term } }] } } },
        ],
      }));
    }

    const whereClause: Prisma.CatalogItemWhereInput = { ...baseWhere };
    if (featured === 'true' || isActive === 'featured') whereClause.isFeatured = true;
    if (isActive === 'all' && session) {
      // Authenticated catalog management can explicitly request all statuses.
    } else if (session && (isActive === 'false' || isActive === 'inactive')) {
      whereClause.isActive = false;
    } else {
      whereClause.isActive = true;
    }
    if (!session) {
      const existingAnd = whereClause.AND;
      whereClause.AND = [
        ...(Array.isArray(existingAnd) ? existingAnd : existingAnd ? [existingAnd] : []),
        catalogPublicationWhere(),
      ];
    }

    const commonQuery = {
      where: whereClause,
      orderBy: [{ displayOrder: 'asc' }, { isFeatured: 'desc' }, { completenessScore: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      ...(wantsPagination ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    } satisfies Pick<Prisma.CatalogItemFindManyArgs, 'where' | 'orderBy' | 'skip' | 'take'>;

    const items = session
      ? await prisma.catalogItem.findMany({
          ...commonQuery,
          include: {
            category: true,
            supplier: true,
            collections: true,
            family: true,
            tags: { include: { group: true } },
            assets: { orderBy: { sortOrder: 'asc' } },
          },
        })
      : await prisma.catalogItem.findMany({
          ...commonQuery,
          select: publicCatalogSelect,
        }).then((publicItems) => publicItems.map((item) => {
          const assets = approvedSafeCatalogAssets(item.assets);
          if (!isProductionCatalog()) return { ...item, assets };

          const { images: legacyImages, ...safeItem } = item;
          void legacyImages;
          return { ...safeItem, assets };
        }));

    if (!wantsPagination) return NextResponse.json(items);

    const [total, active, inactive, featuredCount] = await Promise.all([
      prisma.catalogItem.count({ where: whereClause }),
      session
        ? prisma.catalogItem.count({ where: { ...baseWhere, isActive: true } })
        : prisma.catalogItem.count({ where: whereClause }),
      session
        ? prisma.catalogItem.count({ where: { ...baseWhere, isActive: false } })
        : Promise.resolve(0),
      session
        ? prisma.catalogItem.count({ where: { ...baseWhere, isFeatured: true } })
        : prisma.catalogItem.count({ where: { ...whereClause, isFeatured: true } }),
    ]);

    return NextResponse.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      summary: {
        total: session ? active + inactive : total,
        active,
        inactive: session ? inactive : 0,
        featured: featuredCount,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching catalog items:', error);
    return NextResponse.json({ error: 'Failed to fetch catalog items' }, { status: 500 });
  }
}

// POST /api/catalog - Create new catalog item
export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const {
      categoryId,
      supplierId,
      nameAr,
      nameEn,
      sku,
      descriptionAr,
      descriptionEn,
      costPrice,
      sellingPrice,
      leadTimeDays,
      dimensions,
      material,
      color,
      images,
      media,
      displayOrder,
      specifications,
      isFeatured,
      isActive,
    } = body;

    if (!categoryId || !nameAr || !nameEn || !sku) {
      return NextResponse.json(
        { error: 'Missing required fields: categoryId, nameAr, nameEn, and sku are required' },
        { status: 400 }
      );
    }

    // Check if sku already exists
    const existingSku = await prisma.catalogItem.findUnique({
      where: { sku },
    });

    if (existingSku) {
      return NextResponse.json(
        { error: `A catalog item with SKU "${sku}" already exists` },
        { status: 400 }
      );
    }

    const normalizedMedia = media === undefined ? null : normalizeProductMediaList(media);
    if (normalizedMedia && !normalizedMedia.ok) {
      return NextResponse.json(
        { error: 'Invalid product media', details: normalizedMedia.errors },
        { status: 400 }
      );
    }

    let finalDisplayOrder: number;
    if (displayOrder === undefined || displayOrder === null || displayOrder === '') {
      const maximumOrder = await prisma.catalogItem.aggregate({ _max: { displayOrder: true } });
      finalDisplayOrder = (maximumOrder._max.displayOrder ?? -1) + 1;
    } else {
      finalDisplayOrder = Number(displayOrder);
      if (!Number.isInteger(finalDisplayOrder) || finalDisplayOrder < 0) {
        return NextResponse.json({ error: 'displayOrder must be a non-negative integer' }, { status: 400 });
      }
    }

    // Keep the legacy image array synchronized for existing cards and exports.
    let formattedImages = '[]';
    if (normalizedMedia?.ok) {
      formattedImages = JSON.stringify(imageUrlsFromProductMedia(normalizedMedia.media));
    } else if (Array.isArray(images)) {
      formattedImages = JSON.stringify(images);
    } else if (typeof images === 'string') {
      formattedImages = images;
    }

    const specificationsResult = normalizeCatalogSpecifications(specifications);
    if (!specificationsResult.ok) {
      return NextResponse.json(
        { error: specificationsResult.error },
        { status: 400 },
      );
    }
    const formattedSpecs = specificationsResult.value;

    const createData: Prisma.CatalogItemUncheckedCreateInput & {
      collections?: { connect: Array<{ id: number }> };
    } = {
      categoryId: parseInt(String(categoryId), 10),
      supplierId: supplierId ? parseInt(String(supplierId), 10) : null,
      nameAr,
      nameEn,
      sku,
      descriptionAr: descriptionAr || null,
      descriptionEn: descriptionEn || null,
      costPrice: costPrice !== undefined ? parseFloat(String(costPrice)) : 0,
      sellingPrice: sellingPrice !== undefined ? parseFloat(String(sellingPrice)) : 0,
      leadTimeDays: leadTimeDays !== undefined ? parseInt(String(leadTimeDays), 10) : 7,
      dimensions: dimensions || null,
      material: material || null,
      color: color || null,
      images: formattedImages,
      specifications: formattedSpecs,
      isFeatured: isFeatured === true,
      isActive: isActive !== undefined ? isActive === true : true,
      displayOrder: finalDisplayOrder,
    };

    createData.completenessScore = calculateCatalogCompleteness({
      ...createData,
      imageCount: parseCatalogImages(formattedImages).length,
      reviewedAltCount: 0,
    });
    createData.contentStatus = catalogContentStatus({
      sku,
      nameAr,
      nameEn,
      completenessScore: createData.completenessScore,
    });

    if (body.collectionIds && Array.isArray(body.collectionIds)) {
      createData.collections = {
        connect: body.collectionIds.map((id: number) => ({ id })),
      };
    }

    const mediaToPersist: NormalizedProductMedia[] = normalizedMedia?.ok
      ? normalizedMedia.media
      : parseCatalogImages(formattedImages).map((url, index) => ({
          url,
          kind: 'IMAGE' as const,
          mimeType: '',
          role: index === 0 ? 'PRIMARY' as const : 'GALLERY' as const,
          sortOrder: index,
          altAr: null,
          altEn: null,
        }));
    const createdItem = await prisma.$transaction(async (transaction) => {
      const newItem = await transaction.catalogItem.create({ data: createData });
      for (const asset of mediaToPersist) {
        await transaction.productAsset.upsert({
          where: { catalogItemId_url: { catalogItemId: newItem.id, url: asset.url } },
          create: {
            catalogItemId: newItem.id,
            url: asset.url,
            mimeType: asset.mimeType || null,
            role: asset.role,
            sortOrder: asset.sortOrder,
            altAr: asset.altAr,
            altEn: asset.altEn,
          },
          update: {
            mimeType: asset.mimeType || null,
            role: asset.role,
            sortOrder: asset.sortOrder,
            altAr: asset.altAr,
            altEn: asset.altEn,
          },
        });
      }
      return transaction.catalogItem.findUnique({
        where: { id: newItem.id },
        include: {
          category: true,
          supplier: true,
          collections: true,
          assets: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });
    return NextResponse.json(createdItem, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating catalog item:', error);
    return NextResponse.json(
      { error: 'Failed to create catalog item' },
      { status: 500 }
    );
  }
}
