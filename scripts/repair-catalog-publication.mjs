import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const databasePath = path.resolve(valueAfter("--database", "dev.db"));
const baselinePath = path.resolve(
  valueAfter("--baseline", "backups/migrations/pre-analytics-2026-08-28T19-16-57-898Z.db"),
);
const backupPath = valueAfter("--backup", null);
const idempotencyKey = valueAfter(
  "--idempotency-key",
  "catalog-publication-recovery-2026-09-01-v1",
);

if (!fs.existsSync(databasePath)) throw new Error(`Database not found: ${databasePath}`);
if (!fs.existsSync(baselinePath)) throw new Error(`Baseline not found: ${baselinePath}`);
if (apply && (!backupPath || !fs.existsSync(path.resolve(backupPath)))) {
  throw new Error("--apply requires an existing --backup database path");
}

const SAFE_LOCAL_MEDIA =
  /^\/(?:uploads\/catalog|images)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:avif|gif|jpe?g|png|webp)$/i;

function parseImages(value, sku) {
  let parsed;
  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    throw new Error(`Invalid images JSON for ${sku}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`Images must be an array for ${sku}`);
  return [...new Set(parsed.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

function publicPathFor(url) {
  return path.join(process.cwd(), "public", ...url.replace(/^\/+/, "").split("/"));
}

function mimeTypeFor(url) {
  const extension = path.extname(url).toLowerCase();
  return {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  }[extension] || "application/octet-stream";
}

function checksumFor(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function altText(item, index) {
  const suffixAr = index === 0 ? "الصورة الرئيسية" : `زاوية ${index + 1}`;
  const suffixEn = index === 0 ? "primary product view" : `product view ${index + 1}`;
  return {
    altAr: `${item.nameAr || item.sku} — ${suffixAr}`,
    altEn: `${item.nameEn || item.sku} — ${suffixEn}`,
  };
}

const db = new Database(databasePath, { readonly: !apply });
const baseline = new Database(baselinePath, { readonly: true });

const items = db
  .prepare(
    `SELECT item.*, category."isActive" AS "categoryIsActive"
     FROM "CatalogItem" item
     JOIN "Category" category ON category."id" = item."categoryId"
     WHERE item."isActive" = 1
     ORDER BY item."id"`,
  )
  .all();
const assets = db.prepare('SELECT * FROM "ProductAsset" ORDER BY "id"').all();
const baselineAssets = baseline.prepare('SELECT * FROM "ProductAsset" ORDER BY "id"').all();

const assetByProductAndUrl = new Map(
  assets.map((asset) => [`${asset.catalogItemId}:${asset.url}`, asset]),
);
const baselineByUrl = new Map();
for (const asset of baselineAssets) {
  if (!baselineByUrl.has(asset.url)) baselineByUrl.set(asset.url, asset);
}

const assetPlans = [];
const itemPlans = [];
const issues = [];

for (const item of items) {
  const urls = parseImages(item.images, item.sku);
  if (!item.categoryIsActive) {
    issues.push({ code: "INACTIVE_CATEGORY", itemId: item.id, sku: item.sku });
    continue;
  }
  if (urls.length === 0) {
    issues.push({ code: "EMPTY_GALLERY", itemId: item.id, sku: item.sku });
    continue;
  }

  let validAssetCount = 0;
  for (const [index, url] of urls.entries()) {
    if (!SAFE_LOCAL_MEDIA.test(url) || url.includes("..") || url.includes("\\")) {
      issues.push({ code: "UNSAFE_URL", itemId: item.id, sku: item.sku, url });
      continue;
    }
    const filePath = publicPathFor(url);
    if (!fs.existsSync(filePath)) {
      issues.push({ code: "MISSING_FILE", itemId: item.id, sku: item.sku, url, filePath });
      continue;
    }

    const existing = assetByProductAndUrl.get(`${item.id}:${url}`) || null;
    const baselineAsset = baselineByUrl.get(url) || null;
    const stats = fs.statSync(filePath);
    const alts = altText(item, index);
    const desired = {
      catalogItemId: item.id,
      familyId: item.familyId,
      duplicateOfId: null,
      url,
      mimeType: existing?.mimeType || baselineAsset?.mimeType || mimeTypeFor(url),
      width: existing?.width ?? baselineAsset?.width ?? null,
      height: existing?.height ?? baselineAsset?.height ?? null,
      bytes: existing?.bytes ?? baselineAsset?.bytes ?? stats.size,
      checksum: existing?.checksum || baselineAsset?.checksum || checksumFor(filePath),
      role: index === 0 ? "PRIMARY" : "GALLERY",
      sortOrder: index,
      ...alts,
      reviewStatus: "APPROVED",
    };

    const changed =
      !existing ||
      Object.entries(desired).some(([key, value]) => (existing[key] ?? null) !== (value ?? null));
    if (changed) assetPlans.push({ kind: existing ? "UPDATE" : "INSERT", existing, desired });
    validAssetCount += 1;
  }

  if (validAssetCount > 0) {
    const desiredStatus = "VERIFIED";
    if (item.contentStatus !== desiredStatus || item.lastReviewedAt == null) {
      itemPlans.push({
        item,
        after: { contentStatus: desiredStatus, lastReviewedAt: new Date().toISOString() },
      });
    }
  }
}

const summary = {
  mode: apply ? "apply" : "dry-run",
  databasePath,
  baselinePath,
  activeItems: items.length,
  assetInserts: assetPlans.filter((plan) => plan.kind === "INSERT").length,
  assetUpdates: assetPlans.filter((plan) => plan.kind === "UPDATE").length,
  itemUpdates: itemPlans.length,
  issues,
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  baseline.close();
  db.close();
  process.exit(issues.length > 0 ? 2 : 0);
}

if (issues.length > 0) {
  throw new Error(`Refusing to apply with ${issues.length} validation issue(s)`);
}

const insertAsset = db.prepare(
  `INSERT INTO "ProductAsset" (
    "externalKey", "catalogItemId", "familyId", "duplicateOfId", "url", "mimeType",
    "width", "height", "bytes", "checksum", "role", "sortOrder", "altAr", "altEn",
    "reviewStatus", "createdAt"
  ) VALUES (
    NULL, @catalogItemId, @familyId, @duplicateOfId, @url, @mimeType,
    @width, @height, @bytes, @checksum, @role, @sortOrder, @altAr, @altEn,
    @reviewStatus, @createdAt
  )`,
);
const updateAsset = db.prepare(
  `UPDATE "ProductAsset" SET
    "catalogItemId" = @catalogItemId,
    "familyId" = @familyId,
    "duplicateOfId" = @duplicateOfId,
    "mimeType" = @mimeType,
    "width" = @width,
    "height" = @height,
    "bytes" = @bytes,
    "checksum" = @checksum,
    "role" = @role,
    "sortOrder" = @sortOrder,
    "altAr" = @altAr,
    "altEn" = @altEn,
    "reviewStatus" = @reviewStatus
  WHERE "id" = @id`,
);
const updateItem = db.prepare(
  `UPDATE "CatalogItem" SET
    "contentStatus" = @contentStatus,
    "lastReviewedAt" = @lastReviewedAt,
    "updatedAt" = @updatedAt
  WHERE "id" = @id`,
);
const insertAudit = db.prepare(
  `INSERT INTO "DataChangeAudit" (
    "jobId", "module", "recordKey", "action", "beforeData", "afterData",
    "actorId", "actorEmail", "createdAt"
  ) VALUES (@jobId, @module, @recordKey, @action, @beforeData, @afterData, NULL, @actorEmail, @createdAt)`,
);

const applyRepair = db.transaction(() => {
  const now = new Date().toISOString();
  const job = db
    .prepare(
      `INSERT INTO "DataTransferJob" (
        "schemaVersion", "kind", "scope", "module", "fileName", "sourceHash",
        "idempotencyKey", "status", "dryRun", "rowCount", "insertedCount",
        "updatedCount", "skippedCount", "errorCount", "errors", "summary",
        "actorId", "actorEmail", "resultName", "startedAt", "createdAt", "completedAt"
      ) VALUES (
        1, 'RESTORE', 'CATALOG', 'catalog_media_publication', @fileName, @sourceHash,
        @idempotencyKey, 'SUCCESS', 0, @rowCount, @insertedCount,
        @updatedCount, @skippedCount, 0, '[]', @summary,
        NULL, @actorEmail, @resultName, @startedAt, @createdAt, @completedAt
      )`,
    )
    .run({
      fileName: path.basename(path.resolve(backupPath)),
      sourceHash: checksumFor(path.resolve(backupPath)),
      idempotencyKey,
      rowCount: items.length,
      insertedCount: summary.assetInserts,
      updatedCount: summary.assetUpdates + summary.itemUpdates,
      skippedCount: items.length - summary.itemUpdates,
      summary: JSON.stringify(summary),
      actorEmail: "codex-local-recovery",
      resultName: "catalog-publication-recovery",
      startedAt: now,
      createdAt: now,
      completedAt: now,
    });
  const jobId = Number(job.lastInsertRowid);

  for (const plan of assetPlans) {
    const beforeData = plan.existing ? JSON.stringify(plan.existing) : null;
    let assetId;
    if (plan.kind === "INSERT") {
      const result = insertAsset.run({ ...plan.desired, createdAt: now });
      assetId = Number(result.lastInsertRowid);
    } else {
      assetId = plan.existing.id;
      updateAsset.run({ id: assetId, ...plan.desired });
    }
    insertAudit.run({
      jobId,
      module: "product_assets",
      recordKey: String(assetId),
      action: plan.kind,
      beforeData,
      afterData: JSON.stringify({ id: assetId, ...plan.desired }),
      actorEmail: "codex-local-recovery",
      createdAt: now,
    });
  }

  for (const plan of itemPlans) {
    const after = { ...plan.after, updatedAt: now };
    updateItem.run({ id: plan.item.id, ...after });
    insertAudit.run({
      jobId,
      module: "catalog_items",
      recordKey: String(plan.item.id),
      action: "UPDATE",
      beforeData: JSON.stringify({
        contentStatus: plan.item.contentStatus,
        lastReviewedAt: plan.item.lastReviewedAt,
        updatedAt: plan.item.updatedAt,
      }),
      afterData: JSON.stringify(after),
      actorEmail: "codex-local-recovery",
      createdAt: now,
    });
  }

  return jobId;
});

const jobId = applyRepair();
console.log(JSON.stringify({ ...summary, jobId }, null, 2));

baseline.close();
db.close();
