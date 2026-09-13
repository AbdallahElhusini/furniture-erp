import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// POST /api/projects/[id]/dispatch - Dispatch project to suppliers (Sync Engine Trigger)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const projectId = parseInt(id, 10);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    // 1. Fetch project with all its items and their catalog items & suppliers
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
        items: {
          include: {
            catalogItem: {
              include: {
                supplier: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.items || project.items.length === 0) {
      return NextResponse.json(
        { error: 'لا يمكن إرسال أوامر التوريد: المشروع لا يحتوي على أي بنود' },
        { status: 400 }
      );
    }

    const existingOrderLinks = await prisma.orderItem.count({
      where: { projectItem: { projectId } },
    });
    if (existingOrderLinks > 0) {
      return NextResponse.json(
        { error: 'تم إرسال هذا المشروع بالفعل. عدّل أوامر التوريد الحالية بدلاً من إنشاء نسخة مكررة.' },
        { status: 409 },
      );
    }

    // 2. Group items by supplier
    // Map supplierId -> { supplier, items }
    type ProjectItemWithSupplier = (typeof project.items)[number];
    type AssignedSupplier = NonNullable<ProjectItemWithSupplier['catalogItem']['supplier']>;
    const supplierGroups = new Map<number, {
      supplier: AssignedSupplier;
      items: ProjectItemWithSupplier[];
    }>();
    const unassignedItems: ProjectItemWithSupplier[] = [];

    for (const item of project.items) {
      const supplier = item.catalogItem?.supplier;
      if (supplier?.id && supplier.isActive) {
        if (!supplierGroups.has(supplier.id)) {
          supplierGroups.set(supplier.id, { supplier, items: [] });
        }
        supplierGroups.get(supplier.id)!.items.push(item);
      } else {
        unassignedItems.push(item);
      }
    }

    if (unassignedItems.length > 0) {
      return NextResponse.json(
        {
          error: 'تعذر الإرسال: يجب تعيين مورد فعّال لكل بند قبل إنشاء أوامر التوريد.',
          unassignedItems: unassignedItems.map((item) => ({
            id: item.id,
            sku: item.catalogItem.sku,
            nameAr: item.catalogItem.nameAr,
          })),
        },
        { status: 409 },
      );
    }

    if (supplierGroups.size === 0) {
      return NextResponse.json(
        { error: 'لا يوجد موردين مرتبطين ببنود هذا المشروع. يرجى تحديد الموردين أولاً.' },
        { status: 400 }
      );
    }

    // 3. Calculate max lead time among all items and calculate sync date
    let maxLeadTime = 0;
    for (const item of project.items) {
      const lead = item.leadTimeDays || item.catalogItem?.leadTimeDays || 7;
      if (lead > maxLeadTime) {
        maxLeadTime = lead;
      }
    }

    // Sync date = today + maxLeadTime + 2 days buffer
    const today = new Date();
    const syncDate = new Date(today);
    syncDate.setDate(today.getDate() + maxLeadTime + 2);

    // 4. Perform database operations inside transaction
    const result = await prisma.$transaction(async (tx) => {
      const createdOrders = [];
      const createdTasks = [];

      for (const [supplierId, group] of supplierGroups.entries()) {
        const { supplier, items } = group;

        // Calculate total amount for this supplier
        const totalAmount = items.reduce(
          (sum, item) => sum + item.quantity * item.unitCost,
          0
        );

        // Calculate supplier max lead time
        let supplierMaxLead = 0;
        for (const it of items) {
          const l = it.leadTimeDays || it.catalogItem?.leadTimeDays || 7;
          if (l > supplierMaxLead) supplierMaxLead = l;
        }
        const supplierExpectedDate = new Date(today);
        supplierExpectedDate.setDate(today.getDate() + supplierMaxLead);

        // Create SupplierOrder
        const supplierOrder = await tx.supplierOrder.create({
          data: {
            supplierId,
            projectId,
            status: 'PENDING',
            orderDate: today,
            expectedDate: supplierExpectedDate,
            totalAmount,
            amountPaid: 0,
            notes: `أمر توريد لمشروع: ${project.title} - العميل: ${project.client.name}`,
            items: {
              create: items.map((item) => ({
                projectItemId: item.id,
                quantity: item.quantity,
              })),
            },
          },
          include: {
            supplier: true,
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
        });

        createdOrders.push(supplierOrder);

        // Update ProjectItem status to IN_PRODUCTION
        for (const item of items) {
          await tx.projectItem.update({
            where: { id: item.id },
            data: { status: 'IN_PRODUCTION' },
          });
        }

        // Create Follow-up Task for this supplier order
        const task = await tx.task.create({
          data: {
            projectId,
            type: 'SUPPLIER_FOLLOWUP',
            title: `متابعة أمر توريد مع ${supplier.name} - ${project.title}`,
            description: `متابعة تصنيع وتوريد عدد ${items.length} صنف من ${supplier.name}. تاريخ التسليم المتوقع: ${supplierExpectedDate.toLocaleDateString('ar-EG')}`,
            dueDate: supplierExpectedDate,
            status: 'TODO',
            priority: 'HIGH',
          },
        });

        createdTasks.push(task);
      }

      // Update Project status, syncDate, and estimatedDelivery
      const updatedProject = await tx.project.update({
        where: { id: projectId },
        data: {
          status: 'IN_PRODUCTION',
          syncDate,
          estimatedDelivery: syncDate,
        },
        include: {
          client: true,
          supplierOrders: {
            include: {
              supplier: true,
              items: true,
            },
          },
          tasks: true,
        },
      });

      return {
        project: updatedProject,
        createdOrders,
        createdTasks,
      };
    });

    return NextResponse.json({
      success: true,
      message: 'تم إرسال أوامر التوريد للمصانع وحساب تاريخ المزامنة بنجاح',
      syncDate,
      maxLeadTimeDays: maxLeadTime,
      bufferDays: 2,
      totalLeadTimeDays: maxLeadTime + 2,
      supplierOrders: result.createdOrders,
      tasks: result.createdTasks,
      project: result.project,
      unassignedItemsCount: unassignedItems.length,
    });
  } catch (error: unknown) {
    console.error('Error dispatching project to suppliers:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'تم إرسال المشروع بالفعل أو تغيّرت أوامر التوريد بالتزامن. حدّث الصفحة.' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to dispatch project' },
      { status: 500 }
    );
  }
}
