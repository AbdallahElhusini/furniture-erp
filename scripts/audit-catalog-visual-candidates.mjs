import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import sharp from "sharp";

const root = process.cwd();
const database = new Database(path.join(root, "dev.db"), { readonly: true });

function parseLegacyImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function publicFile(url) {
  if (!url || !url.startsWith("/") || url.startsWith("//")) return null;
  const candidate = path.resolve(root, "public", url.slice(1));
  const publicRoot = path.resolve(root, "public");
  return candidate.startsWith(`${publicRoot}${path.sep}`) ? candidate : null;
}

function bytesToHex(bits) {
  const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
  bits.forEach((bit, index) => {
    if (bit) bytes[Math.floor(index / 8)] |= 1 << (7 - (index % 8));
  });
  return bytes.toString("hex");
}

async function fingerprint(file) {
  const image = sharp(file, { failOn: "none" });
  const metadata = await image.metadata();
  const pixels = await image
    .clone()
    .flatten({ background: "#ffffff" })
    .resize(17, 16, { fit: "fill" })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer();
  const bits = [];
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const offset = row * 17 + column;
      bits.push(pixels[offset] > pixels[offset + 1]);
    }
  }
  return {
    hash: bytesToHex(bits),
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

function hamming(left, right) {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (value) {
      distance += value & 1;
      value >>>= 1;
    }
  }
  return distance;
}

const rows = database.prepare(`
  SELECT
    item.id,
    item.sku,
    item.nameAr,
    item.nameEn,
    item.images,
    item.familyId,
    category.slug AS category,
    asset.url AS assetUrl,
    asset.role AS assetRole,
    asset.sortOrder AS assetSortOrder
  FROM CatalogItem item
  JOIN Category category ON category.id = item.categoryId
  LEFT JOIN ProductAsset asset ON asset.catalogItemId = item.id
    AND asset.duplicateOfId IS NULL
  WHERE item.isActive = 1
  ORDER BY item.id,
    CASE asset.role WHEN 'PRIMARY' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END,
    asset.sortOrder,
    asset.id
`).all();
database.close();

const itemsById = new Map();
for (const row of rows) {
  const current = itemsById.get(row.id) ?? {
    id: row.id,
    sku: row.sku,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    category: row.category,
    familyId: row.familyId,
    urls: [],
  };
  if (row.assetUrl && !current.urls.includes(row.assetUrl)) current.urls.push(row.assetUrl);
  if (current.urls.length === 0) {
    for (const url of parseLegacyImages(row.images)) {
      if (!current.urls.includes(url)) current.urls.push(url);
    }
  }
  itemsById.set(row.id, current);
}

const fingerprints = [];
const unavailable = [];
for (const item of itemsById.values()) {
  const url = item.urls[0] ?? null;
  const file = publicFile(url);
  if (!file || !fs.existsSync(file)) {
    unavailable.push({ id: item.id, sku: item.sku, category: item.category, url });
    continue;
  }
  try {
    fingerprints.push({ ...item, url, ...(await fingerprint(file)) });
  } catch (error) {
    unavailable.push({ id: item.id, sku: item.sku, category: item.category, url, error: String(error) });
  }
}

const candidates = [];
for (let leftIndex = 0; leftIndex < fingerprints.length; leftIndex += 1) {
  const left = fingerprints[leftIndex];
  for (let rightIndex = leftIndex + 1; rightIndex < fingerprints.length; rightIndex += 1) {
    const right = fingerprints[rightIndex];
    if (left.category !== right.category) continue;
    const distance = hamming(left.hash, right.hash);
    const sameFamily = left.familyId != null && left.familyId === right.familyId;
    const adjacentImport = Math.abs(left.id - right.id) <= 3;
    if (distance > 62 && !(sameFamily && adjacentImport && distance <= 78)) continue;
    candidates.push({
      distance,
      sameFamily,
      adjacentImport,
      left: {
        id: left.id,
        sku: left.sku,
        nameAr: left.nameAr,
        nameEn: left.nameEn,
        category: left.category,
        familyId: left.familyId,
        url: left.url,
        dimensions: [left.width, left.height],
      },
      right: {
        id: right.id,
        sku: right.sku,
        nameAr: right.nameAr,
        nameEn: right.nameEn,
        category: right.category,
        familyId: right.familyId,
        url: right.url,
        dimensions: [right.width, right.height],
      },
    });
  }
}

candidates.sort((a, b) =>
  a.distance - b.distance ||
  Number(b.sameFamily) - Number(a.sameFamily) ||
  a.left.id - b.left.id ||
  a.right.id - b.right.id,
);

const report = {
  generatedAt: new Date().toISOString(),
  method: "256-bit grayscale difference hash; review queue only, never an automatic merge decision",
  counts: {
    activeItems: itemsById.size,
    fingerprinted: fingerprints.length,
    unavailable: unavailable.length,
    candidatePairs: candidates.length,
  },
  unavailable,
  candidates,
};

const outputPath = process.env.CATALOG_AUDIT_OUTPUT?.trim();
if (outputPath) {
  const absoluteOutput = path.resolve(root, outputPath);
  if (!absoluteOutput.startsWith(`${root}${path.sep}`)) {
    throw new Error("CATALOG_AUDIT_OUTPUT must remain inside the project workspace");
  }
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

const outputLimit = Number.parseInt(process.env.CATALOG_AUDIT_LIMIT ?? "0", 10);
console.log(JSON.stringify({
  ...report,
  candidates: outputLimit > 0 ? candidates.slice(0, outputLimit) : candidates,
  outputPath: outputPath ? path.resolve(root, outputPath) : null,
}, null, 2));
