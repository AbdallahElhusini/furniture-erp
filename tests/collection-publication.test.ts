import assert from "node:assert/strict";
import test from "node:test";

import {
  isSafeCollectionImagePath,
  validateCollection,
} from "../src/lib/collection-publication.ts";
import { collectionCoverExists } from "../src/lib/collection-cover.ts";

const publishableCollection = {
  type: "SPACE",
  nameAr: "مساحات العمل المرنة",
  nameEn: "Flexible Workspaces",
  slug: "flexible-workspaces",
  descriptionAr: "حلول متكاملة لتجهيز مساحات العمل المرنة باحترافية.",
  image: "/uploads/catalog/flexible-workspaces.webp",
  isDraft: false,
  isActive: true,
  activeItemCount: 3,
};

test("accepts a complete publishable collection", () => {
  assert.deepEqual(validateCollection(publishableCollection), []);
});

test("allows incomplete editorial fields while a collection remains a draft", () => {
  assert.deepEqual(
    validateCollection({
      ...publishableCollection,
      descriptionAr: null,
      image: null,
      isDraft: true,
      isActive: false,
      activeItemCount: 0,
    }),
    [],
  );
});

test("blocks publication until description, local image, and active inventory are ready", () => {
  const errors = validateCollection({
    ...publishableCollection,
    descriptionAr: "قصير",
    image: "https://example.com/image.jpg",
    activeItemCount: 0,
  });

  assert.equal(errors.length, 3);
  assert.match(errors.join(" "), /وصف/);
  assert.match(errors.join(" "), /صورة/);
  assert.match(errors.join(" "), /منتج/);
});

test("rejects traversal, query strings, encoded paths, and non-image files", () => {
  const unsafePaths = [
    "/uploads/catalog/../secret.jpg",
    "/uploads/catalog/chair.jpg?size=large",
    "/uploads/catalog/%2e%2e/secret.jpg",
    "/images/specification.pdf",
    "\\uploads\\catalog\\chair.jpg",
  ];

  for (const path of unsafePaths) assert.equal(isSafeCollectionImagePath(path), false, path);
  assert.equal(isSafeCollectionImagePath("/images/collections/chair-set.avif"), true);
});

test("rejects unsupported collection types and unsafe slugs", () => {
  const errors = validateCollection({
    ...publishableCollection,
    type: "INTERNAL",
    slug: "Flexible Workspaces",
  });

  assert.equal(errors.length, 2);
});

test("confirms that a publishable cover resolves to a real file under public", async () => {
  assert.equal(await collectionCoverExists("/uploads/catalog/EXE-0001.png"), true);
  assert.equal(await collectionCoverExists("/uploads/catalog/missing-cover.webp"), false);
  assert.equal(await collectionCoverExists("/uploads/catalog/../EXE-0001.png"), false);
});
