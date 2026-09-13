import "server-only";
/* eslint-disable @next/next/no-assign-module-variable -- ERP domain term, not the CommonJS global. */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DATA_MODULES,
  DATA_TRANSFER_SCHEMA_VERSION,
  MAX_BACKUP_RECORDS,
  MAX_BACKUP_UPLOAD_BYTES,
  MODULE_APPLY_ORDER,
  SCOPE_MODULES,
  isDataModuleName,
  type ActorIdentity,
  type BackupEnvelope,
  type CellScalar,
  type DataModuleName,
  type DataTransferIssueInput,
  type RestorePreflight,
  type ParsedDataFile,
} from "./contracts";
import { createBackupArtifact } from "./backup";
import { decodeBackupEnvelope } from "./backup-envelope";
import { equivalentPortableTrustedValue } from "./backup-portability";
import { LOSSLESS_MODULE_SCHEMAS, type LosslessModuleSchema } from "./lossless-schema";
import { SAFE_SETTING_KEYS } from "./registry";
import { allocateStableKeys } from "./stable-keys";
import { SITE_CONTENT_DEFINITION_BY_KEY, isSafeSiteLink, isSafeSiteMediaPath } from "@/lib/site-content-registry";
import { validateParsedDataFile } from "./validator";

export { MAX_BACKUP_UPLOAD_BYTES } from "./contracts";

type TransactionClient = Prisma.TransactionClient;
type LosslessRow = Record<string, unknown>;

interface RestoreDelegate {
  findUnique(args: Record<string, unknown>): Promise<LosslessRow | null>;
  upsert(args: Record<string, unknown>): Promise<LosslessRow>;
  update(args: Record<string, unknown>): Promise<LosslessRow>;
  findMany(args: Record<string, unknown>): Promise<LosslessRow[]>;
}

const UNIQUE_KEYS: Partial<Record<DataModuleName, readonly (readonly string[])[]>> = {
  clients: [["externalKey"]], suppliers: [["externalKey"]], technicians: [["externalKey"]],
  settings: [["key"]], site_content: [["key"]], categories: [["slug"]],
  category_redirects: [["fromSlug"]], collections: [["slug"]],
  product_families: [["slug"], ["sourceKey"]], tag_groups: [["key"]], tags: [["slug"]],
  catalog_items: [["sku"]], product_assets: [["externalKey"], ["catalogItemId", "url"]],
  projects: [["externalKey"]], project_items: [["externalKey"]], supplier_orders: [["externalKey"]],
  order_items: [["externalKey"], ["supplierOrderId", "projectItemId"]], tasks: [["externalKey"]],
  payments: [["externalKey"]], quote_requests: [["externalKey"]], quote_items: [["externalKey"]],
  finance_entries: [["externalKey"]],
  portfolio_projects: [["externalKey"]],
};

const IDENTITY_FIELDS: Partial<Record<DataModuleName, { field: string; prefix?: string }>> = {
  clients: { field: "externalKey", prefix: "CLIENT" }, suppliers: { field: "externalKey", prefix: "SUPPLIER" },
  technicians: { field: "externalKey", prefix: "TECH" }, settings: { field: "key" }, site_content: { field: "key" },
  categories: { field: "slug" }, category_redirects: { field: "fromSlug" }, collections: { field: "slug" },
  product_families: { field: "sourceKey" }, tag_groups: { field: "key" }, tags: { field: "slug" },
  catalog_items: { field: "sku" }, product_assets: { field: "externalKey", prefix: "ASSET" },
  projects: { field: "externalKey", prefix: "PROJECT" }, project_items: { field: "externalKey", prefix: "PROJECT-ITEM" },
  supplier_orders: { field: "externalKey", prefix: "SUPPLIER-ORDER" }, order_items: { field: "externalKey", prefix: "ORDER-ITEM" },
  tasks: { field: "externalKey", prefix: "TASK" }, payments: { field: "externalKey", prefix: "PAYMENT" },
  finance_entries: { field: "externalKey", prefix: "FINANCE" },
  quote_requests: { field: "externalKey", prefix: "QUOTE" }, quote_items: { field: "externalKey", prefix: "QUOTE-ITEM" },
  portfolio_projects: { field: "externalKey", prefix: "PORTFOLIO" },
};

