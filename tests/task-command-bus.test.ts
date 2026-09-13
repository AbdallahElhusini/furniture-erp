import assert from "node:assert/strict";
import test from "node:test";

import {
  executeTaskCommand,
  parseCreateTaskCommand,
  parseDeleteTaskCommand,
  parseUpdateTaskCommand,
  TaskCommandError,
  type CreateTaskValues,
  type StoredTaskCommandResult,
  type TaskCommandContext,
  type TaskCommandIdempotencyStore,
  type TaskCommandRepository,
  type TaskCommandResult,
  type TaskRecord,
  type UpdateTaskValues,
} from "../src/lib/task-command-bus.ts";

const context: TaskCommandContext = {
  actor: {
    id: 7,
    email: "manager@hatab.test",
    name: "Operations Manager",
    role: "MANAGER",
  },
  traceId: "task-test:trace-1",
  source: "TEST",
};

class FakeTaskRepository implements TaskCommandRepository {
  readonly records = new Map<number, TaskRecord>();
  readonly projects = new Set([10]);
  readonly technicians = new Set([20]);
  nextId = 1;
  creates = 0;
  updates = 0;
  deletes = 0;

  findTaskById(taskId: number): Promise<TaskRecord | null> {
    return Promise.resolve(this.clone(this.records.get(taskId) ?? null));
  }

  projectExists(projectId: number): Promise<boolean> {
    return Promise.resolve(this.projects.has(projectId));
  }

  technicianExists(technicianId: number): Promise<boolean> {
    return Promise.resolve(this.technicians.has(technicianId));
  }

  createTask(values: CreateTaskValues): Promise<TaskRecord> {
    this.creates += 1;
    const record: TaskRecord = { id: this.nextId++, ...values };
    this.records.set(record.id, this.clone(record)!);
    return Promise.resolve(this.clone(record)!);
  }

  updateTask(taskId: number, values: UpdateTaskValues): Promise<TaskRecord> {
    this.updates += 1;
    const current = this.records.get(taskId);
    if (!current) throw new Error("missing task");
    const updated = { ...current, ...values };
    this.records.set(taskId, this.clone(updated)!);
    return Promise.resolve(this.clone(updated)!);
  }

  deleteTask(taskId: number): Promise<void> {
    this.deletes += 1;
    this.records.delete(taskId);
    return Promise.resolve();
  }

  seed(overrides: Partial<TaskRecord> = {}): TaskRecord {
    const record: TaskRecord = {
      id: this.nextId++,
      projectId: 10,
      technicianId: 20,
      type: "GENERAL",
      title: "Original task",
      description: null,
      dueDate: new Date("2026-09-10T09:00:00.000Z"),
      status: "TODO",
      priority: "MEDIUM",
      ...overrides,
    };
    this.records.set(record.id, this.clone(record)!);
    return this.clone(record)!;
  }

  private clone(record: TaskRecord | null): TaskRecord | null {
    return record ? { ...record, dueDate: new Date(record.dueDate) } : null;
  }
}

class MemoryIdempotencyStore implements TaskCommandIdempotencyStore {
  readonly entries = new Map<string, StoredTaskCommandResult>();

  load(input: { actorId: number; key: string }) {
    return Promise.resolve(this.entries.get(this.key(input)) ?? null);
  }

  save(input: {
    actorId: number;
    key: string;
    fingerprint: string;
    result: TaskCommandResult;
  }) {
    this.entries.set(this.key(input), {
      fingerprint: input.fingerprint,
      result: input.result,
    });
    return Promise.resolve();
  }

  private key(input: { actorId: number; key: string }): string {
    return `${input.actorId}:${input.key}`;
  }
}

function assertTaskError(code: TaskCommandError["code"]) {
  return (error: unknown) => error instanceof TaskCommandError && error.code === code;
}

test("parses and normalizes a strict create command with deterministic defaults", () => {
  const command = parseCreateTaskCommand({
    projectId: "10",
    technicianId: 20,
    type: "DESIGN",
    title: "  Approve reception drawings  ",
    description: "",
    dueDate: "2026-09-12T09:30:00.000Z",
  });

  assert.equal(command.kind, "CREATE_TASK");
  if (command.kind !== "CREATE_TASK") return;
  assert.equal(command.values.title, "Approve reception drawings");
  assert.equal(command.values.description, null);
  assert.equal(command.values.projectId, 10);
  assert.equal(command.values.status, "TODO");
  assert.equal(command.values.priority, "MEDIUM");
  assert.equal(command.values.dueDate.toISOString(), "2026-09-12T09:30:00.000Z");
});

