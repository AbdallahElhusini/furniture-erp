import { prisma } from '@/lib/db';
import type {
  ProjectTimeline,
  ProjectSyncStatus,
  SupplierDispatchResult,
  SyncStatusItem,
  TimelineMilestone,
  MilestoneStatus,
  ProjectStatus,
  ProjectType,
  Priority,
  SupplierOrderStatus,
  ProjectItemStatus,
} from '@/types';

/**
 * Calculates the synchronization date based on the longest manufacturing lead time + 2-day buffer.
 * If items list is empty or lead times are 0, sets sync date to startDate + 2 days.
 *
 * @param items Array of items with leadTimeDays property
 * @param startDate Optional starting date (defaults to current date)
 * @returns Calculated sync Date
 */
export function calculateSyncDate(
  items: Array<{ leadTimeDays: number }>,
  startDate: Date = new Date()
): Date {
  const base = new Date(startDate.getTime());
  const maxLeadTime = items.length > 0 ? Math.max(...items.map((i) => i.leadTimeDays || 0), 0) : 0;
  
  // Base date + max lead time + 2-day safety buffer
  base.setDate(base.getDate() + maxLeadTime + 2);
  return base;
}

/**
 * Breaks down a project into supplier purchase orders by grouping project items by their assigned supplier.
 * Creates SupplierOrder records, OrderItem relations, follow-up Tasks, and updates the Project's syncDate.
 *
 * @param projectId Project ID to dispatch
 * @returns SupplierDispatchResult with details of created orders and sync date
 */
