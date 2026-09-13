export const TASK_COMMAND_TYPES = [
  "SUPPLIER_FOLLOWUP",
  "DESIGN",
  "INSTALLATION",
  "DELIVERY",
  "INSPECTION",
  "GENERAL",
] as const;

export const TASK_COMMAND_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export const TASK_COMMAND_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export type TaskCommandType = (typeof TASK_COMMAND_TYPES)[number];
export type TaskCommandStatus = (typeof TASK_COMMAND_STATUSES)[number];
export type TaskCommandPriority = (typeof TASK_COMMAND_PRIORITIES)[number];

export interface TaskCommandActor {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface TaskCommandContext {
  actor: TaskCommandActor;
  traceId: string;
  source: string;
  idempotencyKey?: string;
}

export interface TaskRecord {
  id: number;
  projectId: number | null;
  technicianId: number | null;
  type: string;
  title: string;
  description: string | null;
  dueDate: Date;
  status: string;
  priority: string;
}

export interface TaskState {
  id: number;
  projectId: number | null;
  technicianId: number | null;
  type: TaskCommandType;
  title: string;
  description: string | null;
  dueDate: string;
  status: TaskCommandStatus;
  priority: TaskCommandPriority;
}

export interface CreateTaskValues {
  projectId: number | null;
  technicianId: number | null;
  type: TaskCommandType;
  title: string;
  description: string | null;
  dueDate: Date;
  status: TaskCommandStatus;
  priority: TaskCommandPriority;
}

export type UpdateTaskValues = Partial<CreateTaskValues>;

export type TaskCommand =
  | { kind: "CREATE_TASK"; values: CreateTaskValues }
  | { kind: "UPDATE_TASK"; taskId: number; values: UpdateTaskValues }
  | { kind: "DELETE_TASK"; taskId: number };

export interface TaskCommandRepository {
  findTaskById(taskId: number): Promise<TaskRecord | null>;
  projectExists(projectId: number): Promise<boolean>;
  technicianExists(technicianId: number): Promise<boolean>;
  createTask(values: CreateTaskValues): Promise<TaskRecord>;
  updateTask(taskId: number, values: UpdateTaskValues): Promise<TaskRecord>;
  deleteTask(taskId: number): Promise<void>;
}

export type TaskMutableField = keyof CreateTaskValues;

export type TaskPostcondition =
  | { kind: "TASK_EQUALS"; taskId: number; expected: TaskState }
  | { kind: "TASK_ABSENT"; taskId: number };

export interface TaskPostconditionCheck {
  ok: boolean;
  expectation: TaskPostcondition;
  actual: TaskState | null;
  mismatches: TaskMutableField[] | ["existence"];
}

export interface TaskCommandResult {
  operation: TaskCommand["kind"];
  outcome: "CREATED" | "UPDATED" | "DELETED" | "NO_CHANGE";
  execution: "EXECUTED" | "REPLAYED";
  taskId: number;
  before: TaskState | null;
  after: TaskState | null;
  changedFields: TaskMutableField[];
  postcondition: TaskPostconditionCheck;
  metadata: {
    actor: TaskCommandActor;
    traceId: string;
    source: string;
    idempotencyKey: string | null;
    commandFingerprint: string;
    originalTraceId: string | null;
  };
}

export interface StoredTaskCommandResult {
  fingerprint: string;
  result: TaskCommandResult;
}

export interface TaskCommandIdempotencyStore {
  load(input: {
    actorId: number;
    key: string;
  }): Promise<StoredTaskCommandResult | null>;
  save(input: {
    actorId: number;
    key: string;
    fingerprint: string;
    result: TaskCommandResult;
  }): Promise<void>;
}

export interface TaskCommandHooks {
  idempotency?: TaskCommandIdempotencyStore;
  beforeExecute?(input: {
    command: TaskCommand;
    context: TaskCommandContext;
    fingerprint: string;
  }): Promise<void> | void;
  afterExecute?(result: TaskCommandResult): Promise<void> | void;
  onError?(input: {
    command: TaskCommand;
    context: TaskCommandContext;
    error: unknown;
  }): Promise<void> | void;
}

export type TaskCommandErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_CONTEXT"
  | "TASK_NOT_FOUND"
  | "REFERENCE_NOT_FOUND"
  | "IDEMPOTENCY_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "POSTCONDITION_FAILED";

export class TaskCommandError extends Error {
  readonly code: TaskCommandErrorCode;
  readonly status: 400 | 404 | 409 | 422 | 500 | 503;
  readonly details?: Record<string, unknown>;

