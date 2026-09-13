import assert from "node:assert/strict";
import test from "node:test";

import { decodeBackupEnvelope } from "../src/lib/data-transfer/backup-envelope.ts";
import { calculateBackupHash } from "../src/lib/data-transfer/backup-integrity.ts";
import {
  canonicalPortableJsonObject,
  equivalentPortableTrustedValue,
  stripPortableRecordId,
} from "../src/lib/data-transfer/backup-portability.ts";
import {
  DATA_MODULES,
  DATA_TRANSFER_SCHEMA_VERSION,
  SCOPE_MODULES,
  type BackupEnvelope,
  type DataModuleName,
  type ParsedDataRow,
} from "../src/lib/data-transfer/contracts.ts";
import { decodeNeutralizedSpreadsheetText, neutralizeSpreadsheetText } from "../src/lib/data-transfer/egress-security.ts";
import { LOSSLESS_MODULE_SCHEMAS, type LosslessModuleSchema } from "../src/lib/data-transfer/lossless-schema.ts";
import { buildPatchData } from "../src/lib/data-transfer/patch-semantics.ts";
import { RowReader } from "../src/lib/data-transfer/row-reader.ts";

function numericReader(value: string | number): RowReader {
  const row: ParsedDataRow = {
    module: "payments",
    sheet: "payments",
    rowNumber: 2,
    values: { amount: value },
  };
  return new RowReader(row);
}

function envelope(overrides: Partial<BackupEnvelope> = {}): BackupEnvelope {
  const base: Omit<BackupEnvelope, "sourceHash"> = {
    format: "HATAB_ERP_LOGICAL_BACKUP",
    schemaVersion: DATA_TRANSFER_SCHEMA_VERSION,
    scope: "CONTENT",
    createdAt: "2026-08-25T12:00:00.000Z",
    restoreMode: "MERGE_NO_DELETE",
    counts: { settings: 0, site_content: 0 },
    data: { settings: [], site_content: [] },
    records: { settings: [], site_content: [] },
    bindings: { settings: [], site_content: [] },
  };
  const combined = { ...base, ...overrides } as Omit<BackupEnvelope, "sourceHash">;
  return { ...combined, sourceHash: calculateBackupHash(combined) };
}

test("all 25 ERP modules have spreadsheet and lossless contracts", () => {
  assert.equal(DATA_MODULES.length, 25);
  assert.deepEqual(SCOPE_MODULES.FULL_BUSINESS, DATA_MODULES);
  for (const dataModule of DATA_MODULES) {
    const schema = LOSSLESS_MODULE_SCHEMAS[dataModule];
    assert.ok(schema, `${dataModule} must have a lossless schema`);
    assert.ok(schema.fields.length >= 2, `${dataModule} must expose exact fields`);
  }
  assert.equal((DATA_MODULES as readonly string[]).includes("users"), false);
  assert.equal((DATA_MODULES as readonly string[]).includes("data_transfer_jobs"), false);
});

test("backup scopes remain explicit and operations excludes catalog/content payloads", () => {
  assert.ok(SCOPE_MODULES.OPERATIONS.includes("payments"));
  assert.ok(SCOPE_MODULES.OPERATIONS.includes("tasks"));
  assert.ok(SCOPE_MODULES.OPERATIONS.includes("order_items"));
  assert.equal(SCOPE_MODULES.OPERATIONS.includes("catalog_items"), false);
  assert.deepEqual(SCOPE_MODULES.CONTENT, ["settings", "site_content"]);
  assert.ok(SCOPE_MODULES.CATALOG.includes("catalog_item_collections"));
  assert.ok(SCOPE_MODULES.CATALOG.includes("catalog_item_tags"));
});

test("lossless catalog and collection contracts retain fields omitted by presentation exports", () => {
  const catalogFields = new Set<string>(LOSSLESS_MODULE_SCHEMAS.catalog_items.fields);
  for (const field of ["completenessScore", "contentStatus", "lastReviewedAt", "createdAt", "updatedAt"]) assert.ok(catalogFields.has(field));
  const collectionFields = new Set<string>(LOSSLESS_MODULE_SCHEMAS.collections.fields);
  for (const field of ["description", "descriptionAr", "descriptionEn", "createdAt"]) assert.ok(collectionFields.has(field));
});

test("spreadsheet egress neutralizes formula injection including leading whitespace", () => {
  for (const dangerous of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "  =HYPERLINK(\"x\")", "\t+1"]) {
    assert.equal(neutralizeSpreadsheetText(dangerous), `'${dangerous}`);
  }
  assert.equal(neutralizeSpreadsheetText("HATAB office"), "HATAB office");
  for (const original of ["=1+1", "+201001234567", "-priority", "@handle", "  =formula", "'literal apostrophe", "'=literal"]) {
    assert.equal(decodeNeutralizedSpreadsheetText(neutralizeSpreadsheetText(original)), original);
  }
});

test("numeric parser accepts canonical/grouped grammar and rejects ambiguous commas", () => {
  const canonical = numericReader("1234.50");
  assert.equal(canonical.number("amount"), 1234.5);
  assert.equal(canonical.hasErrors, false);
  const grouped = numericReader("1,234.50");
  assert.equal(grouped.number("amount"), 1234.5);
  assert.equal(grouped.hasErrors, false);
  for (const invalid of ["1,50", "12,34.00", "1 234", "Infinity"]) {
    const reader = numericReader(invalid);
    assert.equal(reader.number("amount"), null);
    assert.equal(reader.hasErrors, true);
  }
});

