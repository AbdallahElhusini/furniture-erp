import "server-only";

import { prisma } from "@/lib/db";
import type {
  DataModuleName,
  DataTransferIssueInput,
  ParsedDataFile,
  ValidatedDataRow,
  ValidatedDataSet,
} from "./contracts";
import { DATA_MODULE_REGISTRY } from "./registry";
import { allocateStableKeys } from "./stable-keys";

interface ReferenceIndex {
  clients: Set<string>;
  suppliers: Set<string>;
  technicians: Set<string>;
  projects: Set<string>;
  projectItems: Set<string>;
  supplierOrders: Set<string>;
  quotes: Set<string>;
  assets: Set<string>;
  categorySlugs: Set<string>;
  collectionSlugs: Set<string>;
  familyKeys: Set<string>;
  tagGroupKeys: Set<string>;
  tagSlugs: Set<string>;
  catalogSkus: Set<string>;
}

type ExistingExternal = { id: number; externalKey: string | null };

const EXTERNAL_KEY_MODULES: Partial<Record<DataModuleName, keyof ExistingExternalMaps>> = {
  clients: "clients",
  suppliers: "suppliers",
  technicians: "technicians",
  projects: "projects",
  project_items: "projectItems",
  supplier_orders: "supplierOrders",
  order_items: "orderItems",
  product_assets: "productAssets",
  tasks: "tasks",
  payments: "payments",
  finance_entries: "financeEntries",
  quote_requests: "quoteRequests",
  quote_items: "quoteItems",
  portfolio_projects: "portfolioProjects",
  settings: "settings",
  site_content: "siteContent",
  categories: "categories",
  category_redirects: "categoryRedirects",
  collections: "collections",
  product_families: "productFamilies",
  tag_groups: "tagGroups",
  tags: "tags",
  catalog_items: "catalogItems",
};

interface ExistingExternalMaps {
  clients: ExistingExternal[];
  suppliers: ExistingExternal[];
  technicians: ExistingExternal[];
  projects: ExistingExternal[];
  projectItems: ExistingExternal[];
  supplierOrders: ExistingExternal[];
  orderItems: ExistingExternal[];
  productAssets: ExistingExternal[];
  tasks: ExistingExternal[];
  payments: ExistingExternal[];
  financeEntries: ExistingExternal[];
  quoteRequests: ExistingExternal[];
  quoteItems: ExistingExternal[];
  portfolioProjects: ExistingExternal[];
  settings: ExistingExternal[];
  siteContent: ExistingExternal[];
  categories: ExistingExternal[];
  categoryRedirects: ExistingExternal[];
  collections: ExistingExternal[];
  productFamilies: ExistingExternal[];
  tagGroups: ExistingExternal[];
  tags: ExistingExternal[];
  catalogItems: ExistingExternal[];
}

function issueFor(
  row: ValidatedDataRow,
  field: string | undefined,
  code: string,
  message: string,
): DataTransferIssueInput {
  return {
    module: row.module,
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    field,
    severity: "ERROR",
    code,
    message,
    rawData: JSON.stringify(row.raw, (_key, value) =>
      value instanceof Date ? value.toISOString() : value,
    ),
  };
}

function addImportedReferences(index: ReferenceIndex, rows: ValidatedDataRow[]) {
  const targetByModule: Partial<Record<DataModuleName, Set<string>>> = {
    clients: index.clients,
    suppliers: index.suppliers,
    technicians: index.technicians,
    projects: index.projects,
    project_items: index.projectItems,
    supplier_orders: index.supplierOrders,
    quote_requests: index.quotes,
    product_assets: index.assets,
    categories: index.categorySlugs,
    collections: index.collectionSlugs,
    product_families: index.familyKeys,
    tag_groups: index.tagGroupKeys,
    tags: index.tagSlugs,
    catalog_items: index.catalogSkus,
  };
  for (const row of rows) targetByModule[row.module]?.add(row.recordKey);
}

function requireReference(
  issues: DataTransferIssueInput[],
  row: ValidatedDataRow,
  referenceName: string,
  target: Set<string>,
  field: string,
  optional = false,
) {
  const value = row.references[referenceName];
  if (!value && optional) return;
  if (!value || !target.has(value)) {
    issues.push(issueFor(row, field, "UNRESOLVED_REFERENCE", `No matching record exists for '${value || ""}'`));
  }
}

