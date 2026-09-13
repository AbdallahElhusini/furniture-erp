import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/suppliers - Fetch all suppliers with active order counts
export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const activeOnly = searchParams.get('active');
    const specialization = searchParams.get('specialization');

    const whereClause: any = {};

    if (activeOnly !== null && activeOnly !== undefined) {
      whereClause.isActive = activeOnly === 'true';
    }

    if (specialization) {
      whereClause.specialization = { contains: specialization };
    }

    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      whereClause.OR = [
        { name: { contains: searchTerm } },
        { contactPerson: { contains: searchTerm } },
        { phone: { contains: searchTerm } },
        { email: { contains: searchTerm } },
        { specialization: { contains: searchTerm } },
        { address: { contains: searchTerm } },
      ];
    }

    const suppliers = await prisma.supplier.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            catalogItems: true,
            supplierOrders: true,
          },
        },
        supplierOrders: {
          where: {
            status: { notIn: ['DELIVERED', 'CANCELLED'] },
          },
          select: {
            id: true,
            status: true,
            totalAmount: true,
            amountPaid: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const enrichedSuppliers = suppliers.map((supplier) => {
      const activeOrders = supplier.supplierOrders;
      const activeOrdersCount = activeOrders.length;
      const totalActiveAmount = activeOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const totalActivePaid = activeOrders.reduce((sum, o) => sum + o.amountPaid, 0);
      const totalActiveRemaining = totalActiveAmount - totalActivePaid;

      return {
        ...supplier,
        activeOrdersCount,
        totalActiveAmount,
        totalActivePaid,
        totalActiveRemaining,
      };
    });

    return NextResponse.json(enrichedSuppliers);
  } catch (error: any) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suppliers', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/suppliers - Create new supplier
export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
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

    if (!name || !phone) {
      return NextResponse.json(
        { error: 'Supplier name and phone are required' },
        { status: 400 }
      );
    }

    const newSupplier = await prisma.supplier.create({
      data: {
        name,
        contactPerson: contactPerson || null,
        phone,
        email: email || null,
        address: address || null,
        specialization: specialization || null,
        qualityRating: qualityRating !== undefined ? parseInt(String(qualityRating), 10) : 5,
        deliveryRating: deliveryRating !== undefined ? parseInt(String(deliveryRating), 10) : 5,
        notes: notes || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return NextResponse.json(newSupplier, { status: 201 });
  } catch (error: any) {
    console.error('Error creating supplier:', error);
    return NextResponse.json(
      { error: 'Failed to create supplier', details: error.message },
      { status: 500 }
    );
  }
}