test("rejects unknown fields, invalid enum values, partial IDs, and empty updates", () => {
  assert.throws(
    () => parseCreateTaskCommand({
      type: "GENERAL",
      title: "Task",
      dueDate: "2026-09-12",
      executeSql: true,
    }),
    assertTaskError("INVALID_COMMAND"),
  );
  assert.throws(
    () => parseCreateTaskCommand({ type: "MAGIC", title: "Task", dueDate: "2026-09-12" }),
    assertTaskError("INVALID_COMMAND"),
  );
  assert.throws(
    () => parseUpdateTaskCommand("12abc", { status: "DONE" }),
    assertTaskError("INVALID_COMMAND"),
  );
  assert.throws(
    () => parseUpdateTaskCommand(12, {}),
    assertTaskError("INVALID_COMMAND"),
  );
});

test("creates a task with actor/trace hooks, before-after state, and a verified postcondition", async () => {
  const repository = new FakeTaskRepository();
  const events: string[] = [];
  const command = parseCreateTaskCommand({
    projectId: 10,
    technicianId: 20,
    type: "INSTALLATION",
    title: "Install executive office",
    dueDate: "2026-09-15T08:00:00.000Z",
    priority: "HIGH",
  });
  const result = await executeTaskCommand(repository, command, context, {
    beforeExecute({ context: executionContext }) {
      events.push(`before:${executionContext.actor.id}:${executionContext.traceId}`);
    },
    afterExecute(executionResult) {
      events.push(`after:${executionResult.outcome}`);
    },
  });

  assert.equal(repository.creates, 1);
  assert.equal(result.before, null);
  assert.equal(result.after?.title, "Install executive office");
  assert.equal(result.metadata.actor.email, "manager@hatab.test");
  assert.equal(result.postcondition.ok, true);
  assert.deepEqual(result.postcondition.mismatches, []);
  assert.deepEqual(events, ["before:7:task-test:trace-1", "after:CREATED"]);
});

test("fails before mutation when a referenced project or technician does not exist", async () => {
  const repository = new FakeTaskRepository();
  const command = parseCreateTaskCommand({
    projectId: 999,
    type: "GENERAL",
    title: "Impossible reference",
    dueDate: "2026-09-15",
  });

  await assert.rejects(
    executeTaskCommand(repository, command, context),
    assertTaskError("REFERENCE_NOT_FOUND"),
  );
  assert.equal(repository.creates, 0);
});

test("updates only supplied fields and avoids a database write for a deterministic no-op", async () => {
  const repository = new FakeTaskRepository();
  const task = repository.seed();
  const updated = await executeTaskCommand(
    repository,
    parseUpdateTaskCommand(task.id, { status: "IN_PROGRESS", priority: "HIGH" }),
    context,
  );

  assert.equal(updated.outcome, "UPDATED");
  assert.deepEqual(updated.changedFields, ["status", "priority"]);
  assert.equal(updated.before?.status, "TODO");
  assert.equal(updated.after?.status, "IN_PROGRESS");
  assert.equal(updated.postcondition.ok, true);
  assert.equal(repository.updates, 1);

  const noChange = await executeTaskCommand(
    repository,
    parseUpdateTaskCommand(task.id, { status: "IN_PROGRESS" }),
    { ...context, traceId: "task-test:trace-2" },
  );
  assert.equal(noChange.outcome, "NO_CHANGE");
  assert.deepEqual(noChange.changedFields, []);
  assert.equal(repository.updates, 1);
});

test("deletes a task and proves the record is absent", async () => {
  const repository = new FakeTaskRepository();
  const task = repository.seed();
  const result = await executeTaskCommand(
    repository,
    parseDeleteTaskCommand(task.id),
    context,
  );

  assert.equal(result.outcome, "DELETED");
  assert.equal(result.before?.id, task.id);
  assert.equal(result.after, null);
  assert.equal(result.postcondition.expectation.kind, "TASK_ABSENT");
  assert.equal(result.postcondition.ok, true);
  assert.equal(repository.deletes, 1);
});