  constructor(
    code: TaskCommandErrorCode,
    message: string,
    status: 400 | 404 | 409 | 422 | 500 | 503,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TaskCommandError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const CREATE_FIELDS = [
  "projectId",
  "technicianId",
  "type",
  "title",
  "description",
  "dueDate",
  "status",
  "priority",
] as const;
const UPDATE_FIELDS = CREATE_FIELDS;
const REQUIRED_CREATE_FIELDS = ["type", "title", "dueDate"] as const;
const TRACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidCommand(message: string, details?: Record<string, unknown>): never {
  throw new TaskCommandError("INVALID_COMMAND", message, 400, details);
}

function assertAllowedFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknownFields = Object.keys(input).filter((field) => !allowed.includes(field));
  if (unknownFields.length > 0) {
    invalidCommand("Task command contains unsupported fields", { unknownFields });
  }
}

function parsePositiveId(value: unknown, field: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    invalidCommand(`${field} must be a positive integer`, { field });
  }
  return parsed;
}

function parseNullableId(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  return parsePositiveId(value, field);
}

function parseEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalidCommand(`${field} has an unsupported value`, { field, allowed });
  }
  return value as T;
}

function parseTitle(value: unknown): string {
  if (typeof value !== "string") invalidCommand("title must be text", { field: "title" });
  const title = value.trim();
  if (title.length === 0 || title.length > 500) {
    invalidCommand("title must contain between 1 and 500 characters", { field: "title" });
  }
  return title;
}

function parseDescription(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 10_000) {
    invalidCommand("description must be text up to 10000 characters", {
      field: "description",
    });
  }
  return value.trim() || null;
}

function parseDueDate(value: unknown): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    invalidCommand("dueDate must be a valid date", { field: "dueDate" });
  }
  return date;
}

function parseCreateValues(input: Record<string, unknown>): CreateTaskValues {
  for (const field of REQUIRED_CREATE_FIELDS) {
    if (input[field] === undefined || input[field] === null || input[field] === "") {
      invalidCommand("Title, type, and dueDate are required fields", { field });
    }
  }

  return {
    projectId: parseNullableId(input.projectId, "projectId"),
    technicianId: parseNullableId(input.technicianId, "technicianId"),
    type: parseEnum(input.type, "type", TASK_COMMAND_TYPES),
    title: parseTitle(input.title),
    description: parseDescription(input.description),
    dueDate: parseDueDate(input.dueDate),
    status:
      input.status === undefined
        ? "TODO"
        : parseEnum(input.status, "status", TASK_COMMAND_STATUSES),
    priority:
      input.priority === undefined
        ? "MEDIUM"
        : parseEnum(input.priority, "priority", TASK_COMMAND_PRIORITIES),
  };
}

function parseUpdateValues(input: Record<string, unknown>): UpdateTaskValues {
  if (Object.keys(input).length === 0) {
    invalidCommand("At least one task field must be supplied");
  }

  const values: UpdateTaskValues = {};
  if ("projectId" in input) values.projectId = parseNullableId(input.projectId, "projectId");
  if ("technicianId" in input) {
    values.technicianId = parseNullableId(input.technicianId, "technicianId");
  }
  if ("type" in input) values.type = parseEnum(input.type, "type", TASK_COMMAND_TYPES);
  if ("title" in input) values.title = parseTitle(input.title);
  if ("description" in input) values.description = parseDescription(input.description);
  if ("dueDate" in input) values.dueDate = parseDueDate(input.dueDate);
  if ("status" in input) {
    values.status = parseEnum(input.status, "status", TASK_COMMAND_STATUSES);
  }
  if ("priority" in input) {
    values.priority = parseEnum(input.priority, "priority", TASK_COMMAND_PRIORITIES);
  }
  return values;
}

export function parseCreateTaskCommand(input: unknown): TaskCommand {
  if (!isRecord(input)) invalidCommand("Task payload must be an object");
  assertAllowedFields(input, CREATE_FIELDS);
  return { kind: "CREATE_TASK", values: parseCreateValues(input) };
}

export function parseUpdateTaskCommand(taskId: unknown, input: unknown): TaskCommand {
  if (!isRecord(input)) invalidCommand("Task payload must be an object");
  assertAllowedFields(input, UPDATE_FIELDS);
  return {
    kind: "UPDATE_TASK",
    taskId: parsePositiveId(taskId, "taskId"),
    values: parseUpdateValues(input),
  };
}

export function parseDeleteTaskCommand(taskId: unknown): TaskCommand {
  return { kind: "DELETE_TASK", taskId: parsePositiveId(taskId, "taskId") };
}

