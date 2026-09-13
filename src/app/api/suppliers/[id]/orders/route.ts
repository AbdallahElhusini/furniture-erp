import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/suppliers/[id]/orders - Fetch supplier's orders with project info
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const whereClause: any = {
      supplierId,
    };

    if (status) {
      whereClause.status = status;
    }

    const orders = await prisma.supplierOrder.findMany({
      where: whereClause,
      include: {
        project: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                company: true,
                phone: true,
              },
            },
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
    });

    return NextResponse.json(orders);
  } catch (error: any) {
    console.error('Error fetching supplier orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier orders', details: error.message },
      { status: 500 }
    );
  }
}