export async function dispatchProjectToSuppliers(projectId: number): Promise<SupplierDispatchResult> {
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
          orderItems: true,
        },
      },
      supplierOrders: {
        include: {
          supplier: true,
          items: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error(`المشروع رقم ${projectId} غير موجود.`);
  }

  if (!project.items || project.items.length === 0) {
    throw new Error(`لا توجد بنود مسجلة في المشروع رقم ${projectId} لتوزيعها على الموردين.`);
  }

  // Group items by supplierId
  const supplierGroups = new Map<
    number,
    {
      supplierId: number;
      supplierName: string;
      items: typeof project.items;
      totalCost: number;
      maxLeadTime: number;
    }
  >();

  const unassignedItems: typeof project.items = [];

  for (const item of project.items) {
    const supplier = item.catalogItem.supplier;
    const supplierId = item.catalogItem.supplierId || (supplier ? supplier.id : null);

    if (!supplierId || !supplier) {
      unassignedItems.push(item);
      continue;
    }

    const group = supplierGroups.get(supplierId) || {
      supplierId,
      supplierName: supplier.name,
      items: [],
      totalCost: 0,
      maxLeadTime: 0,
    };

    group.items.push(item);
    group.totalCost += item.unitCost * item.quantity;
    const leadTime = item.leadTimeDays || item.catalogItem.leadTimeDays || 7;
    if (leadTime > group.maxLeadTime) {
      group.maxLeadTime = leadTime;
    }

    supplierGroups.set(supplierId, group);
  }

  const dispatchedOrders: SupplierDispatchResult['dispatchedOrders'] = [];
  const now = new Date();

  // Run database modifications in a transaction
  await prisma.$transaction(async (tx) => {
    for (const [, group] of supplierGroups) {
      // Calculate supplier expected date
      const expectedDeliveryDate = new Date(now.getTime());
      expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + group.maxLeadTime);

      // Check if an active order already exists for this project and supplier
      let supplierOrder = await tx.supplierOrder.findFirst({
        where: {
          projectId,
          supplierId: group.supplierId,
          status: { in: ['PENDING', 'CONFIRMED', 'IN_PRODUCTION'] },
        },
      });

      if (supplierOrder) {
        // Update existing order amount
        supplierOrder = await tx.supplierOrder.update({
          where: { id: supplierOrder.id },
          data: {
            totalAmount: supplierOrder.totalAmount + group.totalCost,
            expectedDate: expectedDeliveryDate,
            updatedAt: now,
          },
        });
      } else {
        // Create new supplier order
        supplierOrder = await tx.supplierOrder.create({
          data: {
            projectId,
            supplierId: group.supplierId,
            status: 'PENDING',
            orderDate: now,
            expectedDate: expectedDeliveryDate,
            totalAmount: group.totalCost,
            amountPaid: 0,
            notes: `أمر توريد آلي للمشروع: ${project.title}`,
          },
        });

        // Create follow-up task for the operations team
        const taskDueDate = new Date(now.getTime());
        taskDueDate.setDate(taskDueDate.getDate() + Math.max(1, Math.floor(group.maxLeadTime / 2)));

        await tx.task.create({
          data: {
            projectId,
            type: 'SUPPLIER_FOLLOWUP',
            title: `متابعة تصنيع بنود ${group.supplierName} - ${project.title}`,
            description: `متابعة جاهزية ${group.items.length} منتج من مصنع ${group.supplierName}. موعد التسليم المتوقع: ${expectedDeliveryDate.toISOString().slice(0, 10)}`,
            dueDate: taskDueDate,
            status: 'TODO',
            priority: group.maxLeadTime > 14 ? 'HIGH' : 'MEDIUM',
          },
        });
      }

      // Link project items to the supplier order via OrderItem
      for (const item of group.items) {
        // Check if item is already linked to this order
        const existingOrderItem = await tx.orderItem.findFirst({
          where: {
            supplierOrderId: supplierOrder.id,
            projectItemId: item.id,
          },
        });

        if (!existingOrderItem) {
          await tx.orderItem.create({
            data: {
              supplierOrderId: supplierOrder.id,
              projectItemId: item.id,
              quantity: item.quantity,
            },
          });
        }

        // Update project item status to ORDERED if it was PENDING
        if (item.status === 'PENDING') {
          await tx.projectItem.update({
            where: { id: item.id },
            data: {
              status: 'ORDERED',
              leadTimeDays: item.leadTimeDays || item.catalogItem.leadTimeDays,
            },
          });
        }
      }

      dispatchedOrders.push({
        supplierOrderId: supplierOrder.id,
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        itemsCount: group.items.length,
        totalAmount: group.totalCost,
        maxLeadTimeDays: group.maxLeadTime,
        expectedDeliveryDate,
      });
    }

    // Calculate project overall syncDate (longest manufacturing time of all items + 2 days buffer)
    const overallSyncDate = calculateSyncDate(
      project.items.map((i) => ({
        leadTimeDays: i.leadTimeDays || i.catalogItem.leadTimeDays || 7,
      })),
      now
    );

    // Update project syncDate and advance status to IN_PRODUCTION if it was in APPROVED or earlier
    const nextStatus = ['LEAD', 'INSPECTION', 'DESIGNING', 'PENDING_APPROVAL', 'APPROVED'].includes(
      project.status
    )
      ? 'IN_PRODUCTION'
      : project.status;

    await tx.project.update({
      where: { id: projectId },
      data: {
        syncDate: overallSyncDate,
        status: nextStatus,
        estimatedDelivery: project.estimatedDelivery || overallSyncDate,
        updatedAt: now,
      },
    });
  });

  const calculatedSyncDate = calculateSyncDate(
    project.items.map((i) => ({
      leadTimeDays: i.leadTimeDays || i.catalogItem.leadTimeDays || 7,
    })),
    now
  );

  return {
    success: true,
    projectId,
    message: `تم توزيع بنود المشروع بنجاح على ${supplierGroups.size} مصنع/مورد.`,
    createdOrdersCount: dispatchedOrders.length,
    totalSuppliersInvolved: supplierGroups.size,
    dispatchedOrders,
    unassignedItemsCount: unassignedItems.length,
    calculatedSyncDate,
  };
}

