import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/technicians - Fetch all technicians with their upcoming tasks
export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(request.url);
    const availableOnly = searchParams.get('available');
    const specialization = searchParams.get('specialization');
    const search = searchParams.get('search');

    const whereClause: any = {};

    if (availableOnly === 'true') {
      whereClause.isAvailable = true;
    }

    if (specialization) {
      whereClause.specialization = { contains: specialization };
    }

    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      whereClause.OR = [
        { name: { contains: searchTerm } },
        { phone: { contains: searchTerm } },
        { specialization: { contains: searchTerm } },
        { notes: { contains: searchTerm } },
      ];
    }

    const technicians = await prisma.technician.findMany({
      where: whereClause,
      include: {
        tasks: {
          where: {
            status: { not: 'DONE' },
          },
          include: {
            project: {
              select: {
                id: true,
                title: true,
                status: true,
                client: {
                  select: {
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
          orderBy: { dueDate: 'asc' },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(technicians);
  } catch (error: any) {
    console.error('Error fetching technicians:', error);
    return NextResponse.json(
      { error: 'Failed to fetch technicians', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/technicians - Create technician
export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const { name, phone, specialization, isAvailable, dailyRate, notes } = body;

    if (!name || !phone) {
      return NextResponse.json(
        { error: 'Name and phone are required fields' },
        { status: 400 }
      );
    }

    const newTechnician = await prisma.technician.create({
      data: {
        name,
        phone,
        specialization: specialization || null,
        isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
        dailyRate: dailyRate !== undefined ? parseFloat(String(dailyRate)) : 0,
        notes: notes || null,
      },
    });

    return NextResponse.json(newTechnician, { status: 201 });
  } catch (error: any) {
    console.error('Error creating technician:', error);
    return NextResponse.json(
      { error: 'Failed to create technician', details: error.message },
      { status: 500 }
    );
  }
}