const REFERENCE_FIELDS: Partial<Record<DataModuleName, ReadonlyArray<{ reference: string; field: string; target: DataModuleName }>>> = {
  categories: [{ reference: "parentSlug", field: "parentId", target: "categories" }],
  category_redirects: [{ reference: "categorySlug", field: "categoryId", target: "categories" }],
  product_families: [{ reference: "categorySlug", field: "categoryId", target: "categories" }],
  tags: [{ reference: "groupKey", field: "groupId", target: "tag_groups" }],
  catalog_items: [
    { reference: "categorySlug", field: "categoryId", target: "categories" },
    { reference: "familySourceKey", field: "familyId", target: "product_families" },
    { reference: "supplierExternalKey", field: "supplierId", target: "suppliers" },
  ],
  product_assets: [
    { reference: "catalogSku", field: "catalogItemId", target: "catalog_items" },
    { reference: "familySourceKey", field: "familyId", target: "product_families" },
    { reference: "duplicateExternalKey", field: "duplicateOfId", target: "product_assets" },
  ],
  projects: [{ reference: "clientExternalKey", field: "clientId", target: "clients" }],
  project_items: [
    { reference: "projectExternalKey", field: "projectId", target: "projects" },
    { reference: "catalogSku", field: "catalogItemId", target: "catalog_items" },
  ],
  supplier_orders: [
    { reference: "supplierExternalKey", field: "supplierId", target: "suppliers" },
    { reference: "projectExternalKey", field: "projectId", target: "projects" },
  ],
  order_items: [
    { reference: "supplierOrderExternalKey", field: "supplierOrderId", target: "supplier_orders" },
    { reference: "projectItemExternalKey", field: "projectItemId", target: "project_items" },
  ],
  tasks: [
    { reference: "projectExternalKey", field: "projectId", target: "projects" },
    { reference: "technicianExternalKey", field: "technicianId", target: "technicians" },
  ],
  payments: [{ reference: "projectExternalKey", field: "projectId", target: "projects" }],
  finance_entries: [
    { reference: "projectExternalKey", field: "projectId", target: "projects" },
    { reference: "supplierOrderExternalKey", field: "supplierOrderId", target: "supplier_orders" },
  ],
  quote_items: [
    { reference: "quoteExternalKey", field: "quoteId", target: "quote_requests" },
    { reference: "catalogSku", field: "catalogItemId", target: "catalog_items" },
  ],
};

export interface RestoreResult {
  jobId: number;
  dryRun: boolean;
  sourceHash: string;
  scope: BackupEnvelope["scope"] | null;
  rowCount: number;
  restoredCount: number;
  errorCount: number;
  preRestoreBackup?: string;
  issues: DataTransferIssueInput[];
}

function issue(code: string, message: string, module = "_backup", rowNumber?: number, field?: string): DataTransferIssueInput {
  return { module, rowNumber, field, severity: "ERROR", code, message };
}

function isPlainRecord(value: unknown): value is LosslessRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function schemaOf(module: DataModuleName): LosslessModuleSchema {
  return LOSSLESS_MODULE_SCHEMAS[module];
}

function asDelegate(client: TransactionClient | typeof prisma, module: DataModuleName): RestoreDelegate {
  const model = schemaOf(module).model;
  if (!model) throw new Error(`Module ${module} is a relation module`);
  return (client as unknown as Record<string, RestoreDelegate>)[model];
}

function validateRecordShape(module: DataModuleName, row: unknown, rowNumber: number): DataTransferIssueInput[] {
  if (!isPlainRecord(row)) return [issue("RECORD_SHAPE", "Record must be an object", module, rowNumber)];
  const schema = schemaOf(module);
  const allowed = new Set<string>(schema.fields);
  const optional = new Set<string>(schema.optionalFields ?? []);
  const issues: DataTransferIssueInput[] = [];
  for (const key of Object.keys(row)) {
    if (!allowed.has(key)) issues.push(issue("RECORD_FIELD", `Unknown trusted field: ${key}`, module, rowNumber, key));
  }
  for (const field of schema.fields) {
    if (!Object.hasOwn(row, field) && !optional.has(field)) issues.push(issue("RECORD_FIELD_MISSING", `Lossless field is missing: ${field}`, module, rowNumber, field));
    if (!Object.hasOwn(row, field)) continue;
    const value = row[field];
    const allowedRelationArray = (module === "catalog_item_collections" && field === "collectionIds")
      || (module === "catalog_item_tags" && field === "tagIds");
    if (value !== null && value !== undefined && typeof value === "object" && !allowedRelationArray) {
      issues.push(issue("RECORD_SCALAR", `${field} must be a JSON scalar`, module, rowNumber, field));
    } else if (typeof value === "number" && !Number.isFinite(value)) {
      issues.push(issue("RECORD_NUMBER", `${field} must be finite`, module, rowNumber, field));
    } else if (typeof value === "string" && value.length > 50_000) {
      issues.push(issue("RECORD_TEXT", `${field} exceeds the trusted-record text limit`, module, rowNumber, field));
    }
  }
  if (schema.model) {
    if (!Number.isInteger(row.id) || Number(row.id) <= 0) issues.push(issue("RECORD_ID", "id must be a positive integer", module, rowNumber, "id"));
  } else if (!Number.isInteger(row.catalogItemId) || Number(row.catalogItemId) <= 0) {
    issues.push(issue("RECORD_ID", "catalogItemId must be a positive integer", module, rowNumber, "catalogItemId"));
  }
  for (const field of [...(schema.dateFields ?? []), ...(schema.nullableDateFields ?? [])]) {
    if (!Object.hasOwn(row, field) && optional.has(field)) continue;
    const value = row[field];
    const nullable = (schema.nullableDateFields ?? []).includes(field as never);
    if (value === null && nullable) continue;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      issues.push(issue("RECORD_DATE", `${field} must be an ISO date${nullable ? " or null" : ""}`, module, rowNumber, field));
    }
  }
  if (module === "catalog_item_collections") {
    if (!Array.isArray(row.collectionIds) || row.collectionIds.some((id) => !Number.isInteger(id) || Number(id) <= 0)) {
      issues.push(issue("RECORD_RELATION", "collectionIds must be an array of positive integers", module, rowNumber, "collectionIds"));
    }
  }
  if (module === "catalog_item_tags") {
    if (!Array.isArray(row.tagIds) || row.tagIds.some((id) => !Number.isInteger(id) || Number(id) <= 0)) {
      issues.push(issue("RECORD_RELATION", "tagIds must be an array of positive integers", module, rowNumber, "tagIds"));
    }
  }
  if (module === "catalog_items") {
    if (!Number.isInteger(row.completenessScore) || Number(row.completenessScore) < 0 || Number(row.completenessScore) > 100) {
      issues.push(issue("CATALOG_QUALITY", "completenessScore must be an integer from 0 to 100", module, rowNumber, "completenessScore"));
    }
    if (!["NEEDS_REVIEW", "READY", "VERIFIED"].includes(String(row.contentStatus))) {
      issues.push(issue("CATALOG_QUALITY", "contentStatus is invalid", module, rowNumber, "contentStatus"));
    }
  }
  if (module === "collections" && row.description !== null && (typeof row.description !== "string" || row.description.length > 20_000)) {
    issues.push(issue("COLLECTION_DESCRIPTION", "description must be text up to 20000 characters", module, rowNumber, "description"));
  }
  return issues;
}

