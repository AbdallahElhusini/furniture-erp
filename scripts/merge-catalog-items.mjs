import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATABASE_PATH = path.join(PROJECT_ROOT, "dev.db");
const MERGE_MODES = new Set(["exact", "variant"]);
const DEFAULT_ACTOR_EMAIL = "catalog-merge-cli@local";

const REQUIRED_COLUMNS = Object.freeze({
  CatalogItem: [
    "id",
    "categoryId",
    "familyId",
    "supplierId",
    "sku",
    "images",
    "isActive",
    "isFeatured",
    "updatedAt",
  ],
  ProductAsset: [
    "id",
    "catalogItemId",
    "familyId",
    "duplicateOfId",
    "url",
    "role",
    "sortOrder",
  ],
  ProjectItem: ["id", "catalogItemId"],
  QuoteItem: ["id", "catalogItemId"],
  _CatalogItemToTag: ["A", "B"],
  _CatalogItemToCollection: ["A", "B"],
  DataTransferJob: [
    "id",
    "kind",
    "scope",
    "module",
    "fileName",
    "sourceHash",
    "idempotencyKey",
    "status",
    "dryRun",
    "summary",
  ],
  DataChangeAudit: [
    "id",
    "jobId",
    "module",
    "recordKey",
    "action",
    "beforeData",
    "afterData",
  ],
});

const HANDLED_CATALOG_REFERENCES = new Set([
  "ProductAsset.catalogItemId",
  "ProjectItem.catalogItemId",
  "QuoteItem.catalogItemId",
  "_CatalogItemToTag.A",
  "_CatalogItemToCollection.A",
]);

const HELP_TEXT = `Usage:
  node scripts/merge-catalog-items.mjs \\
    --keep <catalog-item-id> \\
    --merge <catalog-item-id> \\
    --mode <exact|variant> \\
    --backup <verified-sqlite-backup> [--apply]

Options:
  --keep            Canonical CatalogItem id that remains active.
  --merge           Source CatalogItem id that is soft-deactivated.
  --mode exact      Hide source media as duplicates of the keeper primary asset.
  --mode variant    Keep unique source media visible as ordered gallery variants.
  --backup          Required, intact SQLite backup containing both products.
  --db              SQLite database to inspect/write (default: project dev.db).
  --actor-email     Audit actor (default: ${DEFAULT_ACTOR_EMAIL}).
  --actor-id        Optional integer actor id for the audit record.
  --apply           Execute one transactional merge. Without this flag: dry-run only.
  --help            Show this help.

Safety:
  Dry-run is the default. The tool rejects inactive sources, different categories,
  missing/invalid backups, unknown CatalogItem foreign keys, and repeated audited
  operations. The source row is preserved but marked inactive after an applied merge.
`;

function fail(message) {
  throw new Error(message);
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function parseArguments(argv) {
  const values = new Map();
  let apply = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      apply = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      fail(`Unexpected argument: ${token}`);
    }

    const separatorIndex = token.indexOf("=");
    const flag = separatorIndex >= 0 ? token.slice(0, separatorIndex) : token;
    const supported = new Set([
      "--keep",
      "--merge",
      "--mode",
      "--backup",
      "--db",
      "--actor-email",
      "--actor-id",
    ]);
    if (!supported.has(flag)) fail(`Unknown option: ${flag}`);
    if (values.has(flag)) fail(`Option may only be supplied once: ${flag}`);

    const inlineValue = separatorIndex >= 0 ? token.slice(separatorIndex + 1) : null;
    const value = inlineValue ?? argv[++index];
    if (value == null || value === "" || value.startsWith("--")) {
      fail(`Missing value for ${flag}`);
    }
    values.set(flag, value);
  }

  if (help) return { help: true };
  for (const required of ["--keep", "--merge", "--mode", "--backup"]) {
    if (!values.has(required)) fail(`Missing required option: ${required}`);
  }

  const keepId = parsePositiveInteger(values.get("--keep"), "--keep");
  const mergeId = parsePositiveInteger(values.get("--merge"), "--merge");
  if (keepId === mergeId) fail("--keep and --merge must identify different products");

  const mode = String(values.get("--mode")).toLowerCase();
  if (!MERGE_MODES.has(mode)) fail("--mode must be either exact or variant");

  const actorEmail = values.get("--actor-email") || DEFAULT_ACTOR_EMAIL;
  if (actorEmail.length > 320) fail("--actor-email is too long");

  return {
    help: false,
    apply,
    keepId,
    mergeId,
    mode,
    backupPath: path.resolve(values.get("--backup")),
    databasePath: path.resolve(values.get("--db") || DEFAULT_DATABASE_PATH),
    actorEmail,
    actorId: values.has("--actor-id")
      ? parsePositiveInteger(values.get("--actor-id"), "--actor-id")
      : null,
  };
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableColumns(database, tableName) {
  return new Set(
    database
      .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
      .all()
      .map((column) => column.name),
  );
}