async function loadReferenceState(): Promise<{
  index: ReferenceIndex;
  external: ExistingExternalMaps;
  categoryParents: Map<string, string | null>;
}> {
  const [
    clients,
    suppliers,
    technicians,
    projects,
    projectItems,
    supplierOrders,
    orderItems,
    productAssets,
    tasks,
    payments,
    financeEntries,
    quoteRequests,
    quoteItems,
    portfolioProjects,
    settingsById,
    siteContentById,
    categoriesById,
    categoryRedirectsById,
    collectionsById,
    productFamiliesById,
    tagGroupsById,
    tagsById,
    catalogItemsById,
    categories,
    collections,
    families,
    tagGroups,
    tags,
    catalogItems,
  ] = await Promise.all([
    prisma.client.findMany({ select: { id: true, externalKey: true } }),
    prisma.supplier.findMany({ select: { id: true, externalKey: true } }),
    prisma.technician.findMany({ select: { id: true, externalKey: true } }),
    prisma.project.findMany({ select: { id: true, externalKey: true } }),
    prisma.projectItem.findMany({ select: { id: true, externalKey: true } }),
    prisma.supplierOrder.findMany({ select: { id: true, externalKey: true } }),
    prisma.orderItem.findMany({ select: { id: true, externalKey: true } }),
    prisma.productAsset.findMany({ select: { id: true, externalKey: true } }),
    prisma.task.findMany({ select: { id: true, externalKey: true } }),
    prisma.payment.findMany({ select: { id: true, externalKey: true } }),
    prisma.financeEntry.findMany({ select: { id: true, externalKey: true } }),
    prisma.quoteRequest.findMany({ select: { id: true, externalKey: true } }),
    prisma.quoteItem.findMany({ select: { id: true, externalKey: true } }),
    prisma.portfolioProject.findMany({ select: { id: true, externalKey: true } }),
    prisma.setting.findMany({ select: { id: true, key: true } }),
    prisma.siteContent.findMany({ select: { id: true, key: true } }),
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.categoryRedirect.findMany({ select: { id: true, fromSlug: true } }),
    prisma.collection.findMany({ select: { id: true, slug: true } }),
    prisma.productFamily.findMany({ select: { id: true, sourceKey: true } }),
    prisma.tagGroup.findMany({ select: { id: true, key: true } }),
    prisma.tag.findMany({ select: { id: true, slug: true } }),
    prisma.catalogItem.findMany({ select: { id: true, sku: true } }),
    prisma.category.findMany({ select: { slug: true, parent: { select: { slug: true } } } }),
    prisma.collection.findMany({ select: { slug: true } }),
    prisma.productFamily.findMany({ select: { sourceKey: true } }),
    prisma.tagGroup.findMany({ select: { key: true } }),
    prisma.tag.findMany({ select: { slug: true } }),
    prisma.catalogItem.findMany({ select: { sku: true } }),
  ]);

  const stable = (prefix: string, values: ExistingExternal[]) => new Set(allocateStableKeys(prefix, values).values());
  return {
    index: {
      clients: stable("CLIENT", clients),
      suppliers: stable("SUPPLIER", suppliers),
      technicians: stable("TECH", technicians),
      projects: stable("PROJECT", projects),
      projectItems: stable("PROJECT-ITEM", projectItems),
      supplierOrders: stable("SUPPLIER-ORDER", supplierOrders),
      quotes: stable("QUOTE", quoteRequests),
      assets: stable("ASSET", productAssets),
      categorySlugs: new Set(categories.map((value) => value.slug)),
      collectionSlugs: new Set(collections.map((value) => value.slug)),
      familyKeys: new Set(families.map((value) => value.sourceKey)),
      tagGroupKeys: new Set(tagGroups.map((value) => value.key)),
      tagSlugs: new Set(tags.map((value) => value.slug)),
      catalogSkus: new Set(catalogItems.map((value) => value.sku)),
    },
    external: {
      clients,
      suppliers,
      technicians,
      projects,
      projectItems,
      supplierOrders,
      orderItems,
      productAssets,
      tasks,
      payments,
      financeEntries,
      quoteRequests,
      quoteItems,
      portfolioProjects,
      settings: settingsById.map((row) => ({ id: row.id, externalKey: row.key })),
      siteContent: siteContentById.map((row) => ({ id: row.id, externalKey: row.key })),
      categories: categoriesById.map((row) => ({ id: row.id, externalKey: row.slug })),
      categoryRedirects: categoryRedirectsById.map((row) => ({ id: row.id, externalKey: row.fromSlug })),
      collections: collectionsById.map((row) => ({ id: row.id, externalKey: row.slug })),
      productFamilies: productFamiliesById.map((row) => ({ id: row.id, externalKey: row.sourceKey })),
      tagGroups: tagGroupsById.map((row) => ({ id: row.id, externalKey: row.key })),
      tags: tagsById.map((row) => ({ id: row.id, externalKey: row.slug })),
      catalogItems: catalogItemsById.map((row) => ({ id: row.id, externalKey: row.sku })),
    },
    categoryParents: new Map(categories.map((value) => [value.slug, value.parent?.slug ?? null])),
  };
}

