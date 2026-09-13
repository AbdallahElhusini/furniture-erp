import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { calculateCatalogCompleteness, catalogContentStatus } from "@/lib/catalog-quality";
import { SITE_CONTENT_CACHE_TAG } from "@/lib/site-content-server";
import {
  DATA_TRANSFER_SCHEMA_VERSION,
  MODULE_APPLY_ORDER,
  type ActorIdentity,
  type ApplyModuleCount,
  type ApplySummary,
  type DataModuleName,
  type DataTransferIssueInput,
  type ValidatedDataRow,
} from "./contracts";
import { DataFileParseError, parseUploadedDataFile } from "./parser";
import { validateParsedDataFile } from "./validator";
import { createBackupArtifact } from "./backup";
import { buildPatchData, transferRowHasValue } from "./patch-semantics";
import { stableKeyMap } from "./stable-keys";
import { applyPaidDelta, roundMoney } from "@/lib/accounting/validation";

type TransactionClient = Prisma.TransactionClient;
type PlainRecord = Record<string, unknown> & { id: number };

interface CrudDelegate {
  findUnique(args: Record<string, unknown>): Promise<PlainRecord | null>;
  create(args: Record<string, unknown>): Promise<PlainRecord>;
  update(args: Record<string, unknown>): Promise<PlainRecord>;
}

interface ApplyContext {
  clientIds: Map<string, number>;
  supplierIds: Map<string, number>;
  technicianIds: Map<string, number>;
  projectIds: Map<string, number>;
  projectItemIds: Map<string, number>;
  supplierOrderIds: Map<string, number>;
  quoteIds: Map<string, number>;
  assetIds: Map<string, number>;
  categoryIds: Map<string, number>;
  collectionIds: Map<string, number>;
  familyIds: Map<string, number>;
  tagGroupIds: Map<string, number>;
  tagIds: Map<string, number>;
  catalogItemIds: Map<string, number>;
  affectedProjectIds: Set<number>;
  affectedCatalogItemIds: Set<number>;
  importedSupplierBalances: Set<number>;
  projectPaymentOffsets: Map<number, number>;
  importedProjectBalances: Map<number, number>;
}

interface PendingAudit {
  jobId: number;
  module: string;
  recordKey: string;
  action: string;
  beforeData: string | null;
  afterData: string | null;
  actorId: number;
  actorEmail: string;
}

function asDelegate(value: unknown): CrudDelegate {
  return value as CrudDelegate;
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item);
}

function patchData(row: ValidatedDataRow, excluded: readonly string[] = []): Record<string, unknown> {
  return buildPatchData(row.data, row.raw, excluded);
}

function hasValue(row: ValidatedDataRow, field: string): boolean {
  return transferRowHasValue(row.raw, field);
}

