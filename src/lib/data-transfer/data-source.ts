import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { DataModuleName } from "./contracts";
import {
  canonicalPortableJsonObject,
  stripPortableRecordId,
} from "./backup-portability";
import { allocateStableKeys } from "./stable-keys";
import { DATA_MODULE_REGISTRY } from "./registry";
import { SITE_CONTENT_DEFINITIONS } from "@/lib/site-content-registry";

export type ExportDataRow = Record<string, string | number | boolean | null>;
export type LosslessDataRow = Record<string, unknown>;

export interface TrustedDataSnapshot {
  portable: Partial<Record<DataModuleName, ExportDataRow[]>>;
  records: Partial<Record<DataModuleName, LosslessDataRow[]>>;
  bindings: Partial<Record<DataModuleName, Array<{ id: number; key: string }>>>;
}

type DataClient = Prisma.TransactionClient | typeof defaultPrisma;

interface ExportContext {
  client: DataClient;
  keys: Map<string, Map<number, string>>;
}

const exportContextStorage = new AsyncLocalStorage<ExportContext>();

const prisma = new Proxy(defaultPrisma, {
  get(_target, property) {
    const client = exportContextStorage.getStore()?.client ?? defaultPrisma;
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as typeof defaultPrisma;

async function buildExportContext(client: DataClient): Promise<ExportContext> {
  const [clients, suppliers, technicians, projects, projectItems, supplierOrders, orderItems,
    productAssets, tasks, payments, quotes, quoteItems, portfolio, financeEntries] = await Promise.all([
    client.client.findMany({ select: { id: true, externalKey: true } }),
    client.supplier.findMany({ select: { id: true, externalKey: true } }),
    client.technician.findMany({ select: { id: true, externalKey: true } }),
    client.project.findMany({ select: { id: true, externalKey: true } }),
    client.projectItem.findMany({ select: { id: true, externalKey: true } }),
    client.supplierOrder.findMany({ select: { id: true, externalKey: true } }),
    client.orderItem.findMany({ select: { id: true, externalKey: true } }),
    client.productAsset.findMany({ select: { id: true, externalKey: true } }),
    client.task.findMany({ select: { id: true, externalKey: true } }),
    client.payment.findMany({ select: { id: true, externalKey: true } }),
    client.quoteRequest.findMany({ select: { id: true, externalKey: true } }),
    client.quoteItem.findMany({ select: { id: true, externalKey: true } }),
    client.portfolioProject.findMany({ select: { id: true, externalKey: true } }),
    client.financeEntry.findMany({ select: { id: true, externalKey: true } }),
  ]);
  return {
    client,
    keys: new Map([
      ["CLIENT", allocateStableKeys("CLIENT", clients)],
      ["SUPPLIER", allocateStableKeys("SUPPLIER", suppliers)],
      ["TECH", allocateStableKeys("TECH", technicians)],
      ["PROJECT", allocateStableKeys("PROJECT", projects)],
      ["PROJECT-ITEM", allocateStableKeys("PROJECT-ITEM", projectItems)],
      ["SUPPLIER-ORDER", allocateStableKeys("SUPPLIER-ORDER", supplierOrders)],
      ["ORDER-ITEM", allocateStableKeys("ORDER-ITEM", orderItems)],
      ["ASSET", allocateStableKeys("ASSET", productAssets)],
      ["TASK", allocateStableKeys("TASK", tasks)],
      ["PAYMENT", allocateStableKeys("PAYMENT", payments)],
      ["FINANCE", allocateStableKeys("FINANCE", financeEntries)],
      ["QUOTE", allocateStableKeys("QUOTE", quotes)],
      ["QUOTE-ITEM", allocateStableKeys("QUOTE-ITEM", quoteItems)],
      ["PORTFOLIO", allocateStableKeys("PORTFOLIO", portfolio)],
    ]),
  };
}

function keyOf(prefix: string, id: number, current: string | null | undefined): string {
  return exportContextStorage.getStore()?.keys.get(prefix)?.get(id) || current || `${prefix}-${id}`;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function base(recordId: number): ExportDataRow {
  return { action: "UPSERT", record_id: recordId };
}

export async function exportModuleRows(module: DataModuleName): Promise<ExportDataRow[]> {
  switch (module) {
    case "clients": {
      const rows = await prisma.client.findMany({ orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("CLIENT", row.id, row.externalKey), name: row.name,
        company: row.company, phone: row.phone, email: row.email, address: row.address, notes: row.notes,
        stage: row.stage, brief: row.brief, source: row.source, next_follow_up_at: iso(row.nextFollowUpAt),
      }));
    }
    case "suppliers": {
      const rows = await prisma.supplier.findMany({ orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("SUPPLIER", row.id, row.externalKey), name: row.name,
        contact_person: row.contactPerson, phone: row.phone, email: row.email, address: row.address,
        specialization: row.specialization, quality_rating: row.qualityRating,
        delivery_rating: row.deliveryRating, notes: row.notes, is_active: row.isActive,
      }));
    }
    case "technicians": {
      const rows = await prisma.technician.findMany({ orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("TECH", row.id, row.externalKey), name: row.name,
        phone: row.phone, specialization: row.specialization, is_available: row.isAvailable,
        daily_rate: row.dailyRate, notes: row.notes,
      }));
    }
    case "settings": {
      const allowed = new Set([
        "company_name_ar", "company_name_en", "company_phone", "company_email",
        "company_address", "currency", "tax_rate",
      ]);
      const rows = await prisma.setting.findMany({ orderBy: { key: "asc" } });
      return rows.filter((row) => allowed.has(row.key)).map((row) => ({
        ...base(row.id), key: row.key, value: row.value,
      }));
    }
    case "site_content": {
      const rows = await prisma.siteContent.findMany({
        where: { key: { in: SITE_CONTENT_DEFINITIONS.map((definition) => definition.key) } },
        orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => ({
        ...base(row.id), key: row.key, group: row.group, type: row.type, label: row.label,
        value_ar: row.valueAr, value_en: row.valueEn, media_url: row.mediaUrl,
        alt_ar: row.altAr, alt_en: row.altEn, link_url: row.linkUrl, metadata: row.metadata,
        is_active: row.isActive, sort_order: row.sortOrder,
      }));
    }
    case "categories": {
      const rows = await prisma.category.findMany({ include: { parent: { select: { slug: true } } }, orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), slug: row.slug, parent_slug: row.parent?.slug ?? null,
        name_ar: row.nameAr, name_en: row.nameEn, image: row.image,
        sort_order: row.sortOrder, is_active: row.isActive,
      }));
    }
    case "category_redirects": {
      const rows = await prisma.categoryRedirect.findMany({ include: { category: { select: { slug: true } } }, orderBy: { id: "asc" } });
      return rows.map((row) => ({ ...base(row.id), from_slug: row.fromSlug, category_slug: row.category.slug }));
    }
    case "collections": {
      const rows = await prisma.collection.findMany({ orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), slug: row.slug, type: row.type, name_ar: row.nameAr, name_en: row.nameEn,
        description_ar: row.descriptionAr, description_en: row.descriptionEn, image: row.image,
        is_draft: row.isDraft, is_active: row.isActive, sort_order: row.sortOrder,
      }));
    }
    case "product_families": {
      const rows = await prisma.productFamily.findMany({ include: { category: { select: { slug: true } } }, orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), source_key: row.sourceKey, category_slug: row.category.slug, slug: row.slug,
        name_ar: row.nameAr, name_en: row.nameEn, review_status: row.reviewStatus,
      }));
    }
    case "tag_groups": {
      const rows = await prisma.tagGroup.findMany({ orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), key: row.key, name_ar: row.nameAr, name_en: row.nameEn, sort_order: row.sortOrder,
      }));
    }
    case "tags": {
      const rows = await prisma.tag.findMany({ include: { group: { select: { key: true } } }, orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), slug: row.slug, group_key: row.group.key,
        name_ar: row.nameAr, name_en: row.nameEn, sort_order: row.sortOrder,
      }));
    }
    case "catalog_items": {
      const rows = await prisma.catalogItem.findMany({
        include: { family: { select: { sourceKey: true } }, supplier: { select: { id: true, externalKey: true } } },
        orderBy: { id: "asc" },
      });
      const categoryIds = [...new Set(rows.map((row) => row.categoryId))];
      const categories = await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, slug: true } });
      const categoryById = new Map(categories.map((category) => [category.id, category.slug]));
      return rows.map((row) => ({
        ...base(row.id), sku: row.sku, category_slug: categoryById.get(row.categoryId) ?? "",
        family_source_key: row.family?.sourceKey ?? null,
        supplier_external_key: row.supplier ? keyOf("SUPPLIER", row.supplier.id, row.supplier.externalKey) : null,
        name_ar: row.nameAr, name_en: row.nameEn, description_ar: row.descriptionAr,
        description_en: row.descriptionEn, cost_price: row.costPrice, selling_price: row.sellingPrice,
        lead_time_days: row.leadTimeDays, dimensions: row.dimensions, material: row.material,
        color: row.color, images: row.images,
        specifications: canonicalPortableJsonObject(row.specifications),
        is_active: row.isActive, is_featured: row.isFeatured, display_order: row.displayOrder, content_status: row.contentStatus,
      }));
    }
    case "product_assets": {
      const rows = await prisma.productAsset.findMany({
        include: {
          catalogItem: { select: { sku: true } }, family: { select: { sourceKey: true } },
          duplicateOf: { select: { id: true, externalKey: true } },
        },
        orderBy: { id: "asc" },
      });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("ASSET", row.id, row.externalKey),
        catalog_sku: row.catalogItem?.sku ?? null, family_source_key: row.family?.sourceKey ?? null,
        duplicate_external_key: row.duplicateOf ? keyOf("ASSET", row.duplicateOf.id, row.duplicateOf.externalKey) : null,
        url: row.url, mime_type: row.mimeType, width: row.width, height: row.height, bytes: row.bytes,
        checksum: row.checksum, role: row.role, sort_order: row.sortOrder,
        alt_ar: row.altAr, alt_en: row.altEn, review_status: row.reviewStatus,
      }));
    }
    case "catalog_item_collections": {
      const items = await prisma.catalogItem.findMany({
        select: { sku: true, collections: { select: { slug: true } } }, orderBy: { id: "asc" },
      });
      return items.flatMap((item) => item.collections.map((collection) => ({
        action: "UPSERT", record_id: null, link_key: `${item.sku}:${collection.slug}`,
        catalog_sku: item.sku, collection_slug: collection.slug,
      })));
    }
    case "catalog_item_tags": {
      const items = await prisma.catalogItem.findMany({
        select: { sku: true, tags: { select: { slug: true } } }, orderBy: { id: "asc" },
      });
      return items.flatMap((item) => item.tags.map((tag) => ({
        action: "UPSERT", record_id: null, link_key: `${item.sku}:${tag.slug}`,
        catalog_sku: item.sku, tag_slug: tag.slug,
      })));
    }
    case "projects": {
      const rows = await prisma.project.findMany({ include: { client: { select: { id: true, externalKey: true } } }, orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("PROJECT", row.id, row.externalKey),
        client_external_key: keyOf("CLIENT", row.client.id, row.client.externalKey), title: row.title,
        type: row.type, status: row.status, inspection_date: iso(row.inspectionDate),
        design_deadline: iso(row.designDeadline), approval_date: iso(row.approvalDate),
        estimated_delivery: iso(row.estimatedDelivery), sync_date: iso(row.syncDate),
        total_cost: row.totalCost, total_price: row.totalPrice, amount_paid: row.amountPaid,
        shipping_cost: row.shippingCost, installation_cost: row.installationCost,
        notes: row.notes, priority: row.priority,
      }));
    }
    case "project_items": {
      const rows = await prisma.projectItem.findMany({
        include: { project: { select: { id: true, externalKey: true } }, catalogItem: { select: { sku: true } } },
        orderBy: { id: "asc" },
      });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("PROJECT-ITEM", row.id, row.externalKey),
        project_external_key: keyOf("PROJECT", row.project.id, row.project.externalKey),
        catalog_sku: row.catalogItem.sku, quantity: row.quantity, unit_cost: row.unitCost,
        unit_price: row.unitPrice, status: row.status, notes: row.notes, lead_time_days: row.leadTimeDays,
      }));
    }
    case "supplier_orders": {
      const rows = await prisma.supplierOrder.findMany({
        include: {
          supplier: { select: { id: true, externalKey: true } },
          project: { select: { id: true, externalKey: true } },
        },
        orderBy: { id: "asc" },
      });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("SUPPLIER-ORDER", row.id, row.externalKey),
        supplier_external_key: keyOf("SUPPLIER", row.supplier.id, row.supplier.externalKey),
        project_external_key: keyOf("PROJECT", row.project.id, row.project.externalKey),
        status: row.status, order_date: iso(row.orderDate), expected_date: iso(row.expectedDate),
        actual_delivery_date: iso(row.actualDeliveryDate), total_amount: row.totalAmount,
        amount_paid: row.amountPaid, notes: row.notes,
      }));
    }
    case "order_items": {
      const rows = await prisma.orderItem.findMany({
        include: {
          supplierOrder: { select: { id: true, externalKey: true } },
          projectItem: { select: { id: true, externalKey: true } },
        },
        orderBy: { id: "asc" },
      });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("ORDER-ITEM", row.id, row.externalKey),
        supplier_order_external_key: keyOf("SUPPLIER-ORDER", row.supplierOrder.id, row.supplierOrder.externalKey),
        project_item_external_key: keyOf("PROJECT-ITEM", row.projectItem.id, row.projectItem.externalKey),
        quantity: row.quantity,
      }));
    }
    case "tasks": {
      const rows = await prisma.task.findMany({
        include: {
          project: { select: { id: true, externalKey: true } },
          technician: { select: { id: true, externalKey: true } },
        },
        orderBy: { id: "asc" },
      });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("TASK", row.id, row.externalKey),
        project_external_key: row.project ? keyOf("PROJECT", row.project.id, row.project.externalKey) : null,
        technician_external_key: row.technician ? keyOf("TECH", row.technician.id, row.technician.externalKey) : null,
        type: row.type, title: row.title, description: row.description, due_date: iso(row.dueDate),
        status: row.status, priority: row.priority,
      }));
    }
    case "payments": {
      const rows = await prisma.payment.findMany({ include: { project: { select: { id: true, externalKey: true } } }, orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("PAYMENT", row.id, row.externalKey),
        project_external_key: keyOf("PROJECT", row.project.id, row.project.externalKey),
        amount: row.amount, method: row.method, notes: row.notes, date: iso(row.date),
      }));
    }
    case "finance_entries": {
      const rows = await prisma.financeEntry.findMany({ include: { project: { select: { id: true, externalKey: true } }, supplierOrder: { select: { id: true, externalKey: true } } }, orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("FINANCE", row.id, row.externalKey), kind: row.kind, amount: row.amount, date: iso(row.date),
        method: row.method, description: row.description, category: row.category, notes: row.notes, status: row.status, void_reason: row.voidReason,
        project_external_key: row.project ? keyOf("PROJECT", row.project.id, row.project.externalKey) : null,
        supplier_order_external_key: row.supplierOrder ? keyOf("SUPPLIER-ORDER", row.supplierOrder.id, row.supplierOrder.externalKey) : null,
      }));
    }
    case "quote_requests": {
      const rows = await prisma.quoteRequest.findMany({ orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("QUOTE", row.id, row.externalKey),
        client_name: row.clientName, client_email: row.clientEmail, client_phone: row.clientPhone,
        company: row.company, message: row.message, status: row.status, total_estimate: row.totalEstimate,
      }));
    }
    case "quote_items": {
      const rows = await prisma.quoteItem.findMany({
        include: { quote: { select: { id: true, externalKey: true } }, catalogItem: { select: { sku: true } } },
        orderBy: { id: "asc" },
      });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("QUOTE-ITEM", row.id, row.externalKey),
        quote_external_key: keyOf("QUOTE", row.quote.id, row.quote.externalKey),
        catalog_sku: row.catalogItem.sku, quantity: row.quantity,
      }));
    }
    case "portfolio_projects": {
      const rows = await prisma.portfolioProject.findMany({ orderBy: { id: "asc" } });
      return rows.map((row) => ({
        ...base(row.id), external_key: keyOf("PORTFOLIO", row.id, row.externalKey),
        title_ar: row.titleAr, title_en: row.titleEn, description_ar: row.descriptionAr,
        description_en: row.descriptionEn, client_name: row.clientName, location: row.location,
        images: row.images, is_featured: row.isFeatured, sort_order: row.sortOrder,
      }));
    }
  }
}

