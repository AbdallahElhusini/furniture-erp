import assert from "node:assert/strict";
import test from "node:test";
import {
  isAnalyticsEventName,
  sanitizeAnalyticsMetadata,
  sanitizeAnalyticsPath,
  sanitizeAnalyticsSessionId,
} from "../src/lib/analytics-contract.ts";

test("analytics paths discard queries and reject private application routes", () => {
  assert.equal(sanitizeAnalyticsPath("/catalog/chairs?email=private@example.com"), "/catalog/chairs");
  assert.equal(sanitizeAnalyticsPath("/product/29#gallery"), "/product/29");
  assert.equal(sanitizeAnalyticsPath("/admin/quotes"), null);
  assert.equal(sanitizeAnalyticsPath("/api/catalog"), null);
  assert.equal(sanitizeAnalyticsPath("https://example.com/catalog"), null);
});

test("analytics metadata retains counters but removes arbitrary and sensitive values", () => {
  assert.deepEqual(
    sanitizeAnalyticsMetadata({
      itemId: 29,
      quantity: 4,
      formId: "quote-contact",
      email: "private@example.com",
      message: "private note",
      unknown: "not collected",
    }),
    { itemId: 29, quantity: 4, formId: "quote-contact" },
  );
});

test("analytics accepts only known event names and UUID session identifiers", () => {
  assert.equal(isAnalyticsEventName("page_view"), true);
  assert.equal(isAnalyticsEventName("input_value"), false);
  assert.equal(
    sanitizeAnalyticsSessionId("40c7d922-33e1-4b76-aea0-5d21af9b5bd4"),
    "40c7d922-33e1-4b76-aea0-5d21af9b5bd4",
  );
  assert.equal(sanitizeAnalyticsSessionId("visitor-1"), null);
});