function validateBootstrapIds(
  rows: ValidatedDataRow[],
  external: ExistingExternalMaps,
  issues: DataTransferIssueInput[],
) {
  const seenIds = new Map<string, ValidatedDataRow>();
  for (const row of rows) {
    const mapName = EXTERNAL_KEY_MODULES[row.module];
    if (!mapName || row.recordId === undefined) continue;
    const existingRows = external[mapName];
    const existing = existingRows.find((candidate) => candidate.id === row.recordId);
    if (!existing) {
      issues.push(issueFor(row, "record_id", "RECORD_ID_NOT_FOUND", `Record id ${row.recordId} does not exist in ${row.module}`));
      continue;
    }
    if (existing.externalKey && existing.externalKey !== row.recordKey) {
      issues.push(issueFor(row, "record_id", "RECORD_ID_KEY_CONFLICT", `Record id ${row.recordId} is already attached to '${existing.externalKey}'`));
    }
    const keyOwner = existingRows.find((candidate) => candidate.externalKey === row.recordKey);
    if (keyOwner && keyOwner.id !== row.recordId) {
      issues.push(issueFor(row, "external_key", "KEY_ALREADY_ATTACHED", `'${row.recordKey}' belongs to record id ${keyOwner.id}`));
    }
    const seenKey = `${row.module}:${row.recordId}`;
    const previous = seenIds.get(seenKey);
    if (previous && previous.recordKey !== row.recordKey) {
      issues.push(issueFor(row, "record_id", "DUPLICATE_RECORD_ID", `Record id ${row.recordId} is assigned more than one import key`));
    } else {
      seenIds.set(seenKey, row);
    }
  }
}

function validateCategoryCycles(
  rows: ValidatedDataRow[],
  categoryParents: Map<string, string | null>,
  issues: DataTransferIssueInput[],
) {
  const categoryRows = rows.filter((row) => row.module === "categories");
  for (const row of categoryRows) categoryParents.set(row.recordKey, row.references.parentSlug ?? null);

  for (const row of categoryRows) {
    const seen = new Set<string>();
    let cursor: string | null = row.recordKey;
    while (cursor) {
      if (seen.has(cursor)) {
        issues.push(issueFor(row, "parent_slug", "CATEGORY_CYCLE", `Category hierarchy contains a cycle through '${cursor}'`));
        break;
      }
      seen.add(cursor);
      cursor = categoryParents.get(cursor) ?? null;
    }
  }
}

