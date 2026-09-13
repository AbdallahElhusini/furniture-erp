export function stripPortableRecordId<T extends Record<string, unknown>>(source: T): Omit<T, "record_id"> {
  const row = { ...source };
  delete row.record_id;
  return row;
}

/**
 * Converts the legacy "no specifications" sentinels into the catalog import
 * contract's canonical empty object. Invalid/non-object JSON is intentionally
 * preserved so backup preflight still fails closed instead of hiding damage.
 */
export function canonicalPortableJsonObject(value: string | null | undefined): string {
  if (!value?.trim()) return "{}";

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null) return "{}";
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify(parsed);
    }
  } catch {
    // Preserve malformed JSON so the normal validator reports it.
  }

  return value;
}

function isEmptyJsonObject(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return true;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Boolean(parsed)
      && typeof parsed === "object"
      && !Array.isArray(parsed)
      && Object.keys(parsed as Record<string, unknown>).length === 0;
  } catch {
    return false;
  }
}

/**
 * Portable rows are normalized by the spreadsheet validator while lossless
 * records preserve the exact database bytes. This comparison accepts only
 * normalizer-equivalent representations; it does not coerce numbers, enums,
 * dates, malformed JSON, or internal text whitespace.
 */
export function equivalentPortableTrustedValue(
  portableValue: unknown,
  trustedValue: unknown,
  field: string,
): boolean {
  const normalizedPortable = portableValue instanceof Date
    ? portableValue.toISOString()
    : portableValue;
  const normalizedTrusted = trustedValue instanceof Date
    ? trustedValue.toISOString()
    : trustedValue;

  if (normalizedPortable === normalizedTrusted) return true;
  if (
    field === "specifications"
    && isEmptyJsonObject(normalizedPortable)
    && isEmptyJsonObject(normalizedTrusted)
  ) {
    return true;
  }
  if (
    field === "metadata"
    && normalizedPortable === "{}"
    && normalizedTrusted === null
  ) {
    return true;
  }
  if (
    typeof normalizedPortable === "string"
    && typeof normalizedTrusted === "string"
    && ["images", "specifications", "metadata"].includes(field)
  ) {
    try {
      return JSON.stringify(JSON.parse(normalizedPortable))
        === JSON.stringify(JSON.parse(normalizedTrusted));
    } catch {
      return false;
    }
  }
  if (
    typeof normalizedPortable === "string"
    && typeof normalizedTrusted === "string"
  ) {
    return normalizedPortable.trim() === normalizedTrusted.trim();
  }
  return false;
}
