import type {
  CellScalar,
  DataTransferIssueInput,
  ParsedDataRow,
} from "./contracts";
import { isSafeProductMediaSource } from "../product-media.ts";

const EXTERNAL_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,119}$/;

function valueIsBlank(value: CellScalar | undefined): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

export class RowReader {
  readonly issues: DataTransferIssueInput[] = [];
  readonly row: ParsedDataRow;

  constructor(row: ParsedDataRow) {
    this.row = row;
  }

  get hasErrors(): boolean {
    return this.issues.some((issue) => issue.severity === "ERROR");
  }

  issue(field: string | undefined, code: string, message: string, severity: "ERROR" | "WARNING" = "ERROR") {
    this.issues.push({
      module: this.row.module,
      sheet: this.row.sheet,
      rowNumber: this.row.rowNumber,
      field,
      severity,
      code,
      message,
      rawData: JSON.stringify(this.row.values, (_key, value) =>
        value instanceof Date ? value.toISOString() : value,
      ),
    });
  }

  raw(field: string): CellScalar | undefined {
    return this.row.values[field];
  }

  string(
    field: string,
    options: { required?: boolean; max?: number; min?: number; pattern?: RegExp } = {},
  ): string | null {
    const value = this.raw(field);
    if (valueIsBlank(value)) {
      if (options.required) this.issue(field, "REQUIRED", `${field} is required`);
      return null;
    }

    const normalized = value instanceof Date ? value.toISOString() : String(value).trim();
    if (options.min !== undefined && normalized.length < options.min) {
      this.issue(field, "TOO_SHORT", `${field} must contain at least ${options.min} characters`);
    }
    if (options.max !== undefined && normalized.length > options.max) {
      this.issue(field, "TOO_LONG", `${field} must not exceed ${options.max} characters`);
    }
    if (options.pattern && !options.pattern.test(normalized)) {
      this.issue(field, "INVALID_FORMAT", `${field} has an invalid format`);
    }
    return normalized;
  }

  externalKey(field = "external_key", required = true): string | null {
    return this.string(field, {
      required,
      min: 2,
      max: 120,
      pattern: EXTERNAL_KEY_PATTERN,
    });
  }

  integer(
    field: string,
    options: { required?: boolean; min?: number; max?: number } = {},
  ): number | null {
    const value = this.raw(field);
    if (valueIsBlank(value)) {
      if (options.required) this.issue(field, "REQUIRED", `${field} is required`);
      return null;
    }

    let parsed: number;
    if (typeof value === "number") parsed = value;
    else {
      const normalized = String(value).trim();
      if (!/^-?\d+$/.test(normalized)) {
        this.issue(field, "INVALID_INTEGER_FORMAT", `${field} must use plain decimal whole-number notation`);
        return null;
      }
      parsed = Number(normalized);
    }
    if (!Number.isSafeInteger(parsed)) {
      this.issue(field, "INVALID_INTEGER", `${field} must be a whole number`);
      return null;
    }
    if (options.min !== undefined && parsed < options.min) {
      this.issue(field, "OUT_OF_RANGE", `${field} must be at least ${options.min}`);
    }
    if (options.max !== undefined && parsed > options.max) {
      this.issue(field, "OUT_OF_RANGE", `${field} must not exceed ${options.max}`);
    }
    return parsed;
  }

  number(
    field: string,
    options: { required?: boolean; min?: number; max?: number } = {},
  ): number | null {
    const value = this.raw(field);
    if (valueIsBlank(value)) {
      if (options.required) this.issue(field, "REQUIRED", `${field} is required`);
      return null;
    }

    if (typeof value !== "string" && typeof value !== "number") {
      this.issue(field, "INVALID_NUMBER", `${field} must be provided as numeric text or a number`);
      return null;
    }
    let normalized: string | number = value;
    if (typeof normalized === "string") {
      normalized = normalized.trim();
      const canonical = /^-?\d+(?:\.\d+)?$/;
      const grouped = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
      if (!canonical.test(normalized) && !grouped.test(normalized)) {
        this.issue(
          field,
          "INVALID_NUMBER_FORMAT",
          `${field} must use 1234.50 or correctly grouped 1,234.50 notation`,
        );
        return null;
      }
      if (grouped.test(normalized)) normalized = normalized.replaceAll(",", "");
    }
    const parsed = typeof normalized === "number" ? normalized : Number(normalized);
    if (!Number.isFinite(parsed)) {
      this.issue(field, "INVALID_NUMBER", `${field} must be a finite number`);
      return null;
    }
    if (options.min !== undefined && parsed < options.min) {
      this.issue(field, "OUT_OF_RANGE", `${field} must be at least ${options.min}`);
    }
    if (options.max !== undefined && parsed > options.max) {
      this.issue(field, "OUT_OF_RANGE", `${field} must not exceed ${options.max}`);
    }
    return parsed;
  }