function normalizeContext(context: TaskCommandContext): TaskCommandContext {
  if (
    !Number.isSafeInteger(context.actor?.id) ||
    context.actor.id <= 0 ||
    typeof context.actor.email !== "string" ||
    context.actor.email.trim().length === 0 ||
    typeof context.actor.name !== "string" ||
    context.actor.name.trim().length === 0 ||
    typeof context.actor.role !== "string" ||
    context.actor.role.trim().length === 0 ||
    typeof context.traceId !== "string" ||
    !TRACE_PATTERN.test(context.traceId) ||
    typeof context.source !== "string" ||
    context.source.trim().length === 0 ||
    context.source.length > 100 ||
    (context.idempotencyKey !== undefined &&
      (typeof context.idempotencyKey !== "string" ||
        context.idempotencyKey.trim().length === 0 ||
        context.idempotencyKey.length > 200))
  ) {
    throw new TaskCommandError(
      "INVALID_CONTEXT",
      "Task command execution context is invalid",
      400,
    );
  }

  return {
    actor: {
      id: context.actor.id,
      email: context.actor.email.trim(),
      name: context.actor.name.trim(),
      role: context.actor.role.trim(),
    },
    traceId: context.traceId,
    source: context.source.trim(),
    ...(context.idempotencyKey ? { idempotencyKey: context.idempotencyKey.trim() } : {}),
  };
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function taskCommandFingerprint(command: TaskCommand): string {
  return JSON.stringify(canonicalValue(command));
}

function toTaskState(record: TaskRecord): TaskState {
  const type = parseEnum(record.type, "type", TASK_COMMAND_TYPES);
  const status = parseEnum(record.status, "status", TASK_COMMAND_STATUSES);
  const priority = parseEnum(record.priority, "priority", TASK_COMMAND_PRIORITIES);
  return {
    id: record.id,
    projectId: record.projectId,
    technicianId: record.technicianId,
    type,
    title: record.title,
    description: record.description,
    dueDate: record.dueDate.toISOString(),
    status,
    priority,
  };
}

function valuesEqual(field: TaskMutableField, left: TaskState, right: TaskState): boolean {
  return left[field] === right[field];
}

function changedFields(before: TaskState, after: TaskState): TaskMutableField[] {
  return CREATE_FIELDS.filter((field) => !valuesEqual(field, before, after));
}

export async function verifyTaskPostcondition(
  repository: TaskCommandRepository,
  expectation: TaskPostcondition,
): Promise<TaskPostconditionCheck> {
  const record = await repository.findTaskById(expectation.taskId);
  const actual = record ? toTaskState(record) : null;

  if (expectation.kind === "TASK_ABSENT") {
    return {
      ok: actual === null,
      expectation,
      actual,
      mismatches: actual === null ? [] : ["existence"],
    };
  }

  if (!actual) {
    return { ok: false, expectation, actual: null, mismatches: ["existence"] };
  }

  const mismatches = CREATE_FIELDS.filter(
    (field) => !valuesEqual(field, expectation.expected, actual),
  );
  return { ok: mismatches.length === 0, expectation, actual, mismatches };
}

async function assertReferences(
  repository: TaskCommandRepository,
  values: UpdateTaskValues,
): Promise<void> {
  const [projectExists, technicianExists] = await Promise.all([
    values.projectId === undefined || values.projectId === null
      ? Promise.resolve(true)
      : repository.projectExists(values.projectId),
    values.technicianId === undefined || values.technicianId === null
      ? Promise.resolve(true)
      : repository.technicianExists(values.technicianId),
  ]);

  if (!projectExists) {
    throw new TaskCommandError(
      "REFERENCE_NOT_FOUND",
      "Referenced project was not found",
      422,
      { field: "projectId", value: values.projectId },
    );
  }
  if (!technicianExists) {
    throw new TaskCommandError(
      "REFERENCE_NOT_FOUND",
      "Referenced technician was not found",
      422,
      { field: "technicianId", value: values.technicianId },
    );
  }
}

function metadata(
  context: TaskCommandContext,
  fingerprint: string,
  originalTraceId: string | null = null,
): TaskCommandResult["metadata"] {
  return {
    actor: context.actor,
    traceId: context.traceId,
    source: context.source,
    idempotencyKey: context.idempotencyKey ?? null,
    commandFingerprint: fingerprint,
    originalTraceId,
  };
}

async function executeMutation(
  repository: TaskCommandRepository,
  command: TaskCommand,
  context: TaskCommandContext,
  fingerprint: string,
): Promise<TaskCommandResult> {
  if (command.kind === "CREATE_TASK") {
    await assertReferences(repository, command.values);
    const created = toTaskState(await repository.createTask(command.values));
    const expected: TaskState = {
      id: created.id,
      projectId: command.values.projectId,
      technicianId: command.values.technicianId,
      type: command.values.type,
      title: command.values.title,
      description: command.values.description,
      dueDate: command.values.dueDate.toISOString(),
      status: command.values.status,
      priority: command.values.priority,
    };
    const expectation: TaskPostcondition = {
      kind: "TASK_EQUALS",
      taskId: created.id,
      expected,
    };
    const postcondition = await verifyTaskPostcondition(repository, expectation);
    return {
      operation: command.kind,
      outcome: "CREATED",
      execution: "EXECUTED",
      taskId: created.id,
      before: null,
      after: postcondition.actual ?? created,
      changedFields: [...CREATE_FIELDS],
      postcondition,
      metadata: metadata(context, fingerprint),
    };
  }

  const existing = await repository.findTaskById(command.taskId);
  if (!existing) {
    throw new TaskCommandError(
      "TASK_NOT_FOUND",
      "Task not found",
      404,
      { taskId: command.taskId },
    );
  }
  const before = toTaskState(existing);

  if (command.kind === "DELETE_TASK") {
    await repository.deleteTask(command.taskId);
    const expectation: TaskPostcondition = { kind: "TASK_ABSENT", taskId: command.taskId };
    const postcondition = await verifyTaskPostcondition(repository, expectation);
    return {
      operation: command.kind,
      outcome: "DELETED",
      execution: "EXECUTED",
      taskId: command.taskId,
      before,
      after: null,
      changedFields: [],
      postcondition,
      metadata: metadata(context, fingerprint),
    };
  }

  await assertReferences(repository, command.values);
  const expectedState: TaskState = {
    ...before,
    ...command.values,
    dueDate: command.values.dueDate?.toISOString() ?? before.dueDate,
  };
  const changed = changedFields(before, expectedState);
  const after =
    changed.length === 0
      ? before
      : toTaskState(await repository.updateTask(command.taskId, command.values));
  const expectation: TaskPostcondition = {
    kind: "TASK_EQUALS",
    taskId: command.taskId,
    expected: expectedState,
  };
  const postcondition = await verifyTaskPostcondition(repository, expectation);
  return {
    operation: command.kind,
    outcome: changed.length === 0 ? "NO_CHANGE" : "UPDATED",
    execution: "EXECUTED",
    taskId: command.taskId,
    before,
    after: postcondition.actual ?? after,
    changedFields: changed,
    postcondition,
    metadata: metadata(context, fingerprint),
  };
}

async function safelyReportError(
  hooks: TaskCommandHooks | undefined,
  input: Parameters<NonNullable<TaskCommandHooks["onError"]>>[0],
): Promise<void> {
  try {
    await hooks?.onError?.(input);
  } catch {
    // Error reporting must not hide the command failure that triggered it.
  }
}

export async function executeTaskCommand(
  repository: TaskCommandRepository,
  command: TaskCommand,
  contextInput: TaskCommandContext,
  hooks?: TaskCommandHooks,
): Promise<TaskCommandResult> {
  const context = normalizeContext(contextInput);
  const fingerprint = taskCommandFingerprint(command);

  try {
    if (context.idempotencyKey && !hooks?.idempotency) {
      throw new TaskCommandError(
        "IDEMPOTENCY_UNAVAILABLE",
        "An idempotency key requires a configured durable idempotency store",
        503,
      );
    }
    if (context.idempotencyKey && hooks?.idempotency) {
      const stored = await hooks.idempotency.load({
        actorId: context.actor.id,
        key: context.idempotencyKey,
      });
      if (stored) {
        if (stored.fingerprint !== fingerprint) {
          throw new TaskCommandError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was already used for a different command",
            409,
          );
        }
        const postcondition = await verifyTaskPostcondition(
          repository,
          stored.result.postcondition.expectation,
        );
        if (!postcondition.ok) {
          throw new TaskCommandError(
            "POSTCONDITION_FAILED",
            "Stored command result no longer matches the current task state",
            409,
            { mismatches: postcondition.mismatches },
          );
        }
        return {
          ...stored.result,
          execution: "REPLAYED",
          postcondition,
          metadata: metadata(context, fingerprint, stored.result.metadata.traceId),
        };
      }
    }

    await hooks?.beforeExecute?.({ command, context, fingerprint });
    const result = await executeMutation(repository, command, context, fingerprint);
    if (!result.postcondition.ok) {
      throw new TaskCommandError(
        "POSTCONDITION_FAILED",
        "Task command postcondition was not satisfied",
        500,
        { mismatches: result.postcondition.mismatches, taskId: result.taskId },
      );
    }
    await hooks?.afterExecute?.(result);
    if (context.idempotencyKey && hooks?.idempotency) {
      await hooks.idempotency.save({
        actorId: context.actor.id,
        key: context.idempotencyKey,
        fingerprint,
        result,
      });
    }
    return result;
  } catch (error) {
    await safelyReportError(hooks, { command, context, error });
    throw error;
  }
}