async function currentIds(module: DataModuleName): Promise<Set<number>> {
  const model = schemaOf(module).model;
  if (!model) return new Set();
  const rows = await asDelegate(prisma, module).findMany({ select: { id: true } });
  return new Set(rows.map((row) => Number(row.id)));
}

function uniqueTuple(row: LosslessRow, fields: readonly string[]): string | null {
  const values = fields.map((field) => row[field]);
  // SQLite unique constraints permit multiple nulls; those are not collisions.
  if (values.some((value) => value === null || value === undefined)) return null;
  return JSON.stringify(values);
}

async function validateUniqueCollisions(
  module: DataModuleName,
  rows: LosslessRow[],
): Promise<DataTransferIssueInput[]> {
  const keys = UNIQUE_KEYS[module] ?? [];
  if (!keys.length || !schemaOf(module).model) return [];
  const issues: DataTransferIssueInput[] = [];
  const select = Object.fromEntries([...new Set(["id", ...keys.flat()])].map((field) => [field, true]));
  const current = await asDelegate(prisma, module).findMany({ select });
  for (const fields of keys) {
    const label = fields.join("+");
    const incoming = new Map<string, number>();
    rows.forEach((row, index) => {
      const tuple = uniqueTuple(row, fields);
      if (!tuple) return;
      const prior = incoming.get(tuple);
      if (prior !== undefined && prior !== Number(row.id)) {
        issues.push(issue("RECORD_UNIQUE_DUPLICATE", `Duplicate ${label} in backup`, module, index + 1, label));
      } else incoming.set(tuple, Number(row.id));
    });
    const existing = new Map<string, number>();
    for (const row of current) {
      const tuple = uniqueTuple(row, fields);
      if (tuple) existing.set(tuple, Number(row.id));
    }
    rows.forEach((row, index) => {
      const tuple = uniqueTuple(row, fields);
      if (!tuple) return;
      const currentId = existing.get(tuple);
      if (currentId !== undefined && currentId !== Number(row.id)) {
        issues.push(issue("RESTORE_UNIQUE_COLLISION", `${label} already belongs to record ${currentId}`, module, index + 1, label));
      }
    });
  }
  return issues;
}

function validateRestrictedTrustedRecords(envelope: BackupEnvelope): DataTransferIssueInput[] {
  const issues: DataTransferIssueInput[] = [];
  (envelope.records.settings ?? []).forEach((row, index) => {
    const key = typeof row.key === "string" ? row.key : "";
    if (!SAFE_SETTING_KEYS.has(key)) issues.push(issue("UNSAFE_SETTING_KEY", `Setting '${key}' is not transferable`, "settings", index + 1, "key"));
    if (typeof row.value !== "string" || row.value.length > 20_000) issues.push(issue("SETTING_VALUE", "Setting value must be text up to 20000 characters", "settings", index + 1, "value"));
  });
  (envelope.records.site_content ?? []).forEach((row, index) => {
    const key = typeof row.key === "string" ? row.key : "";
    const definition = SITE_CONTENT_DEFINITION_BY_KEY.get(key);
    if (!definition) {
      issues.push(issue("UNREGISTERED_CONTENT_KEY", `Unknown website content key '${key}'`, "site_content", index + 1, "key"));
      return;
    }
    for (const [field, expected] of [["group", definition.group], ["type", definition.type], ["label", definition.label], ["sortOrder", definition.sortOrder]] as const) {
      if (row[field] !== expected) issues.push(issue("CANONICAL_FIELD_MISMATCH", `${field} must match the registered content definition`, "site_content", index + 1, field));
    }
    const textLimit = definition.type === "TEXT" ? 300 : 4_000;
    for (const field of ["valueAr", "valueEn"] as const) {
      const value = row[field];
      if (value !== null && (typeof value !== "string" || value.length > textLimit)) issues.push(issue("CONTENT_TEXT", `${field} exceeds its registered limit`, "site_content", index + 1, field));
    }
    for (const field of ["altAr", "altEn"] as const) {
      const value = row[field];
      if (value !== null && (typeof value !== "string" || value.length > 300)) issues.push(issue("CONTENT_ALT", `${field} must be text up to 300 characters`, "site_content", index + 1, field));
    }
    if (row.mediaUrl !== null) {
      const mediaType = definition.type === "IMAGE" || definition.type === "VIDEO" || definition.type === "BANNER"
        ? definition.type
        : null;
      if (typeof row.mediaUrl !== "string" || !mediaType || !isSafeSiteMediaPath(row.mediaUrl, mediaType)) {
        issues.push(issue("UNSAFE_MEDIA_URL", "mediaUrl is not valid for this registered slot", "site_content", index + 1, "mediaUrl"));
      }
    }
    if (row.linkUrl !== null && (typeof row.linkUrl !== "string" || !isSafeSiteLink(row.linkUrl))) {
      issues.push(issue("UNSAFE_LINK_URL", "linkUrl must be a safe same-origin path", "site_content", index + 1, "linkUrl"));
    }
    if (row.metadata !== null) {
      if (typeof row.metadata !== "string" || row.metadata.length > 4_000) issues.push(issue("CONTENT_METADATA", "metadata must be JSON text up to 4000 characters", "site_content", index + 1, "metadata"));
      else {
        try {
          const parsed = JSON.parse(row.metadata);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
        } catch { issues.push(issue("CONTENT_METADATA", "metadata must be a JSON object", "site_content", index + 1, "metadata")); }
      }
    }
    if (typeof row.isActive !== "boolean") issues.push(issue("CONTENT_BOOLEAN", "isActive must be boolean", "site_content", index + 1, "isActive"));
  });
  return issues;
}

