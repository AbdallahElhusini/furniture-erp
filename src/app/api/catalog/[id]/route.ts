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
} from '@/lib/product-media';
import {
  approvedCatalogAssetWhere,
  approvedSafeProductMediaAssets,
  catalogPublicationWhere,
  isProductionCatalog,
} from '@/lib/catalog-publication';

const publicCatalogItemSelect = {
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
  specifications: true,
  category: { select: { nameAr: true, nameEn: true, slug: true } },
  collections: {
    where: { isActive: true, isDraft: false },
    select: { id: true, type: true, nameAr: true, nameEn: true, slug: true },
  },
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

function parseCatalogItemId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// GET /api/catalog/[id] - Fetch single catalog item with relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const itemId = parseCatalogItemId(id);

    if (itemId === null) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const session = readPrivilegedApiSession(request);
    if (session) {
      const item = await prisma.catalogItem.findUnique({
        where: { id: itemId },
        include: {
          category: true,
          supplier: true,
          collections: true,
          assets: { orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!item) {
        return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });
      }
      return NextResponse.json(item);
    }

    const publicItem = await prisma.catalogItem.findUnique({
      where: { id: itemId, ...catalogPublicationWhere() },
      select: publicCatalogItemSelect,
    });
    if (!publicItem) {
      return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });
    }

    const assets = approvedSafeProductMediaAssets(publicItem.assets);
    if (!isProductionCatalog()) {
      return NextResponse.json({ ...publicItem, assets });
    }

    const { images: legacyImages, ...safeItem } = publicItem;
    void legacyImages;
    return NextResponse.json({ ...safeItem, assets });
  } catch (error: unknown) {
    console.error('Error fetching catalog item:', error);
    return NextResponse.json({ error: 'Failed to fetch catalog item' }, { status: 500 });
  }
}

