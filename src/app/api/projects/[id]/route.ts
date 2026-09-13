import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireLiveAdminSession } from '@/lib/api-auth';
import { PRIVILEGED_API_ROLES } from '@/lib/roles';
import { hasProjectFinancialHistory, projectMoney, ProjectWriteError } from '@/lib/project-write-guards';
import { InvalidJsonBodyError, readBoundedJson, RequestBodyTooLargeError } from '@/lib/public-request-security';

// GET /api/projects/[id] - Fetch single project with ALL relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const projectId = /^[1-9]\d*$/.test(id) ? Number(id) : NaN;

    if (!Number.isSafeInteger(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
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
          orderBy: { createdAt: 'desc' },
        },
        tasks: {
          include: {
            technician: true,
          },
          orderBy: { dueDate: 'asc' },
        },
        payments: {
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error: unknown) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id] - Update project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const projectId = /^[1-9]\d*$/.test(id) ? Number(id) : NaN;

    if (!Number.isSafeInteger(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const input = await readBoundedJson(request, 32_768);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InvalidJsonBodyError('Expected an object');
    const body = input as Record<string, unknown>;
    const {
      clientId,
      title,
      type,
      status,
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
    } = body;

    if (amountPaid !== undefined && projectMoney(amountPaid) !== existingProject.amountPaid) {
      throw new ProjectWriteError('سجّل التحصيل أو تصحيحه من شيت الحسابات، للحفاظ على سجل المدفوعات.', 409);
    }
    if (clientId !== undefined && (!/^[1-9]\d*$/.test(String(clientId)) || !Number.isSafeInteger(Number(clientId)))) throw new ProjectWriteError('معرّف العميل غير صحيح.');
    for (const value of [title, type, status, notes, priority]) {
      if (value !== undefined && value !== null && typeof value !== 'string') throw new ProjectWriteError('بيانات المشروع النصية غير صحيحة.');
    }
    const dateValue = (value: unknown): Date | null => {
      if (value === '' || value === null) return null;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) throw new ProjectWriteError('تاريخ المشروع غير صحيح.');
      const date = new Date(value);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new ProjectWriteError('تاريخ المشروع غير صحيح.');
      return date;
    };

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(clientId !== undefined && { clientId: parseInt(String(clientId), 10) }),
        ...(title !== undefined && { title: String(title) }),
        ...(type !== undefined && { type: String(type) }),
        ...(status !== undefined && { status: String(status) }),
        ...(inspectionDate !== undefined && {
          inspectionDate: dateValue(inspectionDate),
        }),
        ...(designDeadline !== undefined && {
          designDeadline: dateValue(designDeadline),
        }),
        ...(approvalDate !== undefined && {
          approvalDate: dateValue(approvalDate),
        }),
        ...(estimatedDelivery !== undefined && {
          estimatedDelivery: dateValue(estimatedDelivery),
        }),
        ...(syncDate !== undefined && {
          syncDate: dateValue(syncDate),
        }),
        ...(totalCost !== undefined && { totalCost: projectMoney(totalCost) }),
        ...(totalPrice !== undefined && { totalPrice: projectMoney(totalPrice) }),
        ...(shippingCost !== undefined && { shippingCost: projectMoney(shippingCost) }),
        ...(installationCost !== undefined && {
          installationCost: projectMoney(installationCost),
        }),
        ...(notes !== undefined && { notes: notes === null ? null : String(notes) }),
        ...(priority !== undefined && { priority: String(priority) }),
      },
      include: {
        client: true,
        items: {
          include: {
            catalogItem: true,
          },
        },
        supplierOrders: {
          include: {
            supplier: true,
          },
        },
        tasks: true,
        payments: true,
      },
    });

    return NextResponse.json(updatedProject);
  } catch (error: unknown) {
    if (error instanceof ProjectWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof InvalidJsonBodyError || error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: 'بيانات الطلب غير صحيحة.' }, { status: error instanceof RequestBodyTooLargeError ? 413 : 400 });
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const projectId = /^[1-9]\d*$/.test(id) ? Number(id) : NaN;

    if (!Number.isSafeInteger(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.project.findUnique({
        where: { id: projectId },
        include: { _count: { select: { payments: true, financeEntries: true } }, supplierOrders: { select: { amountPaid: true } } },
      });
      if (!existing) throw new ProjectWriteError('المشروع غير موجود.', 404);
      if (hasProjectFinancialHistory(existing)) throw new ProjectWriteError('المشروع مرتبط بحركات أو أرصدة مالية؛ غيّر حالته إلى ملغى بدل حذف سجل الحسابات.', 409);
      await tx.project.delete({ where: { id: projectId } });
      await tx.dataTransferJob.create({ data: {
        kind: 'PROJECT_EDIT', scope: 'OPERATIONS', module: 'projects', status: 'SUCCESS', rowCount: 1,
        actorId: auth.user.id, actorEmail: auth.user.email, completedAt: new Date(),
        changes: { create: { module: 'projects', recordKey: String(projectId), action: 'DELETE', beforeData: JSON.stringify(existing), actorId: auth.user.id, actorEmail: auth.user.email } },
      } });
    });

    return NextResponse.json({
      success: true,
      message: 'تم حذف المشروع بنجاح',
    });
  } catch (error: unknown) {
    if (error instanceof ProjectWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