async function validateIdentityBindings(envelope: BackupEnvelope): Promise<DataTransferIssueInput[]> {
  const issues: DataTransferIssueInput[] = [];
  for (const module of SCOPE_MODULES[envelope.scope]) {
    const identity = IDENTITY_FIELDS[module];
    if (!identity) continue;
    const rows = (envelope.records[module] ?? []).filter(isPlainRecord);
    const bindings = envelope.bindings[module];
    if (!Array.isArray(bindings) || bindings.length !== rows.length) {
      issues.push(issue("IDENTITY_BINDINGS", `Stable identity bindings must cover every ${module} record`, module));
      continue;
    }
    const byId = new Map<number, string>();
    for (let index = 0; index < bindings.length; index += 1) {
      const binding = bindings[index];
      if (!binding || !Number.isInteger(binding.id) || binding.id <= 0 || typeof binding.key !== "string" || !binding.key) {
        issues.push(issue("IDENTITY_BINDING", "Identity binding must contain a positive id and non-empty key", module, index + 1));
        continue;
      }
      if (byId.has(binding.id)) issues.push(issue("IDENTITY_BINDING", `Duplicate identity binding id ${binding.id}`, module, index + 1));
      byId.set(binding.id, binding.key);
    }
    const expectedLegacy = identity.prefix
      ? allocateStableKeys(identity.prefix, rows.map((row) => ({ id: Number(row.id), externalKey: typeof row[identity.field] === "string" ? String(row[identity.field]) : null })))
      : new Map<number, string>();
    rows.forEach((row, index) => {
      const id = Number(row.id);
      const expected = typeof row[identity.field] === "string" ? String(row[identity.field]) : expectedLegacy.get(id);
      if (!expected || byId.get(id) !== expected) issues.push(issue("IDENTITY_BINDING", "Binding does not match the lossless record identity", module, index + 1, identity.field));
    });

    const select = { id: true, [identity.field]: true };
    const current = await asDelegate(prisma, module).findMany({ select });
    const currentLegacy = identity.prefix
      ? allocateStableKeys(identity.prefix, current.map((row) => ({ id: Number(row.id), externalKey: typeof row[identity.field] === "string" ? String(row[identity.field]) : null })))
      : new Map<number, string>();
    const currentById = new Map(current.map((row) => [Number(row.id), row]));
    rows.forEach((row, index) => {
      const id = Number(row.id);
      const live = currentById.get(id);
      if (!live) return;
      const liveKey = typeof live[identity.field] === "string" ? String(live[identity.field]) : currentLegacy.get(id);
      if (liveKey !== byId.get(id)) issues.push(issue("RESTORE_IDENTITY_COLLISION", `Live record ${id} has a different stable identity; numeric overwrite refused`, module, index + 1, identity.field));
    });
  }
  return issues;
}

async function validateOperationsCatalogBindings(envelope: BackupEnvelope): Promise<DataTransferIssueInput[]> {
  if (envelope.scope !== "OPERATIONS") return [];
  const issues: DataTransferIssueInput[] = [];
  const catalog = await prisma.catalogItem.findMany({ select: { id: true, sku: true } });
  const skuById = new Map(catalog.map((row) => [row.id, row.sku]));
  for (const module of ["project_items", "quote_items"] as const) {
    const portableByKey = new Map((envelope.data[module] ?? []).flatMap((row) =>
      typeof row.external_key === "string" && typeof row.catalog_sku === "string" ? [[row.external_key, row.catalog_sku] as const] : [],
    ));
    const bindingById = new Map((envelope.bindings[module] ?? []).map((binding) => [binding.id, binding.key]));
    (envelope.records[module] ?? []).forEach((row, index) => {
      const binding = bindingById.get(Number(row.id));
      const expectedSku = binding ? portableByKey.get(binding) : undefined;
      const liveSku = skuById.get(Number(row.catalogItemId));
      if (!expectedSku || liveSku !== expectedSku) {
        issues.push(issue("CATALOG_IDENTITY_MISMATCH", "Operations restore cannot prove catalogItemId maps to the exported SKU", module, index + 1, "catalogItemId"));
      }
    });
  }
  return issues;
}

