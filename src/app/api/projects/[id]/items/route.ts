import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readBoundedJson,
} from '@/lib/public-request-security';

const PROJECT_ITEM_STATUSES = new Set([
  'PENDING',
  'ORDERED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'INSTALLED',
]);

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return Number.NaN;
  return Number(value);
}

// GET /api/projects/[id]/items - Fetch project items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const projectId = parseInt(id, 10);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const items = await prisma.projectItem.findMany({
      where: { projectId },
      include: {
        catalogItem: {
          include: {
            category: true,
            supplier: true,
          },
        },
        orderItems: {
          include: {
            supplierOrder: true,
          },
        },
      },
    });

    return NextResponse.json(items);
  } catch (error: unknown) {
    console.error('Error fetching project items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project items' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/items - Add item to project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const projectId = parseInt(id, 10);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    let bodyValue: unknown;
    try {
      bodyValue = await readBoundedJson(request, 32 * 1024);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
      }
      if (error instanceof InvalidJsonBodyError) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      throw error;
    }
    if (!bodyValue || typeof bodyValue !== 'object' || Array.isArray(bodyValue)) {
      return NextResponse.json({ error: 'Invalid project item payload' }, { status: 400 });
    }
    const body = bodyValue as Record<string, unknown>;
    const { catalogItemId, quantity, unitCost, unitPrice, notes, leadTimeDays, status } = body;

    if (!catalogItemId) {
      return NextResponse.json(
        { error: 'catalogItemId is required' },
        { status: 400 }
      );
    }

    const parsedCatalogItemId = Number(catalogItemId);
    const qty = optionalNumber(quantity) ?? 1;
    const requestedCost = optionalNumber(unitCost);
    const requestedPrice = optionalNumber(unitPrice);
    const requestedLeadDays = optionalNumber(leadTimeDays);
    const normalizedStatus = status === undefined ? 'PENDING' : String(status).trim().toUpperCase();
    const normalizedNotes = notes === undefined || notes === null ? null : String(notes).trim() || null;

    if (!Number.isSafeInteger(parsedCatalogItemId) || parsedCatalogItemId <= 0) {
      return NextResponse.json({ error: 'catalogItemId must be a positive integer' }, { status: 400 });
    }
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 10_000) {
      return NextResponse.json({ error: 'quantity must be an integer between 1 and 10000' }, { status: 400 });
    }
    if (requestedCost !== undefined && (!Number.isFinite(requestedCost) || requestedCost < 0)) {
      return NextResponse.json({ error: 'unitCost must be a non-negative number' }, { status: 400 });
    }
    if (requestedPrice !== undefined && (!Number.isFinite(requestedPrice) || requestedPrice < 0)) {
      return NextResponse.json({ error: 'unitPrice must be a non-negative number' }, { status: 400 });
    }
    if (requestedLeadDays !== undefined && (!Number.isSafeInteger(requestedLeadDays) || requestedLeadDays < 0 || requestedLeadDays > 3_650)) {
      return NextResponse.json({ error: 'leadTimeDays must be an integer between 0 and 3650' }, { status: 400 });
    }
    if (!PROJECT_ITEM_STATUSES.has(normalizedStatus)) {
      return NextResponse.json({ error: 'Unsupported project item status' }, { status: 400 });
    }
    if (normalizedNotes && normalizedNotes.length > 5_000) {
      return NextResponse.json({ error: 'notes must not exceed 5000 characters' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const [project, catalogItem] = await Promise.all([
        transaction.project.findUnique({ where: { id: projectId }, select: { id: true } }),
        transaction.catalogItem.findUnique({ where: { id: parsedCatalogItemId } }),
      ]);
      if (!project) return { kind: 'PROJECT_NOT_FOUND' as const };
      if (!catalogItem) return { kind: 'CATALOG_NOT_FOUND' as const };

      const newItem = await transaction.projectItem.create({
        data: {
          projectId,
          catalogItemId: parsedCatalogItemId,
          quantity: qty,
          unitCost: requestedCost ?? catalogItem.costPrice,
          unitPrice: requestedPrice ?? catalogItem.sellingPrice,
          leadTimeDays: requestedLeadDays ?? catalogItem.leadTimeDays,
          notes: normalizedNotes,
          status: normalizedStatus,
        },
        include: {
          catalogItem: { include: { category: true, supplier: true } },
        },
      });

      if (catalogItem.supplierId) {
        const activeOrder = await transaction.supplierOrder.findFirst({
          where: {
            projectId,
            supplierId: catalogItem.supplierId,
            status: { notIn: ['DELIVERED', 'SHIPPED', 'CANCELLED'] },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (activeOrder) {
          await transaction.orderItem.create({
            data: {
              supplierOrderId: activeOrder.id,
              projectItemId: newItem.id,
              quantity: newItem.quantity,
            },
          });
          const orderItems = await transaction.orderItem.findMany({
            where: { supplierOrderId: activeOrder.id },
            include: { projectItem: { select: { unitCost: true } } },
          });
          await transaction.supplierOrder.update({
            where: { id: activeOrder.id },
            data: {
              totalAmount: orderItems.reduce(
                (sum, item) => sum + item.quantity * item.projectItem.unitCost,
                0,
              ),
            },
          });
        }
      }

      const allProjectItems = await transaction.projectItem.findMany({ where: { projectId } });
      const updatedProject = await transaction.project.update({
        where: { id: projectId },
        data: {
          totalCost: allProjectItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
          totalPrice: allProjectItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
        },
      });
      return { kind: 'CREATED' as const, newItem, updatedProject, itemsCount: allProjectItems.length };
    });

    if (result.kind === 'PROJECT_NOT_FOUND') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (result.kind === 'CATALOG_NOT_FOUND') {
      return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        item: result.newItem,
        projectTotals: {
          totalCost: result.updatedProject.totalCost,
          totalPrice: result.updatedProject.totalPrice,
          itemsCount: result.itemsCount,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error adding project item:', error);
    return NextResponse.json(
      { error: 'Failed to add project item' },
      { status: 500 }
    );
  }
}

