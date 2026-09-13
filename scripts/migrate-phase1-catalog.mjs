import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const databasePath = path.resolve(projectRoot, 'dev.db');

if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) {
  throw new Error(`Catalog database not found at ${databasePath}`);
}

const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().some((entry) => entry.name === column);
}

function addColumn(table, definition) {
  const column = definition.trim().split(/\s+/)[0].replaceAll('"', '');
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN ${definition}`);
  }
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string' && entry.trim()) : [];
  } catch {
    return [];
  }
}

function isGenericName(item) {
  const skuPattern = item.sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(Product|منتج)\\s+${skuPattern}$`, 'i').test(item.nameEn.trim())
    || new RegExp(`^(Product|منتج)\\s+${skuPattern}$`, 'i').test(item.nameAr.trim());
}

function imageMetadata(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const result = {
    bytes: buffer.length,
    checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
    mimeType: ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
          : null,
    width: null,
    height: null,
  };

  if (ext === '.png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    result.width = buffer.readUInt32BE(16);
    result.height = buffer.readUInt32BE(20);
  } else if ((ext === '.jpg' || ext === '.jpeg') && buffer.length >= 4) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        result.height = buffer.readUInt16BE(offset + 5);
        result.width = buffer.readUInt16BE(offset + 7);
        break;
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  } else if (ext === '.webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
    const format = buffer.toString('ascii', 12, 16);
    if (format === 'VP8X') {
      result.width = 1 + buffer.readUIntLE(24, 3);
      result.height = 1 + buffer.readUIntLE(27, 3);
    }
  }

  return result;
}

function completenessScore(item, imageCount, reviewedAltCount) {
  let score = 0;
  if (item.sku?.trim()) score += 10;
  if (item.categoryId) score += 10;
  if (item.nameAr?.trim() && item.nameEn?.trim() && !isGenericName(item)) score += 10;

  if (imageCount >= 1) score += 15;
  if (imageCount >= 3) score += 5;
  if (imageCount > 0 && reviewedAltCount === imageCount) score += 5;

  if (item.dimensions?.trim()) score += 5;
  if (item.material?.trim()) score += 5;
  if (item.color?.trim()) score += 4;
  if (item.specifications?.trim() && item.specifications !== '{}') score += 6;

  if (Number(item.sellingPrice) > 0) score += 5;
  if (Number(item.leadTimeDays) > 0) score += 5;
  if (item.supplierId) score += 5;

  if (item.descriptionAr?.trim()) score += 4;
  if (item.descriptionEn?.trim()) score += 3;
  if (!isGenericName(item)) score += 3;
  return Math.min(score, 100);
}

const rootCategories = [
  ['seating', 'الجلوس', 'Seating', 100],
  ['desks-workstations', 'المكاتب ومحطات العمل', 'Desks & Workstations', 110],
  ['tables', 'الطاولات', 'Tables', 120],
  ['storage', 'التخزين', 'Storage', 130],
  ['space-division-acoustics', 'تقسيم المساحات والصوتيات', 'Space Division & Acoustics', 140],
  ['accessories-power', 'الإكسسوارات والطاقة', 'Accessories & Power', 150],
];

