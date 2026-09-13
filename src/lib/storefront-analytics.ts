import type { AnalyticsEventInput } from "./analytics-contract";

export const STOREFRONT_ANALYTICS_EVENT = "hatab:analytics";

/**
 * Records an allow-listed storefront interaction without form values or other
 * personal data. The provider batches and validates it before transmission.
 */
export function trackStorefrontEvent(event: AnalyticsEventInput): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AnalyticsEventInput>(STOREFRONT_ANALYTICS_EVENT, {
      detail: event,
    }),
  );
}

