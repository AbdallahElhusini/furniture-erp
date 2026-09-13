import type {
  DataModuleName,
  DataTransferIssueInput,
  ParsedDataRow,
  ValidatedDataRow,
} from "./contracts";
import { RowReader } from "./row-reader";
import { CLIENT_STAGES } from "../client-crm.ts";
import {
  SITE_CONTENT_DEFINITION_BY_KEY,
  isSafeSiteLink,
  isSafeSiteMediaPath,
} from "@/lib/site-content-registry";

export interface ModuleColumn {
  key: string;
  required?: boolean;
  description: string;
}

export interface DataModuleDefinition {
  name: DataModuleName;
  labelAr: string;
  labelEn: string;
  keyColumn: string;
  columns: readonly ModuleColumn[];
  normalize: (row: ParsedDataRow) => {
    value: ValidatedDataRow | null;
    issues: DataTransferIssueInput[];
  };
}

const commonColumns: readonly ModuleColumn[] = [
  { key: "action", description: "UPSERT only in schema v1" },
  { key: "record_id", description: "Optional ERP id used only to attach an import key to an existing row" },
];

const enumValues = {
  projectType: ["LARGE_PROJECT", "SIMPLE_ORDER"] as const,
  projectStatus: [
    "LEAD",
    "INSPECTION",
    "DESIGNING",
    "PENDING_APPROVAL",
    "APPROVED",
    "IN_PRODUCTION",
    "READY",
    "INSTALLING",
    "COMPLETED",
    "CANCELLED",
  ] as const,
  priority: ["LOW", "MEDIUM", "HIGH", "URGENT"] as const,
  taskType: [
    "SUPPLIER_FOLLOWUP",
    "DESIGN",
    "INSTALLATION",
    "DELIVERY",
    "INSPECTION",
    "GENERAL",
  ] as const,
  taskStatus: ["TODO", "IN_PROGRESS", "DONE"] as const,
  paymentMethod: ["CASH", "BANK_TRANSFER", "CHECK"] as const,
  projectItemStatus: ["PENDING", "ORDERED", "IN_PRODUCTION", "READY", "DELIVERED", "INSTALLED"] as const,
  supplierOrderStatus: ["PENDING", "CONFIRMED", "IN_PRODUCTION", "READY", "SHIPPED", "DELIVERED"] as const,
  quoteStatus: ["NEW", "CONTACTED", "QUOTED", "CONVERTED", "REJECTED"] as const,
  collectionType: ["STYLE", "SET", "SPACE", "CAMPAIGN"] as const,
  familyStatus: ["CANDIDATE", "APPROVED", "REJECTED"] as const,
  contentStatus: ["NEEDS_REVIEW", "READY", "VERIFIED"] as const,
  assetRole: ["PRIMARY", "GALLERY", "DETAIL", "LIFESTYLE"] as const,
  siteContentType: ["TEXT", "TEXTAREA", "LINK", "IMAGE", "VIDEO", "BANNER"] as const,
};

export const SAFE_SETTING_KEYS: ReadonlySet<string> = new Set([
  "company_name_ar",
  "company_name_en",
  "company_phone",
  "company_email",
  "company_address",
  "currency",
  "tax_rate",
]);

function columns(...items: ModuleColumn[]): readonly ModuleColumn[] {
  return [...commonColumns, ...items];
}

function normalizeWith(
  row: ParsedDataRow,
  keyColumn: string,
  build: (reader: RowReader) => {
    data: Record<string, unknown>;
    references?: Record<string, string | null>;
  },
): { value: ValidatedDataRow | null; issues: DataTransferIssueInput[] } {
  const reader = new RowReader(row);
  const action = reader.string("action", { max: 20 })?.toUpperCase() || "UPSERT";
  if (action !== "UPSERT") {
    reader.issue("action", "ACTION_NOT_ALLOWED", "Schema v1 accepts UPSERT only; DELETE and implicit deletion are disabled");
  }

  const recordId = reader.integer("record_id", { min: 1 }) ?? undefined;
  const built = build(reader);
  const recordKey = reader.string(keyColumn, { required: true, min: 1, max: 160 });

  if (reader.hasErrors || !recordKey) return { value: null, issues: reader.issues };
  return {
    value: {
      module: row.module,
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      recordKey,
      recordId,
      data: built.data,
      references: built.references ?? {},
      raw: row.values,
    },
    issues: reader.issues,
  };
}

function externalKeyModule(
  name: DataModuleName,
  labelAr: string,
  labelEn: string,
  moduleColumns: readonly ModuleColumn[],
  build: (reader: RowReader) => {
    data: Record<string, unknown>;
    references?: Record<string, string | null>;
  },
): DataModuleDefinition {
  return {
    name,
    labelAr,
    labelEn,
    keyColumn: "external_key",
    columns: columns(
      { key: "external_key", required: true, description: "Stable import key; letters, numbers, dot, slash, colon, underscore, or dash" },
      ...moduleColumns,
    ),
    normalize: (row) => normalizeWith(row, "external_key", (reader) => {
      const externalKey = reader.externalKey("external_key", true);
      const result = build(reader);
      return { ...result, data: { ...result.data, externalKey } };
    }),
  };
}