/**
 * Generates a comprehensive timeline with milestones, dates, progress, and bottleneck analysis for a project.
 *
 * @param projectId Project ID
 * @returns ProjectTimeline object
 */
export async function calculateProjectTimeline(projectId: number): Promise<ProjectTimeline> {
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
      supplierOrders: {
        include: {
          supplier: true,
          items: true,
        },
      },
      tasks: {
        include: {
          technician: true,
        },
      },
      payments: true,
    },
  });

  if (!project) {
    throw new Error(`المشروع رقم ${projectId} غير موجود.`);
  }

  const now = new Date();
  const bottlenecks: string[] = [];

  // Calculate items lead times & sync date
  const longestItem = project.items.reduce<typeof project.items[0] | null>((max, curr) => {
    const currLead = curr.leadTimeDays || curr.catalogItem.leadTimeDays || 0;
    const maxLead = max ? max.leadTimeDays || max.catalogItem.leadTimeDays || 0 : -1;
    return currLead > maxLead ? curr : max;
  }, null);

  const longestLeadDays = longestItem
    ? longestItem.leadTimeDays || longestItem.catalogItem.leadTimeDays || 7
    : 7;

  const syncDate = project.syncDate || calculateSyncDate(
    project.items.map((i) => ({ leadTimeDays: i.leadTimeDays || i.catalogItem.leadTimeDays || 7 })),
    project.approvalDate || project.createdAt
  );

  if (longestItem && longestLeadDays >= 14) {
    bottlenecks.push(
      `المنتج "${longestItem.catalogItem.nameAr}" يمثل أطول مدة تصنيع (${longestLeadDays} يوم) من ${
        longestItem.catalogItem.supplier?.name || 'المصنع'
      }`
    );
  }

  // Check supplier delays
  for (const order of project.supplierOrders) {
    if (order.expectedDate && new Date(order.expectedDate) < now && order.status !== 'DELIVERED') {
      bottlenecks.push(
        `تأخر أمر التوريد للمصنع "${order.supplier.name}" (كان متوقعاً في ${order.expectedDate.toISOString().slice(0, 10)})`
      );
    }
  }

  // Check overdue tasks
  const overdueTasks = project.tasks.filter((t) => t.status !== 'DONE' && new Date(t.dueDate) < now);
  if (overdueTasks.length > 0) {
    bottlenecks.push(`يوجد عدد (${overdueTasks.length}) مهام متأخرة عن موعد استحقاقها`);
  }

  // Build 8 core milestones
  const milestones: TimelineMilestone[] = [];

  // Helper to determine milestone status
  const getStatus = (
    isCompleted: boolean,
    isInProgress: boolean,
    dueDate?: Date | null
  ): MilestoneStatus => {
    if (isCompleted) return 'completed';
    if (dueDate && new Date(dueDate) < now) return 'overdue';
    if (isInProgress) return 'in_progress';
    return 'pending';
  };

  // Status index mapping
  const statusLevels: Record<ProjectStatus, number> = {
    LEAD: 1,
    INSPECTION: 2,
    DESIGNING: 3,
    PENDING_APPROVAL: 4,
    APPROVED: 5,
    IN_PRODUCTION: 6,
    READY: 7,
    INSTALLING: 8,
    COMPLETED: 9,
    CANCELLED: 0,
  };

  const currentLevel = statusLevels[project.status as ProjectStatus] || 1;

  // 1. Lead / Initial Inquiry
  const leadTasks = project.tasks.filter((t) => t.type === 'GENERAL' || t.type === 'INSPECTION');
  milestones.push({
    id: 'milestone-lead',
    phaseOrder: 1,
    titleAr: 'تسجيل الطلب والبيانات الأولية',
    titleEn: 'Lead & Requirement Intake',
    descriptionAr: 'تم تسجيل العميل وتوثيق متطلبات المشروع المبدئية',
    descriptionEn: 'Client registered and initial requirements documented',
    plannedDate: project.createdAt,
    actualDate: project.createdAt,
    status: 'completed',
    progress: 100,
    icon: '📝',
    tasks: leadTasks,
  });

  // 2. Site Inspection
  const isInspectionDone = currentLevel > 2 || !!project.inspectionDate;
  const inspectionTasks = project.tasks.filter((t) => t.type === 'INSPECTION');
  milestones.push({
    id: 'milestone-inspection',
    phaseOrder: 2,
    titleAr: 'المعاينة الميدانية ورفع المقاسات',
    titleEn: 'Site Inspection & Measurements',
    descriptionAr: project.inspectionDate
      ? `تمت جدولة/تنفيذ المعاينة بتاريخ ${project.inspectionDate.toISOString().slice(0, 10)}`
      : 'زيارة موقع العميل ورفع المقاسات الدقيقة',
    descriptionEn: 'Site inspection and architectural dimensions verification',
    plannedDate: project.inspectionDate,
    actualDate: project.inspectionDate,
    status: getStatus(isInspectionDone, currentLevel === 2, project.inspectionDate),
    progress: isInspectionDone ? 100 : currentLevel === 2 ? 50 : 0,
    icon: '📐',
    tasks: inspectionTasks,
  });

  // 3. 3D Design & Quotation
  const isDesignDone = currentLevel >= 4;
  const designTasks = project.tasks.filter((t) => t.type === 'DESIGN');
  milestones.push({
    id: 'milestone-design',
    phaseOrder: 3,
    titleAr: 'التصميم وإعداد عرض الأسعار',
    titleEn: '3D Design & Proposal',
    descriptionAr: 'إعداد الرسومات التنفيذية وتحديد التكلفة الإجمالية والبنود',
    descriptionEn: 'Engineering 3D renders, bill of quantities, and pricing',
    plannedDate: project.designDeadline,
    actualDate: isDesignDone ? project.approvalDate || project.designDeadline : null,
    status: getStatus(isDesignDone, currentLevel === 3, project.designDeadline),
    progress: isDesignDone ? 100 : currentLevel === 3 ? 60 : 0,
    icon: '🎨',
    tasks: designTasks,
  });

  // 4. Approval & Deposit
  const isApproved = currentLevel >= 5 || !!project.approvalDate;
  milestones.push({
    id: 'milestone-approval',
    phaseOrder: 4,
    titleAr: 'اعتماد العميل وسداد الدفعة المقدمة',
    titleEn: 'Client Approval & Down Payment',
    descriptionAr: project.approvalDate
      ? `تم الاعتماد بتاريخ ${project.approvalDate.toISOString().slice(0, 10)} (مسدد: ${project.amountPaid.toLocaleString('ar-EG')} ج.م)`
      : 'موافقة العميل الرسمية وتوقيع العقد وسداد الدفعة الأولى',
    descriptionEn: 'Client agreement signature and advance payment confirmation',
    plannedDate: project.approvalDate,
    actualDate: project.approvalDate,
    status: getStatus(isApproved, currentLevel === 4, null),
    progress: isApproved ? 100 : project.amountPaid > 0 ? 70 : 0,
    icon: '✍️',
  });

  // 5. Supplier Dispatch & Factory Production
  const totalItems = project.items.length;
  const readyItems = project.items.filter((i) => ['READY', 'DELIVERED', 'INSTALLED'].includes(i.status)).length;
  const productionProgress = totalItems > 0 ? Math.round((readyItems / totalItems) * 100) : 0;
  const isProductionDone = currentLevel >= 7 || (totalItems > 0 && readyItems === totalItems);
  const supplierTasks = project.tasks.filter((t) => t.type === 'SUPPLIER_FOLLOWUP');
  
  milestones.push({
    id: 'milestone-production',
    phaseOrder: 5,
    titleAr: 'التوزيع على المصانع والتصنيع المتزامن',
    titleEn: 'Supplier Dispatch & Production',
    descriptionAr: `تم توزيع البنود على المصانع (${readyItems} من ${totalItems} بنود جاهزة)`,
    descriptionEn: `Items dispatched to factories (${readyItems}/${totalItems} ready)`,
    plannedDate: syncDate,
    actualDate: isProductionDone ? syncDate : null,
    status: getStatus(isProductionDone, currentLevel === 6, syncDate),
    progress: isProductionDone ? 100 : productionProgress,
    icon: '🏭',
    tasks: supplierTasks,
  });

  // 6. Products Ready & Synchronization Date
  const isReadyForDelivery = currentLevel >= 7;
  milestones.push({
    id: 'milestone-sync',
    phaseOrder: 6,
    titleAr: 'اكتمال التصنيع ومزامنة التجميع بالمخزن',
    titleEn: 'Sync Date & Assembly Hub',
    descriptionAr: `تاريخ المزامنة المستهدف: ${syncDate.toISOString().slice(0, 10)} (أطول مدة تصنيع + يومين عازل)`,
    descriptionEn: `Target sync date: ${syncDate.toISOString().slice(0, 10)} (includes buffer)`,
    plannedDate: syncDate,
    actualDate: isReadyForDelivery ? syncDate : null,
    status: getStatus(isReadyForDelivery, currentLevel === 7, syncDate),
    progress: isReadyForDelivery ? 100 : productionProgress,
    icon: '📦',
  });

  // 7. Delivery & Installation
  const isInstalled = currentLevel >= 9;
  const installationTasks = project.tasks.filter((t) => t.type === 'INSTALLATION' || t.type === 'DELIVERY');
  milestones.push({
    id: 'milestone-installation',
    phaseOrder: 7,
    titleAr: 'الشحن والتركيب بالموقع',
    titleEn: 'Delivery & Site Installation',
    descriptionAr: project.estimatedDelivery
      ? `موعد التسليم والتركيب المخطط: ${project.estimatedDelivery.toISOString().slice(0, 10)}`
      : 'نقل الأثاث وتركيبه بواسطة الفنيين في مقر العميل',
    descriptionEn: 'Transportation and on-site assembly by technicians',
    plannedDate: project.estimatedDelivery,
    actualDate: isInstalled ? project.estimatedDelivery : null,
    status: getStatus(isInstalled, currentLevel === 8, project.estimatedDelivery),
    progress: isInstalled ? 100 : currentLevel === 8 ? 50 : 0,
    icon: '🚚',
    tasks: installationTasks,
  });

  // 8. Final Handover & Sign-off
  const isCompleted = project.status === 'COMPLETED';
  milestones.push({
    id: 'milestone-completion',
    phaseOrder: 8,
    titleAr: 'التسليم النهائي وإغلاق المشروع',
    titleEn: 'Final Handover & Project Closure',
    descriptionAr: isCompleted
      ? 'تم تسليم المشروع بالكامل واستلام جميع المستحقات المالية'
      : 'مراجعة الجودة وتوقيع محضر الاستلام النهائي وتحصيل المتبقي',
    descriptionEn: 'Quality sign-off, final invoice collection, and warranty handover',
    plannedDate: project.estimatedDelivery,
    actualDate: isCompleted ? project.updatedAt : null,
    status: isCompleted ? 'completed' : 'pending',
    progress: isCompleted ? 100 : 0,
    icon: '✅',
  });

  // Calculate overall progress percentage
  const totalProgress = milestones.reduce((sum, m) => sum + m.progress, 0);
  const progressPercentage = Math.round(totalProgress / milestones.length);

  // Determine current human-friendly phase
  const activeMilestone = milestones.find((m) => m.status === 'in_progress' || m.status === 'overdue') ||
    milestones.find((m) => m.status === 'pending') ||
    milestones[milestones.length - 1];

  const currentPhase = activeMilestone ? activeMilestone.titleAr : 'مكتمل';

  // Calculate days remaining until delivery or syncDate
  const targetDate = project.estimatedDelivery || syncDate;
  const diffTime = targetDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isDelayed = daysRemaining < 0 && project.status !== 'COMPLETED';

  return {
    projectId: project.id,
    projectTitle: project.title,
    clientName: project.client.name,
    projectType: project.type as ProjectType,
    status: project.status as ProjectStatus,
    priority: project.priority as Priority,
    progressPercentage,
    currentPhase,
    isDelayed,
    daysRemaining,
    createdAt: project.createdAt,
    inspectionDate: project.inspectionDate,
    designDeadline: project.designDeadline,
    approvalDate: project.approvalDate,
    syncDate: project.syncDate,
    estimatedDelivery: project.estimatedDelivery,
    milestones,
    bottlenecks,
  };
}

