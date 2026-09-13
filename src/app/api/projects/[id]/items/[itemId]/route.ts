import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";

const ITEM_STATUSES = new Set(["PENDING", "ORDERED", "IN_PRODUCTION", "READY", "DELIVERED", "INSTALLED"]);

async function recalculateProject(transaction: Prisma.TransactionClient, projectId: number) {
  const items = await transaction.projectItem.findMany({
    where: { projectId },
    select: { quantity: true, unitCost: true, unitPrice: true },
  });
  return transaction.project.update({
    where: { id: projectId },
    data: {
      totalCost: items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
      totalPrice: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    },
  });
}

async function recalculateOrder(transaction: Prisma.TransactionClient, supplierOrderId: number) {
  const items = await transaction.orderItem.findMany({
    where: { supplierOrderId },
    include: { projectItem: { select: { unitCost: true } } },
  });
  return transaction.supplierOrder.update({
    where: { id: supplierOrderId },
    data: {
      totalAmount: items.reduce((sum, item) => sum + item.quantity * item.projectItem.unitCost, 0),
    },
  });
}

function parseIds(id: string, itemId: string) {
  const projectId = Number.parseInt(id, 10);
  const projectItemId = Number.parseInt(itemId, 10);
  return {
    projectId,
    projectItemId,
    valid: Number.isSafeInteger(projectId) && projectId > 0 && Number.isSafeInteger(projectItemId) && projectItemId > 0,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;

  try {
    const raw = await params;
    const ids = parseIds(raw.id, raw.itemId);
    if (!ids.valid) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = (await request.json()) as Record<string, unknown>;
    const hasChange = ["quantity", "status", "notes", "unitCost", "unitPrice", "leadTimeDays"]
      .some((key) => key in body);
    if (!hasChange) {
      return NextResponse.json({ error: "At least one editable field is required" }, { status: 400 });
    }

    const existing = await prisma.projectItem.findFirst({
      where: { id: ids.projectItemId, projectId: ids.projectId },
      include: { orderItems: { include: { supplierOrder: { select: { status: true } } } } },
    });
    if (!existing) return NextResponse.json({ error: "Project item not found" }, { status: 404 });

    const quantity = body.quantity === undefined ? undefined : Number.parseInt(String(body.quantity), 10);
    const unitCost = body.unitCost === undefined ? undefined : Number(body.unitCost);
    const unitPrice = body.unitPrice === undefined ? undefined : Number(body.unitPrice);
    const leadTimeDays = body.leadTimeDays === undefined ? undefined : Number.parseInt(String(body.leadTimeDays), 10);
    const status = body.status === undefined ? undefined : String(body.status).toUpperCase();
    if (quantity !== undefined && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000)) {
      return NextResponse.json({ error: "quantity must be an integer between 1 and 10000" }, { status: 400 });
    }
    if (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0)) {
      return NextResponse.json({ error: "unitCost must be a non-negative number" }, { status: 400 });
    }
    if (unitPrice !== undefined && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      return NextResponse.json({ error: "unitPrice must be a non-negative number" }, { status: 400 });
    }
    if (leadTimeDays !== undefined && (!Number.isSafeInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 3650)) {
      return NextResponse.json({ error: "leadTimeDays is invalid" }, { status: 400 });
    }
    if (status !== undefined && !ITEM_STATUSES.has(status)) {
      return NextResponse.json({ error: "Unsupported item status" }, { status: 400 });
    }
    if (
      quantity !== undefined
      && existing.orderItems.some(({ supplierOrder }) => ["SHIPPED", "DELIVERED"].includes(supplierOrder.status))
    ) {
      return NextResponse.json({ error: "Cannot change quantity after shipment or delivery" }, { status: 409 });
    }

    const supplierOrderIds = [...new Set(existing.orderItems.map((item) => item.supplierOrderId))];
    const updated = await prisma.$transaction(async (transaction) => {
      const item = await transaction.projectItem.update({
        where: { id: ids.projectItemId },
        data: {
          ...(quantity !== undefined ? { quantity } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(body.notes !== undefined ? { notes: body.notes === null ? null : String(body.notes).trim() || null } : {}),
          ...(unitCost !== undefined ? { unitCost } : {}),
          ...(unitPrice !== undefined ? { unitPrice } : {}),
          ...(leadTimeDays !== undefined ? { leadTimeDays } : {}),
        },
        include: { catalogItem: true },
      });
      if (quantity !== undefined) {
        await transaction.orderItem.updateMany({
          where: { projectItemId: ids.projectItemId },
          data: { quantity },
        });
      }
      await recalculateProject(transaction, ids.projectId);
      for (const orderId of supplierOrderIds) await recalculateOrder(transaction, orderId);
      return item;
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error("Error updating project item:", error);
    return NextResponse.json(
      { error: "Failed to update project item", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;

  try {
    const raw = await params;
    const ids = parseIds(raw.id, raw.itemId);
    if (!ids.valid) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const existing = await prisma.projectItem.findFirst({
      where: { id: ids.projectItemId, projectId: ids.projectId },
      include: { orderItems: { include: { supplierOrder: { select: { status: true } } } } },
    });
    if (!existing) return NextResponse.json({ error: "Project item not found" }, { status: 404 });
    if (existing.orderItems.some(({ supplierOrder }) => ["SHIPPED", "DELIVERED"].includes(supplierOrder.status))) {
      return NextResponse.json({ error: "Cannot remove an item after shipment or delivery" }, { status: 409 });
    }

    const supplierOrderIds = [...new Set(existing.orderItems.map((item) => item.supplierOrderId))];
    await prisma.$transaction(async (transaction) => {
      await transaction.orderItem.deleteMany({ where: { projectItemId: ids.projectItemId } });
      await transaction.projectItem.delete({ where: { id: ids.projectItemId } });
      await recalculateProject(transaction, ids.projectId);
      for (const orderId of supplierOrderIds) await recalculateOrder(transaction, orderId);
    });
    return NextResponse.json({ success: true, message: "تم حذف بند المشروع وإعادة حساب الإجماليات" });
  } catch (error: unknown) {
    console.error("Error deleting project item:", error);
    return NextResponse.json(
      { error: "Failed to delete project item", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