async function validatePortablePresentation(envelope: BackupEnvelope): Promise<DataTransferIssueInput[]> {
  const issues: DataTransferIssueInput[] = [];
  const parsedRows: ParsedDataFile["rows"] = [];
  for (const module of SCOPE_MODULES[envelope.scope]) {
    (envelope.data[module] ?? []).forEach((row, index) => {
      if (!isPlainRecord(row)) return;
      const values: Record<string, CellScalar> = {};
      for (const [field, value] of Object.entries(row)) {
        if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") values[field] = value;
        else issues.push(issue("PORTABLE_SCALAR", `${field} must be a spreadsheet scalar`, module, index + 1, field));
      }
      parsedRows.push({ module, sheet: module, rowNumber: index + 2, values });
    });
  }
  const parsed: ParsedDataFile = {
    schemaVersion: DATA_TRANSFER_SCHEMA_VERSION,
    source: "HATAB_ERP_LOGICAL_BACKUP",
    generatedAt: envelope.createdAt,
    fileName: "trusted-backup.json",
    fileType: "csv",
    sourceHash: envelope.sourceHash,
    modules: [...SCOPE_MODULES[envelope.scope]],
    rows: parsedRows,
  };
  const validated = await validateParsedDataFile(parsed);
  issues.push(...validated.issues.map((entry) => ({ ...entry, code: `PORTABLE_${entry.code}` })));

  const bindingsByModule = new Map<DataModuleName, Map<number, string>>();
  const idsByKeyByModule = new Map<DataModuleName, Map<string, number>>();
  for (const module of SCOPE_MODULES[envelope.scope]) {
    const byId = new Map((envelope.bindings[module] ?? []).map((binding) => [binding.id, binding.key]));
    bindingsByModule.set(module, byId);
    idsByKeyByModule.set(module, new Map([...byId].map(([id, key]) => [key, id])));
  }

  for (const row of validated.rows) {
    if (row.module === "catalog_item_collections" || row.module === "catalog_item_tags") continue;
    const id = idsByKeyByModule.get(row.module)?.get(row.recordKey);
    const raw = id === undefined ? undefined : (envelope.records[row.module] ?? []).find((candidate) => Number(candidate.id) === id);
    if (!raw) {
      issues.push(issue("PORTABLE_BINDING", `Portable key '${row.recordKey}' has no lossless record binding`, row.module, row.rowNumber));
      continue;
    }
    for (const [field, value] of Object.entries(row.data)) {
      if (field === IDENTITY_FIELDS[row.module]?.field) continue;
      if (Object.hasOwn(raw, field) && !equivalentPortableTrustedValue(value, raw[field], field)) {
        issues.push(issue("PORTABLE_RECORD_MISMATCH", `${field} differs between portable and lossless payloads`, row.module, row.rowNumber, field));
      }
    }
    for (const relation of REFERENCE_FIELDS[row.module] ?? []) {
      const rawId = raw[relation.field];
      const expectedKey = rawId === null || rawId === undefined
        ? null
        : bindingsByModule.get(relation.target)?.get(Number(rawId));
      // OPERATIONS intentionally excludes catalog records; its SKU binding is checked against the live catalog separately.
      if (expectedKey === undefined && envelope.scope === "OPERATIONS" && relation.target === "catalog_items") continue;
      if ((row.references[relation.reference] ?? null) !== (expectedKey ?? null)) {
        issues.push(issue("PORTABLE_REFERENCE_MISMATCH", `${relation.field} differs from portable ${relation.reference}`, row.module, row.rowNumber, relation.field));
      }
    }
  }

  for (const [linkModule, targetModule, idsField, reference] of [
    ["catalog_item_collections", "collections", "collectionIds", "collectionSlug"],
    ["catalog_item_tags", "tags", "tagIds", "tagSlug"],
  ] as const) {
    if (!SCOPE_MODULES[envelope.scope].includes(linkModule)) continue;
    const expectedPairs = new Set<string>();
    for (const raw of envelope.records[linkModule] ?? []) {
      const itemKey = bindingsByModule.get("catalog_items")?.get(Number(raw.catalogItemId));
      const ids = raw[idsField];
      if (!itemKey || !Array.isArray(ids)) continue;
      for (const id of ids) {
        const targetKey = bindingsByModule.get(targetModule)?.get(Number(id));
        if (targetKey) expectedPairs.add(`${itemKey}\u0000${targetKey}`);
      }
    }
    const actualPairs = new Set(validated.rows.filter((row) => row.module === linkModule).map((row) =>
      `${row.references.catalogSku ?? ""}\u0000${row.references[reference] ?? ""}`,
    ));
    if (expectedPairs.size !== actualPairs.size || [...expectedPairs].some((pair) => !actualPairs.has(pair))) {
      issues.push(issue("PORTABLE_LINK_MISMATCH", `${linkModule} portable links differ from lossless relationship records`, linkModule));
    }
  }
  return issues;
}