const clients = externalKeyModule(
  "clients",
  "العملاء",
  "Clients",
  [
    { key: "name", required: true, description: "Client name" },
    { key: "company", description: "Company" },
    { key: "phone", description: "Primary phone; can be empty for a lead, required for CUSTOMER" },
    { key: "email", description: "Email" },
    { key: "address", description: "Address" },
    { key: "notes", description: "Notes" },
    { key: "stage", description: "LEAD, QUALIFIED, CUSTOMER, or LOST" },
    { key: "brief", description: "Client brief and requirements" },
    { key: "source", description: "Lead source: phone, WhatsApp, referral, website, etc." },
    { key: "next_follow_up_at", description: "Next follow-up: YYYY-MM-DD or ISO timestamp" },
  ],
  (r) => {
    const stage = r.enumeration("stage", CLIENT_STAGES, { fallback: "LEAD" });
    const phone = r.string("phone", { required: stage === "CUSTOMER", max: 80 }) ?? "";
    return { data: {
      name: r.string("name", { required: true, max: 200 }),
      company: r.string("company", { max: 200 }),
      phone,
      email: r.string("email", { max: 320 }),
      address: r.string("address", { max: 1_000 }),
      notes: r.string("notes", { max: 5_000 }),
      stage,
      brief: r.string("brief", { max: 5_000 }),
      source: r.string("source", { max: 200 }),
      nextFollowUpAt: r.date("next_follow_up_at"),
    } };
  },
);

const suppliers = externalKeyModule(
  "suppliers",
  "الموردون",
  "Suppliers",
  [
    { key: "name", required: true, description: "Supplier name" },
    { key: "contact_person", description: "Contact person" },
    { key: "phone", required: true, description: "Phone" },
    { key: "email", description: "Email" },
    { key: "address", description: "Address" },
    { key: "specialization", description: "Specialization" },
    { key: "quality_rating", description: "1-5" },
    { key: "delivery_rating", description: "1-5" },
    { key: "notes", description: "Notes" },
    { key: "is_active", description: "true/false" },
  ],
  (r) => ({
    data: {
      name: r.string("name", { required: true, max: 200 }),
      contactPerson: r.string("contact_person", { max: 200 }),
      phone: r.string("phone", { required: true, max: 80 }),
      email: r.string("email", { max: 320 }),
      address: r.string("address", { max: 1_000 }),
      specialization: r.string("specialization", { max: 300 }),
      qualityRating: r.integer("quality_rating", { min: 1, max: 5 }) ?? 5,
      deliveryRating: r.integer("delivery_rating", { min: 1, max: 5 }) ?? 5,
      notes: r.string("notes", { max: 5_000 }),
      isActive: r.boolean("is_active", true),
    },
  }),
);

const technicians = externalKeyModule(
  "technicians",
  "الفنيون",
  "Technicians",
  [
    { key: "name", required: true, description: "Technician name" },
    { key: "phone", required: true, description: "Phone" },
    { key: "specialization", description: "Specialization" },
    { key: "is_available", description: "true/false" },
    { key: "daily_rate", description: "Non-negative daily rate" },
    { key: "notes", description: "Notes" },
  ],
  (r) => ({
    data: {
      name: r.string("name", { required: true, max: 200 }),
      phone: r.string("phone", { required: true, max: 80 }),
      specialization: r.string("specialization", { max: 300 }),
      isAvailable: r.boolean("is_available", true),
      dailyRate: r.number("daily_rate", { min: 0 }) ?? 0,
      notes: r.string("notes", { max: 5_000 }),
    },
  }),
);

const settings: DataModuleDefinition = {
  name: "settings",
  labelAr: "إعدادات الشركة",
  labelEn: "Business settings",
  keyColumn: "key",
  columns: columns(
    { key: "key", required: true, description: "Allowlisted business setting key" },
    { key: "value", required: true, description: "Setting value" },
  ),
  normalize: (row) => normalizeWith(row, "key", (r) => {
    const key = r.string("key", { required: true, max: 120 });
    if (key && !SAFE_SETTING_KEYS.has(key)) {
      r.issue("key", "SETTING_NOT_ALLOWLISTED", `The setting '${key}' is not allowed in spreadsheet imports`);
    }
    return {
      data: {
        key,
        value: r.string("value", { required: true, max: 10_000 }),
      },
    };
  }),
};

