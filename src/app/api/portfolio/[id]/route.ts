import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/portfolio/[id] - Fetch single portfolio project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const portfolioId = parseInt(id, 10);

    if (isNaN(portfolioId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const item = await prisma.portfolioProject.findUnique({
      where: { id: portfolioId },
    });

    if (!item) {
      return NextResponse.json({ error: 'Portfolio project not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error: unknown) {
    console.error('Error fetching portfolio project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio project' },
      { status: 500 }
    );
  }
}

// PUT /api/portfolio/[id] - Update portfolio project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const portfolioId = parseInt(id, 10);

    if (isNaN(portfolioId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existing = await prisma.portfolioProject.findUnique({
      where: { id: portfolioId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Portfolio project not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      titleAr,
      titleEn,
      descriptionAr,
      descriptionEn,
      clientName,
      location,
      images,
      isFeatured,
      sortOrder,
    } = body;

    let formattedImages: string | undefined = undefined;
    if (images !== undefined) {
      if (typeof images === 'string') {
        formattedImages = images;
      } else if (Array.isArray(images)) {
        formattedImages = JSON.stringify(images);
      }
    }

    const updated = await prisma.portfolioProject.update({
      where: { id: portfolioId },
      data: {
        ...(titleAr !== undefined && { titleAr }),
        ...(titleEn !== undefined && { titleEn }),
        ...(descriptionAr !== undefined && { descriptionAr }),
        ...(descriptionEn !== undefined && { descriptionEn }),
        ...(clientName !== undefined && { clientName }),
        ...(location !== undefined && { location }),
        ...(formattedImages !== undefined && { images: formattedImages }),
        ...(isFeatured !== undefined && { isFeatured: Boolean(isFeatured) }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(String(sortOrder), 10) }),
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('Error updating portfolio project:', error);
    return NextResponse.json(
      { error: 'Failed to update portfolio project' },
      { status: 500 }
    );
  }
}

// DELETE /api/portfolio/[id] - Delete portfolio project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const portfolioId = parseInt(id, 10);

    if (isNaN(portfolioId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existing = await prisma.portfolioProject.findUnique({
      where: { id: portfolioId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Portfolio project not found' }, { status: 404 });
    }

    await prisma.portfolioProject.delete({
      where: { id: portfolioId },
    });

    return NextResponse.json({
      success: true,
      message: 'تم حذف العمل من معرض الأعمال بنجاح',
    });
  } catch (error: unknown) {
    console.error('Error deleting portfolio project:', error);
    return NextResponse.json(
      { error: 'Failed to delete portfolio project' },
      { status: 500 }
    );
  }
}