export async function exportModulesSnapshot(
  modules: readonly DataModuleName[],
): Promise<Partial<Record<DataModuleName, ExportDataRow[]>>> {
  return defaultPrisma.$transaction(async (transaction) => {
    const context = await buildExportContext(transaction);
    return exportContextStorage.run(context, async () => {
      const result: Partial<Record<DataModuleName, ExportDataRow[]>> = {};
      for (const dataModule of modules) result[dataModule] = await exportModuleRows(dataModule);
      return result;
    });
  }, { maxWait: 10_000, timeout: 120_000 });
}

const SAFE_SETTING_KEYS = new Set([
  "company_name_ar", "company_name_en", "company_phone", "company_email",
  "company_address", "currency", "tax_rate",
]);

async function rawModuleRows(client: Prisma.TransactionClient, dataModule: DataModuleName): Promise<LosslessDataRow[]> {
  switch (dataModule) {
    case "clients": return client.client.findMany({ orderBy: { id: "asc" } });
    case "suppliers": return client.supplier.findMany({ orderBy: { id: "asc" } });
    case "technicians": return client.technician.findMany({ orderBy: { id: "asc" } });
    case "settings": {
      const rows = await client.setting.findMany({ orderBy: { id: "asc" } });
      return rows.filter((row) => SAFE_SETTING_KEYS.has(row.key));
    }
    case "site_content": return client.siteContent.findMany({
      where: { key: { in: SITE_CONTENT_DEFINITIONS.map((definition) => definition.key) } },
      orderBy: { id: "asc" },
    });
    case "categories": return client.category.findMany({ orderBy: { id: "asc" } });
    case "category_redirects": return client.categoryRedirect.findMany({ orderBy: { id: "asc" } });
    case "collections": return client.collection.findMany({ orderBy: { id: "asc" } });
    case "product_families": return client.productFamily.findMany({ orderBy: { id: "asc" } });
    case "tag_groups": return client.tagGroup.findMany({ orderBy: { id: "asc" } });
    case "tags": return client.tag.findMany({ orderBy: { id: "asc" } });
    case "catalog_items": return client.catalogItem.findMany({ orderBy: { id: "asc" } });
    case "product_assets": return client.productAsset.findMany({ orderBy: { id: "asc" } });
    case "catalog_item_collections": {
      const items = await client.catalogItem.findMany({
        select: { id: true, collections: { select: { id: true }, orderBy: { id: "asc" } } },
        orderBy: { id: "asc" },
      });
      return items.map((item) => ({
        catalogItemId: item.id, collectionIds: item.collections.map((collection) => collection.id),
      }));
    }
    case "catalog_item_tags": {
      const items = await client.catalogItem.findMany({
        select: { id: true, tags: { select: { id: true }, orderBy: { id: "asc" } } },
        orderBy: { id: "asc" },
      });
      return items.map((item) => ({
        catalogItemId: item.id, tagIds: item.tags.map((tag) => tag.id),
      }));
    }
    case "projects": return client.project.findMany({ orderBy: { id: "asc" } });
    case "project_items": return client.projectItem.findMany({ orderBy: { id: "asc" } });
    case "supplier_orders": return client.supplierOrder.findMany({ orderBy: { id: "asc" } });
    case "order_items": return client.orderItem.findMany({ orderBy: { id: "asc" } });
    case "tasks": return client.task.findMany({ orderBy: { id: "asc" } });
    case "payments": return client.payment.findMany({ orderBy: { id: "asc" } });
    case "finance_entries": return client.financeEntry.findMany({ orderBy: { id: "asc" } });
    case "quote_requests": return client.quoteRequest.findMany({ orderBy: { id: "asc" } });
    case "quote_items": return client.quoteItem.findMany({ orderBy: { id: "asc" } });
    case "portfolio_projects": return client.portfolioProject.findMany({ orderBy: { id: "asc" } });
  }
}

