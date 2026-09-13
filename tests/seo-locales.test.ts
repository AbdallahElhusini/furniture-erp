import assert from "node:assert/strict";
import test from "node:test";
import {
  localizedStorefrontPath,
  storefrontLanguageAlternates,
  stripStorefrontLocalePrefix,
} from "../src/lib/i18n/storefront-paths.ts";
import {
  isPublicSiteUrl,
  isSearchIndexingEnabled,
} from "../src/lib/site.ts";

test("locale paths keep one stable Arabic base and English prefix", () => {
  assert.equal(localizedStorefrontPath("ar", "/catalog"), "/catalog");
  assert.equal(localizedStorefrontPath("en", "/catalog"), "/en/catalog");
  assert.equal(localizedStorefrontPath("en", "/"), "/en");
  assert.equal(localizedStorefrontPath("ar", "/en/collections"), "/collections");
});

test("locale paths preserve canonical query parameters and fragments", () => {
  assert.equal(
    localizedStorefrontPath("en", "/catalog?style=classic#pieces"),
    "/en/catalog?style=classic#pieces",
  );
  assert.equal(
    localizedStorefrontPath("ar", "/en/catalog?category=executive-desks"),
    "/catalog?category=executive-desks",
  );
});

test("language clusters are reciprocal and include x-default", () => {
  assert.deepEqual(storefrontLanguageAlternates("/product/12"), {
    ar: "/product/12",
    en: "/en/product/12",
    "x-default": "/product/12",
  });
});

test("English prefix stripping never changes unrelated paths", () => {
  assert.equal(stripStorefrontLocalePrefix("/en"), "/");
  assert.equal(stripStorefrontLocalePrefix("/en/catalog"), "/catalog");
  assert.equal(stripStorefrontLocalePrefix("/engineering"), "/engineering");
});

test("search indexing fails closed for local, private, and non-HTTPS origins", () => {
  for (const value of [
    "http://localhost:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000",
    "https://192.168.1.20",
    "https://hatab.test",
    "http://hatab.example.com",
  ]) {
    assert.equal(isPublicSiteUrl(value), false, value);
    assert.equal(isSearchIndexingEnabled("production", value), false, value);
  }
});

test("search indexing opens only for a public HTTPS canonical in production", () => {
  assert.equal(isPublicSiteUrl("https://hataboffice.com"), true);
  assert.equal(isPublicSiteUrl("https://fdesign.com"), true);
  assert.equal(isPublicSiteUrl("https://[fd00::1]"), false);
  assert.equal(
    isSearchIndexingEnabled("production", "https://hataboffice.com"),
    true,
  );
  assert.equal(
    isSearchIndexingEnabled("development", "http://localhost:3000"),
    true,
  );
});
