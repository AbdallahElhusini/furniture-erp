import assert from "node:assert/strict";
import test from "node:test";

import {
  imageUrlsFromProductMedia,
  inferProductMediaKind,
  isRemoteProductMediaSource,
  isSafeProductMediaSource,
  normalizeProductMediaList,
} from "../src/lib/product-media.ts";
import {
  MAX_PRODUCT_UPLOAD_BYTES,
  detectProductUpload,
} from "../src/lib/upload-security.ts";

test("product media accepts supported local and public HTTPS image/video sources", () => {
  assert.equal(isSafeProductMediaSource("/images/products/chair.webp", "IMAGE"), true);
  assert.equal(isSafeProductMediaSource("/uploads/catalog/chair.jpg", "IMAGE"), true);
  assert.equal(isSafeProductMediaSource("/media/chair-demo.webm", "VIDEO"), true);
  assert.equal(isSafeProductMediaSource("/uploads/catalog/chair-demo.mp4", "VIDEO"), true);
  assert.equal(isSafeProductMediaSource("https://cdn.example.com/catalog/chair.avif", "IMAGE"), true);
  assert.equal(isSafeProductMediaSource("https://cdn.example.com/catalog/chair.mp4", "VIDEO"), true);
  assert.equal(isRemoteProductMediaSource("https://cdn.example.com/catalog/chair.mp4"), true);
});

test("product media rejects unsafe or unsupported sources", () => {
  assert.equal(isSafeProductMediaSource("http://cdn.example.com/chair.jpg"), false);
  assert.equal(isSafeProductMediaSource("https://localhost/chair.jpg"), false);
  assert.equal(isSafeProductMediaSource("https://127.0.0.1/chair.jpg"), false);
  assert.equal(isSafeProductMediaSource("/uploads/catalog/../secret.jpg"), false);
  assert.equal(isSafeProductMediaSource("/uploads/catalog/chair.svg"), false);
  assert.equal(isSafeProductMediaSource("/uploads/catalog/chair.mov"), false);
  assert.equal(isSafeProductMediaSource("/media/chair.mp4?download=1"), false);
  assert.equal(inferProductMediaKind("/uploads/catalog/chair.mp4"), "VIDEO");
});

test("normalization preserves gallery order, selects the first image as primary, and derives legacy images", () => {
  const result = normalizeProductMediaList([
    { url: "/media/chair-demo.mp4", kind: "VIDEO", role: "PRIMARY", altEn: "Chair demo" },
    { url: "/images/products/chair-front.webp", kind: "IMAGE", role: "GALLERY", altAr: "واجهة الكرسي" },
    { url: "https://cdn.example.com/chair-detail.jpg", kind: "IMAGE", role: "DETAIL", altEn: "Chair detail" },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.media.map(({ kind, role, sortOrder }) => ({ kind, role, sortOrder })), [
    { kind: "VIDEO", role: "GALLERY", sortOrder: 0 },
    { kind: "IMAGE", role: "PRIMARY", sortOrder: 1 },
    { kind: "IMAGE", role: "DETAIL", sortOrder: 2 },
  ]);
  assert.deepEqual(imageUrlsFromProductMedia(result.media), [
    "/images/products/chair-front.webp",
    "https://cdn.example.com/chair-detail.jpg",
  ]);
});

test("normalization reports duplicate sources and mismatched declared kinds", () => {
  const duplicate = normalizeProductMediaList([
    { url: "/images/products/chair.webp", kind: "IMAGE" },
    { url: "/images/products/chair.webp", kind: "IMAGE" },
  ]);
  const mismatch = normalizeProductMediaList([
    { url: "/media/chair.mp4", kind: "IMAGE" },
  ]);

  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join(" "), /duplicates/);
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.errors.join(" "), /does not match/);
});

test("upload validation identifies media by bytes and rejects active content", () => {
  const bytes = (...values: number[]) => Uint8Array.from(values);
  assert.deepEqual(
    detectProductUpload(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0)),
    { extension: ".jpg", mimeType: "image/jpeg", kind: "IMAGE" },
  );
  assert.deepEqual(
    detectProductUpload(bytes(0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d)),
    { extension: ".mp4", mimeType: "video/mp4", kind: "VIDEO" },
  );
  assert.equal(
    detectProductUpload(new TextEncoder().encode("<html><script>alert(1)</script></html>")),
    null,
  );
  assert.equal(MAX_PRODUCT_UPLOAD_BYTES, 32 * 1024 * 1024);
});