const categoryPlans = [
  { old: 'desks', slug: 'operative-desks', ar: 'مكاتب تشغيلية', en: 'Operative Desks', root: 'desks-workstations', aliases: ['operative-desk'], order: 10 },
  { old: 'office-chairs', slug: 'task-ergonomic-seating', ar: 'كراسي عمل وإرجونومك', en: 'Task & Ergonomic Seating', root: 'seating', aliases: ['chairs-mesh'], order: 20 },
  { old: 'partitions', slug: 'partitions-screens', ar: 'قواطع وشاشات', en: 'Partitions & Screens', root: 'space-division-acoustics', aliases: [], order: 30 },
  { old: 'meeting-tables', slug: 'meeting-conference-tables', ar: 'طاولات اجتماعات ومؤتمرات', en: 'Meeting & Conference Tables', root: 'tables', aliases: ['meeting-table'], order: 40 },
  { old: 'storage-units', slug: 'cabinets-storage', ar: 'خزائن ووحدات تخزين', en: 'Cabinets & Storage', root: 'storage', aliases: ['cabinet'], order: 50 },
  { old: 'sofas-reception', slug: 'lounge-sofas', ar: 'كنب ومقاعد استراحة', en: 'Lounge Seating & Sofas', root: 'seating', aliases: ['sofa-set'], order: 60 },
  { old: 'waiting-chairs', slug: 'waiting-beam-seating', ar: 'مقاعد انتظار', en: 'Waiting & Beam Seating', root: 'seating', aliases: ['chairs-waiting-set'], order: 70 },
  { old: 'executive-desks', slug: 'executive-desks', ar: 'مكاتب تنفيذية', en: 'Executive Desks', root: 'desks-workstations', aliases: ['executive-desk'], order: 80 },
  { old: 'office-accessories', slug: 'office-accessories', ar: 'إكسسوارات مكتبية', en: 'Office Accessories', root: 'accessories-power', aliases: [], order: 90 },
  { old: 'shelves-bookcases', slug: 'shelving-bookcases', ar: 'أرفف ومكتبات', en: 'Shelving & Bookcases', root: 'storage', aliases: [], order: 100 },
  { old: 'chairs-conference', slug: 'conference-visitor-seating', ar: 'كراسي اجتماعات وزوار', en: 'Conference & Visitor Seating', root: 'seating', aliases: [], order: 110 },
  { old: 'chairs-counter-chair', slug: 'counter-stools', ar: 'كراسي كاونتر وبار', en: 'Counter Stools', root: 'seating', aliases: [], order: 120 },
  { old: 'counter', slug: 'reception-counters', ar: 'كاونترات استقبال', en: 'Reception Counters', root: 'desks-workstations', aliases: [], order: 130 },
  { old: 'table', slug: 'general-tables', ar: 'طاولات متعددة الاستخدام', en: 'General Tables', root: 'tables', aliases: [], order: 140 },
  { old: 'work-station', slug: 'bench-workstations', ar: 'محطات عمل', en: 'Bench Workstations', root: 'desks-workstations', aliases: [], order: 150 },
];

const tagGroups = [
  { key: 'space', ar: 'المساحة', en: 'Space', order: 10 },
  { key: 'material', ar: 'الخامة', en: 'Material', order: 20 },
  { key: 'color', ar: 'اللون', en: 'Color', order: 30 },
  { key: 'feature', ar: 'الميزة', en: 'Feature', order: 40 },
];

const tags = [
  ['space', 'executive-office', 'مكتب تنفيذي', 'Executive Office', 10],
  ['space', 'open-office', 'مكتب مفتوح', 'Open Office', 20],
  ['space', 'meeting-space', 'مساحة اجتماعات', 'Meeting Space', 30],
  ['space', 'reception', 'استقبال', 'Reception', 40],
  ['space', 'lounge', 'استراحة', 'Lounge', 50],
  ['material', 'wood', 'خشب', 'Wood', 10],
  ['material', 'metal', 'معدن', 'Metal', 20],
  ['material', 'glass', 'زجاج', 'Glass', 30],
  ['material', 'fabric', 'قماش', 'Fabric', 40],
  ['material', 'leather', 'جلد', 'Leather', 50],
  ['material', 'mesh', 'شبك', 'Mesh', 60],
  ['color', 'black', 'أسود', 'Black', 10],
  ['color', 'white', 'أبيض', 'White', 20],
  ['color', 'grey', 'رمادي', 'Grey', 30],
  ['color', 'brown', 'بني', 'Brown', 40],
  ['color', 'beige', 'بيج', 'Beige', 50],
  ['color', 'blue', 'أزرق', 'Blue', 60],
  ['color', 'green', 'أخضر', 'Green', 70],
  ['feature', 'ergonomic', 'إرجونومك', 'Ergonomic', 10],
  ['feature', 'modular', 'مرن التكوين', 'Modular', 20],
  ['feature', 'mobile', 'متحرك', 'Mobile', 30],
  ['feature', 'electrified', 'مزود بالطاقة', 'Electrified', 40],
  ['feature', 'acoustic', 'صوتي', 'Acoustic', 50],
];

