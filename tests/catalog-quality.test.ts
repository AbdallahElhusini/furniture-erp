import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogDisplayName,
  isCatalogSeoReady,
  isGenericCatalogName,
  normalizeCatalogSpecifications,
} from "../src/lib/catalog-quality.ts";

test("uses a truthful category and SKU fallback for generic imported names", () => {
  const imported = {
    sku: "EXE-0001",
    nameAr: "منتج EXE-0001",
    nameEn: "Product EXE-0001",
  };

  assert.equal(isGenericCatalogName(imported), true);
  assert.equal(
    catalogDisplayName({ ...imported, categoryNameAr: "مكاتب تنفيذية" }),
    "مكاتب تنفيذية · EXE-0001",
  );
});

test("keeps reviewed editorial names unchanged", () => {
  const reviewed = {
    sku: "EXD-001",
    nameAr: "مكتب تنفيذي كلاسيك 180سم",
    nameEn: "Classic Executive Desk 180cm",
  };

  assert.equal(isGenericCatalogName(reviewed), false);
  assert.equal(catalogDisplayName(reviewed), reviewed.nameAr);
});

test("only marks complete reviewed products as ready for search indexing", () => {
  assert.equal(isCatalogSeoReady({ contentStatus: "READY", completenessScore: 80 }), true);
  assert.equal(isCatalogSeoReady({ contentStatus: "VERIFIED", completenessScore: 96 }), true);
  assert.equal(isCatalogSeoReady({ contentStatus: "READY", completenessScore: 79 }), false);
  assert.equal(isCatalogSeoReady({ contentStatus: "NEEDS_REVIEW", completenessScore: 100 }), false);
});

test("catalog specifications accept only bounded JSON objects", () => {
  assert.deepEqual(normalizeCatalogSpecifications(undefined), { ok: true, value: null });
  assert.deepEqual(normalizeCatalogSpecifications(null), { ok: true, value: null });
  assert.deepEqual(normalizeCatalogSpecifications('{ "finish": "oak" }'), {
    ok: true,
    value: '{"finish":"oak"}',
  });
  assert.equal(normalizeCatalogSpecifications("null").ok, false);
  assert.equal(normalizeCatalogSpecifications("[]").ok, false);
  assert.equal(normalizeCatalogSpecifications("not-json").ok, false);
  assert.equal(normalizeCatalogSpecifications({ note: "123456" }, 5).ok, false);
});