export async function preflightBackup(buffer: Buffer): Promise<RestorePreflight> {
  const parsed = decodeBackupEnvelope(buffer, MAX_BACKUP_UPLOAD_BYTES);
  if (!parsed.envelope) return { valid: false, scope: null, sourceHash: null, rowCount: 0, counts: {}, issues: parsed.issues };
  const envelope = parsed.envelope;
  const issues = [...parsed.issues];
  const expectedModules = new Set<DataModuleName>(SCOPE_MODULES[envelope.scope]);
  if (expectedModules.has("finance_entries") && (!Array.isArray(envelope.records.finance_entries) || !Array.isArray(envelope.data.finance_entries))) {
    return { valid: false, scope: envelope.scope, sourceHash: envelope.sourceHash, rowCount: 0, counts: envelope.counts, issues: [issue("BACKUP_PREDATES_ACCOUNTING", "This backup predates the accounting ledger. Restoring its supplier balances without ledger movements could produce inconsistent accounts. Use a current full/operations backup or restore the required modules through reviewed import.", "finance_entries")] };
  }
  for (const key of [...Object.keys(envelope.records), ...Object.keys(envelope.data), ...Object.keys(envelope.bindings)]) {
    if (!isDataModuleName(key) || !expectedModules.has(key)) issues.push(issue("BACKUP_MODULE", `Module ${key} is not allowed in ${envelope.scope}`, key));
  }
  for (const module of expectedModules) {
    if (!Array.isArray(envelope.records[module])) issues.push(issue("BACKUP_MODULE_MISSING", `Lossless module ${module} is missing`, module));
    if (!Array.isArray(envelope.data[module])) issues.push(issue("BACKUP_PORTABLE_MISSING", `Portable module ${module} is missing`, module));
  }

  let rowCount = 0;
  const ids = new Map<DataModuleName, Set<number>>();
  for (const module of expectedModules) {
    const rows = envelope.records[module] ?? [];
    rowCount += rows.length;
    const moduleIds = new Set<number>();
    rows.forEach((row, index) => {
      issues.push(...validateRecordShape(module, row, index + 1));
      if (isPlainRecord(row) && Number.isInteger(row.id)) {
        const id = Number(row.id);
        if (moduleIds.has(id)) issues.push(issue("RECORD_ID_DUPLICATE", `Duplicate id ${id}`, module, index + 1, "id"));
        moduleIds.add(id);
      }
    });
    ids.set(module, moduleIds);
    if (Number(envelope.counts[module]) !== rows.length) issues.push(issue("BACKUP_COUNT", `Count mismatch for ${module}`, module));
    const portable = envelope.data[module] ?? [];
    portable.forEach((row, index) => {
      if (!isPlainRecord(row)) issues.push(issue("PORTABLE_SHAPE", "Portable row must be an object", module, index + 1));
      else if (Object.hasOwn(row, "record_id")) issues.push(issue("PORTABLE_ID", "Portable backups must not contain record_id", module, index + 1, "record_id"));
    });
  }
  if (rowCount > MAX_BACKUP_RECORDS) issues.push(issue("BACKUP_ROWS", `Backup exceeds ${MAX_BACKUP_RECORDS} lossless records`));

  issues.push(...validateRestrictedTrustedRecords(envelope));
  issues.push(...await validateIdentityBindings(envelope));
  issues.push(...await validateOperationsCatalogBindings(envelope));
  issues.push(...await validatePortablePresentation(envelope));

  if (expectedModules.has("finance_entries")) {
    const incomingEntryIds = new Set((envelope.records.finance_entries ?? []).map((row) => Number(row.id)));
    const incomingOrderIds = new Set((envelope.records.supplier_orders ?? []).map((row) => Number(row.id)));
    if (incomingOrderIds.size) {
      const retained = await prisma.financeEntry.findMany({ where: { kind: "SUPPLIER_PAYMENT", status: "POSTED" }, select: { id: true, supplierOrderId: true } });
      if (retained.some((row) => row.supplierOrderId !== null && incomingOrderIds.has(row.supplierOrderId) && !incomingEntryIds.has(row.id))) {
        issues.push(issue("FINANCE_RESTORE_REQUIRES_COMPLETE_LEDGER", "Current supplier payments absent from this backup would survive MERGE_NO_DELETE while their supplier balance is overwritten. Restore a current snapshot or reconcile those movements first.", "finance_entries"));
      }
    }
  }
  if (expectedModules.has("payments") && expectedModules.has("projects")) {
    const incomingPaymentIds = new Set((envelope.records.payments ?? []).map((row) => Number(row.id)));
    const incomingProjectIds = new Set((envelope.records.projects ?? []).map((row) => Number(row.id)));
    const retained = await prisma.payment.findMany({ where: { amount: { gt: 0 } }, select: { id: true, projectId: true } });
    if (retained.some((row) => incomingProjectIds.has(row.projectId) && !incomingPaymentIds.has(row.id))) {
      issues.push(issue("RECEIPT_RESTORE_REQUIRES_COMPLETE_LEDGER", "Current customer receipts absent from this backup would survive MERGE_NO_DELETE while the project's paid balance is overwritten. Restore a current snapshot or reconcile those receipts first.", "payments"));
    }
  }

  for (const module of expectedModules) {
    const rows = (envelope.records[module] ?? []).filter(isPlainRecord);
    issues.push(...await validateUniqueCollisions(module, rows));
  }

  const externalIdCache = new Map<DataModuleName, Set<number>>();
  const available = async (module: DataModuleName): Promise<Set<number>> => {
    if (expectedModules.has(module)) return ids.get(module) ?? new Set();
    let current = externalIdCache.get(module);
    if (!current) {
      current = await currentIds(module);
      externalIdCache.set(module, current);
    }
    return current;
  };
  for (const module of expectedModules) {
    const rows = envelope.records[module] ?? [];
    const schema = schemaOf(module);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!isPlainRecord(row)) continue;
      for (const relation of schema.foreignKeys ?? []) {
        const value = row[relation.field];
        if ((value === null || value === undefined) && relation.nullable) continue;
        if (!Number.isInteger(value) || !(await available(relation.module)).has(Number(value))) {
          issues.push(issue("RECORD_FOREIGN_KEY", `${relation.field} does not resolve to ${relation.module}`, module, index + 1, relation.field));
        }
      }
      if (module === "catalog_item_collections" && Array.isArray(row.collectionIds)) {
        const collectionIds = await available("collections");
        for (const id of row.collectionIds) if (!collectionIds.has(Number(id))) issues.push(issue("RECORD_FOREIGN_KEY", `Collection ${id} does not exist`, module, index + 1, "collectionIds"));
      }
      if (module === "catalog_item_tags" && Array.isArray(row.tagIds)) {
        const tagIds = await available("tags");
        for (const id of row.tagIds) if (!tagIds.has(Number(id))) issues.push(issue("RECORD_FOREIGN_KEY", `Tag ${id} does not exist`, module, index + 1, "tagIds"));
      }
    }
  }
  return {
    valid: issues.length === 0,
    scope: envelope.scope,
    sourceHash: envelope.sourceHash,
    rowCount,
    counts: envelope.counts,
    issues,
    envelope: issues.length === 0 ? envelope : undefined,
  };
}