function assertRequiredSchema(database) {
  for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const actualColumns = tableColumns(database, tableName);
    if (actualColumns.size === 0) fail(`Required table is missing: ${tableName}`);
    const missing = columns.filter((column) => !actualColumns.has(column));
    if (missing.length > 0) {
      fail(`Required columns are missing from ${tableName}: ${missing.join(", ")}`);
    }
  }

  const unknownReferences = [];
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();
  for (const { name } of tables) {
    for (const foreignKey of database
      .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`)
      .all()) {
      if (foreignKey.table !== "CatalogItem") continue;
      const key = `${name}.${foreignKey.from}`;
      if (!HANDLED_CATALOG_REFERENCES.has(key)) unknownReferences.push(key);
    }
  }
  if (unknownReferences.length > 0) {
    fail(
      `CatalogItem has unhandled foreign-key references: ${unknownReferences.join(", ")}`,
    );
  }
}

function assertDatabaseHealth(database, label) {
  const integrity = database.pragma("integrity_check", { simple: true });
  if (String(integrity).toLowerCase() !== "ok") {
    fail(`${label} failed SQLite integrity_check: ${integrity}`);
  }
  const foreignKeyIssues = database.pragma("foreign_key_check");
  if (foreignKeyIssues.length > 0) {
    fail(`${label} has ${foreignKeyIssues.length} foreign-key issue(s)`);
  }
}

function canonicalExistingPath(inputPath, label) {
  const resolvedPath = path.resolve(inputPath);
  if (!fs.existsSync(resolvedPath)) fail(`${label} was not found: ${resolvedPath}`);
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile() || stat.size === 0) fail(`${label} is not a non-empty file: ${resolvedPath}`);
  return fs.realpathSync.native(resolvedPath);
}

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function selectCatalogItem(database, id) {
  return database
    .prepare(
      `SELECT item.*, category."slug" AS "categorySlug",
              category."nameAr" AS "categoryNameAr",
              category."nameEn" AS "categoryNameEn"
       FROM "CatalogItem" item
       JOIN "Category" category ON category."id" = item."categoryId"
       WHERE item."id" = ?`,
    )
    .get(id);
}

function orderedAssets(database, itemId) {
  return database
    .prepare(
      `SELECT * FROM "ProductAsset"
       WHERE "catalogItemId" = ?
       ORDER BY CASE WHEN "role" = 'PRIMARY' THEN 0 ELSE 1 END,
                "sortOrder", "id"`,
    )
    .all(itemId);
}

function readProductGraph(database, itemId) {
  const item = selectCatalogItem(database, itemId);
  if (!item) return null;
  return {
    item,
    assets: orderedAssets(database, itemId),
    projectItems: database
      .prepare(
        `SELECT "id", "projectId", "quantity", "unitCost", "unitPrice", "status"
         FROM "ProjectItem" WHERE "catalogItemId" = ? ORDER BY "id"`,
      )
      .all(itemId),
    quoteItems: database
      .prepare(
        `SELECT "id", "quoteId", "quantity"
         FROM "QuoteItem" WHERE "catalogItemId" = ? ORDER BY "id"`,
      )
      .all(itemId),
    tagIds: database
      .prepare(`SELECT "B" AS "id" FROM "_CatalogItemToTag" WHERE "A" = ? ORDER BY "B"`)
      .all(itemId)
      .map((row) => row.id),
    collectionIds: database
      .prepare(
        `SELECT "B" AS "id" FROM "_CatalogItemToCollection" WHERE "A" = ? ORDER BY "B"`,
      )
      .all(itemId)
      .map((row) => row.id),
  };
}

function parseLegacyImages(value, sku) {
  let parsed;
  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    fail(`CatalogItem ${sku} has malformed legacy images JSON`);
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    fail(`CatalogItem ${sku} legacy images must be a JSON string array`);
  }
  return uniqueStrings(parsed);
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isImageAsset(asset) {
  if (typeof asset.mimeType === "string" && asset.mimeType.toLowerCase().startsWith("image/")) {
    return true;
  }
  try {
    const pathname = asset.url.startsWith("https://")
      ? new URL(asset.url).pathname
      : asset.url;
    return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(pathname);
  } catch {
    return false;
  }
}

function firstVisibleAsset(assets) {
  return [...assets]
    .filter((asset) => asset.duplicateOfId == null)
    .sort(
      (left, right) =>
        (left.role === "PRIMARY" ? 0 : 1) - (right.role === "PRIMARY" ? 0 : 1) ||
        Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
        left.id - right.id,
    )[0];
}

function assetById(database, id, cache) {
  if (cache.has(id)) return cache.get(id);
  const asset = database.prepare(`SELECT * FROM "ProductAsset" WHERE "id" = ?`).get(id);
  if (!asset) fail(`ProductAsset ${id} referenced by duplicateOfId was not found`);
  cache.set(id, asset);
  return asset;
}

function buildAssetPlan(database, keepGraph, sourceGraph, mode) {
  const keepAssets = keepGraph.assets;
  const sourceAssets = sourceGraph.assets;
  const sourceAssetIds = new Set(sourceAssets.map((asset) => asset.id));
  const assetCache = new Map([...keepAssets, ...sourceAssets].map((asset) => [asset.id, asset]));
  const keeperByUrl = new Map(keepAssets.map((asset) => [asset.url, asset]));

  let canonical = firstVisibleAsset(keepAssets);
  let promotedHiddenKeeper = false;
  if (!canonical && keepAssets.length > 0) {
    canonical = [...keepAssets].sort(
      (left, right) =>
        Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || left.id - right.id,
    )[0];
    promotedHiddenKeeper = true;
  }
  let canonicalFromSource = false;
  if (!canonical && sourceAssets.length > 0) {
    canonical = firstVisibleAsset(sourceAssets) || sourceAssets[0];
    canonicalFromSource = true;
  }

  let nextSortOrder =
    keepAssets.reduce((highest, asset) => Math.max(highest, Number(asset.sortOrder || 0)), -1) + 1;
  if (canonicalFromSource && nextSortOrder === 0) nextSortOrder = 1;

  const operations = [];
  for (const asset of sourceAssets) {
    if (canonicalFromSource && asset.id === canonical.id) {
      operations.push({
        id: asset.id,
        url: asset.url,
        action: "move-primary",
        catalogItemId: keepGraph.item.id,
        familyId: keepGraph.item.familyId ?? sourceGraph.item.familyId ?? null,
        duplicateSeed: null,
        duplicateOfId: null,
        role: "PRIMARY",
        sortOrder: 0,
      });
      continue;
    }

    if (keeperByUrl.has(asset.url)) {
      operations.push({
        id: asset.id,
        url: asset.url,
        action: "detach-url-collision",
        catalogItemId: null,
        familyId: keepGraph.item.familyId ?? null,
        duplicateSeed: canonical?.id ?? keeperByUrl.get(asset.url).id,
        duplicateOfId: null,
        role: "GALLERY",
        sortOrder: asset.sortOrder,
      });
      continue;
    }

    const visibleVariant = mode === "variant" && asset.duplicateOfId == null;
    operations.push({
      id: asset.id,
      url: asset.url,
      action: visibleVariant ? "move-visible-variant" : "move-hidden-duplicate",
      catalogItemId: keepGraph.item.id,
      familyId: keepGraph.item.familyId ?? sourceGraph.item.familyId ?? null,
      duplicateSeed: visibleVariant
        ? null
        : mode === "exact"
          ? canonical?.id ?? null
          : asset.duplicateOfId,
      duplicateOfId: null,
      role: "GALLERY",
      sortOrder: nextSortOrder++,
    });
  }

  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  const resolving = new Set();
  function resolveFinalRoot(id) {
    if (id == null) return null;
    if (resolving.has(id)) fail(`ProductAsset duplicate chain contains a cycle at ${id}`);
    resolving.add(id);
    const operation = operationById.get(id);
    let result;
    if (operation) {
      result = operation.duplicateSeed == null
        ? operation.id
        : resolveFinalRoot(operation.duplicateSeed);
    } else {
      const asset = assetById(database, id, assetCache);
      result = asset.duplicateOfId == null ? asset.id : resolveFinalRoot(asset.duplicateOfId);
    }
    resolving.delete(id);
    return result;
  }

  for (const operation of operations) {
    operation.duplicateOfId = operation.duplicateSeed == null
      ? null
      : resolveFinalRoot(operation.duplicateSeed);
    if (operation.duplicateOfId === operation.id) {
      fail(`ProductAsset ${operation.id} would become its own duplicate`);
    }
    delete operation.duplicateSeed;
  }

  const incomingRepoints = [];
  if (sourceAssetIds.size > 0) {
    const placeholders = [...sourceAssetIds].map(() => "?").join(", ");
    const incoming = database
      .prepare(
        `SELECT "id", "duplicateOfId" FROM "ProductAsset"
         WHERE "duplicateOfId" IN (${placeholders})`,
      )
      .all(...sourceAssetIds);
    for (const asset of incoming) {
      if (sourceAssetIds.has(asset.id)) continue;
      const duplicateOfId = resolveFinalRoot(asset.duplicateOfId);
      if (duplicateOfId === asset.id) {
        fail(`Repointing ProductAsset ${asset.id} would create a self-reference`);
      }
      if (duplicateOfId !== asset.duplicateOfId) {
        incomingRepoints.push({ id: asset.id, duplicateOfId });
      }
    }
  }

  const keeperPrimaryUpdate =
    canonical &&
    !canonicalFromSource &&
    (canonical.role !== "PRIMARY" || canonical.duplicateOfId != null)
      ? { id: canonical.id, role: "PRIMARY", duplicateOfId: null }
      : null;

  const visibleAssets = [
    ...keepAssets
      .filter((asset) => asset.duplicateOfId == null || (promotedHiddenKeeper && asset.id === canonical.id))
      .map((asset) => ({
        id: asset.id,
        url: asset.url,
        mimeType: asset.mimeType,
        role: keeperPrimaryUpdate?.id === asset.id ? "PRIMARY" : asset.role,
        sortOrder: asset.sortOrder,
      })),
    ...operations
      .filter(
        (operation) =>
          operation.catalogItemId === keepGraph.item.id && operation.duplicateOfId == null,
      )
      .map((operation) => ({
        id: operation.id,
        url: operation.url,
        mimeType: assetCache.get(operation.id)?.mimeType,
        role: operation.role,
        sortOrder: operation.sortOrder,
      })),
  ].sort(
    (left, right) =>
      (left.role === "PRIMARY" ? 0 : 1) - (right.role === "PRIMARY" ? 0 : 1) ||
      Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      left.id - right.id,
  );

  return {
    canonicalAssetId: canonical?.id ?? null,
    keeperPrimaryUpdate,
    operations,
    incomingRepoints,
    visibleImageUrls: uniqueStrings(
      visibleAssets.filter(isImageAsset).map((asset) => asset.url),
    ),
  };
}

function isBlank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function pickIfBlank(keeperValue, sourceValue) {
  return isBlank(keeperValue) && !isBlank(sourceValue) ? sourceValue : keeperValue;
}

function latestDate(left, right) {
  if (!left) return right ?? null;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function mergeVariantColor(keeperColor, sourceColor) {
  if (isBlank(keeperColor)) return isBlank(sourceColor) ? keeperColor : sourceColor;
  if (isBlank(sourceColor)) return keeperColor;
  if (String(keeperColor).trim().toLowerCase() === String(sourceColor).trim().toLowerCase()) {
    return keeperColor;
  }
  return `${String(keeperColor).trim()} / ${String(sourceColor).trim()}`;
}

function fieldConflicts(keeper, source) {
  const conflicts = [];
  for (const field of [
    "supplierId",
    "dimensions",
    "material",
    "color",
    "specifications",
    "costPrice",
    "sellingPrice",
    "leadTimeDays",
  ]) {
    const left = keeper[field];
    const right = source[field];
    const bothMeaningful = !isBlank(left) && !isBlank(right);
    if (bothMeaningful && String(left).trim() !== String(right).trim()) {
      conflicts.push({ field, keeper: left, source: right });
    }
  }
  return conflicts;
}

function buildKeeperPatch(keeper, source, mode, images) {
  return {
    familyId: keeper.familyId ?? source.familyId ?? null,
    supplierId: keeper.supplierId ?? source.supplierId ?? null,
    descriptionAr: pickIfBlank(keeper.descriptionAr, source.descriptionAr),
    descriptionEn: pickIfBlank(keeper.descriptionEn, source.descriptionEn),
    costPrice:
      Number(keeper.costPrice) === 0 && Number(source.costPrice) !== 0
        ? source.costPrice
        : keeper.costPrice,
    sellingPrice:
      Number(keeper.sellingPrice) === 0 && Number(source.sellingPrice) !== 0
        ? source.sellingPrice
        : keeper.sellingPrice,
    leadTimeDays:
      Number(keeper.leadTimeDays) <= 0 && Number(source.leadTimeDays) > 0
        ? source.leadTimeDays
        : keeper.leadTimeDays,
    dimensions: pickIfBlank(keeper.dimensions, source.dimensions),
    material: pickIfBlank(keeper.material, source.material),
    color:
      mode === "variant"
        ? mergeVariantColor(keeper.color, source.color)
        : pickIfBlank(keeper.color, source.color),
    specifications: pickIfBlank(keeper.specifications, source.specifications),
    images: JSON.stringify(images),
    isActive: 1,
    isFeatured: Number(Boolean(keeper.isFeatured || source.isFeatured)),
    displayOrder: Math.min(Number(keeper.displayOrder), Number(source.displayOrder)),
    completenessScore: Math.max(
      Number(keeper.completenessScore || 0),
      Number(source.completenessScore || 0),
    ),
    lastReviewedAt: latestDate(keeper.lastReviewedAt, source.lastReviewedAt),
  };
}

function verifyBackup(backupPath, databasePath, keeper, source) {
  const canonicalBackupPath = canonicalExistingPath(backupPath, "Backup");
  if (canonicalBackupPath.toLowerCase() === databasePath.toLowerCase()) {
    fail("--backup must not point to the active database");
  }

  const backup = new Database(canonicalBackupPath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    backup.pragma("foreign_keys = ON");
    assertRequiredSchema(backup);
    assertDatabaseHealth(backup, "Backup");
    for (const liveItem of [keeper, source]) {
      const backupItem = selectCatalogItem(backup, liveItem.id);
      if (!backupItem) {
        fail(`Backup does not contain CatalogItem ${liveItem.id} (${liveItem.sku})`);
      }
      if (
        backupItem.sku !== liveItem.sku ||
        Number(backupItem.categoryId) !== Number(liveItem.categoryId)
      ) {
        fail(`Backup identity does not match CatalogItem ${liveItem.id} (${liveItem.sku})`);
      }
    }
  } finally {
    backup.close();
  }
  return {
    path: canonicalBackupPath,
    fileName: path.basename(canonicalBackupPath),
    sha256: fileSha256(canonicalBackupPath),
    bytes: fs.statSync(canonicalBackupPath).size,
  };
}

function buildIdempotencyKey(keepId, mergeId, mode, backupHash) {
  return `catalog-merge:v1:${keepId}:${mergeId}:${mode}:${backupHash}`;
}

function assertMergeable(database, options) {
  const keepGraph = readProductGraph(database, options.keepId);
  const sourceGraph = readProductGraph(database, options.mergeId);
  if (!keepGraph) fail(`Keeper CatalogItem ${options.keepId} was not found`);
  if (!sourceGraph) fail(`Source CatalogItem ${options.mergeId} was not found`);

  if (!Boolean(keepGraph.item.isActive)) {
    fail(`Keeper ${keepGraph.item.sku} (${keepGraph.item.id}) is inactive`);
  }
  if (!Boolean(sourceGraph.item.isActive)) {
    fail(`Source ${sourceGraph.item.sku} (${sourceGraph.item.id}) is already inactive`);
  }
  if (Number(keepGraph.item.categoryId) !== Number(sourceGraph.item.categoryId)) {
    fail(
      `Category mismatch: ${keepGraph.item.sku} is ${keepGraph.item.categorySlug}; ` +
        `${sourceGraph.item.sku} is ${sourceGraph.item.categorySlug}`,
    );
  }

  const backup = verifyBackup(
    options.backupPath,
    options.databasePath,
    keepGraph.item,
    sourceGraph.item,
  );
  const idempotencyKey = buildIdempotencyKey(
    options.keepId,
    options.mergeId,
    options.mode,
    backup.sha256,
  );
  const previousJob = database
    .prepare(`SELECT "id", "status", "createdAt" FROM "DataTransferJob" WHERE "idempotencyKey" = ?`)
    .get(idempotencyKey);
  if (previousJob) {
    fail(
      `This exact merge is already audited as DataTransferJob ${previousJob.id} (${previousJob.status})`,
    );
  }

  const keepLegacyImages = parseLegacyImages(keepGraph.item.images, keepGraph.item.sku);
  const sourceLegacyImages = parseLegacyImages(sourceGraph.item.images, sourceGraph.item.sku);
  const assetPlan = buildAssetPlan(database, keepGraph, sourceGraph, options.mode);
  const nextImages = uniqueStrings([
    ...keepLegacyImages,
    ...(options.mode === "variant" ? sourceLegacyImages : []),
    ...assetPlan.visibleImageUrls,
  ]);
  const keeperPatch = buildKeeperPatch(
    keepGraph.item,
    sourceGraph.item,
    options.mode,
    nextImages,
  );

  const keeperTags = new Set(keepGraph.tagIds);
  const keeperCollections = new Set(keepGraph.collectionIds);
  const tagIdsToAdd = sourceGraph.tagIds.filter((id) => !keeperTags.has(id));
  const collectionIdsToAdd = sourceGraph.collectionIds.filter(
    (id) => !keeperCollections.has(id),
  );

  return {
    keepGraph,
    sourceGraph,
    backup,
    idempotencyKey,
    assetPlan,
    nextImages,
    keeperPatch,
    tagIdsToAdd,
    collectionIdsToAdd,
    conflicts: fieldConflicts(keepGraph.item, sourceGraph.item),
  };
}

function publicAssetOperation(operation) {
  return {
    id: operation.id,
    url: operation.url,
    action: operation.action,
    catalogItemId: operation.catalogItemId,
    duplicateOfId: operation.duplicateOfId,
    role: operation.role,
    sortOrder: operation.sortOrder,
  };
}

function publicPlan(options, plan) {
  return {
    dryRun: !options.apply,
    mode: options.mode,
    database: options.databasePath,
    backup: {
      fileName: plan.backup.fileName,
      sha256: plan.backup.sha256,
      bytes: plan.backup.bytes,
    },
    keeper: {
      id: plan.keepGraph.item.id,
      sku: plan.keepGraph.item.sku,
      category: plan.keepGraph.item.categorySlug,
      active: Boolean(plan.keepGraph.item.isActive),
    },
    source: {
      id: plan.sourceGraph.item.id,
      sku: plan.sourceGraph.item.sku,
      category: plan.sourceGraph.item.categorySlug,
      active: Boolean(plan.sourceGraph.item.isActive),
    },
    changes: {
      projectItemReferences: plan.sourceGraph.projectItems.length,
      quoteItemReferences: plan.sourceGraph.quoteItems.length,
      tagLinksToAdd: plan.tagIdsToAdd,
      collectionLinksToAdd: plan.collectionIdsToAdd,
      assets: plan.assetPlan.operations.map(publicAssetOperation),
      incomingDuplicateReferences: plan.assetPlan.incomingRepoints,
      nextLegacyImages: plan.nextImages,
      sourceWillBeSoftDeactivated: true,
    },
    fieldConflicts: plan.conflicts,
    idempotencyKey: plan.idempotencyKey,
  };
}

function updateKeeper(database, id, patch, updatedAt) {
  return database
    .prepare(
      `UPDATE "CatalogItem" SET
         "familyId" = @familyId,
         "supplierId" = @supplierId,
         "descriptionAr" = @descriptionAr,
         "descriptionEn" = @descriptionEn,
         "costPrice" = @costPrice,
         "sellingPrice" = @sellingPrice,
         "leadTimeDays" = @leadTimeDays,
         "dimensions" = @dimensions,
         "material" = @material,
         "color" = @color,
         "specifications" = @specifications,
         "images" = @images,
         "isActive" = @isActive,
         "isFeatured" = @isFeatured,
         "displayOrder" = @displayOrder,
         "completenessScore" = @completenessScore,
         "lastReviewedAt" = @lastReviewedAt,
         "updatedAt" = @updatedAt
       WHERE "id" = @id`,
    )
    .run({ id, ...patch, updatedAt }).changes;
}

function applyAssetPlan(database, plan) {
  let updated = 0;
  if (plan.keeperPrimaryUpdate) {
    updated += database
      .prepare(
        `UPDATE "ProductAsset"
         SET "role" = 'PRIMARY', "duplicateOfId" = NULL
         WHERE "id" = ?`,
      )
      .run(plan.keeperPrimaryUpdate.id).changes;
  }

  const updateAsset = database.prepare(
    `UPDATE "ProductAsset" SET
       "catalogItemId" = @catalogItemId,
       "familyId" = @familyId,
       "duplicateOfId" = @duplicateOfId,
       "role" = @role,
       "sortOrder" = @sortOrder
     WHERE "id" = @id`,
  );
  for (const operation of plan.operations) {
    updated += updateAsset.run(operation).changes;
  }
  const repoint = database.prepare(
    `UPDATE "ProductAsset" SET "duplicateOfId" = @duplicateOfId WHERE "id" = @id`,
  );
  for (const incoming of plan.incomingRepoints) {
    updated += repoint.run(incoming).changes;
  }
  return updated;
}

function assertAppliedState(database, options, plan) {
  const keeper = selectCatalogItem(database, options.keepId);
  const source = selectCatalogItem(database, options.mergeId);
  if (!keeper || !Boolean(keeper.isActive)) fail("Post-merge verification: keeper is not active");
  if (!source || Boolean(source.isActive) || Boolean(source.isFeatured)) {
    fail("Post-merge verification: source was not safely deactivated");
  }

  for (const table of ["ProjectItem", "QuoteItem"]) {
    const count = database
      .prepare(`SELECT COUNT(*) AS "count" FROM ${quoteIdentifier(table)} WHERE "catalogItemId" = ?`)
      .get(options.mergeId).count;
    if (count !== 0) fail(`Post-merge verification: ${table} still references the source`);
  }
  for (const table of ["_CatalogItemToTag", "_CatalogItemToCollection"]) {
    const count = database
      .prepare(`SELECT COUNT(*) AS "count" FROM ${quoteIdentifier(table)} WHERE "A" = ?`)
      .get(options.mergeId).count;
    if (count !== 0) fail(`Post-merge verification: ${table} still references the source`);
  }
  const sourceAssetCount = database
    .prepare(`SELECT COUNT(*) AS "count" FROM "ProductAsset" WHERE "catalogItemId" = ?`)
    .get(options.mergeId).count;
  if (sourceAssetCount !== 0) {
    fail("Post-merge verification: ProductAsset rows still reference the source");
  }

  if (plan.assetPlan.keeperPrimaryUpdate) {
    const primary = database
      .prepare(`SELECT "role", "duplicateOfId" FROM "ProductAsset" WHERE "id" = ?`)
      .get(plan.assetPlan.keeperPrimaryUpdate.id);
    if (!primary || primary.role !== "PRIMARY" || primary.duplicateOfId != null) {
      fail("Post-merge verification: canonical keeper asset was not promoted safely");
    }
  }

  for (const operation of plan.assetPlan.operations) {
    const actual = database
      .prepare(
        `SELECT "catalogItemId", "duplicateOfId", "role", "sortOrder"
         FROM "ProductAsset" WHERE "id" = ?`,
      )
      .get(operation.id);
    if (
      !actual ||
      actual.catalogItemId !== operation.catalogItemId ||
      actual.duplicateOfId !== operation.duplicateOfId ||
      actual.role !== operation.role ||
      Number(actual.sortOrder) !== Number(operation.sortOrder)
    ) {
      fail(`Post-merge verification failed for ProductAsset ${operation.id}`);
    }
    if (actual.duplicateOfId != null) {
      const root = database
        .prepare(`SELECT "duplicateOfId" FROM "ProductAsset" WHERE "id" = ?`)
        .get(actual.duplicateOfId);
      if (!root || root.duplicateOfId != null) {
        fail(`Post-merge verification found a duplicate chain at ProductAsset ${operation.id}`);
      }
    }
  }

  if (keeper.images !== JSON.stringify(plan.nextImages)) {
    fail("Post-merge verification: keeper legacy images do not match the plan");
  }
  const foreignKeyIssues = database.pragma("foreign_key_check");
  if (foreignKeyIssues.length > 0) {
    fail(`Post-merge verification found ${foreignKeyIssues.length} foreign-key issue(s)`);
  }
}

export function executeCatalogMerge(rawOptions) {
  const options = {
    ...rawOptions,
    databasePath: canonicalExistingPath(rawOptions.databasePath, "Database"),
    backupPath: path.resolve(rawOptions.backupPath),
  };
  const database = new Database(options.databasePath, {
    readonly: !options.apply,
    fileMustExist: true,
  });
  database.pragma("busy_timeout = 5000");
  database.pragma("foreign_keys = ON");

  try {
    assertRequiredSchema(database);
    assertDatabaseHealth(database, "Database");
    const initialPlan = assertMergeable(database, options);
    if (!options.apply) return publicPlan(options, initialPlan);

    const apply = database.transaction(() => {
      const plan = assertMergeable(database, options);
      const beforeData = {
        keeper: plan.keepGraph,
        source: plan.sourceGraph,
      };
      const now = new Date().toISOString();

      const projectReferences = database
        .prepare(`UPDATE "ProjectItem" SET "catalogItemId" = ? WHERE "catalogItemId" = ?`)
        .run(options.keepId, options.mergeId).changes;
      const quoteReferences = database
        .prepare(`UPDATE "QuoteItem" SET "catalogItemId" = ? WHERE "catalogItemId" = ?`)
        .run(options.keepId, options.mergeId).changes;

      const connectTag = database.prepare(
        `INSERT OR IGNORE INTO "_CatalogItemToTag" ("A", "B") VALUES (?, ?)`,
      );
      let tagLinksAdded = 0;
      for (const tagId of plan.sourceGraph.tagIds) {
        tagLinksAdded += connectTag.run(options.keepId, tagId).changes;
      }
      const sourceTagLinksRemoved = database
        .prepare(`DELETE FROM "_CatalogItemToTag" WHERE "A" = ?`)
        .run(options.mergeId).changes;

      const connectCollection = database.prepare(
        `INSERT OR IGNORE INTO "_CatalogItemToCollection" ("A", "B") VALUES (?, ?)`,
      );
      let collectionLinksAdded = 0;
      for (const collectionId of plan.sourceGraph.collectionIds) {
        collectionLinksAdded += connectCollection.run(options.keepId, collectionId).changes;
      }
      const sourceCollectionLinksRemoved = database
        .prepare(`DELETE FROM "_CatalogItemToCollection" WHERE "A" = ?`)
        .run(options.mergeId).changes;

      const assetRowsUpdated = applyAssetPlan(database, plan.assetPlan);
      const keeperRowsUpdated = updateKeeper(
        database,
        options.keepId,
        plan.keeperPatch,
        now,
      );
      const sourceRowsUpdated = database
        .prepare(
          `UPDATE "CatalogItem"
           SET "isActive" = 0, "isFeatured" = 0, "updatedAt" = ?
           WHERE "id" = ?`,
        )
        .run(now, options.mergeId).changes;

      assertAppliedState(database, options, plan);

      const counts = {
        projectReferences,
        quoteReferences,
        tagLinksAdded,
        sourceTagLinksRemoved,
        collectionLinksAdded,
        sourceCollectionLinksRemoved,
        assetRowsUpdated,
        keeperRowsUpdated,
        sourceRowsUpdated,
      };
      const updatedCount = Object.values(counts).reduce((total, count) => total + count, 0);
      const skippedCount =
        plan.sourceGraph.tagIds.length - tagLinksAdded +
        plan.sourceGraph.collectionIds.length - collectionLinksAdded +
        plan.assetPlan.operations.filter(
          (operation) => operation.action === "detach-url-collision",
        ).length;
      const summary = {
        operation: "catalog-product-merge",
        mode: options.mode,
        keeper: { id: options.keepId, sku: plan.keepGraph.item.sku },
        source: { id: options.mergeId, sku: plan.sourceGraph.item.sku },
        backup: {
          fileName: plan.backup.fileName,
          sha256: plan.backup.sha256,
          bytes: plan.backup.bytes,
        },
        counts,
        fieldConflicts: plan.conflicts,
        assetOperations: plan.assetPlan.operations.map(publicAssetOperation),
      };
      const job = database
        .prepare(
          `INSERT INTO "DataTransferJob" (
             "schemaVersion", "kind", "scope", "module", "fileName", "sourceHash",
             "idempotencyKey", "status", "dryRun", "rowCount", "insertedCount",
             "updatedCount", "skippedCount", "errorCount", "errors", "summary",
             "actorId", "actorEmail", "resultName", "startedAt", "createdAt", "completedAt"
           ) VALUES (
             1, 'MERGE', 'CATALOG', 'CatalogItem', @fileName, @sourceHash,
             @idempotencyKey, 'SUCCESS', 0, 2, 0,
             @updatedCount, @skippedCount, 0, '[]', @summary,
             @actorId, @actorEmail, @resultName, @now, @now, @now
           ) RETURNING "id"`,
        )
        .get({
          fileName: plan.backup.fileName,
          sourceHash: plan.backup.sha256,
          idempotencyKey: plan.idempotencyKey,
          updatedCount,
          skippedCount,
          summary: JSON.stringify(summary),
          actorId: options.actorId,
          actorEmail: options.actorEmail,
          resultName: `${plan.sourceGraph.item.sku}->${plan.keepGraph.item.sku}`,
          now,
        });

      const afterData = {
        keeper: readProductGraph(database, options.keepId),
        source: readProductGraph(database, options.mergeId),
        detachedAssetIds: plan.assetPlan.operations
          .filter((operation) => operation.catalogItemId == null)
          .map((operation) => operation.id),
        counts,
      };
      database
        .prepare(
          `INSERT INTO "DataChangeAudit" (
             "jobId", "module", "recordKey", "action", "beforeData", "afterData",
             "actorId", "actorEmail", "createdAt"
           ) VALUES (?, 'CatalogItemMerge', ?, 'UPDATE', ?, ?, ?, ?, ?)`,
        )
        .run(
          job.id,
          `${plan.sourceGraph.item.sku}->${plan.keepGraph.item.sku}`,
          JSON.stringify(beforeData),
          JSON.stringify(afterData),
          options.actorId,
          options.actorEmail,
          now,
        );

      return {
        ...publicPlan(options, plan),
        dryRun: false,
        jobId: job.id,
        counts,
      };
    });

    return apply.immediate();
  } finally {
    database.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }
  const result = executeCatalogMerge(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!options.apply) {
    process.stdout.write("Dry run only. Re-run the reviewed command with --apply to commit.\n");
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown catalog merge error";
    process.stderr.write(`Catalog merge failed: ${message}\n`);
    process.exitCode = 1;
  });
}