  boolean(field: string, fallback: boolean | null = null): boolean | null {
    const value = this.raw(field);
    if (valueIsBlank(value)) return fallback;
    if (typeof value === "boolean") return value;
    if (typeof value === "number" && (value === 0 || value === 1)) return value === 1;

    const normalized = String(value).trim().toLowerCase();
    if (["true", "yes", "y", "1", "نعم"].includes(normalized)) return true;
    if (["false", "no", "n", "0", "لا"].includes(normalized)) return false;
    this.issue(field, "INVALID_BOOLEAN", `${field} must be true or false`);
    return fallback;
  }

  date(field: string, required = false): Date | null {
    const value = this.raw(field);
    if (valueIsBlank(value)) {
      if (required) this.issue(field, "REQUIRED", `${field} is required`);
      return null;
    }

    let parsed: Date;
    if (value instanceof Date) parsed = new Date(value.getTime());
    else {
      const normalized = String(value).trim();
      const isoDate = /^\d{4}-\d{2}-\d{2}$/;
      const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
      if (!isoDate.test(normalized) && !isoDateTime.test(normalized)) {
        this.issue(field, "INVALID_DATE_FORMAT", `${field} must use YYYY-MM-DD or an ISO timestamp with timezone`);
        return null;
      }
      parsed = new Date(normalized);
      if (Number.isNaN(parsed.getTime())) {
        this.issue(field, "INVALID_DATE", `${field} is not a valid ISO date`);
        return null;
      }
      if (isoDate.test(normalized) && parsed.toISOString().slice(0, 10) !== normalized) {
        this.issue(field, "INVALID_DATE", `${field} is not a real calendar date`);
        return null;
      }
    }
    if (Number.isNaN(parsed.getTime())) {
      this.issue(field, "INVALID_DATE", `${field} must be an ISO date or an Excel date`);
      return null;
    }
    return parsed;
  }

  enumeration<const T extends readonly string[]>(
    field: string,
    allowed: T,
    options: { required?: boolean; fallback?: T[number] } = {},
  ): T[number] | null {
    const value = this.string(field, { required: options.required, max: 80 });
    if (value === null) return options.fallback ?? null;
    const normalized = value.toUpperCase();
    if (!(allowed as readonly string[]).includes(normalized)) {
      this.issue(field, "INVALID_ENUM", `${field} must be one of: ${allowed.join(", ")}`);
      return options.fallback ?? null;
    }
    return normalized as T[number];
  }

  json(field: string, fallback: unknown): string {
    const value = this.raw(field);
    if (valueIsBlank(value)) return JSON.stringify(fallback);
    if (typeof value !== "string") {
      this.issue(field, "INVALID_JSON", `${field} must contain JSON text`);
      return JSON.stringify(fallback);
    }
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      this.issue(field, "INVALID_JSON", `${field} contains invalid JSON`);
      return JSON.stringify(fallback);
    }
  }

  mediaUrl(field: string): string | null {
    const value = this.string(field, { max: 2_000 });
    if (!value) return null;
    const lower = value.toLowerCase();
    const allowedPrefixes = ["/uploads/catalog/", "/images/", "/media/"];
    const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".mp4", ".webm"];
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      this.issue(field, "UNSAFE_MEDIA_URL", `${field} contains invalid URL encoding`);
      return null;
    }
    if (
      allowedPrefixes.some((prefix) => lower.startsWith(prefix)) &&
      allowedExtensions.some((extension) => lower.endsWith(extension)) &&
      !decoded.includes("..") &&
      !decoded.includes("\\") &&
      !value.includes("?") &&
      !value.includes("#")
    ) {
      return value;
    }
    this.issue(
      field,
      "UNSAFE_MEDIA_URL",
      `${field} must use /uploads/catalog/, /images/, or /media/ with an approved media extension`,
    );
    return null;
  }

  productMediaUrl(field: string): string | null {
    const value = this.string(field, { max: 1_000 });
    if (!value) return null;
    if (isSafeProductMediaSource(value)) return value;
    this.issue(
      field,
      "UNSAFE_PRODUCT_MEDIA_URL",
      `${field} must be a supported local product image/video path or a public HTTPS media URL`,
    );
    return null;
  }

  linkUrl(field: string): string | null {
    const value = this.string(field, { max: 2_000 });
    if (!value) return null;
    if (value.startsWith("/") && !value.startsWith("//") && !value.includes("..")) return value;
    try {
      const url = new URL(value);
      if (["https:", "mailto:", "tel:"].includes(url.protocol)) return value;
    } catch {
      // The issue below is more useful than the URL constructor error.
    }
    this.issue(field, "UNSAFE_LINK_URL", `${field} must be a safe site path, HTTPS, mailto, or tel URL`);
    return null;
  }
}