function reviveRecord(module: DataModuleName, row: LosslessRow): LosslessRow {
  const result = { ...row };
  const schema = schemaOf(module);
  for (const field of schema.dateFields ?? []) result[field] = new Date(String(result[field]));
  for (const field of schema.nullableDateFields ?? []) {
    if (Object.hasOwn(result, field)) result[field] = result[field] === null ? null : new Date(String(result[field]));
  }
  return result;
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item);
}

async function createAudits(tx: TransactionClient, audits: Prisma.DataChangeAuditCreateManyInput[]) {
  for (let start = 0; start < audits.length; start += 250) {
    await tx.dataChangeAudit.createMany({ data: audits.slice(start, start + 250) });
  }
}

async function applyLosslessBackup(envelope: BackupEnvelope, jobId: number, actor: ActorIdentity, recoveryName: string): Promise<number> {
  let restoredCount = 0;
  await prisma.$transaction(async (tx) => {
    const audits: Prisma.DataChangeAuditCreateManyInput[] = [];
    for (const module of MODULE_APPLY_ORDER) {
      if (!SCOPE_MODULES[envelope.scope].includes(module)) continue;
      if (module === "catalog_item_collections" || module === "catalog_item_tags") continue;
      const schema = schemaOf(module);
      const delegate = asDelegate(tx, module);
      for (const source of envelope.records[module] ?? []) {
        const revived = reviveRecord(module, source);
        const id = Number(revived.id);
        const before = await delegate.findUnique({ where: { id } });
        const deferred = new Set<string>(schema.deferredFields ?? []);
        const writeData = Object.fromEntries(Object.entries(revived).map(([key, value]) => [key, deferred.has(key) ? null : value]));
        const updateData = { ...writeData };
        delete updateData.id;
        const after = await delegate.upsert({ where: { id }, create: writeData, update: updateData });
        audits.push({
          jobId, module, recordKey: String(id), action: "RESTORE",
          beforeData: before ? json(before) : null, afterData: json(after),
          actorId: actor.id, actorEmail: actor.email,
        });
        restoredCount += 1;
      }
      if ((schema.deferredFields?.length ?? 0) > 0) {
        for (const source of envelope.records[module] ?? []) {
          const data = Object.fromEntries((schema.deferredFields ?? []).map((field) => [field, source[field]]));
          const finalRecord = await delegate.update({ where: { id: Number(source.id) }, data });
          const pendingAudit = [...audits].reverse().find((entry) => entry.module === module && entry.recordKey === String(source.id));
          if (pendingAudit) pendingAudit.afterData = json(finalRecord);
        }
      }
    }

    for (const relationModule of ["catalog_item_collections", "catalog_item_tags"] as const) {
      if (!SCOPE_MODULES[envelope.scope].includes(relationModule)) continue;
      for (const source of envelope.records[relationModule] ?? []) {
        const catalogItemId = Number(source.catalogItemId);
        const before = await tx.catalogItem.findUnique({
          where: { id: catalogItemId },
          select: relationModule === "catalog_item_collections"
            ? { collections: { select: { id: true }, orderBy: { id: "asc" } } }
            : { tags: { select: { id: true }, orderBy: { id: "asc" } } },
        });
        if (relationModule === "catalog_item_collections") {
          const ids = (source.collectionIds as number[]).map((id) => ({ id }));
          await tx.catalogItem.update({ where: { id: catalogItemId }, data: { collections: { connect: ids } } });
        } else {
          const ids = (source.tagIds as number[]).map((id) => ({ id }));
          await tx.catalogItem.update({ where: { id: catalogItemId }, data: { tags: { connect: ids } } });
        }
        const after = await tx.catalogItem.findUnique({
          where: { id: catalogItemId },
          select: relationModule === "catalog_item_collections"
            ? { collections: { select: { id: true }, orderBy: { id: "asc" } } }
            : { tags: { select: { id: true }, orderBy: { id: "asc" } } },
        });
        audits.push({
          jobId, module: relationModule, recordKey: String(catalogItemId), action: "RESTORE",
          beforeData: json(before), afterData: json(after), actorId: actor.id, actorEmail: actor.email,
        });
        restoredCount += 1;
      }
    }
    await createAudits(tx, audits);
    await tx.dataTransferJob.update({ where: { id: jobId }, data: {
      status: "SUCCESS",
      rowCount: Object.values(envelope.counts).reduce((sum, count) => sum + count, 0),
      updatedCount: restoredCount,
      resultName: recoveryName,
      summary: json({ counts: envelope.counts, restoreMode: envelope.restoreMode, preRestoreBackup: recoveryName }),
      completedAt: new Date(),
    } });
  }, { maxWait: 10_000, timeout: 120_000 });
  return restoredCount;
}