test("replays the same idempotent command once and rejects key reuse with different arguments", async () => {
  const repository = new FakeTaskRepository();
  const idempotency = new MemoryIdempotencyStore();
  const idempotentContext = { ...context, idempotencyKey: "create-installation-42" };
  const command = parseCreateTaskCommand({
    type: "INSTALLATION",
    title: "Install room 42",
    dueDate: "2026-09-20",
  });

  const first = await executeTaskCommand(repository, command, idempotentContext, { idempotency });
  const replay = await executeTaskCommand(
    repository,
    command,
    { ...idempotentContext, traceId: "task-test:replay" },
    { idempotency },
  );
  assert.equal(first.execution, "EXECUTED");
  assert.equal(replay.execution, "REPLAYED");
  assert.equal(replay.metadata.originalTraceId, "task-test:trace-1");
  assert.equal(repository.creates, 1);

  const conflictingCommand = parseCreateTaskCommand({
    type: "INSTALLATION",
    title: "Different task",
    dueDate: "2026-09-20",
  });
  await assert.rejects(
    executeTaskCommand(repository, conflictingCommand, idempotentContext, { idempotency }),
    assertTaskError("IDEMPOTENCY_CONFLICT"),
  );
  assert.equal(repository.creates, 1);
});

test("fails closed when a caller requests idempotency without configuring durable storage", async () => {
  const repository = new FakeTaskRepository();
  const command = parseCreateTaskCommand({
    type: "GENERAL",
    title: "Needs exactly-once handling",
    dueDate: "2026-09-20",
  });
  await assert.rejects(
    executeTaskCommand(repository, command, { ...context, idempotencyKey: "missing-store" }),
    assertTaskError("IDEMPOTENCY_UNAVAILABLE"),
  );
  assert.equal(repository.creates, 0);
});

test("detects a failed deterministic postcondition instead of reporting false success", async () => {
  const repository = new FakeTaskRepository();
  const task = repository.seed();
  repository.updateTask = async (taskId, values) => {
    const current = await repository.findTaskById(taskId);
    if (!current) throw new Error("missing task");
    return { ...current, ...values };
  };

  await assert.rejects(
    executeTaskCommand(
      repository,
      parseUpdateTaskCommand(task.id, { status: "DONE" }),
      context,
    ),
    assertTaskError("POSTCONDITION_FAILED"),
  );
});

test("postconditions prove the requested create and update state, not merely adapter return values", async () => {
  const createRepository = new FakeTaskRepository();
  createRepository.createTask = async (values) => {
    const record: TaskRecord = {
      id: createRepository.nextId++,
      ...values,
      priority: "LOW",
    };
    createRepository.records.set(record.id, record);
    return record;
  };
  await assert.rejects(
    executeTaskCommand(
      createRepository,
      parseCreateTaskCommand({
        type: "GENERAL",
        title: "Preserve requested priority",
        dueDate: "2026-09-18T10:00:00.000Z",
        priority: "URGENT",
      }),
      context,
    ),
    assertTaskError("POSTCONDITION_FAILED"),
  );

  const updateRepository = new FakeTaskRepository();
  const task = updateRepository.seed();
  updateRepository.updateTask = async (taskId, values) => {
    const current = await updateRepository.findTaskById(taskId);
    if (!current) throw new Error("missing task");
    const persisted: TaskRecord = { ...current, ...values, status: "IN_PROGRESS" };
    updateRepository.records.set(taskId, persisted);
    return persisted;
  };
  await assert.rejects(
    executeTaskCommand(
      updateRepository,
      parseUpdateTaskCommand(task.id, { status: "DONE" }),
      context,
    ),
    assertTaskError("POSTCONDITION_FAILED"),
  );
});

test("rejects execution without valid actor and trace metadata", async () => {
  const repository = new FakeTaskRepository();
  const task = repository.seed();
  await assert.rejects(
    executeTaskCommand(repository, parseDeleteTaskCommand(task.id), {
      ...context,
      traceId: "bad trace with spaces",
    }),
    assertTaskError("INVALID_CONTEXT"),
  );
  assert.equal(repository.deletes, 0);
});
