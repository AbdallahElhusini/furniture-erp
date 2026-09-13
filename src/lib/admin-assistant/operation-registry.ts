import { createHash } from "node:crypto";

import rawContract from "../../../contracts/admin-assistant-operations.v2.json" with { type: "json" };
import type { ParsedAssistantAction } from "./types.ts";

export type OperationRisk = "LOW" | "MEDIUM" | "HIGH";
export type OperationApproval = "EXPLICIT";
export type OperationFieldType = "string" | "reference" | "integer" | "number" | "enum";

export interface OperationFieldDefinition {
  type: OperationFieldType;
  required: boolean;
  nullable?: boolean;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  values?: string[];
  grounded: boolean;
  nullRequiresClearIntent?: boolean;
}

export interface OperationDefinition {
  kind: ParsedAssistantAction["kind"];
  domain: string;
  handler: string;
  summaryEn: string;
  summaryAr: string;
  risk: OperationRisk;
  approval: OperationApproval;
  destructive: boolean;
  modelEnabled: boolean;
  fields: Record<string, OperationFieldDefinition>;
  atLeastOneOf?: string[];
  mutuallyExclusive?: string[][];
  riskEscalations?: Array<{
    when: Record<string, string[]>;
    risk: OperationRisk;
  }>;
}

interface OperationContract {
  schemaVersion: string;
  contractVersion: number;
  languageSupport: string[];
  envelope: {
    required: string[];
    additionalProperties: boolean;
    maxActions: number;
    maxUnparsed: number;
    maxUnparsedItemLength: number;
    requireGroundedUnparsed: boolean;
  };
  operations: OperationDefinition[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item ?? null)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashCanonicalValue(value: unknown): string {
  // Plans cross a JSON boundary when signed and persisted. Hash that same
  // representation: optional undefined properties and Date values must not
  // make the in-memory preview differ from its verified token.
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Cannot hash a non-JSON value");
  return createHash("sha256").update(stableStringify(JSON.parse(serialized)), "utf8").digest("hex");
}

function validateContract(value: unknown): asserts value is OperationContract {
  if (!isRecord(value)) throw new Error("Assistant operation contract must be an object");
  if (typeof value.schemaVersion !== "string" || !value.schemaVersion.trim()) {
    throw new Error("Assistant operation contract is missing schemaVersion");
  }
  if (!Number.isSafeInteger(value.contractVersion) || Number(value.contractVersion) < 1) {
    throw new Error("Assistant operation contract has an invalid contractVersion");
  }
  if (!isRecord(value.envelope) || !Array.isArray(value.operations) || value.operations.length === 0) {
    throw new Error("Assistant operation contract has no envelope or operations");
  }

  const seen = new Set<string>();
  for (const candidate of value.operations) {
    if (!isRecord(candidate) || typeof candidate.kind !== "string" || !candidate.kind.trim()) {
      throw new Error("Assistant operation contract contains an operation without a kind");
    }
    if (seen.has(candidate.kind)) throw new Error(`Duplicate assistant operation kind: ${candidate.kind}`);
    seen.add(candidate.kind);
    if (!isRecord(candidate.fields)) throw new Error(`${candidate.kind} has no field definitions`);
    for (const [fieldName, fieldValue] of Object.entries(candidate.fields)) {
      if (!isRecord(fieldValue) || !["string", "reference", "integer", "number", "enum"].includes(String(fieldValue.type))) {
        throw new Error(`${candidate.kind}.${fieldName} has an invalid type`);
      }
      if (typeof fieldValue.required !== "boolean" || typeof fieldValue.grounded !== "boolean") {
        throw new Error(`${candidate.kind}.${fieldName} is missing required/grounded metadata`);
      }
      if (fieldValue.type === "enum" && (!Array.isArray(fieldValue.values) || fieldValue.values.length === 0)) {
        throw new Error(`${candidate.kind}.${fieldName} has no enum values`);
      }
    }
    const fieldNames = new Set(Object.keys(candidate.fields));
    for (const fieldName of Array.isArray(candidate.atLeastOneOf) ? candidate.atLeastOneOf : []) {
      if (!fieldNames.has(String(fieldName))) throw new Error(`${candidate.kind} references unknown patch field ${fieldName}`);
    }
    for (const group of Array.isArray(candidate.mutuallyExclusive) ? candidate.mutuallyExclusive : []) {
      if (!Array.isArray(group) || group.length < 2 || group.some((field) => !fieldNames.has(String(field)))) {
        throw new Error(`${candidate.kind} has an invalid mutuallyExclusive group`);
      }
    }
  }
}

validateContract(rawContract);

export const OPERATION_CONTRACT = rawContract;
export const OPERATION_SCHEMA_VERSION = OPERATION_CONTRACT.schemaVersion;
export const OPERATION_CONTRACT_VERSION = OPERATION_CONTRACT.contractVersion;
export const OPERATION_CONTRACT_HASH = hashCanonicalValue(OPERATION_CONTRACT);
export const CURRENT_OPERATION_CONTRACT = Object.freeze({
  schemaVersion: OPERATION_SCHEMA_VERSION,
  contractVersion: OPERATION_CONTRACT_VERSION,
  hash: OPERATION_CONTRACT_HASH,
});

export function isCurrentOperationContract(value: unknown): boolean {
  return isRecord(value)
    && value.schemaVersion === OPERATION_SCHEMA_VERSION
    && value.contractVersion === OPERATION_CONTRACT_VERSION
    && value.hash === OPERATION_CONTRACT_HASH;
}

export const OPERATION_DEFINITIONS = OPERATION_CONTRACT.operations as OperationDefinition[];
export const OPERATION_KINDS = OPERATION_DEFINITIONS.map((operation) => operation.kind);
export const MODEL_ENABLED_OPERATION_KINDS = OPERATION_DEFINITIONS
  .filter((operation) => operation.modelEnabled)
  .map((operation) => operation.kind);

const OPERATION_BY_KIND = new Map(OPERATION_DEFINITIONS.map((operation) => [operation.kind, operation] as const));

export function getOperationDefinition(kind: ParsedAssistantAction["kind"]): OperationDefinition {
  const operation = OPERATION_BY_KIND.get(kind);
  if (!operation) throw new Error(`Unregistered assistant operation: ${kind}`);
  return operation;
}

export function getAllowedModelFields(kind: ParsedAssistantAction["kind"]): ReadonlySet<string> {
  return new Set(["kind", ...Object.keys(getOperationDefinition(kind).fields)]);
}

function jsonSchemaForField(field: OperationFieldDefinition): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (field.type === "integer" || field.type === "number") {
    base.type = field.nullable ? [field.type, "null"] : field.type;
    if (field.minimum !== undefined) base.minimum = field.minimum;
    if (field.maximum !== undefined) base.maximum = field.maximum;
  } else if (field.type === "enum") {
    base.type = field.nullable ? ["string", "null"] : "string";
    base.enum = field.nullable ? [...(field.values ?? []), null] : field.values;
  } else {
    base.type = field.nullable ? ["string", "null"] : "string";
    if (field.maxLength !== undefined) base.maxLength = field.maxLength;
    base.minLength = 1;
  }
  return base;
}

