import assert from "node:assert/strict";
import test from "node:test";

import {
  approvedSafeProductMediaAssets,
  approvedSafeCatalogAssetUrls,
  catalogPublicationWhere,
  hasPublishableCatalogAsset,
  isSafeCatalogAssetUrl,
} from "../src/lib/catalog-publication.ts";

test("production publication queries require verified active products in active categories", () => {
  assert.deepEqual(catalogPublicationWhere("production"), {
    isActive: true,
    category: { isActive: true },
    contentStatus: "VERIFIED",
  });
});

test("development publication queries retain the active-catalog preview", () => {
  assert.deepEqual(catalogPublicationWhere("development"), {
    isActive: true,
    category: { isActive: true },
  });
});

test("only local raster catalog paths are safe for public product imagery", () => {
  assert.equal(isSafeCatalogAssetUrl("/uploads/catalog/chairs/task-chair.webp"), true);
  assert.equal(isSafeCatalogAssetUrl("/images/products/desk.avif"), true);
  assert.equal(isSafeCatalogAssetUrl("https://example.com/chair.jpg"), false);
  assert.equal(isSafeCatalogAssetUrl("/uploads/catalog/../secret.jpg"), false);
  assert.equal(isSafeCatalogAssetUrl("/uploads/catalog/chair.svg"), false);
  assert.equal(isSafeCatalogAssetUrl("/uploads/catalog/chair.jpg?size=large"), false);
});

test("publishable imagery is approved, safe, non-duplicate, and bilingual", () => {
  const assets = [
    {
      url: "/uploads/catalog/primary.png",
      reviewStatus: "APPROVED",
      duplicateOfId: null,
      altAr: "كرسي مكتب",
      altEn: "Office chair",
    },
    {
      url: "/uploads/catalog/duplicate.png",
      reviewStatus: "APPROVED",
      duplicateOfId: 1,
      altAr: "نسخة",
      altEn: "Duplicate",
    },
    {
      url: "/uploads/catalog/candidate.png",
      reviewStatus: "NEEDS_REVIEW",
      duplicateOfId: null,
      altAr: "مرشح",
      altEn: "Candidate",
    },
  ];

  assert.deepEqual(approvedSafeCatalogAssetUrls(assets), [
    "/uploads/catalog/primary.png",
  ]);
  assert.equal(hasPublishableCatalogAsset(assets), true);
  assert.equal(
    hasPublishableCatalogAsset([
      { ...assets[0], altEn: null },
      assets[1],
      assets[2],
    ]),
    false,
  );
});

test("approved storefront media can include ordered HTTPS images and videos", () => {
  const assets = [
    {
      url: "https://cdn.example.com/product/overview.mp4",
      mimeType: "video/mp4",
      sortOrder: 2,
      reviewStatus: "APPROVED",
      duplicateOfId: null,
      altAr: "فيديو المنتج",
      altEn: "Product video",
    },
    {
      url: "https://cdn.example.com/product/primary.webp",
      mimeType: "image/webp",
      sortOrder: 0,
      reviewStatus: "APPROVED",
      duplicateOfId: null,
      altAr: "صورة المنتج",
      altEn: "Product image",
    },
    {
      url: "/media/unreviewed.webm",
      mimeType: "video/webm",
      sortOrder: 1,
      reviewStatus: "NEEDS_REVIEW",
      duplicateOfId: null,
      altAr: "مرشح",
      altEn: "Candidate",
    },
  ];

  assert.deepEqual(
    approvedSafeProductMediaAssets(assets).map(({ url, kind }) => ({ url, kind })),
    [
      { url: "https://cdn.example.com/product/primary.webp", kind: "IMAGE" },
      { url: "https://cdn.example.com/product/overview.mp4", kind: "VIDEO" },
    ],
  );
  assert.equal(hasPublishableCatalogAsset(assets), true);
});
