import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const currentPath = path.resolve("dev.db");
const baselinePath = path.resolve(
  process.argv[2] || "backups/migrations/pre-analytics-2026-08-28T19-16-57-898Z.db",
);

function parseImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
  } catch {
    return [];
  }
}

function publicPathFor(url) {
  return path.join(process.cwd(), "public", ...url.replace(/^\/+/, "").split("/"));
}

const current = new Database(currentPath, { readonly: true });
const baseline = new Database(baselinePath, { readonly: true });

const currentItems = current
  .prepare('SELECT "id", "sku", "nameAr", "nameEn", "images", "isActive", "contentStatus" FROM "CatalogItem" ORDER BY "id"')
  .all()
  .map((item) => ({ ...item, imageList: parseImages(item.images) }));
const baselineItems = baseline
  .prepare('SELECT "id", "sku", "nameAr", "nameEn", "images", "isActive", "contentStatus" FROM "CatalogItem" ORDER BY "id"')
  .all()
  .map((item) => ({ ...item, imageList: parseImages(item.images) }));
const currentAssets = current
  .prepare('SELECT "id", "catalogItemId", "url", "role", "sortOrder", "reviewStatus", "duplicateOfId" FROM "ProductAsset" ORDER BY "id"')
  .all();

const currentById = new Map(currentItems.map((item) => [item.id, item]));
const currentByUrl = new Map();
for (const item of currentItems) {
  for (const url of item.imageList) {
    const owners = currentByUrl.get(url) || [];
    owners.push(item.id);
    currentByUrl.set(url, owners);
  }
}

const missingItems = baselineItems
  .filter((item) => !currentById.has(item.id))
  .map((item) => {
    const ownerScores = new Map();
    for (const url of item.imageList) {
      for (const ownerId of currentByUrl.get(url) || []) {
        ownerScores.set(ownerId, (ownerScores.get(ownerId) || 0) + 1);
      }
    }
    const candidateOwners = [...ownerScores.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([id, overlap]) => ({
        id,
        sku: currentById.get(id)?.sku,
        active: Boolean(currentById.get(id)?.isActive),
        overlap,
        sourceImageCount: item.imageList.length,
      }));
    return {
      id: item.id,
      sku: item.sku,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      images: item.imageList,
      candidateOwners,
      fullyPreservedIn: candidateOwners
        .filter((owner) => owner.overlap === item.imageList.length && item.imageList.length > 0)
        .map((owner) => owner.id),
    };
  });

const assetsByProductAndUrl = new Map(
  currentAssets.map((asset) => [`${asset.catalogItemId}:${asset.url}`, asset]),
);
const missingAssetRefs = [];
const missingFiles = [];
const malformedImageJson = [];
for (const item of currentItems) {
  let parsed;
  try {
    parsed = JSON.parse(item.images || "[]");
    if (!Array.isArray(parsed)) malformedImageJson.push({ id: item.id, sku: item.sku, reason: "not-array" });
  } catch {
    malformedImageJson.push({ id: item.id, sku: item.sku, reason: "invalid-json" });
  }
  for (const [index, url] of item.imageList.entries()) {
    if (!assetsByProductAndUrl.has(`${item.id}:${url}`)) {
      missingAssetRefs.push({ id: item.id, sku: item.sku, active: Boolean(item.isActive), index, url });
    }
    const diskPath = publicPathFor(url);
    if (!fs.existsSync(diskPath)) {
      missingFiles.push({ id: item.id, sku: item.sku, active: Boolean(item.isActive), url, diskPath });
    }
  }
}

const legacyUrlSets = new Map(currentItems.map((item) => [item.id, new Set(item.imageList)]));
const orphanedAssetLinks = currentAssets.filter(
  (asset) => asset.catalogItemId != null && !legacyUrlSets.get(asset.catalogItemId)?.has(asset.url),
);

const tableCount = (db, table) =>
  db.prepare(`SELECT COUNT(*) AS total FROM "${table}"`).get().total;

const report = {
  generatedAt: new Date().toISOString(),
  currentPath,
  baselinePath,
  integrity: current.pragma("integrity_check"),
  counts: {
    currentCatalogItems: currentItems.length,
    baselineCatalogItems: baselineItems.length,
    currentActiveItems: currentItems.filter((item) => item.isActive).length,
    currentVerifiedItems: currentItems.filter((item) => item.isActive && item.contentStatus === "VERIFIED").length,
    currentAssets: currentAssets.length,
    currentApprovedAssets: currentAssets.filter((asset) => asset.reviewStatus === "APPROVED").length,
    missingCatalogItems: missingItems.length,
    missingItemsFullyPreserved: missingItems.filter((item) => item.fullyPreservedIn.length > 0).length,
    missingAssetRefs: missingAssetRefs.length,
    activeMissingAssetRefs: missingAssetRefs.filter((item) => item.active).length,
    missingFiles: missingFiles.length,
    activeMissingFiles: missingFiles.filter((item) => item.active).length,
    orphanedAssetLinks: orphanedAssetLinks.length,
    malformedImageJson: malformedImageJson.length,
    currentProjectItems: tableCount(current, "ProjectItem"),
    baselineProjectItems: tableCount(baseline, "ProjectItem"),
    currentQuoteItems: tableCount(current, "QuoteItem"),
    baselineQuoteItems: tableCount(baseline, "QuoteItem"),
  },
  missingCatalogItems: missingItems,
  missingAssetRefs,
  missingFiles,
  orphanedAssetLinks,
  malformedImageJson,
};

const outputPath = path.resolve("artifacts/site-recovery-audit.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, counts: report.counts }, null, 2));

current.close();
baseline.close();