function jsonSchemaForOperation(operation: OperationDefinition): Record<string, unknown> {
  const required = [
    "kind",
    ...Object.entries(operation.fields)
      .filter(([, field]) => field.required)
      .map(([fieldName]) => fieldName),
  ];
  const allOf: Record<string, unknown>[] = [];
  if (operation.atLeastOneOf?.length) {
    allOf.push({
      anyOf: operation.atLeastOneOf.map((fieldName) => ({ required: [fieldName] })),
    });
  }
  for (const group of operation.mutuallyExclusive ?? []) {
    allOf.push({ not: { required: group } });
  }
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties: {
      kind: { const: operation.kind },
      ...Object.fromEntries(Object.entries(operation.fields).map(([fieldName, field]) => (
        [fieldName, jsonSchemaForField(field)]
      ))),
    },
    ...(allOf.length ? { allOf } : {}),
  };
}

export function createModelOutputJsonSchema(options: { modelEnabledOnly?: boolean } = {}): Record<string, unknown> {
  const operations = options.modelEnabledOnly
    ? OPERATION_DEFINITIONS.filter((operation) => operation.modelEnabled)
    : OPERATION_DEFINITIONS;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: OPERATION_SCHEMA_VERSION,
    type: "object",
    additionalProperties: OPERATION_CONTRACT.envelope.additionalProperties,
    required: OPERATION_CONTRACT.envelope.required,
    properties: {
      actions: {
        type: "array",
        maxItems: OPERATION_CONTRACT.envelope.maxActions,
        items: { oneOf: operations.map(jsonSchemaForOperation) },
      },
      unparsed: {
        type: "array",
        maxItems: OPERATION_CONTRACT.envelope.maxUnparsed,
        items: {
          type: "string",
          minLength: 1,
          maxLength: OPERATION_CONTRACT.envelope.maxUnparsedItemLength,
        },
      },
    },
  };
}