async function persistIssues(jobId: number, issues: DataTransferIssueInput[]) {
  if (!issues.length) return;
  await prisma.dataTransferIssue.createMany({ data: issues.map((entry) => ({ jobId, ...entry })) });
}

export async function runBackupRestore(input: {
  fileName: string;
  buffer: Buffer;
  dryRun: boolean;
  actor: ActorIdentity;
}): Promise<RestoreResult> {
  const job = await prisma.dataTransferJob.create({
    data: {
      schemaVersion: DATA_TRANSFER_SCHEMA_VERSION,
      kind: "RESTORE", scope: "UNKNOWN", fileName: input.fileName,
      status: "VALIDATING", dryRun: input.dryRun,
      actorId: input.actor.id, actorEmail: input.actor.email,
    },
  });
  let resultScope: BackupEnvelope["scope"] | null = null;
  let resultHash = "";
  let resultRows = 0;
  let recoveryName: string | undefined;
  try {
    const preflight = await preflightBackup(input.buffer);
    resultScope = preflight.scope;
    resultHash = preflight.sourceHash ?? "";
    resultRows = preflight.rowCount;
    await persistIssues(job.id, preflight.issues);
    if (!preflight.valid || !preflight.envelope) {
      await prisma.dataTransferJob.update({ where: { id: job.id }, data: {
        status: "FAILED", scope: preflight.scope ?? "UNKNOWN", sourceHash: preflight.sourceHash,
        rowCount: preflight.rowCount, errorCount: preflight.issues.length,
        errors: json(preflight.issues.slice(0, 100)), completedAt: new Date(),
      } });
      return { jobId: job.id, dryRun: input.dryRun, sourceHash: preflight.sourceHash ?? "", scope: preflight.scope,
        rowCount: preflight.rowCount, restoredCount: 0, errorCount: preflight.issues.length, issues: preflight.issues };
    }
    const envelope = preflight.envelope;
    if (input.dryRun) {
      await prisma.dataTransferJob.update({ where: { id: job.id }, data: {
        status: "SUCCESS", scope: envelope.scope, sourceHash: envelope.sourceHash,
        rowCount: preflight.rowCount, skippedCount: preflight.rowCount,
        summary: json({ counts: envelope.counts, restoreMode: envelope.restoreMode }), completedAt: new Date(),
      } });
      return { jobId: job.id, dryRun: true, sourceHash: envelope.sourceHash, scope: envelope.scope,
        rowCount: preflight.rowCount, restoredCount: 0, errorCount: 0, issues: [] };
    }
    const preRestore = await createBackupArtifact({ scope: envelope.scope, actor: input.actor, reason: "PRE_RESTORE" });
    recoveryName = preRestore.fileName;
    await prisma.dataTransferJob.update({ where: { id: job.id }, data: { status: "APPLYING", scope: envelope.scope, sourceHash: envelope.sourceHash } });
    const restoredCount = await applyLosslessBackup(envelope, job.id, input.actor, preRestore.fileName);
    return { jobId: job.id, dryRun: false, sourceHash: envelope.sourceHash, scope: envelope.scope,
      rowCount: preflight.rowCount, restoredCount, errorCount: 0, preRestoreBackup: preRestore.fileName, issues: [] };
  } catch (error) {
    const failure = issue("RESTORE_FAILED", error instanceof Error ? error.message : "Restore failed");
    await persistIssues(job.id, [failure]);
    await prisma.dataTransferJob.update({ where: { id: job.id }, data: {
      status: "FAILED", errorCount: 1, errors: json([failure]), completedAt: new Date(),
    } });
    return { jobId: job.id, dryRun: input.dryRun, sourceHash: resultHash, scope: resultScope,
      rowCount: resultRows, restoredCount: 0, errorCount: 1, preRestoreBackup: recoveryName, issues: [failure] };
  }
}

export function backupModuleNames(): readonly DataModuleName[] {
  return DATA_MODULES;
}
