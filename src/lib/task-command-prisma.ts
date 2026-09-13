import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "./session.ts";
import prisma from "./db.ts";
import type {
  CreateTaskValues,
  TaskCommand,
  TaskCommandContext,
  TaskCommandRepository,
  TaskCommandResult,
  UpdateTaskValues,
} from "./task-command-bus.ts";
import { executeTaskCommand } from "./task-command-bus.ts";

type TaskPrismaClient = Pick<Prisma.TransactionClient, "task" | "project" | "technician">;

/**
 * Builds the task command adapter for either the shared Prisma client or an
 * existing transaction. Assistant execution uses the latter so validation,
 * mutation, postcondition checks, and the ERP audit commit atomically.
 */
export function createPrismaTaskCommandRepository(
  client: TaskPrismaClient = prisma,
): TaskCommandRepository {
  return {
    findTaskById(taskId) {
      return client.task.findUnique({ where: { id: taskId } });
    },
    async projectExists(projectId) {
      return (await client.project.count({ where: { id: projectId } })) === 1;
    },
    async technicianExists(technicianId) {
      return (await client.technician.count({ where: { id: technicianId } })) === 1;
    },
    createTask(values: CreateTaskValues) {
      return client.task.create({ data: values });
    },
    updateTask(taskId: number, values: UpdateTaskValues) {
      return client.task.update({ where: { id: taskId }, data: values });
    },
    async deleteTask(taskId: number) {
      await client.task.delete({ where: { id: taskId } });
    },
  };
}

/**
 * Runs the complete command lifecycle in one database transaction so reference
 * validation, mutation, and the deterministic postcondition cannot be split by
 * a concurrent write. Assistant execution can reuse its wider transaction via
 * createPrismaTaskCommandRepository(tx).
 */
export function executePrismaTaskCommand(
  command: TaskCommand,
  context: TaskCommandContext,
): Promise<TaskCommandResult> {
  return prisma.$transaction((tx) => executeTaskCommand(
    createPrismaTaskCommandRepository(tx),
    command,
    context,
  ));
}

function acceptedTraceId(value: string | null): string | null {
  const traceId = value?.trim();
  return traceId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(traceId) ? traceId : null;
}

export function taskCommandContextFromRequest(
  request: Request,
  session: SessionPayload,
): TaskCommandContext {
  return {
    actor: {
      id: session.sub,
      email: session.email,
      name: session.name,
      role: session.role,
    },
    traceId: acceptedTraceId(request.headers.get("x-trace-id")) ?? randomUUID(),
    source: "TASK_API",
  };
}
