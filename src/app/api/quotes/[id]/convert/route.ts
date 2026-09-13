import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// POST /api/quotes/[id]/convert - Convert quote request to project
export async function POST(
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

    // Fetch quote with items and their catalog items
    const quote = await prisma.quoteRequest.findUnique({
      where: { id: quoteId },
      include: {
        items: {
          include: {
            catalogItem: {
              include: {
                supplier: true,
                category: true,
              },
            },
          },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote request not found' }, { status: 404 });
    }

    if (quote.status === 'CONVERTED') {
      return NextResponse.json(
        { error: 'هذا العرض تم تحويله إلى مشروع بالفعل' },
        { status: 400 }
      );
    }

    if (quote.items.length === 0) {
      return NextResponse.json(
        { error: 'لا يمكن تحويل عرض سعر بدون منتجات إلى مشروع' },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { projectTitle, projectType, priority } = body;

    // Convert quote to project in transaction
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.quoteRequest.updateMany({
        where: { id: quoteId, status: { not: 'CONVERTED' } },
        data: { status: 'CONVERTED' },
      });
      if (claimed.count !== 1) return { kind: 'ALREADY_CONVERTED' as const };

      // 1. Create or find Client
      let client = await tx.client.findFirst({
        where: {
          OR: [
            { phone: quote.clientPhone },
            quote.clientEmail ? { email: quote.clientEmail } : { phone: quote.clientPhone },
          ],
        },
      });

      if (!client) {
        client = await tx.client.create({
          data: {
            name: quote.clientName,
            phone: quote.clientPhone,
            email: quote.clientEmail || null,
            company: quote.company || null,
            notes: quote.message ? `طلب عرض سعر سابق #${quote.id}: ${quote.message}` : null,
          },
        });
      }

      // 2. Calculate costs and prices
      let totalCost = 0;
      let totalPrice = 0;

      const projectItemsData = quote.items.map((item) => {
        const cost = item.catalogItem ? item.catalogItem.costPrice : 0;
        const price = item.catalogItem ? item.catalogItem.sellingPrice : 0;
        const lead = item.catalogItem ? item.catalogItem.leadTimeDays : 7;

        totalCost += cost * item.quantity;
        totalPrice += price * item.quantity;

        return {
          catalogItemId: item.catalogItemId,
          quantity: item.quantity,
          unitCost: cost,
          unitPrice: price,
          leadTimeDays: lead,
          status: 'PENDING',
        };
      });

      if (quote.totalEstimate && quote.totalEstimate > 0) {
        totalPrice = quote.totalEstimate;
      }

      // 3. Create Project
      const project = await tx.project.create({
        data: {
          clientId: client.id,
          title:
            projectTitle ||
            `مشروع ${quote.company ? quote.company + ' - ' : ''}${quote.clientName} (عرض #${quote.id})`,
          type: projectType || 'LARGE_PROJECT',
          status: 'APPROVED',
          totalCost,
          totalPrice,
          amountPaid: 0,
          notes: quote.message ? `ملاحظات العرض: ${quote.message}` : null,
          priority: priority || 'MEDIUM',
          items: {
            create: projectItemsData,
          },
        },
        include: {
          client: true,
          items: {
            include: {
              catalogItem: true,
            },
          },
        },
      });

      return { kind: 'CREATED' as const, project };
    });

    if (result.kind === 'ALREADY_CONVERTED') {
      return NextResponse.json(
        { error: 'هذا العرض تم تحويله إلى مشروع بالفعل' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحويل عرض السعر إلى مشروع بنجاح',
      project: result.project,
    });
  } catch (error: unknown) {
    console.error('Error converting quote to project:', error);
    return NextResponse.json(
      { error: 'Failed to convert quote to project' },
      { status: 500 }
    );
  }
}
