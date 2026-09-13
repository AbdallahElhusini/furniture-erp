import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/quotes/[id] - Fetch single quote with items and catalog details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quote = await prisma.quoteRequest.findUnique({
      where: { id: quoteId },
      include: {
        items: {
          include: {
            catalogItem: {
              include: {
                category: true,
                supplier: true,
              },
            },
          },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote request not found' }, { status: 404 });
    }

    return NextResponse.json(quote);
  } catch (error: any) {
    console.error('Error fetching quote request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote request', details: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/quotes/[id] - Update quote status or details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const existingQuote = await prisma.quoteRequest.findUnique({
      where: { id: quoteId },
    });

    if (!existingQuote) {
      return NextResponse.json({ error: 'Quote request not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      clientName,
      clientEmail,
      clientPhone,
      company,
      message,
      status,
      totalEstimate,
    } = body;

    const updatedQuote = await prisma.quoteRequest.update({
      where: { id: quoteId },
      data: {
        ...(clientName !== undefined && { clientName }),
        ...(clientEmail !== undefined && { clientEmail }),
        ...(clientPhone !== undefined && { clientPhone }),
        ...(company !== undefined && { company }),
        ...(message !== undefined && { message }),
        ...(status !== undefined && { status }),
        ...(totalEstimate !== undefined && { totalEstimate: parseFloat(String(totalEstimate)) }),
      },
      include: {
        items: {
          include: {
            catalogItem: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(updatedQuote);
  } catch (error: any) {
    console.error('Error updating quote request:', error);
    return NextResponse.json(
      { error: 'Failed to update quote request', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/quotes/[id] - Delete quote
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const existingQuote = await prisma.quoteRequest.findUnique({
      where: { id: quoteId },
    });

    if (!existingQuote) {
      return NextResponse.json({ error: 'Quote request not found' }, { status: 404 });
    }

    await prisma.quoteRequest.delete({
      where: { id: quoteId },
    });

    return NextResponse.json({
      success: true,
      message: 'تم حذف طلب عرض السعر بنجاح',
    });
  } catch (error: any) {
    console.error('Error deleting quote request:', error);
    return NextResponse.json(
      { error: 'Failed to delete quote request', details: error.message },
      { status: 500 }
    );
  }
}
