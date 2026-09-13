export const ANALYTICS_COOKIE_NAME = "hatab_analytics_sid";
export const ANALYTICS_STORAGE_KEY = "hatab_analytics_sid";
export const ANALYTICS_ACTIVITY_STORAGE_KEY = "hatab_analytics_last_activity";
export const ANALYTICS_OPT_OUT_KEY = "hatab_analytics_opt_out";
export const ANALYTICS_EVENT_ENDPOINT = "/api/analytics/events";
export const ANALYTICS_SESSION_TIMEOUT_SECONDS = 30 * 60;

export const ANALYTICS_EVENT_NAMES = [
  "page_view",
  "section_dwell",
  "form_start",
  "form_submit",
  "cart_add",
  "cart_update",
  "cart_remove",
  "cart_clear",
  "project_board_snapshot",
  "project_board_open",
  "quote_success",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export interface AnalyticsEventInput {
  name: AnalyticsEventName;
  path?: string;
  section?: string;
  entityType?: string;
  entityId?: string | number;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

const EVENT_NAME_SET = new Set<string>(ANALYTICS_EVENT_NAMES);
const SAFE_METADATA_KEYS = new Set([
  "durationMs",
  "itemId",
  "quantity",
  "itemCount",
  "pieceCount",
  "fieldsConfigured",
  "formId",
  "step",
  "status",
  "source",
  "result",
]);

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === "string" && EVENT_NAME_SET.has(value);
}

export function sanitizeAnalyticsPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const withoutQuery = value.trim().split(/[?#]/, 1)[0];
  if (!withoutQuery.startsWith("/") || withoutQuery.startsWith("//")) return null;
  if (withoutQuery.startsWith("/admin") || withoutQuery.startsWith("/api")) return null;
  const normalized = withoutQuery.replace(/\/{2,}/g, "/").slice(0, 240);
  return normalized || "/";
}

export function sanitizeAnalyticsLabel(value: unknown, maxLength = 80): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_:/.-]+/g, "-");
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function sanitizeAnalyticsMetadata(
  value: unknown,
): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const result: Record<string, string | number | boolean> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!SAFE_METADATA_KEYS.has(key) || Object.keys(result).length >= 12) continue;

    if (typeof candidate === "boolean") {
      result[key] = candidate;
    } else if (typeof candidate === "number" && Number.isFinite(candidate)) {
      result[key] = Math.max(-1_000_000_000, Math.min(1_000_000_000, Math.round(candidate)));
    } else if (typeof candidate === "string") {
      const safe = sanitizeAnalyticsLabel(candidate, 80);
      if (safe) result[key] = safe;
    }
  }
  return result;
}

export function sanitizeAnalyticsSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}