/**
 * Creates the portable rows and the exact non-secret business records inside a
 * single SQLite read transaction. The records payload is the trusted restore
 * source; portable rows are intentionally record-id free for moving data to a
 * fresh database through the normal validator/importer.
 */
export async function exportTrustedSnapshot(modules: readonly DataModuleName[]): Promise<TrustedDataSnapshot> {
  return defaultPrisma.$transaction(async (transaction) => {
    const context = await buildExportContext(transaction);
    return exportContextStorage.run(context, async () => {
      const portable: Partial<Record<DataModuleName, ExportDataRow[]>> = {};
      const records: Partial<Record<DataModuleName, LosslessDataRow[]>> = {};
      const bindings: Partial<Record<DataModuleName, Array<{ id: number; key: string }>>> = {};
      for (const dataModule of modules) {
        const presentation = await exportModuleRows(dataModule);
        const keyColumn = DATA_MODULE_REGISTRY[dataModule].keyColumn;
        bindings[dataModule] = presentation.flatMap((row) =>
          typeof row.record_id === "number" && typeof row[keyColumn] === "string"
            ? [{ id: row.record_id, key: row[keyColumn] as string }]
            : [],
        );
        portable[dataModule] = presentation.map(stripPortableRecordId);
        records[dataModule] = await rawModuleRows(transaction, dataModule);
      }
      return { portable, records, bindings };
    });
  }, { maxWait: 10_000, timeout: 120_000 });
}
