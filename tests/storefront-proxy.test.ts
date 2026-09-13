import assert from "node:assert/strict";
import test from "node:test";
import {
  getRewrittenUrl,
  isRewrite,
} from "next/experimental/testing/server.js";
import { NextRequest } from "next/server.js";
import { proxy } from "../src/proxy.ts";
import { STOREFRONT_LOCALE_HEADER } from "../src/lib/i18n/storefront-paths.ts";

test("English storefront URLs rewrite once with an English locale cookie", async () => {
  const response = await proxy(
    new NextRequest("https://hatab.example/en/catalog?style=dynamic"),
  );

  assert.equal(isRewrite(response), true);
  assert.equal(
    getRewrittenUrl(response),
    "https://hatab.example/catalog?style=dynamic",
  );
  assert.match(response.headers.get("set-cookie") || "", /hatab_storefront_locale=en/);
  assert.doesNotMatch(response.headers.get("set-cookie") || "", /hatab_storefront_locale=ar/);
});

test("rewritten storefront requests retain their routed locale", async () => {
  const response = await proxy(
    new NextRequest("https://hatab.example/catalog?style=dynamic", {
      headers: { [STOREFRONT_LOCALE_HEADER]: "en" },
    }),
  );

  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(
    response.headers.get(`x-middleware-request-${STOREFRONT_LOCALE_HEADER}`),
    "en",
  );
});

test("an unprefixed storefront request remains Arabic", async () => {
  const response = await proxy(new NextRequest("https://hatab.example/catalog"));

  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.match(response.headers.get("set-cookie") || "", /hatab_storefront_locale=ar/);
});
