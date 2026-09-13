import type { Prisma } from "@prisma/client";

export async function auditClientChange(tx: Prisma.TransactionClient, input: {
  actorId: number; actorEmail: string; recordId: number; action: "INSERT" | "UPDATE" | "DELETE"; before?: unknown; after?: unknown;
}) {
  await tx.dataTransferJob.create({ data: {
    kind: "MANUAL_CRM", scope: "MODULE", module: "clients", status: "SUCCESS", rowCount: 1,
    actorId: input.actorId, actorEmail: input.actorEmail, completedAt: new Date(),
    changes: { create: {
      module: "clients", recordKey: String(input.recordId), action: input.action,
      actorId: input.actorId, actorEmail: input.actorEmail,
      beforeData: input.before ? JSON.stringify(input.before) : null,
      afterData: input.after ? JSON.stringify(input.after) : null,
    } },
  } });
}
