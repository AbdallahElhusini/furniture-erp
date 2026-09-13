import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/reports/timeline - Unified ERP timeline aggregating all dates
export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(request.url);
    const daysAhead = parseInt(searchParams.get('days') || '14', 10);
    const daysBack = parseInt(searchParams.get('back') || '7', 10);

    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - daysBack);
    rangeStart.setHours(0, 0, 0, 0);

    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + daysAhead);
    rangeEnd.setHours(23, 59, 59, 999);

    // 1. Tasks (all types: followups, installations, deliveries, designs, etc.)
    const tasks = await prisma.task.findMany({
      where: {
        dueDate: { gte: rangeStart, lte: rangeEnd },
      },
      include: {
        project: {
          select: { id: true, title: true, status: true, client: { select: { name: true, company: true } } },
        },
        technician: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    // 2. Projects with key milestone dates in range
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { inspectionDate: { gte: rangeStart, lte: rangeEnd } },
          { designDeadline: { gte: rangeStart, lte: rangeEnd } },
          { approvalDate: { gte: rangeStart, lte: rangeEnd } },
          { estimatedDelivery: { gte: rangeStart, lte: rangeEnd } },
          { syncDate: { gte: rangeStart, lte: rangeEnd } },
        ],
      },
      include: {
        client: { select: { name: true, company: true } },
        _count: { select: { items: true, supplierOrders: true } },
      },
    });

    // 3. Supplier orders with expected/actual delivery in range
    const supplierOrders = await prisma.supplierOrder.findMany({
      where: {
        OR: [
          { expectedDate: { gte: rangeStart, lte: rangeEnd } },
          { actualDeliveryDate: { gte: rangeStart, lte: rangeEnd } },
        ],
      },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        project: {
          select: { id: true, title: true, client: { select: { name: true } } },
        },
      },
    });

    // Build unified timeline events
    const events: any[] = [];

    // Task events
    for (const task of tasks) {
      events.push({
        id: `task-${task.id}`,
        date: task.dueDate,
        type: task.type,
        category: 'TASK',
        title: task.title,
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        projectTitle: task.project?.title || null,
        clientName: task.project?.client?.name || null,
        clientCompany: task.project?.client?.company || null,
        technicianName: task.technician?.name || null,
        technicianPhone: task.technician?.phone || null,
        description: task.description,
      });
    }

    // Project milestone events
    for (const proj of projects) {
      if (proj.inspectionDate && proj.inspectionDate >= rangeStart && proj.inspectionDate <= rangeEnd) {
        events.push({
          id: `proj-inspect-${proj.id}`,
          date: proj.inspectionDate,
          type: 'INSPECTION',
          category: 'MILESTONE',
          title: `معاينة: ${proj.title}`,
          status: proj.status,
          priority: proj.priority,
          projectId: proj.id,
          projectTitle: proj.title,
          clientName: proj.client?.name || null,
          clientCompany: proj.client?.company || null,
        });
      }
      if (proj.designDeadline && proj.designDeadline >= rangeStart && proj.designDeadline <= rangeEnd) {
        events.push({
          id: `proj-design-${proj.id}`,
          date: proj.designDeadline,
          type: 'DESIGN_DEADLINE',
          category: 'MILESTONE',
          title: `موعد تسليم التصميم: ${proj.title}`,
          status: proj.status,
          priority: proj.priority,
          projectId: proj.id,
          projectTitle: proj.title,
          clientName: proj.client?.name || null,
          clientCompany: proj.client?.company || null,
        });
      }
      if (proj.estimatedDelivery && proj.estimatedDelivery >= rangeStart && proj.estimatedDelivery <= rangeEnd) {
        events.push({
          id: `proj-delivery-${proj.id}`,
          date: proj.estimatedDelivery,
          type: 'CLIENT_DELIVERY',
          category: 'MILESTONE',
          title: `تسليم العميل: ${proj.title}`,
          status: proj.status,
          priority: 'HIGH',
          projectId: proj.id,
          projectTitle: proj.title,
          clientName: proj.client?.name || null,
          clientCompany: proj.client?.company || null,
        });
      }
      if (proj.syncDate && proj.syncDate >= rangeStart && proj.syncDate <= rangeEnd) {
        events.push({
          id: `proj-sync-${proj.id}`,
          date: proj.syncDate,
          type: 'SYNC_DATE',
          category: 'MILESTONE',
          title: `موعد التزامن (جاهزية المصانع): ${proj.title}`,
          status: proj.status,
          priority: 'URGENT',
          projectId: proj.id,
          projectTitle: proj.title,
          clientName: proj.client?.name || null,
          clientCompany: proj.client?.company || null,
        });
      }
    }

    // Supplier order events
    for (const order of supplierOrders) {
      if (order.expectedDate && order.expectedDate >= rangeStart && order.expectedDate <= rangeEnd) {
        events.push({
          id: `supplier-exp-${order.id}`,
          date: order.expectedDate,
          type: 'SUPPLIER_DELIVERY',
          category: 'SUPPLIER',
          title: `استلام من ${order.supplier?.name}: مشروع ${order.project?.title}`,
          status: order.status,
          priority: 'HIGH',
          projectId: order.projectId,
          projectTitle: order.project?.title || null,
          clientName: order.project?.client?.name || null,
          supplierName: order.supplier?.name || null,
          supplierPhone: order.supplier?.phone || null,
          amount: order.totalAmount,
        });
      }
    }

    // Sort all events by date
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Group by date
    const grouped: Record<string, any[]> = {};
    for (const event of events) {
      const dateKey = new Date(event.date).toISOString().split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(event);
    }

    // Active projects summary for the board header
    const activeProjects = await prisma.project.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'CANCELLED', 'LEAD'] },
      },
      include: {
        client: { select: { name: true, company: true } },
        _count: { select: { items: true, tasks: true, supplierOrders: true } },
      },
      orderBy: { priority: 'desc' },
    });

    return NextResponse.json({
      events,
      grouped,
      activeProjects,
      range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
      stats: {
        totalEvents: events.length,
        overdue: events.filter(e => new Date(e.date) < now && e.status !== 'DONE').length,
        today: events.filter(e => new Date(e.date).toDateString() === now.toDateString()).length,
        upcoming: events.filter(e => new Date(e.date) > now).length,
      },
    });
  } catch (error: any) {
    console.error('Error building timeline:', error);
    return NextResponse.json(
      { error: 'Failed to build timeline', details: error.message },
      { status: 500 }
    );
  }
}