const siteContent: DataModuleDefinition = {
  name: "site_content",
  labelAr: "محتوى الموقع",
  labelEn: "Website content",
  keyColumn: "key",
  columns: columns(
    { key: "key", required: true, description: "Stable CMS slot key" },
    { key: "group", description: "Canonical page/section group (read-only)" },
    { key: "type", description: `Canonical type (read-only): ${enumValues.siteContentType.join(" | ")}` },
    { key: "label", description: "Canonical dashboard label (read-only)" },
    { key: "value_ar", description: "Arabic text" },
    { key: "value_en", description: "English text" },
    { key: "media_url", description: "Registered same-origin media path" },
    { key: "alt_ar", description: "Arabic media alt text" },
    { key: "alt_en", description: "English media alt text" },
    { key: "link_url", description: "Safe relative, HTTPS, mailto, or tel URL" },
    { key: "metadata", description: "JSON object" },
    { key: "is_active", description: "true/false" },
    { key: "sort_order", description: "Whole number" },
  ),
  normalize: (row) => normalizeWith(row, "key", (r) => {
    const key = r.externalKey("key", true);
    const definition = key ? SITE_CONTENT_DEFINITION_BY_KEY.get(key) : undefined;
    if (key && !definition) r.issue("key", "UNREGISTERED_CONTENT_KEY", `Unknown website content key '${key}'`);
    const suppliedGroup = r.string("group", { max: 120 });
    const suppliedType = r.string("type", { max: 80 })?.toUpperCase();
    const suppliedLabel = r.string("label", { max: 240 });
    const suppliedSortOrder = r.integer("sort_order", { min: 0 });
    if (definition && suppliedGroup && suppliedGroup !== definition.group) {
      r.issue("group", "CANONICAL_FIELD_MISMATCH", `group must remain '${definition.group}'`);
    }
    if (definition && suppliedType && suppliedType !== definition.type) {
      r.issue("type", "CANONICAL_FIELD_MISMATCH", `type must remain '${definition.type}'`);
    }
    if (definition && suppliedLabel && suppliedLabel !== definition.label) {
      r.issue("label", "CANONICAL_FIELD_MISMATCH", "label is registry-controlled and cannot be changed by import");
    }
    if (definition && suppliedSortOrder !== null && suppliedSortOrder !== definition.sortOrder) {
      r.issue("sort_order", "CANONICAL_FIELD_MISMATCH", "sort_order is registry-controlled and cannot be changed by import");
    }
    const textLimit = definition?.type === "TEXT" ? 300 : 4_000;
    const valueAr = r.string("value_ar", { max: textLimit });
    const valueEn = r.string("value_en", { max: textLimit });
    const altAr = r.string("alt_ar", { max: 300 });
    const altEn = r.string("alt_en", { max: 300 });
    const mediaUrl = r.string("media_url", { max: 1_000 });
    const linkUrl = r.string("link_url", { max: 500 });
    if (mediaUrl && definition) {
      if (!(definition.type === "IMAGE" || definition.type === "VIDEO" || definition.type === "BANNER")) {
        r.issue("media_url", "MEDIA_NOT_ALLOWED", `${definition.key} is not a media slot`);
      } else if (!isSafeSiteMediaPath(mediaUrl, definition.type)) {
        r.issue("media_url", "UNSAFE_MEDIA_URL", "media_url must be a registered same-origin media path");
      }
    }
    if (linkUrl && !isSafeSiteLink(linkUrl)) {
      r.issue("link_url", "UNSAFE_LINK_URL", "link_url must be a safe same-origin path");
    }
    const metadata = r.json("metadata", {});
    if (metadata.length > 4_000) r.issue("metadata", "TOO_LONG", "metadata must not exceed 4000 characters");
    if (!metadata.startsWith("{")) r.issue("metadata", "INVALID_METADATA", "metadata must be a JSON object");
    return {
      data: {
        key,
        group: definition?.group ?? suppliedGroup,
        type: definition?.type ?? suppliedType,
        label: definition?.label ?? suppliedLabel,
        valueAr,
        valueEn,
        mediaUrl,
        altAr,
        altEn,
        linkUrl,
        metadata,
        isActive: r.boolean("is_active", true),
        sortOrder: definition?.sortOrder ?? suppliedSortOrder ?? 0,
      },
    };
  }),
};

