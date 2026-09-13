import type { DataModuleName } from "./contracts";

export interface LosslessModuleSchema {
  model: string | null;
  fields: readonly string[];
  optionalFields?: readonly string[];
  dateFields?: readonly string[];
  nullableDateFields?: readonly string[];
  foreignKeys?: ReadonlyArray<{ field: string; module: DataModuleName; nullable?: boolean }>;
  deferredFields?: readonly string[];
}

export const LOSSLESS_MODULE_SCHEMAS = {
  clients: {
    model: "client",
    fields: ["id", "externalKey", "name", "company", "phone", "email", "address", "notes", "stage", "brief", "source", "nextFollowUpAt", "createdAt", "updatedAt"],
    optionalFields: ["stage", "brief", "source", "nextFollowUpAt"],
    dateFields: ["createdAt", "updatedAt"],
    nullableDateFields: ["nextFollowUpAt"],
  },
  suppliers: {
    model: "supplier",
    fields: ["id", "externalKey", "name", "contactPerson", "phone", "email", "address", "specialization", "qualityRating", "deliveryRating", "notes", "isActive", "createdAt", "updatedAt"],
    dateFields: ["createdAt", "updatedAt"],
  },
  technicians: {
    model: "technician",
    fields: ["id", "externalKey", "name", "phone", "specialization", "isAvailable", "dailyRate", "notes", "createdAt"],
    dateFields: ["createdAt"],
  },
  settings: { model: "setting", fields: ["id", "key", "value"] },
  site_content: {
    model: "siteContent",
    fields: ["id", "key", "group", "type", "label", "valueAr", "valueEn", "mediaUrl", "altAr", "altEn", "linkUrl", "metadata", "isActive", "sortOrder", "createdAt", "updatedAt"],
    dateFields: ["createdAt", "updatedAt"],
  },
  categories: {
    model: "category",
    fields: ["id", "parentId", "nameAr", "nameEn", "slug", "image", "sortOrder", "isActive"],
    foreignKeys: [{ field: "parentId", module: "categories", nullable: true }],
    deferredFields: ["parentId"],
  },
  category_redirects: {
    model: "categoryRedirect",
    fields: ["id", "fromSlug", "categoryId", "createdAt"],
    dateFields: ["createdAt"],
    foreignKeys: [{ field: "categoryId", module: "categories" }],
  },
  collections: {
    model: "collection",
    fields: ["id", "type", "nameAr", "nameEn", "slug", "description", "descriptionAr", "descriptionEn", "image", "isDraft", "isActive", "sortOrder", "createdAt"],
    dateFields: ["createdAt"],
  },
  product_families: {
    model: "productFamily",
    fields: ["id", "categoryId", "nameAr", "nameEn", "slug", "sourceKey", "reviewStatus", "createdAt", "updatedAt"],
    dateFields: ["createdAt", "updatedAt"],
    foreignKeys: [{ field: "categoryId", module: "categories" }],
  },
  tag_groups: { model: "tagGroup", fields: ["id", "key", "nameAr", "nameEn", "sortOrder"] },
  tags: {
    model: "tag",
    fields: ["id", "groupId", "slug", "nameAr", "nameEn", "sortOrder"],
    foreignKeys: [{ field: "groupId", module: "tag_groups" }],
  },
  catalog_items: {
    model: "catalogItem",
    fields: ["id", "categoryId", "familyId", "supplierId", "nameAr", "nameEn", "sku", "descriptionAr", "descriptionEn", "costPrice", "sellingPrice", "leadTimeDays", "dimensions", "material", "color", "images", "specifications", "isActive", "isFeatured", "displayOrder", "completenessScore", "contentStatus", "lastReviewedAt", "createdAt", "updatedAt"],
    optionalFields: ["displayOrder"],
    dateFields: ["createdAt", "updatedAt"],
    nullableDateFields: ["lastReviewedAt"],
    foreignKeys: [
      { field: "categoryId", module: "categories" },
      { field: "familyId", module: "product_families", nullable: true },
      { field: "supplierId", module: "suppliers", nullable: true },
    ],
  },
  product_assets: {
    model: "productAsset",
    fields: ["id", "externalKey", "catalogItemId", "familyId", "duplicateOfId", "url", "mimeType", "width", "height", "bytes", "checksum", "role", "sortOrder", "altAr", "altEn", "reviewStatus", "createdAt"],
    dateFields: ["createdAt"],
    foreignKeys: [
      { field: "catalogItemId", module: "catalog_items", nullable: true },
      { field: "familyId", module: "product_families", nullable: true },
      { field: "duplicateOfId", module: "product_assets", nullable: true },
    ],
    deferredFields: ["duplicateOfId"],
  },
  catalog_item_collections: {
    model: null,
    fields: ["catalogItemId", "collectionIds"],
    foreignKeys: [{ field: "catalogItemId", module: "catalog_items" }],
  },
  catalog_item_tags: {
    model: null,
    fields: ["catalogItemId", "tagIds"],
    foreignKeys: [{ field: "catalogItemId", module: "catalog_items" }],
  },
  projects: {
    model: "project",
    fields: ["id", "externalKey", "clientId", "title", "type", "status", "inspectionDate", "designDeadline", "approvalDate", "estimatedDelivery", "syncDate", "totalCost", "totalPrice", "amountPaid", "shippingCost", "installationCost", "notes", "priority", "createdAt", "updatedAt"],
    dateFields: ["createdAt", "updatedAt"],
    nullableDateFields: ["inspectionDate", "designDeadline", "approvalDate", "estimatedDelivery", "syncDate"],
    foreignKeys: [{ field: "clientId", module: "clients" }],
  },
  project_items: {
    model: "projectItem",
    fields: ["id", "externalKey", "projectId", "catalogItemId", "quantity", "unitCost", "unitPrice", "status", "notes", "leadTimeDays"],
    foreignKeys: [{ field: "projectId", module: "projects" }, { field: "catalogItemId", module: "catalog_items" }],
  },
  supplier_orders: {
    model: "supplierOrder",
    fields: ["id", "externalKey", "supplierId", "projectId", "status", "orderDate", "expectedDate", "actualDeliveryDate", "totalAmount", "amountPaid", "notes", "createdAt", "updatedAt"],
    dateFields: ["orderDate", "createdAt", "updatedAt"],
    nullableDateFields: ["expectedDate", "actualDeliveryDate"],
    foreignKeys: [{ field: "supplierId", module: "suppliers" }, { field: "projectId", module: "projects" }],
  },
  order_items: {
    model: "orderItem",
    fields: ["id", "externalKey", "supplierOrderId", "projectItemId", "quantity"],
    foreignKeys: [{ field: "supplierOrderId", module: "supplier_orders" }, { field: "projectItemId", module: "project_items" }],
  },
  tasks: {
    model: "task",
    fields: ["id", "externalKey", "projectId", "technicianId", "type", "title", "description", "dueDate", "status", "priority", "createdAt", "updatedAt"],
    dateFields: ["dueDate", "createdAt", "updatedAt"],
    foreignKeys: [{ field: "projectId", module: "projects", nullable: true }, { field: "technicianId", module: "technicians", nullable: true }],
  },
  payments: {
    model: "payment",
    fields: ["id", "externalKey", "projectId", "amount", "method", "notes", "date", "createdAt"],
    dateFields: ["date", "createdAt"],
    foreignKeys: [{ field: "projectId", module: "projects" }],
  },
  finance_entries: {
    model: "financeEntry",
    fields: ["id", "externalKey", "kind", "amount", "date", "method", "description", "category", "notes", "projectId", "supplierOrderId", "status", "voidReason", "revision", "createdAt", "updatedAt"],
    dateFields: ["date", "createdAt", "updatedAt"],
    foreignKeys: [{ field: "projectId", module: "projects", nullable: true }, { field: "supplierOrderId", module: "supplier_orders", nullable: true }],
  },
  quote_requests: {
    model: "quoteRequest",
    fields: ["id", "externalKey", "clientName", "clientEmail", "clientPhone", "company", "message", "status", "totalEstimate", "createdAt", "updatedAt"],
    dateFields: ["createdAt", "updatedAt"],
  },
  quote_items: {
    model: "quoteItem",
    fields: ["id", "externalKey", "quoteId", "catalogItemId", "quantity"],
    foreignKeys: [{ field: "quoteId", module: "quote_requests" }, { field: "catalogItemId", module: "catalog_items" }],
  },
  portfolio_projects: {
    model: "portfolioProject",
    fields: ["id", "externalKey", "titleAr", "titleEn", "descriptionAr", "descriptionEn", "clientName", "location", "images", "isFeatured", "sortOrder", "createdAt"],
    dateFields: ["createdAt"],
  },
} as const satisfies Record<DataModuleName, LosslessModuleSchema>;
