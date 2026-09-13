export const DATA_TRANSFER_SCHEMA_VERSION = 1;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_SHEETS = 32;
export const MAX_ROWS_PER_SHEET = 10_000;
export const MAX_TOTAL_ROWS = 25_000;
export const MAX_COLUMNS_PER_SHEET = 96;
export const MAX_CELL_CHARACTERS = 20_000;
export const MAX_BACKUP_UPLOAD_BYTES = 64 * 1024 * 1024;
export const MAX_BACKUP_RECORDS = 100_000;

export const DATA_MODULES = [
  "clients",
  "suppliers",
  "technicians",
  "settings",
  "site_content",
  "categories",
  "category_redirects",
  "collections",
  "product_families",
  "tag_groups",
  "tags",
  "catalog_items",
  "product_assets",
  "catalog_item_collections",
  "catalog_item_tags",
  "projects",
  "project_items",
  "supplier_orders",
  "order_items",
  "tasks",
  "payments",
  "finance_entries",
  "quote_requests",
  "quote_items",
  "portfolio_projects",
] as const;

export type DataModuleName = (typeof DATA_MODULES)[number];

export const MODULE_APPLY_ORDER: readonly DataModuleName[] = [
  "clients",
  "suppliers",
  "technicians",
  "settings",
  "site_content",
  "categories",
  "category_redirects",
  "collections",
  "product_families",
  "tag_groups",
  "tags",
  "catalog_items",
  "product_assets",
  "catalog_item_collections",
  "catalog_item_tags",
  "projects",
  "project_items",
  "supplier_orders",
  "order_items",
  "tasks",
  "payments",
  "finance_entries",
  "quote_requests",
  "quote_items",
  "portfolio_projects",
];

export const DATA_SCOPES = [
  "FULL_BUSINESS",
  "CATALOG",
  "OPERATIONS",
  "CONTENT",
] as const;

export type DataScope = (typeof DATA_SCOPES)[number];

export const SCOPE_MODULES: Record<DataScope, readonly DataModuleName[]> = {
  FULL_BUSINESS: MODULE_APPLY_ORDER,
  CATALOG: [
    "suppliers",
    "categories",
    "category_redirects",
    "collections",
    "product_families",
    "tag_groups",
    "tags",
    "catalog_items",
    "product_assets",
    "catalog_item_collections",
    "catalog_item_tags",
  ],
  OPERATIONS: [
    "clients",
    "suppliers",
    "technicians",
    "projects",
    "project_items",
    "supplier_orders",
    "order_items",
    "tasks",
    "payments",
    "finance_entries",
    "quote_requests",
    "quote_items",
    "portfolio_projects",
  ],
  CONTENT: ["settings", "site_content"],
};

export type CellScalar = string | number | boolean | Date | null;

export interface ParsedDataRow {
  module: DataModuleName;
  sheet: string;
  rowNumber: number;
  values: Record<string, CellScalar>;
}

export interface ParsedDataFile {
  schemaVersion: number;
  source: string;
  generatedAt: string | null;
  fileName: string;
  fileType: "xlsx" | "csv";
  sourceHash: string;
  rows: ParsedDataRow[];
  modules: DataModuleName[];
}

export type IssueSeverity = "ERROR" | "WARNING";

export interface DataTransferIssueInput {
  module: string;
  sheet?: string;
  rowNumber?: number;
  field?: string;
  severity: IssueSeverity;
  code: string;
  message: string;
  rawData?: string;
}

export interface ValidatedDataRow<TData = Record<string, unknown>> {
  module: DataModuleName;
  sheet: string;
  rowNumber: number;
  recordKey: string;
  recordId?: number;
  data: TData;
  references: Record<string, string | null>;
  raw: Record<string, CellScalar>;
}

export interface ValidatedDataSet {
  rows: ValidatedDataRow[];
  issues: DataTransferIssueInput[];
  counts: Partial<Record<DataModuleName, number>>;
}

export interface ActorIdentity {
  id: number;
  email: string;
}

export interface ApplyModuleCount {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface ApplySummary {
  jobId: number;
  dryRun: boolean;
  duplicate: boolean;
  sourceHash: string;
  rowCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  modules: Partial<Record<DataModuleName, ApplyModuleCount>>;
  issues: DataTransferIssueInput[];
}

export interface BackupEnvelope {
  format: "HATAB_ERP_LOGICAL_BACKUP";
  schemaVersion: number;
  scope: DataScope;
  createdAt: string;
  sourceHash: string;
  counts: Record<string, number>;
  restoreMode: "MERGE_NO_DELETE";
  data: Partial<Record<DataModuleName, Array<Record<string, unknown>>>>;
  records: Partial<Record<DataModuleName, Array<Record<string, unknown>>>>;
  bindings: Partial<Record<DataModuleName, Array<{ id: number; key: string }>>>;
}

export interface RestorePreflight {
  valid: boolean;
  scope: DataScope | null;
  sourceHash: string | null;
  rowCount: number;
  counts: Record<string, number>;
  issues: DataTransferIssueInput[];
  envelope?: BackupEnvelope;
}

export function isDataModuleName(value: string): value is DataModuleName {
  return (DATA_MODULES as readonly string[]).includes(value);
}

export function isDataScope(value: string): value is DataScope {
  return (DATA_SCOPES as readonly string[]).includes(value);
}
