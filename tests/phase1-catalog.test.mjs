import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(testDir, '..', 'dev.db');

function openDatabase() {
  return new Database(databasePath, { readonly: true });
}

test('phase 1 preserves the reviewed catalog and assigns every item to a candidate family', () => {
  const db = openDatabase();
  try {
    assert.ok(db.prepare('SELECT COUNT(*) AS count FROM "CatalogItem" WHERE "isActive" = 1').get().count >= 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "CatalogItem" WHERE "isActive" = 1 AND "familyId" IS NULL').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "CatalogItem" WHERE "completenessScore" < 0 OR "completenessScore" > 100').get().count, 0);
    assert.equal(
      db.prepare(`SELECT COUNT(*) AS count FROM "CatalogItem" WHERE "isActive" = 1 AND "contentStatus" = 'VERIFIED' AND (trim("nameAr") = '' OR trim("nameEn") = '')`).get().count,
      0,
    );
  } finally {
    db.close();
  }
});

test('catalog products expose a stable indexed storefront display order', () => {
  const db = openDatabase();
  try {
    const columns = db.prepare('PRAGMA table_info("CatalogItem")').all();
    assert.ok(columns.some((column) => column.name === 'displayOrder' && column.notnull === 1));
    const indexes = db.prepare('PRAGMA index_list("CatalogItem")').all();
    assert.ok(indexes.some((index) => index.name === 'CatalogItem_displayOrder_idx'));
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM "CatalogItem" WHERE "displayOrder" < 0').get().count,
      0,
    );
  } finally {
    db.close();
  }
});

test('canonical taxonomy contains roots, populated leaves, and valid legacy redirects', () => {
  const db = openDatabase();
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "Category" WHERE "isActive" = 1 AND "parentId" IS NULL').get().count, 6);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "Category" WHERE "isActive" = 1 AND "parentId" IS NOT NULL').get().count, 15);
    assert.equal(db.prepare(`
      SELECT COUNT(*) AS count
      FROM "CategoryRedirect" r
      LEFT JOIN "Category" c ON c."id" = r."categoryId"
      WHERE c."id" IS NULL OR c."isActive" != 1
    `).get().count, 0);
    assert.equal(db.prepare(`
      SELECT COUNT(*) AS count
      FROM "CatalogItem" i
      JOIN "Category" c ON c."id" = i."categoryId"
      WHERE c."isActive" != 1 OR c."parentId" IS NULL
    `).get().count, 0);
  } finally {
    db.close();
  }
});

test('every active storefront image has one approved structured asset and duplicate links stay acyclic', () => {
  const db = openDatabase();
  try {
    const items = db.prepare('SELECT "id", "images" FROM "CatalogItem" WHERE "isActive" = 1').all();
    const approvedAsset = db.prepare(`
      SELECT COUNT(*) AS count
      FROM "ProductAsset"
      WHERE "catalogItemId" = ? AND "url" = ?
        AND "reviewStatus" = 'APPROVED' AND "duplicateOfId" IS NULL
    `);
    for (const item of items) {
      try {
        const parsed = JSON.parse(item.images || '[]');
        for (const image of Array.isArray(parsed) ? parsed : []) {
          if (typeof image !== 'string' || !image.trim()) continue;
          assert.equal(
            approvedAsset.get(item.id, image.trim()).count,
            1,
            `active catalog item ${item.id} is missing an approved asset for ${image}`,
          );
        }
      } catch {
        assert.fail(`active catalog item ${item.id} has malformed image JSON`);
      }
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "ProductAsset" WHERE "duplicateOfId" = "id"').get().count, 0);
    assert.equal(db.prepare(`
      SELECT COUNT(*) AS count
      FROM "ProductAsset" duplicate
      JOIN "ProductAsset" original ON original."id" = duplicate."duplicateOfId"
      WHERE original."duplicateOfId" IS NOT NULL OR original."id" > duplicate."id"
    `).get().count, 0);
  } finally {
    db.close();
  }
});

test('controlled vocabulary and unpublished collection drafts are seeded safely', () => {
  const db = openDatabase();
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "TagGroup"').get().count, 4);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "Tag"').get().count, 23);
    assert.ok(db.prepare('SELECT COUNT(*) AS count FROM "_CatalogItemToTag"').get().count > 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "Collection" WHERE "isDraft" = 1 AND "isActive" = 0').get().count, 6);
    const executiveCollection = db.prepare(`
      SELECT "nameAr", "nameEn", "slug"
      FROM "Collection"
      WHERE "slug" = 'executive-office-suite'
    `).get();
    assert.deepEqual(executiveCollection, {
      nameAr: 'جناح المكتب التنفيذي',
      nameEn: 'Executive Office Suite',
      slug: 'executive-office-suite',
    });
    assert.equal(
      db.prepare(`SELECT COUNT(*) AS count FROM "Collection" WHERE "slug" LIKE '% %'`).get().count,
      0,
    );
  } finally {
    db.close();
  }
});
