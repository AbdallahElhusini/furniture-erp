export const PRODUCT_MEDIA_KINDS = ["IMAGE", "VIDEO"] as const;
export type ProductMediaKind = (typeof PRODUCT_MEDIA_KINDS)[number];

export const PRODUCT_MEDIA_ROLES = ["PRIMARY", "GALLERY", "DETAIL", "LIFESTYLE"] as const;
export type ProductMediaRole = (typeof PRODUCT_MEDIA_ROLES)[number];

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const LOCAL_IMAGE_PREFIXES = ["/images/", "/uploads/catalog/"] as const;
const LOCAL_VIDEO_PREFIXES = ["/media/", "/uploads/catalog/"] as const;
const BLOCKED_REMOTE_HOSTS = /(?:^|\.)(?:localhost|local|internal)$/i;
const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export interface ProductMediaInput {
  id?: number;
  url: string;
  kind?: ProductMediaKind;
  mimeType?: string | null;
  role?: ProductMediaRole;
  sortOrder?: number;
  altAr?: string | null;
  altEn?: string | null;
  reviewStatus?: string | null;
  duplicateOfId?: number | null;
}

export interface NormalizedProductMedia {
  id?: number;
  url: string;
  kind: ProductMediaKind;
  mimeType: string;
  role: ProductMediaRole;
  sortOrder: number;
  altAr: string | null;
  altEn: string | null;
  reviewStatus?: string | null;
  duplicateOfId?: number | null;
}

export type ProductMediaValidationResult =
  | { ok: true; media: NormalizedProductMedia[] }
  | { ok: false; media: NormalizedProductMedia[]; errors: string[] };

function extensionOf(value: string): string {
  try {
    const pathname = value.startsWith("https://") ? new URL(value).pathname : value;
    const dotIndex = pathname.lastIndexOf(".");
    return dotIndex >= 0 ? pathname.slice(dotIndex).toLowerCase() : "";
  } catch {
    return "";
  }
}

function isSafeLocalSource(value: string, kind: ProductMediaKind): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return false;
  }
  const prefixes = kind === "IMAGE" ? LOCAL_IMAGE_PREFIXES : LOCAL_VIDEO_PREFIXES;
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function isSafeRemoteSource(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.port && url.port !== "443") return false;
    const hostname = url.hostname.toLowerCase();
    if (!hostname || BLOCKED_REMOTE_HOSTS.test(hostname) || IPV4_HOST.test(hostname) || hostname.includes(":")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function inferProductMediaKind(
  value: string,
  mimeType?: string | null,
): ProductMediaKind | null {
  const normalizedMime = mimeType?.trim().toLowerCase();
  if (normalizedMime?.startsWith("image/")) return "IMAGE";
  if (normalizedMime?.startsWith("video/")) return "VIDEO";
  const extension = extensionOf(value);
  if (IMAGE_EXTENSIONS.has(extension)) return "IMAGE";
  if (VIDEO_EXTENSIONS.has(extension)) return "VIDEO";
  return null;
}

export function isRemoteProductMediaSource(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://") && isSafeRemoteSource(value);
}

export function isSafeProductMediaSource(
  value: unknown,
  expectedKind?: ProductMediaKind,
): value is string {
  if (typeof value !== "string" || !value || value.length > 1_000) return false;
  const kind = inferProductMediaKind(value);
  if (!kind || (expectedKind && expectedKind !== kind)) return false;
  if (kind === "IMAGE" && !IMAGE_EXTENSIONS.has(extensionOf(value))) return false;
  if (kind === "VIDEO" && !VIDEO_EXTENSIONS.has(extensionOf(value))) return false;
  return value.startsWith("/") ? isSafeLocalSource(value, kind) : isSafeRemoteSource(value);
}

export function mimeTypeForProductMedia(value: string, kind = inferProductMediaKind(value)): string {
  const extension = extensionOf(value);
  if (kind === "VIDEO") return extension === ".webm" ? "video/webm" : "video/mp4";
  if (extension === ".avif") return "image/avif";
  if (extension === ".gif") return "image/gif";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function normalizeAlt(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length <= 240 ? normalized || null : undefined;
}

export function normalizeProductMediaList(
  value: unknown,
  maximumItems = 24,
): ProductMediaValidationResult {
  if (!Array.isArray(value)) {
    return { ok: false, media: [], errors: ["media must be an ordered array"] };
  }
  if (value.length > maximumItems) {
    return { ok: false, media: [], errors: [`media supports at most ${maximumItems} items`] };
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const media: NormalizedProductMedia[] = [];

  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`media[${index}] must be an object`);
      return;
    }
    const candidate = entry as Record<string, unknown>;
    const rawUrl = typeof candidate.url === "string" ? candidate.url.trim() : "";
    const kind = inferProductMediaKind(rawUrl, typeof candidate.mimeType === "string" ? candidate.mimeType : null);
    if (!kind || !isSafeProductMediaSource(rawUrl, kind)) {
      errors.push(`media[${index}].url must be a supported local path or public HTTPS image/video URL`);
      return;
    }
    if (candidate.kind !== undefined && candidate.kind !== kind) {
      errors.push(`media[${index}].kind does not match its file extension`);
      return;
    }
    if (seen.has(rawUrl)) {
      errors.push(`media[${index}].url duplicates another gallery item`);
      return;
    }
    const altAr = normalizeAlt(candidate.altAr);
    const altEn = normalizeAlt(candidate.altEn);
    if (altAr === undefined || altEn === undefined) {
      errors.push(`media[${index}] alt text must be 240 characters or fewer`);
      return;
    }
    const requestedRole = PRODUCT_MEDIA_ROLES.includes(candidate.role as ProductMediaRole)
      ? candidate.role as ProductMediaRole
      : "GALLERY";
    seen.add(rawUrl);
    media.push({
      ...(typeof candidate.id === "number" && Number.isSafeInteger(candidate.id) ? { id: candidate.id } : {}),
      url: rawUrl,
      kind,
      mimeType: mimeTypeForProductMedia(rawUrl, kind),
      role: requestedRole,
      sortOrder: media.length,
      altAr,
      altEn,
      ...(typeof candidate.reviewStatus === "string" ? { reviewStatus: candidate.reviewStatus } : {}),
      ...(typeof candidate.duplicateOfId === "number" || candidate.duplicateOfId === null
        ? { duplicateOfId: candidate.duplicateOfId }
        : {}),
    });
  });

  const primaryImageIndex = media.findIndex((item) => item.kind === "IMAGE");
  media.forEach((item, index) => {
    if (index === primaryImageIndex) item.role = "PRIMARY";
    else if (item.role === "PRIMARY") item.role = "GALLERY";
    item.sortOrder = index;
  });

  return errors.length > 0 ? { ok: false, media, errors } : { ok: true, media };
}

export function imageUrlsFromProductMedia(media: readonly NormalizedProductMedia[]): string[] {
  return media.filter((item) => item.kind === "IMAGE").map((item) => item.url);
}