test("integer and date parsing reject scientific, hexadecimal, and ambiguous locale forms", () => {
  const base = (values: ParsedDataRow["values"]) => new RowReader({ module: "tasks", sheet: "tasks", rowNumber: 2, values });
  for (const invalid of ["1e3", "0x10", "12.5", "+4"]) {
    const reader = base({ quantity: invalid });
    assert.equal(reader.integer("quantity"), null);
    assert.equal(reader.hasErrors, true);
  }
  assert.equal(base({ quantity: "004" }).integer("quantity"), 4);
  assert.equal(base({ due_date: "2026-08-25" }).date("due_date")?.toISOString().slice(0, 10), "2026-08-25");
  for (const invalid of ["08/25/2026", "25-08-2026", "2026-02-30", "2026-08-25T12:30:00"]) {
    const reader = base({ due_date: invalid });
    assert.equal(reader.date("due_date"), null);
    assert.equal(reader.hasErrors, true);
  }
});

test("product asset imports accept supported local and public HTTPS media but reject private sources", () => {
  const reader = (url: string) => new RowReader({
    module: "product_assets",
    sheet: "product_assets",
    rowNumber: 2,
    values: { url },
  });
  for (const valid of [
    "/uploads/catalog/chair.webp",
    "/media/chair-demo.mp4",
    "https://cdn.example.com/catalog/chair.webm",
  ]) {
    const mediaReader = reader(valid);
    assert.equal(mediaReader.productMediaUrl("url"), valid);
    assert.equal(mediaReader.hasErrors, false);
  }
  for (const invalid of [
    "http://cdn.example.com/chair.jpg",
    "https://localhost/chair.jpg",
    "/uploads/catalog/../secret.jpg",
  ]) {
    const mediaReader = reader(invalid);
    assert.equal(mediaReader.productMediaUrl("url"), null);
    assert.equal(mediaReader.hasErrors, true);
  }
});

test("MERGE patch keeps omitted and blank fields and has no v1 clear token", () => {
  const patch = buildPatchData(
    { title: "New title", notes: null, priority: "HIGH", amountPaid: 50 },
    { title: "New title", notes: "", amount_paid: null },
  );
  assert.deepEqual(patch, { title: "New title" });
  assert.equal(Object.hasOwn(patch, "notes"), false);
  assert.equal(Object.hasOwn(patch, "priority"), false);
  assert.equal(Object.hasOwn(patch, "amountPaid"), false);
});

test("portable backup rows never carry database record_id", () => {
  const portable = stripPortableRecordId({ action: "UPSERT", record_id: 91, external_key: "CLIENT-91", name: "Hatab" });
  assert.deepEqual(portable, { action: "UPSERT", external_key: "CLIENT-91", name: "Hatab" });
});

test("backup portability canonicalizes only safe legacy representation differences", () => {
  assert.equal(canonicalPortableJsonObject(null), "{}");
  assert.equal(canonicalPortableJsonObject("null"), "{}");
  assert.equal(canonicalPortableJsonObject(' { "finish": "oak" } '), '{"finish":"oak"}');
  assert.equal(canonicalPortableJsonObject("[]"), "[]");
  assert.equal(canonicalPortableJsonObject("not-json"), "not-json");

  assert.equal(equivalentPortableTrustedValue("mac", "mac ", "name"), true);
  assert.equal(equivalentPortableTrustedValue("inside  spacing", "inside spacing", "name"), false);
  assert.equal(equivalentPortableTrustedValue("{}", "null", "specifications"), true);
  assert.equal(equivalentPortableTrustedValue("{}", null, "specifications"), true);
  assert.equal(equivalentPortableTrustedValue("{}", "[]", "specifications"), false);
  assert.equal(equivalentPortableTrustedValue("READY", "ready", "status"), false);
});

test("backup integrity rejects tampering and wrong schema even with recomputed hash", () => {
  const valid = envelope();
  assert.ok(decodeBackupEnvelope(Buffer.from(JSON.stringify(valid)), 1024 * 1024).envelope);

  const tampered = structuredClone(valid);
  tampered.counts.settings = 99;
  const tamperResult = decodeBackupEnvelope(Buffer.from(JSON.stringify(tampered)), 1024 * 1024);
  assert.equal(tamperResult.envelope, null);
  assert.ok(tamperResult.issues.some((entry) => entry.code === "BACKUP_HASH"));

  const wrongSchema = envelope({ schemaVersion: DATA_TRANSFER_SCHEMA_VERSION + 1 });
  const schemaResult = decodeBackupEnvelope(Buffer.from(JSON.stringify(wrongSchema)), 1024 * 1024);
  assert.equal(schemaResult.envelope, null);
  assert.ok(schemaResult.issues.some((entry) => entry.code === "BACKUP_VERSION"));
});

test("every foreign-key contract targets a declared ERP module", () => {
  const declared = new Set<DataModuleName>(DATA_MODULES);
  for (const dataModule of DATA_MODULES) {
    const schema: LosslessModuleSchema = LOSSLESS_MODULE_SCHEMAS[dataModule];
    for (const relation of schema.foreignKeys ?? []) {
      assert.ok(declared.has(relation.module), `${dataModule}.${relation.field} target is declared`);
    }
  }
});
