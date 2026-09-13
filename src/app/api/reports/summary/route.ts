import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireLiveAdminSession } from '@/lib/api-auth';
import { PRIVILEGED_API_ROLES } from '@/lib/roles';
import { summarizeProjectAmounts } from '@/lib/project-summary';

// GET /api/reports/summary - Generate overall executive dashboard summary
export async function GET(request: NextRequest) {
  const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
  if (auth.response) return auth.response;
  try {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Run parallel queries for speed and efficiency
    const [
      allProjects,
      projectsByStatusGroup,
      recentQuotesCount,
      todayTasksCount,
      suppliersCount,
      clientsCount,
      catalogItemsCount,
    ] = await Promise.all([
      // All projects financial data
      prisma.project.findMany({
        select: {
          id: true,
          status: true,
          totalPrice: true,
          amountPaid: true,
          totalCost: true,
        },
      }),

      // Group projects by status
      prisma.project.groupBy({
        by: ['status'],
        _count: {
          id: true,
        },
      }),

      // Recent quote requests (NEW or in last 7 days)
      prisma.quoteRequest.count({
        where: {
          status: 'NEW',
        },
      }),

      // Today's pending tasks
      prisma.task.count({
        where: {
          dueDate: {
            gte: startOfToday,
            lte: endOfToday,
          },
          status: {
            not: 'DONE',
          },
        },
      }),

      // Active suppliers count
      prisma.supplier.count({
        where: {
          isActive: true,
        },
      }),

      // Total clients count
      prisma.client.count(),

      // Active catalog items count
      prisma.catalogItem.count({
        where: {
          isActive: true,
        },
      }),
    ]);

    // Financial calculations
    const totalProjects = allProjects.length;
    const activeProjects = allProjects.filter(
      (p) => !['COMPLETED', 'CANCELLED'].includes(p.status)
    ).length;
    const completedProjects = allProjects.filter((p) => p.status === 'COMPLETED').length;

    const { totalRevenue, totalCollected, totalPending, totalCosts, totalProfit, profitMargin } = summarizeProjectAmounts(allProjects);

    // Map projects by status into dictionary
    const projectsByStatus: Record<string, number> = {
      LEAD: 0,
      INSPECTION: 0,
      DESIGNING: 0,
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      IN_PRODUCTION: 0,
      READY: 0,
      INSTALLING: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };

    projectsByStatusGroup.forEach((group) => {
      projectsByStatus[group.status] = group._count.id;
    });

    return NextResponse.json({
      totalProjects,
      activeProjects,
      completedProjects,
      totalRevenue,
      totalCollected,
      totalPending,
      totalCosts,
      totalProfit,
      profitMargin,
      projectsByStatus,
      recentQuotes: recentQuotesCount,
      todayTasks: todayTasksCount,
      suppliersCount,
      clientsCount,
      catalogItemsCount,
    });
  } catch (error: unknown) {
    console.error('Error generating summary report:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary report' },
      { status: 500 }
    );
  }
}