const categories: DataModuleDefinition = {
  name: "categories",
  labelAr: "الفئات",
  labelEn: "Categories",
  keyColumn: "slug",
  columns: columns(
    { key: "slug", required: true, description: "Unique URL slug" },
    { key: "parent_slug", description: "Parent category slug" },
    { key: "name_ar", required: true, description: "Arabic name" },
    { key: "name_en", required: true, description: "English name" },
    { key: "image", description: "Verified local media path" },
    { key: "sort_order", description: "Whole number" },
    { key: "is_active", description: "true/false" },
  ),
  normalize: (row) => normalizeWith(row, "slug", (r) => {
    const slug = r.string("slug", { required: true, max: 160, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
    const parentSlug = r.string("parent_slug", { max: 160, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
    if (slug && parentSlug === slug) r.issue("parent_slug", "SELF_REFERENCE", "A category cannot be its own parent");
    return {
      data: {
        slug,
        nameAr: r.string("name_ar", { required: true, max: 240 }),
        nameEn: r.string("name_en", { required: true, max: 240 }),
        image: r.mediaUrl("image"),
        sortOrder: r.integer("sort_order", { min: 0 }) ?? 0,
        isActive: r.boolean("is_active", true),
      },
      references: { parentSlug },
    };
  }),
};

const categoryRedirects: DataModuleDefinition = {
  name: "category_redirects",
  labelAr: "تحويلات روابط الفئات",
  labelEn: "Category redirects",
  keyColumn: "from_slug",
  columns: columns(
    { key: "from_slug", required: true, description: "Former unique category slug" },
    { key: "category_slug", required: true, description: "Current destination category slug" },
  ),
  normalize: (row) => normalizeWith(row, "from_slug", (r) => {
    const fromSlug = r.string("from_slug", { required: true, max: 160, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
    const categorySlug = r.string("category_slug", { required: true, max: 160, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
    if (fromSlug && categorySlug === fromSlug) {
      r.issue("category_slug", "SELF_REDIRECT", "A category redirect cannot target the same slug");
    }
    return { data: { fromSlug }, references: { categorySlug } };
  }),
};

const collections: DataModuleDefinition = {
  name: "collections",
  labelAr: "التشكيلات",
  labelEn: "Collections",
  keyColumn: "slug",
  columns: columns(
    { key: "slug", required: true, description: "Unique URL slug" },
    { key: "type", required: true, description: enumValues.collectionType.join(" | ") },
    { key: "name_ar", required: true, description: "Arabic name" },
    { key: "name_en", required: true, description: "English name" },
    { key: "description_ar", description: "Arabic description" },
    { key: "description_en", description: "English description" },
    { key: "image", description: "Verified local media path" },
    { key: "is_draft", description: "true/false" },
    { key: "is_active", description: "true/false" },
    { key: "sort_order", description: "Whole number" },
  ),
  normalize: (row) => normalizeWith(row, "slug", (r) => ({
    data: {
      slug: r.string("slug", { required: true, max: 160, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }),
      type: r.enumeration("type", enumValues.collectionType, { required: true }),
      nameAr: r.string("name_ar", { required: true, max: 240 }),
      nameEn: r.string("name_en", { required: true, max: 240 }),
      descriptionAr: r.string("description_ar", { max: 20_000 }),
      descriptionEn: r.string("description_en", { max: 20_000 }),
      image: r.mediaUrl("image"),
      isDraft: r.boolean("is_draft", true),
      isActive: r.boolean("is_active", false),
      sortOrder: r.integer("sort_order", { min: 0 }) ?? 0,
    },
  })),
};

const productFamilies: DataModuleDefinition = {
  name: "product_families",
  labelAr: "عائلات المنتجات",
  labelEn: "Product families",
  keyColumn: "source_key",
  columns: columns(
    { key: "source_key", required: true, description: "Stable source family key" },
    { key: "category_slug", required: true, description: "Category slug" },
    { key: "slug", required: true, description: "Unique URL slug" },
    { key: "name_ar", required: true, description: "Arabic name" },
    { key: "name_en", required: true, description: "English name" },
    { key: "review_status", description: enumValues.familyStatus.join(" | ") },
  ),
  normalize: (row) => normalizeWith(row, "source_key", (r) => {
    const sourceKey = r.externalKey("source_key", true);
    const categorySlug = r.string("category_slug", { required: true, max: 160 });
    return {
      data: {
        sourceKey,
        slug: r.string("slug", { required: true, max: 160, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }),
        nameAr: r.string("name_ar", { required: true, max: 240 }),
        nameEn: r.string("name_en", { required: true, max: 240 }),
        reviewStatus: r.enumeration("review_status", enumValues.familyStatus, { fallback: "CANDIDATE" }),
      },
      references: { categorySlug },
    };
  }),
};

const tagGroups: DataModuleDefinition = {
  name: "tag_groups",
  labelAr: "مجموعات الوسوم",
  labelEn: "Tag groups",
  keyColumn: "key",
  columns: columns(
    { key: "key", required: true, description: "Stable group key" },
    { key: "name_ar", required: true, description: "Arabic name" },
    { key: "name_en", required: true, description: "English name" },
    { key: "sort_order", description: "Whole number" },
  ),
  normalize: (row) => normalizeWith(row, "key", (r) => ({
    data: {
      key: r.externalKey("key", true),
      nameAr: r.string("name_ar", { required: true, max: 240 }),
      nameEn: r.string("name_en", { required: true, max: 240 }),
      sortOrder: r.integer("sort_order", { min: 0 }) ?? 0,
    },
  })),
};

const tags: DataModuleDefinition = {
  name: "tags",
  labelAr: "الوسوم",
  labelEn: "Tags",
  keyColumn: "slug",
  columns: columns(
    { key: "slug", required: true, description: "Unique tag slug" },
    { key: "group_key", required: true, description: "Tag group key" },
    { key: "name_ar", required: true, description: "Arabic name" },
    { key: "name_en", required: true, description: "English name" },
    { key: "sort_order", description: "Whole number" },
  ),
  normalize: (row) => normalizeWith(row, "slug", (r) => {
    const groupKey = r.externalKey("group_key", true);
    return {
      data: {
        slug: r.string("slug", { required: true, max: 160, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }),
        nameAr: r.string("name_ar", { required: true, max: 240 }),
        nameEn: r.string("name_en", { required: true, max: 240 }),
        sortOrder: r.integer("sort_order", { min: 0 }) ?? 0,
      },
      references: { groupKey },
    };
  }),
};

const catalogItems: DataModuleDefinition = {
  name: "catalog_items",
  labelAr: "المنتجات",
  labelEn: "Catalog items",
  keyColumn: "sku",
  columns: columns(
    { key: "sku", required: true, description: "Unique SKU" },
    { key: "category_slug", required: true, description: "Category slug" },
    { key: "family_source_key", description: "Product family source key" },
    { key: "supplier_external_key", description: "Supplier external key" },
    { key: "name_ar", required: true, description: "Arabic name" },
    { key: "name_en", required: true, description: "English name" },
    { key: "description_ar", description: "Arabic description" },
    { key: "description_en", description: "English description" },
    { key: "cost_price", description: "Non-negative cost" },
    { key: "selling_price", description: "Non-negative selling price" },
    { key: "lead_time_days", description: "Non-negative integer" },
    { key: "dimensions", description: "Dimensions" },
    { key: "material", description: "Material" },
    { key: "color", description: "Color" },
    { key: "images", description: "JSON string array" },
    { key: "specifications", description: "JSON object" },
    { key: "is_active", description: "true/false" },
    { key: "is_featured", description: "true/false" },
    { key: "display_order", description: "Stable storefront display order" },
    { key: "content_status", description: enumValues.contentStatus.join(" | ") },
  ),
  normalize: (row) => normalizeWith(row, "sku", (r) => {
    const categorySlug = r.string("category_slug", { required: true, max: 160 });
    const familySourceKey = r.externalKey("family_source_key", false);
    const supplierExternalKey = r.externalKey("supplier_external_key", false);
    const images = r.json("images", []);
    const specifications = r.json("specifications", {});
    if (!images.startsWith("[")) r.issue("images", "INVALID_IMAGES", "images must be a JSON array");
    if (!specifications.startsWith("{")) r.issue("specifications", "INVALID_SPECIFICATIONS", "specifications must be a JSON object");
    return {
      data: {
        sku: r.string("sku", { required: true, max: 120, pattern: /^[A-Za-z0-9][A-Za-z0-9._/-]*$/ }),
        nameAr: r.string("name_ar", { required: true, max: 500 }),
        nameEn: r.string("name_en", { required: true, max: 500 }),
        descriptionAr: r.string("description_ar", { max: 20_000 }),
        descriptionEn: r.string("description_en", { max: 20_000 }),
        costPrice: r.number("cost_price", { min: 0 }) ?? 0,
        sellingPrice: r.number("selling_price", { min: 0 }) ?? 0,
        leadTimeDays: r.integer("lead_time_days", { min: 0, max: 3_650 }) ?? 7,
        dimensions: r.string("dimensions", { max: 500 }),
        material: r.string("material", { max: 500 }),
        color: r.string("color", { max: 500 }),
        images,
        specifications,
        isActive: r.boolean("is_active", true),
        isFeatured: r.boolean("is_featured", false),
        displayOrder: r.integer("display_order", { min: 0 }) ?? 0,
        contentStatus: r.enumeration("content_status", enumValues.contentStatus, { fallback: "NEEDS_REVIEW" }),
      },
      references: { categorySlug, familySourceKey, supplierExternalKey },
    };
  }),
};

const productAssets = externalKeyModule(
  "product_assets",
  "ملفات المنتجات",
  "Product assets",
  [
    { key: "catalog_sku", description: "Owning catalog SKU" },
    { key: "family_source_key", description: "Owning family source key" },
    { key: "duplicate_external_key", description: "Duplicate asset external key" },
    { key: "url", required: true, description: "Validated local or public HTTPS product image/video URL" },
    { key: "mime_type", description: "MIME type" },
    { key: "width", description: "Pixels" },
    { key: "height", description: "Pixels" },
    { key: "bytes", description: "Byte size" },
    { key: "checksum", description: "Checksum" },
    { key: "role", description: enumValues.assetRole.join(" | ") },
    { key: "sort_order", description: "Whole number" },
    { key: "alt_ar", description: "Arabic alt text" },
    { key: "alt_en", description: "English alt text" },
    { key: "review_status", description: "Review status" },
  ],
  (r) => {
    const catalogSku = r.string("catalog_sku", { max: 120 });
    const familySourceKey = r.externalKey("family_source_key", false);
    if (!catalogSku && !familySourceKey) r.issue("catalog_sku", "OWNER_REQUIRED", "An asset must reference a catalog SKU or family source key");
    return {
      data: {
        url: r.productMediaUrl("url"),
        mimeType: r.string("mime_type", { max: 200 }),
        width: r.integer("width", { min: 1 }),
        height: r.integer("height", { min: 1 }),
        bytes: r.integer("bytes", { min: 0 }),
        checksum: r.string("checksum", { max: 256 }),
        role: r.enumeration("role", enumValues.assetRole, { fallback: "GALLERY" }),
        sortOrder: r.integer("sort_order", { min: 0 }) ?? 0,
        altAr: r.string("alt_ar", { max: 500 }),
        altEn: r.string("alt_en", { max: 500 }),
        reviewStatus: r.string("review_status", { max: 80 }) || "NEEDS_REVIEW",
      },
      references: {
        catalogSku,
        familySourceKey,
        duplicateExternalKey: r.externalKey("duplicate_external_key", false),
      },
    };
  },
);

function linkModule(
  name: "catalog_item_collections" | "catalog_item_tags",
  labelAr: string,
  labelEn: string,
  targetColumn: "collection_slug" | "tag_slug",
): DataModuleDefinition {
  return {
    name,
    labelAr,
    labelEn,
    keyColumn: "link_key",
    columns: columns(
      { key: "link_key", required: true, description: "Stable link key, normally SKU:target" },
      { key: "catalog_sku", required: true, description: "Catalog SKU" },
      { key: targetColumn, required: true, description: targetColumn.replaceAll("_", " ") },
    ),
    normalize: (row) => normalizeWith(row, "link_key", (r) => {
      const catalogSku = r.string("catalog_sku", { required: true, max: 120 });
      const target = r.string(targetColumn, { required: true, max: 160 });
      return {
        data: {},
        references: {
          catalogSku,
          [targetColumn === "collection_slug" ? "collectionSlug" : "tagSlug"]: target,
        },
      };
    }),
  };
}

const projects = externalKeyModule(
  "projects",
  "المشاريع",
  "Projects",
  [
    { key: "client_external_key", required: true, description: "Client external key" },
    { key: "title", required: true, description: "Project title" },
    { key: "type", description: enumValues.projectType.join(" | ") },
    { key: "status", description: enumValues.projectStatus.join(" | ") },
    { key: "inspection_date", description: "ISO or Excel date" },
    { key: "design_deadline", description: "ISO or Excel date" },
    { key: "approval_date", description: "ISO or Excel date" },
    { key: "estimated_delivery", description: "ISO or Excel date" },
    { key: "sync_date", description: "ISO or Excel date" },
    { key: "total_cost", description: "Non-negative" },
    { key: "total_price", description: "Non-negative" },
    { key: "amount_paid", description: "Non-negative" },
    { key: "shipping_cost", description: "Non-negative" },
    { key: "installation_cost", description: "Non-negative" },
    { key: "notes", description: "Notes" },
    { key: "priority", description: enumValues.priority.join(" | ") },
  ],
  (r) => {
    const clientExternalKey = r.externalKey("client_external_key", true);
    const totalPrice = r.number("total_price", { min: 0 }) ?? 0;
    const amountPaid = r.number("amount_paid", { min: 0 }) ?? 0;
    if (amountPaid > totalPrice && totalPrice > 0) {
      r.issue("amount_paid", "PAYMENT_EXCEEDS_TOTAL", "amount_paid cannot exceed total_price", "WARNING");
    }
    return {
      data: {
        title: r.string("title", { required: true, max: 500 }),
        type: r.enumeration("type", enumValues.projectType, { fallback: "LARGE_PROJECT" }),
        status: r.enumeration("status", enumValues.projectStatus, { fallback: "LEAD" }),
        inspectionDate: r.date("inspection_date"),
        designDeadline: r.date("design_deadline"),
        approvalDate: r.date("approval_date"),
        estimatedDelivery: r.date("estimated_delivery"),
        syncDate: r.date("sync_date"),
        totalCost: r.number("total_cost", { min: 0 }) ?? 0,
        totalPrice,
        amountPaid,
        shippingCost: r.number("shipping_cost", { min: 0 }) ?? 0,
        installationCost: r.number("installation_cost", { min: 0 }) ?? 0,
        notes: r.string("notes", { max: 10_000 }),
        priority: r.enumeration("priority", enumValues.priority, { fallback: "MEDIUM" }),
      },
      references: { clientExternalKey },
    };
  },
);

const projectItems = externalKeyModule(
  "project_items",
  "بنود المشاريع",
  "Project items",
  [
    { key: "project_external_key", required: true, description: "Project external key" },
    { key: "catalog_sku", required: true, description: "Catalog SKU" },
    { key: "quantity", required: true, description: "Positive whole number" },
    { key: "unit_cost", required: true, description: "Non-negative unit cost" },
    { key: "unit_price", required: true, description: "Non-negative unit price" },
    { key: "status", description: enumValues.projectItemStatus.join(" | ") },
    { key: "notes", description: "Notes" },
    { key: "lead_time_days", description: "Non-negative whole number" },
  ],
  (r) => ({
    data: {
      quantity: r.integer("quantity", { required: true, min: 1 }) ?? 1,
      unitCost: r.number("unit_cost", { required: true, min: 0 }) ?? 0,
      unitPrice: r.number("unit_price", { required: true, min: 0 }) ?? 0,
      status: r.enumeration("status", enumValues.projectItemStatus, { fallback: "PENDING" }),
      notes: r.string("notes", { max: 5_000 }),
      leadTimeDays: r.integer("lead_time_days", { min: 0, max: 3_650 }) ?? 0,
    },
    references: {
      projectExternalKey: r.externalKey("project_external_key", true),
      catalogSku: r.string("catalog_sku", { required: true, max: 120 }),
    },
  }),
);

const supplierOrders = externalKeyModule(
  "supplier_orders",
  "أوامر الموردين",
  "Supplier orders",
  [
    { key: "supplier_external_key", required: true, description: "Supplier external key" },
    { key: "project_external_key", required: true, description: "Project external key" },
    { key: "status", description: enumValues.supplierOrderStatus.join(" | ") },
    { key: "order_date", required: true, description: "ISO or Excel date" },
    { key: "expected_date", description: "ISO or Excel date" },
    { key: "actual_delivery_date", description: "ISO or Excel date" },
    { key: "total_amount", description: "Non-negative total" },
    { key: "amount_paid", description: "Non-negative amount" },
    { key: "notes", description: "Notes" },
  ],
  (r) => {
    const totalAmount = r.number("total_amount", { min: 0 }) ?? 0;
    const amountPaid = r.number("amount_paid", { min: 0 }) ?? 0;
    if (amountPaid > totalAmount && totalAmount > 0) {
      r.issue("amount_paid", "PAYMENT_EXCEEDS_TOTAL", "amount_paid cannot exceed total_amount", "WARNING");
    }
    return {
      data: {
        status: r.enumeration("status", enumValues.supplierOrderStatus, { fallback: "PENDING" }),
        orderDate: r.date("order_date", true),
        expectedDate: r.date("expected_date"),
        actualDeliveryDate: r.date("actual_delivery_date"),
        totalAmount,
        amountPaid,
        notes: r.string("notes", { max: 10_000 }),
      },
      references: {
        supplierExternalKey: r.externalKey("supplier_external_key", true),
        projectExternalKey: r.externalKey("project_external_key", true),
      },
    };
  },
);

const orderItems = externalKeyModule(
  "order_items",
  "بنود أوامر الموردين",
  "Supplier order items",
  [
    { key: "supplier_order_external_key", required: true, description: "Supplier order external key" },
    { key: "project_item_external_key", required: true, description: "Project item external key" },
    { key: "quantity", required: true, description: "Positive whole number" },
  ],
  (r) => ({
    data: { quantity: r.integer("quantity", { required: true, min: 1 }) ?? 1 },
    references: {
      supplierOrderExternalKey: r.externalKey("supplier_order_external_key", true),
      projectItemExternalKey: r.externalKey("project_item_external_key", true),
    },
  }),
);

const tasks = externalKeyModule(
  "tasks",
  "المهام",
  "Tasks",
  [
    { key: "project_external_key", description: "Optional project external key" },
    { key: "technician_external_key", description: "Optional technician external key" },
    { key: "type", required: true, description: enumValues.taskType.join(" | ") },
    { key: "title", required: true, description: "Task title" },
    { key: "description", description: "Description" },
    { key: "due_date", required: true, description: "ISO or Excel date" },
    { key: "status", description: enumValues.taskStatus.join(" | ") },
    { key: "priority", description: enumValues.priority.join(" | ") },
  ],
  (r) => ({
    data: {
      type: r.enumeration("type", enumValues.taskType, { required: true }),
      title: r.string("title", { required: true, max: 500 }),
      description: r.string("description", { max: 10_000 }),
      dueDate: r.date("due_date", true),
      status: r.enumeration("status", enumValues.taskStatus, { fallback: "TODO" }),
      priority: r.enumeration("priority", enumValues.priority, { fallback: "MEDIUM" }),
    },
    references: {
      projectExternalKey: r.externalKey("project_external_key", false),
      technicianExternalKey: r.externalKey("technician_external_key", false),
    },
  }),
);

const payments = externalKeyModule(
  "payments",
  "المدفوعات",
  "Payments",
  [
    { key: "project_external_key", required: true, description: "Project external key" },
    { key: "amount", required: true, description: "Positive payment amount" },
    { key: "method", description: enumValues.paymentMethod.join(" | ") },
    { key: "notes", description: "Notes" },
    { key: "date", required: true, description: "ISO or Excel date" },
  ],
  (r) => ({
    data: {
      amount: r.number("amount", { required: true, min: 0.01 }),
      method: r.enumeration("method", enumValues.paymentMethod, { fallback: "CASH" }),
      notes: r.string("notes", { max: 5_000 }),
      date: r.date("date", true),
    },
    references: { projectExternalKey: r.externalKey("project_external_key", true) },
  }),
);

const quoteRequests = externalKeyModule(
  "quote_requests",
  "طلبات عروض الأسعار",
  "Quote requests",
  [
    { key: "client_name", required: true, description: "Client name" },
    { key: "client_email", description: "Email" },
    { key: "client_phone", required: true, description: "Phone" },
    { key: "company", description: "Company" },
    { key: "message", description: "Request message" },
    { key: "status", description: enumValues.quoteStatus.join(" | ") },
    { key: "total_estimate", description: "Non-negative estimate" },
  ],
  (r) => ({
    data: {
      clientName: r.string("client_name", { required: true, max: 240 }),
      clientEmail: r.string("client_email", { max: 320 }),
      clientPhone: r.string("client_phone", { required: true, max: 80 }),
      company: r.string("company", { max: 240 }),
      message: r.string("message", { max: 10_000 }),
      status: r.enumeration("status", enumValues.quoteStatus, { fallback: "NEW" }),
      totalEstimate: r.number("total_estimate", { min: 0 }) ?? 0,
    },
  }),
);

const quoteItems = externalKeyModule(
  "quote_items",
  "بنود عروض الأسعار",
  "Quote items",
  [
    { key: "quote_external_key", required: true, description: "Quote external key" },
    { key: "catalog_sku", required: true, description: "Catalog SKU" },
    { key: "quantity", required: true, description: "Positive whole number" },
  ],
  (r) => ({
    data: { quantity: r.integer("quantity", { required: true, min: 1 }) ?? 1 },
    references: {
      quoteExternalKey: r.externalKey("quote_external_key", true),
      catalogSku: r.string("catalog_sku", { required: true, max: 120 }),
    },
  }),
);

const portfolioProjects = externalKeyModule(
  "portfolio_projects",
  "مشاريع سابقة",
  "Portfolio projects",
  [
    { key: "title_ar", required: true, description: "Arabic title" },
    { key: "title_en", required: true, description: "English title" },
    { key: "description_ar", description: "Arabic description" },
    { key: "description_en", description: "English description" },
    { key: "client_name", description: "Client name" },
    { key: "location", description: "Location" },
    { key: "images", description: "JSON array of verified local media paths" },
    { key: "is_featured", description: "true/false" },
    { key: "sort_order", description: "Whole number" },
  ],
  (r) => {
    const images = r.json("images", []);
    if (!images.startsWith("[")) r.issue("images", "INVALID_IMAGES", "images must be a JSON array");
    if (images.startsWith("[")) {
      try {
        const parsed = JSON.parse(images) as unknown;
        if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
          r.issue("images", "INVALID_IMAGES", "images must be a JSON array of path strings");
        } else {
          for (const item of parsed) {
            const testRow = { ...r.row, values: { images: item } };
            const mediaReader = new RowReader(testRow);
            mediaReader.mediaUrl("images");
            for (const issue of mediaReader.issues) r.issues.push(issue);
          }
        }
      } catch {
        // RowReader.json already records malformed JSON.
      }
    }
    return {
      data: {
        titleAr: r.string("title_ar", { required: true, max: 500 }),
        titleEn: r.string("title_en", { required: true, max: 500 }),
        descriptionAr: r.string("description_ar", { max: 20_000 }),
        descriptionEn: r.string("description_en", { max: 20_000 }),
        clientName: r.string("client_name", { max: 300 }),
        location: r.string("location", { max: 500 }),
        images,
        isFeatured: r.boolean("is_featured", false),
        sortOrder: r.integer("sort_order", { min: 0 }) ?? 0,
      },
    };
  },
);

const financeEntries = externalKeyModule(
  "finance_entries", "الحركات المالية والمصروفات", "Finance ledger",
  [
    { key: "kind", required: true, description: "SUPPLIER_PAYMENT | EXPENSE | OTHER_INCOME. Customer receipts use payments." },
    { key: "amount", required: true, description: "Positive amount, maximum two decimal places" },
    { key: "date", required: true, description: "ISO date of actual movement" },
    { key: "method", description: "CASH | BANK_TRANSFER | CHECK" },
    { key: "description", required: true, description: "Movement description" },
    { key: "category", description: "Expense/income category" },
    { key: "notes", description: "Notes or receipt reference" },
    { key: "project_external_key", description: "Optional project key" },
    { key: "supplier_order_external_key", description: "Required only for SUPPLIER_PAYMENT" },
    { key: "status", description: "POSTED | VOID" },
    { key: "void_reason", description: "Required if VOID" },
  ],
  (r) => {
    const kind = r.enumeration("kind", ["SUPPLIER_PAYMENT", "EXPENSE", "OTHER_INCOME"] as const, { required: true });
    const status = r.enumeration("status", ["POSTED", "VOID"] as const, { fallback: "POSTED" });
    const amount = r.number("amount", { required: true, min: 0.01, max: 1_000_000_000 });
    if (amount !== null && Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) r.issue("amount", "CURRENCY_PRECISION", "Use at most two decimal places");
    const supplierOrderExternalKey = r.externalKey("supplier_order_external_key", kind === "SUPPLIER_PAYMENT");
    if (kind !== "SUPPLIER_PAYMENT" && supplierOrderExternalKey) r.issue("supplier_order_external_key", "INVALID_FINANCE_LINK", "Only supplier payments can reference a supplier order");
    const voidReason = r.string("void_reason", { required: status === "VOID", min: status === "VOID" ? 3 : undefined, max: 500 });
    return { data: { kind, amount, date: r.date("date", true), method: r.enumeration("method", enumValues.paymentMethod, { fallback: "CASH" }), description: r.string("description", { required: true, max: 240 }), category: r.string("category", { max: 80 }), notes: r.string("notes", { max: 2000 }), status, voidReason }, references: { projectExternalKey: r.externalKey("project_external_key", false), supplierOrderExternalKey } };
  },
);

export const DATA_MODULE_REGISTRY: Record<DataModuleName, DataModuleDefinition> = {
  clients,
  suppliers,
  technicians,
  settings,
  site_content: siteContent,
  categories,
  category_redirects: categoryRedirects,
  collections,
  product_families: productFamilies,
  tag_groups: tagGroups,
  tags,
  catalog_items: catalogItems,
  product_assets: productAssets,
  catalog_item_collections: linkModule(
    "catalog_item_collections",
    "ربط المنتجات بالتشكيلات",
    "Catalog collection links",
    "collection_slug",
  ),
  catalog_item_tags: linkModule(
    "catalog_item_tags",
    "ربط المنتجات بالوسوم",
    "Catalog tag links",
    "tag_slug",
  ),
  projects,
  project_items: projectItems,
  supplier_orders: supplierOrders,
  order_items: orderItems,
  tasks,
  payments,
  finance_entries: financeEntries,
  quote_requests: quoteRequests,
  quote_items: quoteItems,
  portfolio_projects: portfolioProjects,
};

export function moduleColumnKeys(module: DataModuleName): Set<string> {
  return new Set(DATA_MODULE_REGISTRY[module].columns.map((column) => column.key));
}
