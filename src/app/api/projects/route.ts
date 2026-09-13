import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/projects - Fetch all projects with client relation
export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search');
    const clientId = searchParams.get('clientId');

    const whereClause: any = {};

    if (status) {
      whereClause.status = status;
    }

    if (type) {
      whereClause.type = type;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    if (clientId) {
      whereClause.clientId = parseInt(clientId, 10);
    }

    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      whereClause.OR = [
        { title: { contains: searchTerm } },
        { notes: { contains: searchTerm } },
        { client: { name: { contains: searchTerm } } },
        { client: { phone: { contains: searchTerm } } },
        { client: { company: { contains: searchTerm } } },
      ];
    }

    const projects = await prisma.project.findMany({
      where: whereClause,
      include: {
        client: true,
        _count: {
          select: {
            items: true,
            tasks: true,
            supplierOrders: true,
            payments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(projects);
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create new project with client
export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const {
      title,
      type,
      status,
      clientId,
      client, // Optional client object to create a new client { name, phone, email, company, address, notes }
      inspectionDate,
      designDeadline,
      approvalDate,
      estimatedDelivery,
      syncDate,
      totalCost,
      totalPrice,
      amountPaid,
      shippingCost,
      installationCost,
      notes,
      priority,
      items, // Optional array of items [{ catalogItemId, quantity, unitCost, unitPrice, notes, leadTimeDays }]
    } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Project title is required' },
        { status: 400 }
      );
    }

    let finalClientId = clientId ? parseInt(String(clientId), 10) : null;

    // If no existing clientId provided, create or find client from client object
    if (!finalClientId) {
      if (!client || !client.name || !client.phone) {
        return NextResponse.json(
          { error: 'Either clientId or client details (name and phone) must be provided' },
          { status: 400 }
        );
      }

      // Check if client with this phone already exists
      let existingClient = await prisma.client.findFirst({
        where: { phone: client.phone },
      });

      if (!existingClient) {
        existingClient = await prisma.client.create({
          data: {
            name: client.name,
            phone: client.phone,
            email: client.email || null,
            company: client.company || null,
            address: client.address || null,
            notes: client.notes || null,
          },
        });
      }

      finalClientId = existingClient.id;
    }

    // Process initial items if provided
    let calculatedCost = totalCost !== undefined ? parseFloat(String(totalCost)) : 0;
    let calculatedPrice = totalPrice !== undefined ? parseFloat(String(totalPrice)) : 0;

    let itemsData: any[] = [];
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const catalogItem = await prisma.catalogItem.findUnique({
          where: { id: parseInt(String(item.catalogItemId), 10) },
        });

        const qty = item.quantity ? parseInt(String(item.quantity), 10) : 1;
        const uCost = item.unitCost !== undefined ? parseFloat(String(item.unitCost)) : (catalogItem?.costPrice || 0);
        const uPrice = item.unitPrice !== undefined ? parseFloat(String(item.unitPrice)) : (catalogItem?.sellingPrice || 0);
        const leadDays = item.leadTimeDays !== undefined ? parseInt(String(item.leadTimeDays), 10) : (catalogItem?.leadTimeDays || 7);

        itemsData.push({
          catalogItemId: parseInt(String(item.catalogItemId), 10),
          quantity: qty,
          unitCost: uCost,
          unitPrice: uPrice,
          leadTimeDays: leadDays,
          notes: item.notes || null,
          status: 'PENDING',
        });
      }

      if (totalCost === undefined) {
        calculatedCost = itemsData.reduce((acc, curr) => acc + curr.quantity * curr.unitCost, 0);
      }
      if (totalPrice === undefined) {
        calculatedPrice = itemsData.reduce((acc, curr) => acc + curr.quantity * curr.unitPrice, 0);
      }
    }

    const newProject = await prisma.project.create({
      data: {
        clientId: finalClientId,
        title,
        type: type || 'LARGE_PROJECT',
        status: status || 'LEAD',
        inspectionDate: inspectionDate ? new Date(inspectionDate) : null,
        designDeadline: designDeadline ? new Date(designDeadline) : null,
        approvalDate: approvalDate ? new Date(approvalDate) : null,
        estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
        syncDate: syncDate ? new Date(syncDate) : null,
        totalCost: calculatedCost,
        totalPrice: calculatedPrice,
        amountPaid: amountPaid !== undefined ? parseFloat(String(amountPaid)) : 0,
        shippingCost: shippingCost !== undefined ? parseFloat(String(shippingCost)) : 0,
        installationCost: installationCost !== undefined ? parseFloat(String(installationCost)) : 0,
        notes: notes || null,
        priority: priority || 'MEDIUM',
        ...(itemsData.length > 0 && {
          items: {
            create: itemsData,
          },
        }),
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

    return NextResponse.json(newProject, { status: 201 });
  } catch (error: any) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project', details: error.message },
      { status: 500 }
    );
  }
}
