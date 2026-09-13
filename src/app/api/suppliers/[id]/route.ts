import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/suppliers/[id] - Fetch single supplier with orders and catalog items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const supplierId = parseInt(id, 10);

    if (isNaN(supplierId)) {
      return NextResponse.json({ error: 'Invalid supplier ID' }, { status: 400 });
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        catalogItems: {
          include: {
            category: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        supplierOrders: {
          include: {
            project: {
              include: {
                client: true,
              },
            },
            items: {
              include: {
                projectItem: {
                  include: {
                    catalogItem: true,
                  },
                },
              },
            },
          },
          orderBy: { orderDate: 'desc' },
        },
        _count: {
          select: {
            catalogItems: true,
            supplierOrders: true,
          },
        },
      },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Compute totals
    const totalOrdersAmount = supplier.supplierOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalOrdersPaid = supplier.supplierOrders.reduce((sum, o) => sum + o.amountPaid, 0);
    const totalRemaining = totalOrdersAmount - totalOrdersPaid;

    return NextResponse.json({
      ...supplier,
      financialSummary: {
        totalOrdersAmount,
        totalOrdersPaid,
        totalRemaining,
      },
    });
  } catch (error: any) {
    console.error('Error fetching supplier:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier', details: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/suppliers/[id] - Update supplier
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const supplierId = parseInt(id, 10);

    if (isNaN(supplierId)) {
      return NextResponse.json({ error: 'Invalid supplier ID' }, { status: 400 });
    }

    const existingSupplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!existingSupplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      contactPerson,
      phone,
      email,
      address,
      specialization,
      qualityRating,
      deliveryRating,
      notes,
      isActive,
    } = body;

    const updatedSupplier = await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(name !== undefined && { name }),
        ...(contactPerson !== undefined && { contactPerson }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(address !== undefined && { address }),
        ...(specialization !== undefined && { specialization }),
        ...(qualityRating !== undefined && {
          qualityRating: parseInt(String(qualityRating), 10),
        }),
        ...(deliveryRating !== undefined && {
          deliveryRating: parseInt(String(deliveryRating), 10),
        }),
        ...(notes !== undefined && { notes }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    return NextResponse.json(updatedSupplier);
  } catch (error: any) {
    console.error('Error updating supplier:', error);
    return NextResponse.json(
      { error: 'Failed to update supplier', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/suppliers/[id] - Soft delete supplier (set isActive=false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const supplierId = parseInt(id, 10);

    if (isNaN(supplierId)) {
      return NextResponse.json({ error: 'Invalid supplier ID' }, { status: 400 });
    }

    const existingSupplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!existingSupplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const softDeleted = await prisma.supplier.update({
      where: { id: supplierId },
      data: { isActive: false },
    });

    return NextResponse.json({
      success: true,
      message: 'تم إيقاف المورد بنجاح',
      supplier: softDeleted,
    });
  } catch (error: any) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json(
      { error: 'Failed to delete supplier', details: error.message },
      { status: 500 }
    );
  }
}
