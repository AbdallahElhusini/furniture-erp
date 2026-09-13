import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/technicians/[id] - Fetch single technician with tasks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const technicianId = parseInt(id, 10);

    if (isNaN(technicianId)) {
      return NextResponse.json({ error: 'Invalid technician ID' }, { status: 400 });
    }

    const technician = await prisma.technician.findUnique({
      where: { id: technicianId },
      include: {
        tasks: {
          include: {
            project: {
              select: {
                id: true,
                title: true,
                status: true,
                client: true,
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
    });

    if (!technician) {
      return NextResponse.json({ error: 'Technician not found' }, { status: 404 });
    }

    return NextResponse.json(technician);
  } catch (error: any) {
    console.error('Error fetching technician:', error);
    return NextResponse.json(
      { error: 'Failed to fetch technician', details: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/technicians/[id] - Update technician
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const technicianId = parseInt(id, 10);

    if (isNaN(technicianId)) {
      return NextResponse.json({ error: 'Invalid technician ID' }, { status: 400 });
    }

    const existingTechnician = await prisma.technician.findUnique({
      where: { id: technicianId },
    });

    if (!existingTechnician) {
      return NextResponse.json({ error: 'Technician not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, phone, specialization, isAvailable, dailyRate, notes } = body;

    const updatedTechnician = await prisma.technician.update({
      where: { id: technicianId },
      data: {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(specialization !== undefined && { specialization }),
        ...(isAvailable !== undefined && { isAvailable: Boolean(isAvailable) }),
        ...(dailyRate !== undefined && { dailyRate: parseFloat(String(dailyRate)) }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    });

    return NextResponse.json(updatedTechnician);
  } catch (error: any) {
    console.error('Error updating technician:', error);
    return NextResponse.json(
      { error: 'Failed to update technician', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/technicians/[id] - Delete technician
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const technicianId = parseInt(id, 10);

    if (isNaN(technicianId)) {
      return NextResponse.json({ error: 'Invalid technician ID' }, { status: 400 });
    }

    const existing = await prisma.technician.findUnique({
      where: { id: technicianId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Technician not found' }, { status: 404 });
    }

    await prisma.technician.delete({
      where: { id: technicianId },
    });

    return NextResponse.json({
      success: true,
      message: 'تم حذف الفني بنجاح',
    });
  } catch (error: any) {
    console.error('Error deleting technician:', error);
    return NextResponse.json(
      { error: 'Failed to delete technician', details: error.message },
      { status: 500 }
    );
  }
}