// PUT /api/catalog/[id] - Update catalog item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const itemId = parseInt(id, 10);

    if (isNaN(itemId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existingItem = await prisma.catalogItem.findUnique({
      where: { id: itemId },
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });
    }

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

    // If SKU is being changed, check if the new SKU is already taken
    if (sku && sku !== existingItem.sku) {
      const skuConflict = await prisma.catalogItem.findUnique({
        where: { sku },
      });
      if (skuConflict) {
        return NextResponse.json(
          { error: `SKU "${sku}" is already in use by another item` },
          { status: 400 }
        );
      }
    }

    const normalizedMedia = media === undefined ? null : normalizeProductMediaList(media);
    if (normalizedMedia && !normalizedMedia.ok) {
      return NextResponse.json(
        { error: 'Invalid product media', details: normalizedMedia.errors },
        { status: 400 }
      );
    }
    if (displayOrder !== undefined && (!Number.isInteger(Number(displayOrder)) || Number(displayOrder) < 0)) {
      return NextResponse.json({ error: 'displayOrder must be a non-negative integer' }, { status: 400 });
    }

    // Keep the legacy image array synchronized for existing cards and exports.
    let formattedImages: string | undefined = undefined;
    if (normalizedMedia?.ok) {
      formattedImages = JSON.stringify(imageUrlsFromProductMedia(normalizedMedia.media));
    } else if (images !== undefined) {
      if (typeof images === 'string') {
        formattedImages = images;
      } else if (Array.isArray(images)) {
        formattedImages = JSON.stringify(images);
      }
    }

    let formattedSpecs: string | null | undefined = undefined;
    if (specifications !== undefined) {
      const specificationsResult = normalizeCatalogSpecifications(specifications);
      if (!specificationsResult.ok) {
        return NextResponse.json(
          { error: specificationsResult.error },
          { status: 400 },
        );
      }
      formattedSpecs = specificationsResult.value;
    }

    const nextImages = formattedImages ?? existingItem.images;
    const completenessScore = calculateCatalogCompleteness({
      sku: sku ?? existingItem.sku,
      categoryId: categoryId !== undefined ? parseInt(String(categoryId), 10) : existingItem.categoryId,
      supplierId: supplierId !== undefined ? (supplierId ? parseInt(String(supplierId), 10) : null) : existingItem.supplierId,
      nameAr: nameAr ?? existingItem.nameAr,
      nameEn: nameEn ?? existingItem.nameEn,
      descriptionAr: descriptionAr !== undefined ? descriptionAr : existingItem.descriptionAr,
      descriptionEn: descriptionEn !== undefined ? descriptionEn : existingItem.descriptionEn,
      sellingPrice: sellingPrice !== undefined ? parseFloat(String(sellingPrice)) : existingItem.sellingPrice,
      leadTimeDays: leadTimeDays !== undefined ? parseInt(String(leadTimeDays), 10) : existingItem.leadTimeDays,
      dimensions: dimensions !== undefined ? dimensions : existingItem.dimensions,
      material: material !== undefined ? material : existingItem.material,
      color: color !== undefined ? color : existingItem.color,
      specifications: formattedSpecs !== undefined ? formattedSpecs : existingItem.specifications,
      imageCount: parseCatalogImages(nextImages).length,
      reviewedAltCount: 0,
    });

    const updateData: Prisma.CatalogItemUncheckedUpdateInput & {
      collections?: { set: Array<{ id: number }> };
    } = {
      ...(categoryId !== undefined && { categoryId: parseInt(String(categoryId), 10) }),
      ...(supplierId !== undefined && { supplierId: supplierId ? parseInt(String(supplierId), 10) : null }),
      ...(nameAr !== undefined && { nameAr }),
      ...(nameEn !== undefined && { nameEn }),
      ...(sku !== undefined && { sku }),
      ...(descriptionAr !== undefined && { descriptionAr }),
      ...(descriptionEn !== undefined && { descriptionEn }),
      ...(costPrice !== undefined && { costPrice: parseFloat(String(costPrice)) }),
      ...(sellingPrice !== undefined && { sellingPrice: parseFloat(String(sellingPrice)) }),
      ...(leadTimeDays !== undefined && { leadTimeDays: parseInt(String(leadTimeDays), 10) }),
      ...(dimensions !== undefined && { dimensions }),
      ...(material !== undefined && { material }),
      ...(color !== undefined && { color }),
      ...(formattedImages !== undefined && { images: formattedImages }),
      ...(formattedSpecs !== undefined && { specifications: formattedSpecs }),
      ...(isFeatured !== undefined && { isFeatured: Boolean(isFeatured) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(displayOrder !== undefined && { displayOrder: Number(displayOrder) }),
      completenessScore,
      contentStatus: catalogContentStatus({
        sku: sku ?? existingItem.sku,
        nameAr: nameAr ?? existingItem.nameAr,
        nameEn: nameEn ?? existingItem.nameEn,
        completenessScore,
      }),
    };

    if (body.collectionIds && Array.isArray(body.collectionIds)) {
      updateData.collections = {
        set: body.collectionIds.map((id: number) => ({ id }))
      };
    }

    const updatedItem = await prisma.$transaction(async (transaction) => {
      await transaction.catalogItem.update({
        where: { id: itemId },
        data: updateData,
      });

      if (normalizedMedia?.ok) {
        const retainedUrls = normalizedMedia.media.map((asset) => asset.url);
        await transaction.productAsset.deleteMany({
          where: {
            catalogItemId: itemId,
            ...(retainedUrls.length > 0 ? { url: { notIn: retainedUrls } } : {}),
          },
        });
        for (const asset of normalizedMedia.media) {
          await transaction.productAsset.upsert({
            where: { catalogItemId_url: { catalogItemId: itemId, url: asset.url } },
            create: {
              catalogItemId: itemId,
              familyId: existingItem.familyId,
              url: asset.url,
              mimeType: asset.mimeType,
              role: asset.role,
              sortOrder: asset.sortOrder,
              altAr: asset.altAr,
              altEn: asset.altEn,
            },
            update: {
              mimeType: asset.mimeType,
              role: asset.role,
              sortOrder: asset.sortOrder,
              altAr: asset.altAr,
              altEn: asset.altEn,
            },
          });
        }
      } else if (formattedImages !== undefined) {
        for (const [index, url] of parseCatalogImages(formattedImages).entries()) {
          await transaction.productAsset.upsert({
            where: { catalogItemId_url: { catalogItemId: itemId, url } },
            create: {
              catalogItemId: itemId,
              familyId: existingItem.familyId,
              url,
              role: index === 0 ? 'PRIMARY' : 'GALLERY',
              sortOrder: index,
            },
            update: { role: index === 0 ? 'PRIMARY' : 'GALLERY', sortOrder: index },
          });
        }
      }

      return transaction.catalogItem.findUnique({
        where: { id: itemId },
        include: {
          category: true,
          supplier: true,
          collections: true,
          assets: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });

    return NextResponse.json(updatedItem);
  } catch (error: unknown) {
    console.error('Error updating catalog item:', error);
    return NextResponse.json(
      { error: 'Failed to update catalog item' },
      { status: 500 }
    );
  }
}

// DELETE /api/catalog/[id] - Soft delete catalog item (set isActive=false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const itemId = parseInt(id, 10);

    if (isNaN(itemId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existingItem = await prisma.catalogItem.findUnique({
      where: { id: itemId },
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });
    }

    const softDeletedItem = await prisma.catalogItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });

    return NextResponse.json({
      success: true,
      message: 'Catalog item deactivated successfully',
      item: softDeletedItem,
    });
  } catch (error: unknown) {
    console.error('Error deleting catalog item:', error);
    return NextResponse.json(
      { error: 'Failed to delete catalog item' },
      { status: 500 }
    );
  }
}