/**
 * Returns detailed synchronization status showing which items are ready, which are in production,
 * supplier orders breakdown, bottleneck item, and completion metrics.
 *
 * @param projectId Project ID
 * @returns ProjectSyncStatus object
 */
export async function getProjectSyncStatus(projectId: number): Promise<ProjectSyncStatus> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      items: {
        include: {
          catalogItem: {
            include: {
              category: true,
              supplier: true,
            },
          },
          orderItems: {
            include: {
              supplierOrder: {
                include: {
                  supplier: true,
                },
              },
            },
          },
        },
      },
      supplierOrders: {
        include: {
          supplier: true,
          items: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error(`المشروع رقم ${projectId} غير موجود.`);
  }

  const now = new Date();
  const totalItems = project.items.length;

  let readyItemsCount = 0;
  let inProductionItemsCount = 0;
  let orderedItemsCount = 0;
  let pendingItemsCount = 0;
  let longestLeadTimeDays = 0;
  let bottleneckItem: SyncStatusItem | null = null;

  const items: SyncStatusItem[] = project.items.map((item) => {
    const leadTime = item.leadTimeDays || item.catalogItem.leadTimeDays || 7;
    const isReady = ['READY', 'DELIVERED', 'INSTALLED'].includes(item.status);

    if (isReady) readyItemsCount++;
    else if (item.status === 'IN_PRODUCTION') inProductionItemsCount++;
    else if (item.status === 'ORDERED') orderedItemsCount++;
    else pendingItemsCount++;

    const orderItem = item.orderItems[0];
    const supplierOrder = orderItem?.supplierOrder;
    const expectedDeliveryDate = supplierOrder?.expectedDate || null;

    let daysRemaining = 0;
    if (expectedDeliveryDate) {
      daysRemaining = Math.ceil(
        (new Date(expectedDeliveryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    } else {
      daysRemaining = leadTime;
    }

    const syncItem: SyncStatusItem = {
      id: item.id,
      catalogItemId: item.catalogItemId,
      nameAr: item.catalogItem.nameAr,
      nameEn: item.catalogItem.nameEn,
      sku: item.catalogItem.sku,
      categoryNameAr: item.catalogItem.category?.nameAr,
      supplierId: item.catalogItem.supplierId,
      supplierName: item.catalogItem.supplier?.name || null,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unitPrice: item.unitPrice,
      leadTimeDays: leadTime,
      status: item.status as ProjectItemStatus,
      isReady,
      supplierOrderId: supplierOrder?.id || null,
      supplierOrderStatus: (supplierOrder?.status as SupplierOrderStatus) || null,
      expectedDeliveryDate,
      daysRemaining,
      isBottleneck: false,
    };

    if (leadTime > longestLeadTimeDays) {
      longestLeadTimeDays = leadTime;
      bottleneckItem = syncItem;
    }

    return syncItem;
  });

  if (bottleneckItem) {
    (bottleneckItem as SyncStatusItem).isBottleneck = true;
  }

  const completionPercentage = totalItems > 0 ? Math.round((readyItemsCount / totalItems) * 100) : 0;
  const isFullySynced = totalItems > 0 && readyItemsCount === totalItems;

  const calculatedSyncDate = calculateSyncDate(
    project.items.map((i) => ({ leadTimeDays: i.leadTimeDays || i.catalogItem.leadTimeDays || 7 })),
    project.approvalDate || project.createdAt
  );

  const supplierOrders = project.supplierOrders.map((order) => {
    const isOrderReady = ['READY', 'SHIPPED', 'DELIVERED'].includes(order.status);
    return {
      id: order.id,
      supplierId: order.supplierId,
      supplierName: order.supplier.name,
      status: order.status as SupplierOrderStatus,
      orderDate: order.orderDate,
      expectedDate: order.expectedDate,
      totalAmount: order.totalAmount,
      amountPaid: order.amountPaid,
      itemsCount: order.items.length,
      isReady: isOrderReady,
    };
  });

  return {
    projectId: project.id,
    projectTitle: project.title,
    projectStatus: project.status as ProjectStatus,
    isFullySynced,
    totalItems,
    readyItemsCount,
    inProductionItemsCount,
    orderedItemsCount,
    pendingItemsCount,
    completionPercentage,
    longestLeadTimeDays,
    bottleneckItem,
    calculatedSyncDate: project.syncDate || calculatedSyncDate,
    estimatedDelivery: project.estimatedDelivery,
    items,
    supplierOrders,
  };
}

/**
 * Updates the status of a project item and automatically synchronizes
 * related supplier orders and parent project state.
 *
 * @param projectItemId Project item ID
 * @param status New ProjectItemStatus
 */
export async function updateItemProductionStatus(
  projectItemId: number,
  status: ProjectItemStatus
): Promise<{ success: boolean; projectUpdated: boolean; orderUpdated: boolean }> {
  const item = await prisma.projectItem.findUnique({
    where: { id: projectItemId },
    include: {
      orderItems: {
        include: {
          supplierOrder: {
            include: {
              items: {
                include: {
                  projectItem: true,
                },
              },
            },
          },
        },
      },
      project: {
        include: {
          items: true,
        },
      },
    },
  });

  if (!item) {
    throw new Error(`البند رقم ${projectItemId} غير موجود.`);
  }

  let orderUpdated = false;
  let projectUpdated = false;

  await prisma.$transaction(async (tx) => {
    // 1. Update the item status
    await tx.projectItem.update({
      where: { id: projectItemId },
      data: { status },
    });

    // 2. Check and update parent supplier order if all its items are READY
    for (const orderItem of item.orderItems) {
      const order = orderItem.supplierOrder;
      if (order) {
        const siblingItems = order.items.map((oi) =>
          oi.projectItemId === projectItemId ? { ...oi.projectItem, status } : oi.projectItem
        );

        const allOrderItemsReady = siblingItems.every((si) =>
          ['READY', 'DELIVERED', 'INSTALLED'].includes(si.status)
        );

        if (allOrderItemsReady && order.status !== 'READY' && order.status !== 'DELIVERED') {
          await tx.supplierOrder.update({
            where: { id: order.id },
            data: { status: 'READY' },
          });
          orderUpdated = true;
        }
      }
    }

    // 3. Check and update parent project if all items are READY
    const projectItems = item.project.items.map((pi) =>
      pi.id === projectItemId ? { ...pi, status } : pi
    );

    const allProjectItemsReady = projectItems.every((pi) =>
      ['READY', 'DELIVERED', 'INSTALLED'].includes(pi.status)
    );

    if (allProjectItemsReady && item.project.status === 'IN_PRODUCTION') {
      await tx.project.update({
        where: { id: item.projectId },
        data: { status: 'READY' },
      });
      projectUpdated = true;
    }
  });

  return { success: true, projectUpdated, orderUpdated };
}