const draftCollections = [
  ['SPACE', 'executive-office-suite', 'جناح المكتب التنفيذي', 'Executive Office Suite', 10],
  ['SPACE', 'open-plan-workspace', 'مساحة العمل المفتوحة', 'Open-plan Workspace', 20],
  ['SPACE', 'collaborative-meeting', 'مساحة اجتماع تعاونية', 'Collaborative Meeting', 30],
  ['SPACE', 'reception-welcome', 'الاستقبال والترحيب', 'Reception & Welcome', 40],
  ['STYLE', 'focused-work', 'العمل المركّز', 'Focused Work', 50],
  ['STYLE', 'warm-natural', 'دفء طبيعي', 'Warm Natural', 60],
];

const migrate = db.transaction(() => {
  const hadDisplayOrder = hasColumn('CatalogItem', 'displayOrder');
  addColumn('Category', '"parentId" INTEGER');
  addColumn('CatalogItem', '"familyId" INTEGER');
  addColumn('CatalogItem', '"completenessScore" INTEGER NOT NULL DEFAULT 0');
  addColumn('CatalogItem', '"contentStatus" TEXT NOT NULL DEFAULT \'NEEDS_REVIEW\'');
  addColumn('CatalogItem', '"lastReviewedAt" DATETIME');
  addColumn('CatalogItem', '"displayOrder" INTEGER NOT NULL DEFAULT 0');
  if (!hadDisplayOrder) db.exec('UPDATE "CatalogItem" SET "displayOrder" = "id"');
  addColumn('Collection', '"descriptionAr" TEXT');
  addColumn('Collection', '"descriptionEn" TEXT');
  addColumn('Collection', '"isDraft" BOOLEAN NOT NULL DEFAULT true');
  addColumn('Collection', '"sortOrder" INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS "CategoryRedirect" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "fromSlug" TEXT NOT NULL,
      "categoryId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CategoryRedirect_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CategoryRedirect_fromSlug_key" ON "CategoryRedirect"("fromSlug");
    CREATE INDEX IF NOT EXISTS "CategoryRedirect_categoryId_idx" ON "CategoryRedirect"("categoryId");
    CREATE INDEX IF NOT EXISTS "Category_parentId_idx" ON "Category"("parentId");

    CREATE TABLE IF NOT EXISTS "ProductFamily" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "categoryId" INTEGER NOT NULL,
      "nameAr" TEXT NOT NULL,
      "nameEn" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "sourceKey" TEXT NOT NULL,
      "reviewStatus" TEXT NOT NULL DEFAULT 'CANDIDATE',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "ProductFamily_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ProductFamily_slug_key" ON "ProductFamily"("slug");
    CREATE UNIQUE INDEX IF NOT EXISTS "ProductFamily_sourceKey_key" ON "ProductFamily"("sourceKey");
    CREATE INDEX IF NOT EXISTS "ProductFamily_categoryId_idx" ON "ProductFamily"("categoryId");
    CREATE INDEX IF NOT EXISTS "ProductFamily_reviewStatus_idx" ON "ProductFamily"("reviewStatus");
    CREATE INDEX IF NOT EXISTS "CatalogItem_familyId_idx" ON "CatalogItem"("familyId");
    CREATE INDEX IF NOT EXISTS "CatalogItem_completenessScore_idx" ON "CatalogItem"("completenessScore");
    CREATE INDEX IF NOT EXISTS "CatalogItem_contentStatus_idx" ON "CatalogItem"("contentStatus");
    CREATE INDEX IF NOT EXISTS "CatalogItem_displayOrder_idx" ON "CatalogItem"("displayOrder");

    CREATE TABLE IF NOT EXISTS "ProductAsset" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "catalogItemId" INTEGER,
      "familyId" INTEGER,
      "duplicateOfId" INTEGER,
      "url" TEXT NOT NULL,
      "mimeType" TEXT,
      "width" INTEGER,
      "height" INTEGER,
      "bytes" INTEGER,
      "checksum" TEXT,
      "role" TEXT NOT NULL DEFAULT 'GALLERY',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "altAr" TEXT,
      "altEn" TEXT,
      "reviewStatus" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProductAsset_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProductAsset_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ProductFamily" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ProductAsset_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "ProductAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ProductAsset_catalogItemId_url_key" ON "ProductAsset"("catalogItemId", "url");
    CREATE INDEX IF NOT EXISTS "ProductAsset_familyId_idx" ON "ProductAsset"("familyId");
    CREATE INDEX IF NOT EXISTS "ProductAsset_checksum_idx" ON "ProductAsset"("checksum");
    CREATE INDEX IF NOT EXISTS "ProductAsset_duplicateOfId_idx" ON "ProductAsset"("duplicateOfId");

    CREATE TABLE IF NOT EXISTS "TagGroup" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL,
      "nameAr" TEXT NOT NULL,
      "nameEn" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "TagGroup_key_key" ON "TagGroup"("key");

    CREATE TABLE IF NOT EXISTS "Tag" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "groupId" INTEGER NOT NULL,
      "slug" TEXT NOT NULL,
      "nameAr" TEXT NOT NULL,
      "nameEn" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "Tag_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TagGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Tag_slug_key" ON "Tag"("slug");
    CREATE INDEX IF NOT EXISTS "Tag_groupId_idx" ON "Tag"("groupId");

    CREATE TABLE IF NOT EXISTS "_CatalogItemToTag" (
      "A" INTEGER NOT NULL,
      "B" INTEGER NOT NULL,
      CONSTRAINT "_CatalogItemToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "CatalogItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "_CatalogItemToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "_CatalogItemToTag_AB_unique" ON "_CatalogItemToTag"("A", "B");
    CREATE INDEX IF NOT EXISTS "_CatalogItemToTag_B_index" ON "_CatalogItemToTag"("B");
  `);

  const upsertRoot = db.prepare(`
    INSERT INTO "Category" ("nameAr", "nameEn", "slug", "sortOrder", "isActive", "parentId")
    VALUES (?, ?, ?, ?, 1, NULL)
    ON CONFLICT("slug") DO UPDATE SET
      "nameAr" = excluded."nameAr", "nameEn" = excluded."nameEn",
      "sortOrder" = excluded."sortOrder", "isActive" = 1, "parentId" = NULL
  `);
  for (const [slug, ar, en, order] of rootCategories) upsertRoot.run(ar, en, slug, order);

  const findCategory = db.prepare('SELECT * FROM "Category" WHERE "slug" = ?');
  const updateCanonical = db.prepare(`UPDATE "Category" SET "nameAr" = ?, "nameEn" = ?, "slug" = ?, "parentId" = ?, "sortOrder" = ?, "isActive" = 1 WHERE "id" = ?`);
  const remapItems = db.prepare('UPDATE "CatalogItem" SET "categoryId" = ? WHERE "categoryId" = ?');
  const deactivateAlias = db.prepare('UPDATE "Category" SET "isActive" = 0, "parentId" = ? WHERE "id" = ?');
  const upsertRedirect = db.prepare(`
    INSERT INTO "CategoryRedirect" ("fromSlug", "categoryId") VALUES (?, ?)
    ON CONFLICT("fromSlug") DO UPDATE SET "categoryId" = excluded."categoryId"
  `);

  for (const plan of categoryPlans) {
    const root = findCategory.get(plan.root);
    const canonical = findCategory.get(plan.slug) || findCategory.get(plan.old);
    if (!root || !canonical) continue;

    updateCanonical.run(plan.ar, plan.en, plan.slug, root.id, plan.order, canonical.id);
    if (plan.old !== plan.slug) upsertRedirect.run(plan.old, canonical.id);

    for (const aliasSlug of plan.aliases) {
      const alias = findCategory.get(aliasSlug);
      if (!alias || alias.id === canonical.id) continue;
      remapItems.run(canonical.id, alias.id);
      deactivateAlias.run(root.id, alias.id);
      upsertRedirect.run(aliasSlug, canonical.id);
    }
  }

  const upsertGroup = db.prepare(`
    INSERT INTO "TagGroup" ("key", "nameAr", "nameEn", "sortOrder") VALUES (?, ?, ?, ?)
    ON CONFLICT("key") DO UPDATE SET "nameAr" = excluded."nameAr", "nameEn" = excluded."nameEn", "sortOrder" = excluded."sortOrder"
  `);
  for (const group of tagGroups) upsertGroup.run(group.key, group.ar, group.en, group.order);

  const upsertTag = db.prepare(`
    INSERT INTO "Tag" ("groupId", "slug", "nameAr", "nameEn", "sortOrder") VALUES (?, ?, ?, ?, ?)
    ON CONFLICT("slug") DO UPDATE SET "groupId" = excluded."groupId", "nameAr" = excluded."nameAr", "nameEn" = excluded."nameEn", "sortOrder" = excluded."sortOrder"
  `);
  const findGroup = db.prepare('SELECT "id" FROM "TagGroup" WHERE "key" = ?');
  for (const [groupKey, slug, ar, en, order] of tags) {
    upsertTag.run(findGroup.get(groupKey).id, slug, ar, en, order);
  }

  const upsertCollection = db.prepare(`
    INSERT INTO "Collection" ("type", "nameAr", "nameEn", "slug", "description", "descriptionAr", "descriptionEn", "isDraft", "isActive", "sortOrder")
    VALUES (?, ?, ?, ?, NULL, NULL, NULL, 1, 0, ?)
    ON CONFLICT("slug") DO UPDATE SET
      "type" = excluded."type", "nameAr" = excluded."nameAr", "nameEn" = excluded."nameEn",
      "isDraft" = 1, "isActive" = 0, "sortOrder" = excluded."sortOrder"
  `);
  const findMisboundCollection = db.prepare(`
    SELECT "id" FROM "Collection"
    WHERE "slug" = ? AND "nameAr" = ? AND "nameEn" = ? AND "isDraft" = 1 AND "isActive" = 0
  `);
  const findCollectionBySlug = db.prepare('SELECT "id" FROM "Collection" WHERE "slug" = ?');
  const repairMisboundCollection = db.prepare(`
    UPDATE "Collection"
    SET "type" = ?, "nameAr" = ?, "nameEn" = ?, "slug" = ?, "sortOrder" = ?
    WHERE "id" = ?
  `);
  for (const [type, slug, nameAr, nameEn, sortOrder] of draftCollections) {
    const misbound = findMisboundCollection.get(nameEn, slug, nameAr);
    const canonical = findCollectionBySlug.get(slug);
    if (misbound && !canonical) {
      repairMisboundCollection.run(type, nameAr, nameEn, slug, sortOrder, misbound.id);
    } else {
      upsertCollection.run(type, nameAr, nameEn, slug, sortOrder);
    }
  }

  const items = db.prepare('SELECT * FROM "CatalogItem" ORDER BY "id"').all();
  const upsertFamily = db.prepare(`
    INSERT INTO "ProductFamily" ("categoryId", "nameAr", "nameEn", "slug", "sourceKey", "reviewStatus", "updatedAt")
    VALUES (?, ?, ?, ?, ?, 'CANDIDATE', CURRENT_TIMESTAMP)
    ON CONFLICT("sourceKey") DO UPDATE SET
      "categoryId" = excluded."categoryId", "nameAr" = excluded."nameAr", "nameEn" = excluded."nameEn", "updatedAt" = CURRENT_TIMESTAMP
  `);
  const findFamily = db.prepare('SELECT "id" FROM "ProductFamily" WHERE "sourceKey" = ?');
  const setFamily = db.prepare('UPDATE "CatalogItem" SET "familyId" = ? WHERE "id" = ?');
  const categoryById = db.prepare('SELECT "nameAr", "nameEn" FROM "Category" WHERE "id" = ?');

  for (const item of items) {
    const generated = /^(.*)-(\d{4})$/.exec(item.sku);
    const generic = isGenericName(item);
    const batch = generic && generated ? Math.floor((Number(generated[2]) - 1) / 10) + 1 : null;
    const sourceKey = batch ? `IMPORT:${generated[1]}:${String(batch).padStart(3, '0')}` : `SINGLE:${item.sku}`;
    const familySlug = sourceKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const category = categoryById.get(item.categoryId);
    const suffixAr = batch ? ` — مجموعة مرشحة ${batch}` : ` — مرشح منفرد`;
    const suffixEn = batch ? ` — Candidate Group ${batch}` : ` — Single Candidate`;
    upsertFamily.run(item.categoryId, `${category.nameAr}${suffixAr}`, `${category.nameEn}${suffixEn}`, familySlug, sourceKey);
    setFamily.run(findFamily.get(sourceKey).id, item.id);
  }

  const insertAsset = db.prepare(`
    INSERT INTO "ProductAsset" (
      "catalogItemId", "familyId", "url", "mimeType", "width", "height", "bytes", "checksum", "role", "sortOrder", "reviewStatus"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEEDS_REVIEW')
    ON CONFLICT("catalogItemId", "url") DO UPDATE SET
      "familyId" = excluded."familyId", "mimeType" = excluded."mimeType", "width" = excluded."width",
      "height" = excluded."height", "bytes" = excluded."bytes", "checksum" = excluded."checksum",
      "role" = excluded."role", "sortOrder" = excluded."sortOrder"
  `);
  const assetByItemUrl = db.prepare('SELECT "id", "checksum" FROM "ProductAsset" WHERE "catalogItemId" = ? AND "url" = ?');
  const firstByChecksum = db.prepare('SELECT "id" FROM "ProductAsset" WHERE "checksum" = ? ORDER BY "id" LIMIT 1');
  const setDuplicate = db.prepare('UPDATE "ProductAsset" SET "duplicateOfId" = ? WHERE "id" = ?');

  for (const item of items) {
    const images = safeJsonArray(item.images);
    images.forEach((url, index) => {
      const filePath = path.resolve(projectRoot, 'public', url.replace(/^\/+/, ''));
      const metadata = imageMetadata(filePath);
      insertAsset.run(
        item.id,
        item.familyId || findFamily.get(/^(.*)-(\d{4})$/.test(item.sku) && isGenericName(item)
          ? `IMPORT:${/^(.*)-(\d{4})$/.exec(item.sku)[1]}:${String(Math.floor((Number(/^(.*)-(\d{4})$/.exec(item.sku)[2]) - 1) / 10) + 1).padStart(3, '0')}`
          : `SINGLE:${item.sku}`).id,
        url,
        metadata.mimeType || null,
        metadata.width || null,
        metadata.height || null,
        metadata.bytes || null,
        metadata.checksum || null,
        index === 0 ? 'PRIMARY' : 'GALLERY',
        index,
      );
      const asset = assetByItemUrl.get(item.id, url);
      const canonicalAsset = asset.checksum ? firstByChecksum.get(asset.checksum) : null;
      setDuplicate.run(canonicalAsset?.id === asset.id ? null : canonicalAsset?.id || null, asset.id);
    });
  }

  const tagBySlug = db.prepare('SELECT "id" FROM "Tag" WHERE "slug" = ?');
  const connectTag = db.prepare('INSERT OR IGNORE INTO "_CatalogItemToTag" ("A", "B") VALUES (?, ?)');
  const categoryTags = {
    'executive-desks': ['executive-office'],
    'operative-desks': ['open-office'],
    'bench-workstations': ['open-office', 'modular'],
    'meeting-conference-tables': ['meeting-space'],
    'conference-visitor-seating': ['meeting-space'],
    'reception-counters': ['reception'],
    'waiting-beam-seating': ['reception'],
    'lounge-sofas': ['lounge'],
    'task-ergonomic-seating': ['open-office', 'ergonomic'],
  };
  const itemCategory = db.prepare(`SELECT c."slug" FROM "CatalogItem" i JOIN "Category" c ON c."id" = i."categoryId" WHERE i."id" = ?`);
  for (const item of items) {
    const categorySlug = itemCategory.get(item.id)?.slug;
    for (const tagSlug of categoryTags[categorySlug] || []) {
      const tag = tagBySlug.get(tagSlug);
      if (tag) connectTag.run(item.id, tag.id);
    }

    const haystack = [item.material, item.color, item.nameAr, item.nameEn].filter(Boolean).join(' ').toLowerCase();
    const inferredTags = [
      ['wood', /خشب|wood/], ['metal', /معدن|metal|steel/], ['glass', /زجاج|glass/],
      ['fabric', /قماش|fabric/], ['leather', /جلد|leather/], ['mesh', /شبك|mesh/],
      ['black', /أسود|black/], ['white', /أبيض|white/], ['grey', /رمادي|grey|gray/],
      ['brown', /بني|brown/], ['beige', /بيج|beige/], ['blue', /أزرق|blue/], ['green', /أخضر|green/],
    ];
    for (const [tagSlug, pattern] of inferredTags) {
      if (pattern.test(haystack)) connectTag.run(item.id, tagBySlug.get(tagSlug).id);
    }
  }

  const refreshedItems = db.prepare('SELECT * FROM "CatalogItem" ORDER BY "id"').all();
  const assetsForItem = db.prepare('SELECT "altAr", "altEn", "reviewStatus" FROM "ProductAsset" WHERE "catalogItemId" = ?');
  const setCompleteness = db.prepare('UPDATE "CatalogItem" SET "completenessScore" = ?, "contentStatus" = ? WHERE "id" = ?');
  for (const item of refreshedItems) {
    const assets = assetsForItem.all(item.id);
    const reviewedAltCount = assets.filter((asset) => asset.reviewStatus === 'APPROVED' && asset.altAr && asset.altEn).length;
    const score = completenessScore(item, assets.length, reviewedAltCount);
    const status = !isGenericName(item) && score >= 80 ? 'READY' : 'NEEDS_REVIEW';
    setCompleteness.run(score, status, item.id);
  }
});

try {
  migrate();
  const summary = {
    activeCategories: db.prepare('SELECT COUNT(*) AS count FROM "Category" WHERE "isActive" = 1').get().count,
    redirects: db.prepare('SELECT COUNT(*) AS count FROM "CategoryRedirect"').get().count,
    products: db.prepare('SELECT COUNT(*) AS count FROM "CatalogItem"').get().count,
    candidateFamilies: db.prepare('SELECT COUNT(*) AS count FROM "ProductFamily" WHERE "reviewStatus" = \'CANDIDATE\'').get().count,
    assets: db.prepare('SELECT COUNT(*) AS count FROM "ProductAsset"').get().count,
    duplicateAssets: db.prepare('SELECT COUNT(*) AS count FROM "ProductAsset" WHERE "duplicateOfId" IS NOT NULL').get().count,
    tagGroups: db.prepare('SELECT COUNT(*) AS count FROM "TagGroup"').get().count,
    tags: db.prepare('SELECT COUNT(*) AS count FROM "Tag"').get().count,
    itemTagLinks: db.prepare('SELECT COUNT(*) AS count FROM "_CatalogItemToTag"').get().count,
    draftCollections: db.prepare('SELECT COUNT(*) AS count FROM "Collection" WHERE "isDraft" = 1').get().count,
    averageCompleteness: Math.round(db.prepare('SELECT AVG("completenessScore") AS score FROM "CatalogItem"').get().score || 0),
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  db.close();
}