function validateReferences(index: ReferenceIndex, rows: ValidatedDataRow[], issues: DataTransferIssueInput[]) {
  for (const row of rows) {
    switch (row.module) {
      case "category_redirects":
        requireReference(issues, row, "categorySlug", index.categorySlugs, "category_slug");
        break;
      case "categories":
        requireReference(issues, row, "parentSlug", index.categorySlugs, "parent_slug", true);
        break;
      case "product_families":
        requireReference(issues, row, "categorySlug", index.categorySlugs, "category_slug");
        break;
      case "tags":
        requireReference(issues, row, "groupKey", index.tagGroupKeys, "group_key");
        break;
      case "catalog_items":
        requireReference(issues, row, "categorySlug", index.categorySlugs, "category_slug");
        requireReference(issues, row, "familySourceKey", index.familyKeys, "family_source_key", true);
        requireReference(issues, row, "supplierExternalKey", index.suppliers, "supplier_external_key", true);
        break;
      case "product_assets":
        requireReference(issues, row, "catalogSku", index.catalogSkus, "catalog_sku", true);
        requireReference(issues, row, "familySourceKey", index.familyKeys, "family_source_key", true);
        requireReference(issues, row, "duplicateExternalKey", index.assets, "duplicate_external_key", true);
        break;
      case "catalog_item_collections":
        requireReference(issues, row, "catalogSku", index.catalogSkus, "catalog_sku");
        requireReference(issues, row, "collectionSlug", index.collectionSlugs, "collection_slug");
        break;
      case "catalog_item_tags":
        requireReference(issues, row, "catalogSku", index.catalogSkus, "catalog_sku");
        requireReference(issues, row, "tagSlug", index.tagSlugs, "tag_slug");
        break;
      case "projects":
        requireReference(issues, row, "clientExternalKey", index.clients, "client_external_key");
        break;
      case "project_items":
        requireReference(issues, row, "projectExternalKey", index.projects, "project_external_key");
        requireReference(issues, row, "catalogSku", index.catalogSkus, "catalog_sku");
        break;
      case "supplier_orders":
        requireReference(issues, row, "supplierExternalKey", index.suppliers, "supplier_external_key");
        requireReference(issues, row, "projectExternalKey", index.projects, "project_external_key");
        break;
      case "order_items":
        requireReference(issues, row, "supplierOrderExternalKey", index.supplierOrders, "supplier_order_external_key");
        requireReference(issues, row, "projectItemExternalKey", index.projectItems, "project_item_external_key");
        break;
      case "tasks":
        requireReference(issues, row, "projectExternalKey", index.projects, "project_external_key", true);
        requireReference(issues, row, "technicianExternalKey", index.technicians, "technician_external_key", true);
        break;
      case "payments":
        requireReference(issues, row, "projectExternalKey", index.projects, "project_external_key");
        break;
      case "finance_entries":
        requireReference(issues, row, "projectExternalKey", index.projects, "project_external_key", true);
        requireReference(issues, row, "supplierOrderExternalKey", index.supplierOrders, "supplier_order_external_key", row.data.kind !== "SUPPLIER_PAYMENT");
        break;
      case "quote_items":
        requireReference(issues, row, "quoteExternalKey", index.quotes, "quote_external_key");
        requireReference(issues, row, "catalogSku", index.catalogSkus, "catalog_sku");
        break;
      default:
        break;
    }
  }
}

export async function validateParsedDataFile(parsed: ParsedDataFile): Promise<ValidatedDataSet> {
  const issues: DataTransferIssueInput[] = [];
  const rows: ValidatedDataRow[] = [];
  const counts: Partial<Record<DataModuleName, number>> = {};
  const seenKeys = new Set<string>();

  for (const rawRow of parsed.rows) {
    const normalized = DATA_MODULE_REGISTRY[rawRow.module].normalize(rawRow);
    issues.push(...normalized.issues);
    if (!normalized.value) continue;
    const duplicateKey = `${normalized.value.module}:${normalized.value.recordKey}`;
    if (seenKeys.has(duplicateKey)) {
      issues.push(issueFor(normalized.value, DATA_MODULE_REGISTRY[rawRow.module].keyColumn, "DUPLICATE_KEY", `The key '${normalized.value.recordKey}' appears more than once`));
      continue;
    }
    seenKeys.add(duplicateKey);
    rows.push(normalized.value);
    counts[rawRow.module] = (counts[rawRow.module] ?? 0) + 1;
  }

  const state = await loadReferenceState();
  addImportedReferences(state.index, rows);
  validateBootstrapIds(rows, state.external, issues);
  validateReferences(state.index, rows, issues);
  validateCategoryCycles(rows, state.categoryParents, issues);

  return { rows, issues, counts };
}