function sortedRows(rows: ValidatedDataRow[]): ValidatedDataRow[] {
  const order = new Map(MODULE_APPLY_ORDER.map((module, index) => [module, index]));
  const grouped = new Map<DataModuleName, ValidatedDataRow[]>();
  for (const row of rows) grouped.set(row.module, [...(grouped.get(row.module) ?? []), row]);

  const sortDependencies = (moduleRows: ValidatedDataRow[], reference: string) => {
    const byKey = new Map(moduleRows.map((row) => [row.recordKey, row]));
    const result: ValidatedDataRow[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (row: ValidatedDataRow) => {
      if (visited.has(row.recordKey)) return;
      if (visiting.has(row.recordKey)) return;
      visiting.add(row.recordKey);
      const dependency = row.references[reference];
      if (dependency && byKey.has(dependency)) visit(byKey.get(dependency)!);
      visiting.delete(row.recordKey);
      visited.add(row.recordKey);
      result.push(row);
    };
    for (const row of moduleRows) visit(row);
    return result;
  };

  if (grouped.has("categories")) grouped.set("categories", sortDependencies(grouped.get("categories")!, "parentSlug"));
  if (grouped.has("product_assets")) grouped.set("product_assets", sortDependencies(grouped.get("product_assets")!, "duplicateExternalKey"));

  return [...grouped.entries()]
    .sort(([left], [right]) => (order.get(left) ?? 999) - (order.get(right) ?? 999))
    .flatMap(([, moduleRows]) => moduleRows);
}

async function loadApplyContext(tx: TransactionClient): Promise<ApplyContext> {
  const [clients, suppliers, technicians, projects, projectItems, supplierOrders, quotes, assets,
    categories, collections, families, tagGroups, tags, catalogItems, paymentTotals] = await Promise.all([
    tx.client.findMany({ select: { id: true, externalKey: true } }),
    tx.supplier.findMany({ select: { id: true, externalKey: true } }),
    tx.technician.findMany({ select: { id: true, externalKey: true } }),
    tx.project.findMany({ select: { id: true, externalKey: true, amountPaid: true } }),
    tx.projectItem.findMany({ select: { id: true, externalKey: true } }),
    tx.supplierOrder.findMany({ select: { id: true, externalKey: true } }),
    tx.quoteRequest.findMany({ select: { id: true, externalKey: true } }),
    tx.productAsset.findMany({ select: { id: true, externalKey: true } }),
    tx.category.findMany({ select: { id: true, slug: true } }),
    tx.collection.findMany({ select: { id: true, slug: true } }),
    tx.productFamily.findMany({ select: { id: true, sourceKey: true } }),
    tx.tagGroup.findMany({ select: { id: true, key: true } }),
    tx.tag.findMany({ select: { id: true, slug: true } }),
    tx.catalogItem.findMany({ select: { id: true, sku: true } }),
    tx.payment.groupBy({ by: ["projectId"], _sum: { amount: true } }),
  ]);
  const paymentTotalByProject = new Map(paymentTotals.map((total) => [total.projectId, total._sum.amount ?? 0]));
  return {
    clientIds: stableKeyMap("CLIENT", clients), supplierIds: stableKeyMap("SUPPLIER", suppliers), technicianIds: stableKeyMap("TECH", technicians),
    projectIds: stableKeyMap("PROJECT", projects), projectItemIds: stableKeyMap("PROJECT-ITEM", projectItems),
    supplierOrderIds: stableKeyMap("SUPPLIER-ORDER", supplierOrders), quoteIds: stableKeyMap("QUOTE", quotes), assetIds: stableKeyMap("ASSET", assets),
    categoryIds: new Map(categories.map((row) => [row.slug, row.id])),
    collectionIds: new Map(collections.map((row) => [row.slug, row.id])),
    familyIds: new Map(families.map((row) => [row.sourceKey, row.id])),
    tagGroupIds: new Map(tagGroups.map((row) => [row.key, row.id])),
    tagIds: new Map(tags.map((row) => [row.slug, row.id])),
    catalogItemIds: new Map(catalogItems.map((row) => [row.sku, row.id])),
    affectedProjectIds: new Set(), affectedCatalogItemIds: new Set(), importedSupplierBalances: new Set(),
    projectPaymentOffsets: new Map(projects.map((project) => [project.id, roundMoney(project.amountPaid - (paymentTotalByProject.get(project.id) ?? 0))])),
    importedProjectBalances: new Map(),
  };
}

async function writeRecord(input: {
  delegate: CrudDelegate;
  row: ValidatedDataRow;
  uniqueField: string;
  createData: Record<string, unknown>;
  updateData: Record<string, unknown>;
  actor: ActorIdentity;
  jobId: number;
  audits: PendingAudit[];
}): Promise<{ record: PlainRecord; action: "INSERT" | "UPDATE" }> {
  const { delegate, row, uniqueField } = input;
  let before = await delegate.findUnique({ where: { [uniqueField]: row.recordKey } });
  if (!before && row.recordId !== undefined) before = await delegate.findUnique({ where: { id: row.recordId } });
  const record = before
    ? await delegate.update({ where: { id: before.id }, data: input.updateData })
    : await delegate.create({ data: input.createData });
  const action = before ? "UPDATE" : "INSERT";
  input.audits.push({
    jobId: input.jobId, module: row.module, recordKey: row.recordKey, action,
    beforeData: before ? json(before) : null, afterData: json(record),
    actorId: input.actor.id, actorEmail: input.actor.email,
  });
  return { record, action };
}

function ref(map: Map<string, number>, value: string | null | undefined, name: string): number {
  const id = value ? map.get(value) : undefined;
  if (!id) throw new Error(`Validated reference '${name}:${value || ""}' disappeared before apply`);
  return id;
}

async function applyRow(
  tx: TransactionClient,
  context: ApplyContext,
  row: ValidatedDataRow,
  jobId: number,
  actor: ActorIdentity,
  audits: PendingAudit[],
): Promise<"INSERT" | "UPDATE" | "SKIP"> {
  const data = row.data;
  const externalCreate = { ...data, externalKey: row.recordKey };
  const externalUpdate = { ...patchData(row, ["externalKey"]), externalKey: row.recordKey };

  switch (row.module) {
    case "clients": {
      const result = await writeRecord({ delegate: asDelegate(tx.client), row, uniqueField: "externalKey", createData: externalCreate, updateData: externalUpdate, actor, jobId, audits });
      context.clientIds.set(row.recordKey, result.record.id); return result.action;
    }
    case "suppliers": {
      const result = await writeRecord({ delegate: asDelegate(tx.supplier), row, uniqueField: "externalKey", createData: externalCreate, updateData: externalUpdate, actor, jobId, audits });
      context.supplierIds.set(row.recordKey, result.record.id); return result.action;
    }
    case "technicians": {
      const result = await writeRecord({ delegate: asDelegate(tx.technician), row, uniqueField: "externalKey", createData: externalCreate, updateData: externalUpdate, actor, jobId, audits });
      context.technicianIds.set(row.recordKey, result.record.id); return result.action;
    }
    case "settings":
      return (await writeRecord({ delegate: asDelegate(tx.setting), row, uniqueField: "key", createData: data, updateData: patchData(row, ["key"]), actor, jobId, audits })).action;
    case "site_content":
      return (await writeRecord({
        delegate: asDelegate(tx.siteContent), row, uniqueField: "key", createData: data,
        updateData: {
          ...patchData(row, ["key", "group", "type", "label", "sortOrder"]),
          group: data.group, type: data.type, label: data.label, sortOrder: data.sortOrder,
        },
        actor, jobId, audits,
      })).action;
    case "categories": {
      const parentId = row.references.parentSlug ? ref(context.categoryIds, row.references.parentSlug, "category") : null;
      const createData = { ...data, parentId };
      const updateData = patchData(row, ["slug"]);
      if (hasValue(row, "parent_slug")) updateData.parentId = parentId;
      const result = await writeRecord({ delegate: asDelegate(tx.category), row, uniqueField: "slug", createData, updateData, actor, jobId, audits });
      context.categoryIds.set(row.recordKey, result.record.id); return result.action;
    }
    case "category_redirects": {
      const categoryId = ref(context.categoryIds, row.references.categorySlug, "category");
      return (await writeRecord({ delegate: asDelegate(tx.categoryRedirect), row, uniqueField: "fromSlug", createData: { ...data, categoryId }, updateData: { ...patchData(row, ["fromSlug"]), categoryId }, actor, jobId, audits })).action;
    }
    case "collections": {
      const result = await writeRecord({ delegate: asDelegate(tx.collection), row, uniqueField: "slug", createData: data, updateData: patchData(row, ["slug"]), actor, jobId, audits });
      context.collectionIds.set(row.recordKey, result.record.id); return result.action;
    }
    case "product_families": {
      const categoryId = ref(context.categoryIds, row.references.categorySlug, "category");
      const result = await writeRecord({ delegate: asDelegate(tx.productFamily), row, uniqueField: "sourceKey", createData: { ...data, categoryId }, updateData: { ...patchData(row, ["sourceKey"]), categoryId }, actor, jobId, audits });
      context.familyIds.set(row.recordKey, result.record.id); return result.action;
    }
    case "tag_groups": {
      const result = await writeRecord({ delegate: asDelegate(tx.tagGroup), row, uniqueField: "key", createData: data, updateData: patchData(row, ["key"]), actor, jobId, audits });
      context.tagGroupIds.set(row.recordKey, result.record.id); return result.action;
    }
    case "tags": {
      const groupId = ref(context.tagGroupIds, row.references.groupKey, "tag-group");
      const result = await writeRecord({ delegate: asDelegate(tx.tag), row, uniqueField: "slug", createData: { ...data, groupId }, updateData: { ...patchData(row, ["slug"]), groupId }, actor, jobId, audits });
      context.tagIds.set(row.recordKey, result.record.id); return result.action;
    }
    case "catalog_items": {
      const categoryId = ref(context.categoryIds, row.references.categorySlug, "category");
      const familyId = row.references.familySourceKey ? ref(context.familyIds, row.references.familySourceKey, "family") : null;
      const supplierId = row.references.supplierExternalKey ? ref(context.supplierIds, row.references.supplierExternalKey, "supplier") : null;
      const createData = { ...data, categoryId, familyId, supplierId };
      const updateData = patchData(row, ["sku"]);
      updateData.categoryId = categoryId;
      if (hasValue(row, "family_source_key")) updateData.familyId = familyId;
      if (hasValue(row, "supplier_external_key")) updateData.supplierId = supplierId;
      const result = await writeRecord({ delegate: asDelegate(tx.catalogItem), row, uniqueField: "sku", createData, updateData, actor, jobId, audits });
      context.catalogItemIds.set(row.recordKey, result.record.id); context.affectedCatalogItemIds.add(result.record.id); return result.action;
    }
    case "product_assets": {
      const catalogItemId = row.references.catalogSku ? ref(context.catalogItemIds, row.references.catalogSku, "catalog") : null;
      const familyId = row.references.familySourceKey ? ref(context.familyIds, row.references.familySourceKey, "family") : null;
      const duplicateOfId = row.references.duplicateExternalKey ? ref(context.assetIds, row.references.duplicateExternalKey, "asset") : null;
      const createData = { ...externalCreate, catalogItemId, familyId, duplicateOfId };
      const updateData: Record<string, unknown> = { ...externalUpdate };
      if (hasValue(row, "catalog_sku")) updateData.catalogItemId = catalogItemId;
      if (hasValue(row, "family_source_key")) updateData.familyId = familyId;
      if (hasValue(row, "duplicate_external_key")) updateData.duplicateOfId = duplicateOfId;
      const result = await writeRecord({ delegate: asDelegate(tx.productAsset), row, uniqueField: "externalKey", createData, updateData, actor, jobId, audits });
      context.assetIds.set(row.recordKey, result.record.id);
      if (catalogItemId) context.affectedCatalogItemIds.add(catalogItemId);
      return result.action;
    }
    case "catalog_item_collections": {
      const itemId = ref(context.catalogItemIds, row.references.catalogSku, "catalog");
      const collectionId = ref(context.collectionIds, row.references.collectionSlug, "collection");
      const before = await tx.catalogItem.findUnique({ where: { id: itemId }, select: { collections: { where: { id: collectionId }, select: { id: true } } } });
      await tx.catalogItem.update({ where: { id: itemId }, data: { collections: { connect: { id: collectionId } } } });
      audits.push({
        jobId, module: row.module, recordKey: row.recordKey, action: "UPDATE",
        beforeData: json({ connected: Boolean(before?.collections.length), catalogItemId: itemId, collectionId }),
        afterData: json({ connected: true, catalogItemId: itemId, collectionId }),
        actorId: actor.id, actorEmail: actor.email,
      });
      return "UPDATE";
    }
    case "catalog_item_tags": {
      const itemId = ref(context.catalogItemIds, row.references.catalogSku, "catalog");
      const tagId = ref(context.tagIds, row.references.tagSlug, "tag");
      const before = await tx.catalogItem.findUnique({ where: { id: itemId }, select: { tags: { where: { id: tagId }, select: { id: true } } } });
      await tx.catalogItem.update({ where: { id: itemId }, data: { tags: { connect: { id: tagId } } } });
      audits.push({
        jobId, module: row.module, recordKey: row.recordKey, action: "UPDATE",
        beforeData: json({ connected: Boolean(before?.tags.length), catalogItemId: itemId, tagId }),
        afterData: json({ connected: true, catalogItemId: itemId, tagId }),
        actorId: actor.id, actorEmail: actor.email,
      });
      return "UPDATE";
    }
    case "projects": {
      const clientId = ref(context.clientIds, row.references.clientExternalKey, "client");
      const result = await writeRecord({ delegate: asDelegate(tx.project), row, uniqueField: "externalKey", createData: { ...externalCreate, clientId }, updateData: { ...externalUpdate, clientId }, actor, jobId, audits });
      context.projectIds.set(row.recordKey, result.record.id); context.affectedProjectIds.add(result.record.id);
      if (hasValue(row, "amount_paid")) context.importedProjectBalances.set(result.record.id, Number(result.record.amountPaid));
      return result.action;
    }
    case "project_items": {
      const projectId = ref(context.projectIds, row.references.projectExternalKey, "project");
      const catalogItemId = ref(context.catalogItemIds, row.references.catalogSku, "catalog");
      const result = await writeRecord({ delegate: asDelegate(tx.projectItem), row, uniqueField: "externalKey", createData: { ...externalCreate, projectId, catalogItemId }, updateData: { ...externalUpdate, projectId, catalogItemId }, actor, jobId, audits });
      context.projectItemIds.set(row.recordKey, result.record.id); context.affectedProjectIds.add(projectId); return result.action;
    }
    case "supplier_orders": {
      const supplierId = ref(context.supplierIds, row.references.supplierExternalKey, "supplier");
      const projectId = ref(context.projectIds, row.references.projectExternalKey, "project");
      const result = await writeRecord({ delegate: asDelegate(tx.supplierOrder), row, uniqueField: "externalKey", createData: { ...externalCreate, supplierId, projectId }, updateData: { ...externalUpdate, supplierId, projectId }, actor, jobId, audits });
      context.supplierOrderIds.set(row.recordKey, result.record.id);
      if (hasValue(row, "amount_paid")) context.importedSupplierBalances.add(result.record.id);
      return result.action;
    }
    case "order_items": {
      const supplierOrderId = ref(context.supplierOrderIds, row.references.supplierOrderExternalKey, "supplier-order");
      const projectItemId = ref(context.projectItemIds, row.references.projectItemExternalKey, "project-item");
      let existing = await tx.orderItem.findUnique({ where: { externalKey: row.recordKey } });
      if (!existing && row.recordId) existing = await tx.orderItem.findUnique({ where: { id: row.recordId } });
      if (!existing) existing = await tx.orderItem.findUnique({ where: { supplierOrderId_projectItemId: { supplierOrderId, projectItemId } } });
      if (existing?.externalKey && existing.externalKey !== row.recordKey) {
        throw new Error(`Order-item relation is already owned by external key '${existing.externalKey}'`);
      }
      const delegate = asDelegate(tx.orderItem);
      const result = existing
        ? await delegate.update({ where: { id: existing.id }, data: { ...externalUpdate, supplierOrderId, projectItemId } })
        : await delegate.create({ data: { ...externalCreate, supplierOrderId, projectItemId } });
      audits.push({ jobId, module: row.module, recordKey: row.recordKey, action: existing ? "UPDATE" : "INSERT", beforeData: existing ? json(existing) : null, afterData: json(result), actorId: actor.id, actorEmail: actor.email });
      return existing ? "UPDATE" : "INSERT";
    }
    case "tasks": {
      const projectId = row.references.projectExternalKey ? ref(context.projectIds, row.references.projectExternalKey, "project") : null;
      const technicianId = row.references.technicianExternalKey ? ref(context.technicianIds, row.references.technicianExternalKey, "technician") : null;
      const updateData: Record<string, unknown> = { ...externalUpdate };
      if (hasValue(row, "project_external_key")) updateData.projectId = projectId;
      if (hasValue(row, "technician_external_key")) updateData.technicianId = technicianId;
      return (await writeRecord({ delegate: asDelegate(tx.task), row, uniqueField: "externalKey", createData: { ...externalCreate, projectId, technicianId }, updateData, actor, jobId, audits })).action;
    }
    case "payments": {
      const projectId = ref(context.projectIds, row.references.projectExternalKey, "project");
      const before = await tx.payment.findUnique({ where: { externalKey: row.recordKey } })
        ?? (row.recordId ? await tx.payment.findUnique({ where: { id: row.recordId } }) : null);
      const result = await writeRecord({ delegate: asDelegate(tx.payment), row, uniqueField: "externalKey", createData: { ...externalCreate, projectId }, updateData: { ...externalUpdate, projectId }, actor, jobId, audits });
      if (before) context.affectedProjectIds.add(before.projectId);
      context.affectedProjectIds.add(projectId); return result.action;
    }
    case "finance_entries": {
      const before = await tx.financeEntry.findUnique({ where: { externalKey: row.recordKey } })
        ?? (row.recordId ? await tx.financeEntry.findUnique({ where: { id: row.recordId } }) : null);
      let projectId = row.references.projectExternalKey ? ref(context.projectIds, row.references.projectExternalKey, "project") : before?.projectId ?? null;
      const supplierOrderId = row.references.supplierOrderExternalKey ? ref(context.supplierOrderIds, row.references.supplierOrderExternalKey, "supplierOrder") : before?.supplierOrderId ?? null;
      const order = supplierOrderId ? await tx.supplierOrder.findUniqueOrThrow({ where: { id: supplierOrderId } }) : null;
      if (order) {
        if (projectId && projectId !== order.projectId) throw new Error("Finance entry project does not match its supplier order");
        projectId = order.projectId;
      }
      if (before && (before.kind !== data.kind || before.projectId !== projectId || before.supplierOrderId !== supplierOrderId)) throw new Error("Existing finance entries cannot change kind, project or supplier order; void and create a corrected entry");
      if (before?.status === "VOID" && data.status !== "VOID") throw new Error("Voided finance entries cannot be reopened by import");
      const result = await writeRecord({ delegate: asDelegate(tx.financeEntry), row, uniqueField: "externalKey", createData: { ...externalCreate, projectId, supplierOrderId }, updateData: { ...externalUpdate, revision: { increment: 1 } }, actor, jobId, audits });
      if (order && !context.importedSupplierBalances.has(order.id)) {
        const previous = before?.status === "POSTED" ? before.amount : 0;
        const next = result.record.status === "POSTED" ? Number(result.record.amount) : 0;
        await tx.supplierOrder.update({ where: { id: order.id }, data: { amountPaid: applyPaidDelta(order.amountPaid, previous, next) } });
      }
      return result.action;
    }
    case "quote_requests": {
      const result = await writeRecord({ delegate: asDelegate(tx.quoteRequest), row, uniqueField: "externalKey", createData: externalCreate, updateData: externalUpdate, actor, jobId, audits });
      context.quoteIds.set(row.recordKey, result.record.id); return result.action;
    }
    case "quote_items": {
      const quoteId = ref(context.quoteIds, row.references.quoteExternalKey, "quote");
      const catalogItemId = ref(context.catalogItemIds, row.references.catalogSku, "catalog");
      return (await writeRecord({ delegate: asDelegate(tx.quoteItem), row, uniqueField: "externalKey", createData: { ...externalCreate, quoteId, catalogItemId }, updateData: { ...externalUpdate, quoteId, catalogItemId }, actor, jobId, audits })).action;
    }
    case "portfolio_projects":
      return (await writeRecord({ delegate: asDelegate(tx.portfolioProject), row, uniqueField: "externalKey", createData: externalCreate, updateData: externalUpdate, actor, jobId, audits })).action;
  }
}

async function recomputeDerivedData(tx: TransactionClient, context: ApplyContext) {
  for (const projectId of context.affectedProjectIds) {
    const [items, payments] = await Promise.all([
      tx.projectItem.findMany({ where: { projectId }, select: { quantity: true, unitCost: true, unitPrice: true, leadTimeDays: true } }),
      tx.payment.aggregate({ where: { projectId }, _sum: { amount: true } }),
    ]);
    const paid = context.importedProjectBalances.get(projectId)
      ?? roundMoney((context.projectPaymentOffsets.get(projectId) ?? 0) + (payments._sum.amount ?? 0));
    if (paid < 0) throw new Error("Import would create a negative customer balance; reconcile the existing receipt balance first");
    const update: Record<string, unknown> = { amountPaid: paid };
    if (items.length > 0) {
      update.totalCost = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      update.totalPrice = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const maximumLead = Math.max(0, ...items.map((item) => item.leadTimeDays));
      const syncDate = new Date();
      syncDate.setDate(syncDate.getDate() + maximumLead + 2);
      update.syncDate = syncDate;
    }
    await tx.project.update({ where: { id: projectId }, data: update });
  }

  for (const catalogItemId of context.affectedCatalogItemIds) {
    const item = await tx.catalogItem.findUnique({
      where: { id: catalogItemId },
      include: { assets: { select: { altAr: true, altEn: true } } },
    });
    if (!item) continue;
    const completenessScore = calculateCatalogCompleteness({
      ...item, imageCount: item.assets.length,
      reviewedAltCount: item.assets.filter((asset) => asset.altAr?.trim() && asset.altEn?.trim()).length,
    });
    await tx.catalogItem.update({
      where: { id: catalogItemId },
      data: {
        completenessScore,
        contentStatus: item.contentStatus === "VERIFIED"
          ? "VERIFIED"
          : catalogContentStatus({ ...item, completenessScore }),
      },
    });
  }
}

async function persistIssues(jobId: number, issues: DataTransferIssueInput[]) {
  if (issues.length === 0) return;
  await prisma.dataTransferIssue.createMany({
    data: issues.map((issue) => ({
      jobId, module: issue.module, sheet: issue.sheet, rowNumber: issue.rowNumber,
      field: issue.field, severity: issue.severity, code: issue.code,
      message: issue.message, rawData: issue.rawData,
    })),
  });
}

function summaryFromJob(job: {
  id: number; dryRun: boolean; sourceHash: string | null; rowCount: number; insertedCount: number;
  updatedCount: number; skippedCount: number; errorCount: number; summary: string; errors: string;
}, duplicate: boolean): ApplySummary {
  let modules: Partial<Record<DataModuleName, ApplyModuleCount>> = {};
  let issues: DataTransferIssueInput[] = [];
  try { modules = (JSON.parse(job.summary) as { modules?: typeof modules }).modules ?? {}; } catch { /* legacy summary */ }
  try { issues = JSON.parse(job.errors) as DataTransferIssueInput[]; } catch { /* legacy errors */ }
  return {
    jobId: job.id, dryRun: job.dryRun, duplicate, sourceHash: job.sourceHash ?? "",
    rowCount: job.rowCount, insertedCount: job.insertedCount, updatedCount: job.updatedCount,
    skippedCount: job.skippedCount, errorCount: job.errorCount, modules, issues,
  };
}

function inProgressSummary(job: Parameters<typeof summaryFromJob>[0]): ApplySummary {
  const result = summaryFromJob(job, true);
  return {
    ...result,
    errorCount: Math.max(1, result.errorCount),
    issues: [{
      module: "_system", severity: "ERROR", code: "IMPORT_IN_PROGRESS",
      message: "An identical import is already validating or applying; wait for that job to finish.",
    }],
  };
}

function refreshImportedSurfaces(modules: readonly DataModuleName[]) {
  if (modules.includes("site_content") || modules.includes("settings")) {
    revalidateTag(SITE_CONTENT_CACHE_TAG, { expire: 0 });
  }
  if (modules.some((module) => [
    "categories", "category_redirects", "collections", "product_families", "tag_groups", "tags",
    "catalog_items", "product_assets", "catalog_item_collections", "catalog_item_tags", "portfolio_projects",
  ].includes(module))) {
    revalidatePath("/catalog");
    revalidatePath("/collections");
  }
  revalidatePath("/", "layout");
}

export async function runSpreadsheetImport(input: {
  fileName: string;
  buffer: Buffer;
  csvModule?: string | null;
  dryRun: boolean;
  actor: ActorIdentity;
}): Promise<ApplySummary> {
  const sourceHash = createHash("sha256").update(input.buffer).digest("hex");
  const mode = input.dryRun ? "DRY_RUN" : "APPLY";
  const idempotencyKey = createHash("sha256").update(`IMPORT|${mode}|${input.csvModule || "BUNDLE"}|${sourceHash}`).digest("hex");
  let job;
  try {
    job = await prisma.dataTransferJob.create({
      data: {
        schemaVersion: DATA_TRANSFER_SCHEMA_VERSION,
        kind: "IMPORT", scope: input.csvModule ? "MODULE" : "FULL_BUSINESS",
        module: input.csvModule || null, fileName: input.fileName, sourceHash,
        idempotencyKey, dryRun: input.dryRun, status: "VALIDATING",
        actorId: input.actor.id, actorEmail: input.actor.email,
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const concurrent = await prisma.dataTransferJob.findUnique({ where: { idempotencyKey } });
      if (concurrent) {
        return ["PENDING", "VALIDATING", "APPLYING"].includes(concurrent.status)
          ? inProgressSummary(concurrent)
          : summaryFromJob(concurrent, true);
      }
    }
    throw error;
  }

  try {
    const parsed = await parseUploadedDataFile({ fileName: input.fileName, buffer: input.buffer, csvModule: input.csvModule });
    const validated = await validateParsedDataFile(parsed);
    await persistIssues(job.id, validated.issues);
    const errors = validated.issues.filter((issue) => issue.severity === "ERROR");
    if (errors.length > 0) {
      await prisma.dataTransferJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED", rowCount: parsed.rows.length, errorCount: errors.length,
          errors: json(errors.slice(0, 100)), summary: json({ counts: validated.counts }), completedAt: new Date(),
        },
      });
      return { jobId: job.id, dryRun: input.dryRun, duplicate: false, sourceHash, rowCount: parsed.rows.length,
        insertedCount: 0, updatedCount: 0, skippedCount: 0, errorCount: errors.length,
        modules: {}, issues: validated.issues };
    }

    if (input.dryRun) {
      await prisma.dataTransferJob.update({
        where: { id: job.id },
        data: { status: "SUCCESS", rowCount: parsed.rows.length, skippedCount: parsed.rows.length, summary: json({ counts: validated.counts, modules: {} }), completedAt: new Date() },
      });
      return { jobId: job.id, dryRun: true, duplicate: false, sourceHash, rowCount: parsed.rows.length,
        insertedCount: 0, updatedCount: 0, skippedCount: parsed.rows.length, errorCount: 0,
        modules: {}, issues: validated.issues };
    }

    // A persisted, lossless recovery point is mandatory before the first write.
    // If backup storage is unavailable, the import fails without mutating ERP data.
    const preImport = await createBackupArtifact({ scope: "FULL_BUSINESS", actor: input.actor, reason: "PRE_IMPORT" });
    await prisma.dataTransferJob.update({
      where: { id: job.id },
      data: { status: "APPLYING", resultName: preImport.fileName, summary: json({ preImportBackup: preImport.fileName }) },
    });
    const moduleCounts: Partial<Record<DataModuleName, ApplyModuleCount>> = {};
    const audits: PendingAudit[] = [];
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    await prisma.$transaction(async (tx) => {
      const context = await loadApplyContext(tx);
      for (const row of sortedRows(validated.rows)) {
        const count = moduleCounts[row.module] ?? { inserted: 0, updated: 0, skipped: 0 };
        const action = await applyRow(tx, context, row, job.id, input.actor, audits);
        if (action === "INSERT") count.inserted += 1;
        else if (action === "UPDATE") count.updated += 1;
        else count.skipped += 1;
        moduleCounts[row.module] = count;
      }
      await recomputeDerivedData(tx, context);
      if (audits.length > 0) await tx.dataChangeAudit.createMany({ data: audits });
      insertedCount = Object.values(moduleCounts).reduce((sum, count) => sum + (count?.inserted ?? 0), 0);
      updatedCount = Object.values(moduleCounts).reduce((sum, count) => sum + (count?.updated ?? 0), 0);
      skippedCount = Object.values(moduleCounts).reduce((sum, count) => sum + (count?.skipped ?? 0), 0);
      // The SUCCESS marker commits atomically with business rows and audits.
      await tx.dataTransferJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCESS", rowCount: parsed.rows.length, insertedCount, updatedCount, skippedCount,
          errorCount: 0, summary: json({ counts: validated.counts, modules: moduleCounts, preImportBackup: preImport.fileName }), completedAt: new Date(),
        },
      });
    }, { maxWait: 10_000, timeout: 120_000 });

    try { refreshImportedSurfaces(parsed.modules); }
    catch (error) { console.error("Data import committed, but cache revalidation failed.", error); }
    return { jobId: job.id, dryRun: false, duplicate: false, sourceHash, rowCount: parsed.rows.length,
      insertedCount, updatedCount, skippedCount, errorCount: 0, modules: moduleCounts, issues: validated.issues };
  } catch (error) {
    const issues = error instanceof DataFileParseError ? error.issues : [{
      module: "_system", severity: "ERROR" as const, code: "IMPORT_FAILED",
      message: error instanceof Error ? error.message : "Import failed",
    }];
    await persistIssues(job.id, issues);
    await prisma.dataTransferJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorCount: issues.length, errors: json(issues.slice(0, 100)), completedAt: new Date() },
    });
    return { jobId: job.id, dryRun: input.dryRun, duplicate: false, sourceHash, rowCount: 0,
      insertedCount: 0, updatedCount: 0, skippedCount: 0, errorCount: issues.length,
      modules: {}, issues };
  }
}
