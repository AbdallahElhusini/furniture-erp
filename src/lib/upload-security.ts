export const MAX_PRODUCT_UPLOAD_BYTES = 32 * 1024 * 1024;
export const MAX_PRODUCT_MULTIPART_BYTES = MAX_PRODUCT_UPLOAD_BYTES + 512 * 1024;

export interface DetectedProductUpload {
  extension: ".avif" | ".gif" | ".jpg" | ".mp4" | ".png" | ".webm" | ".webp";
  mimeType: string;
  kind: "IMAGE" | "VIDEO";
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

/** Detect supported media from content bytes instead of trusting name/MIME. */
export function detectProductUpload(bytes: Uint8Array): DetectedProductUpload | null {
  if (bytes.length < 12) return null;
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) {
    return { extension: ".jpg", mimeType: "image/jpeg", kind: "IMAGE" };
  }
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { extension: ".png", mimeType: "image/png", kind: "IMAGE" };
  }
  if (["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) {
    return { extension: ".gif", mimeType: "image/gif", kind: "IMAGE" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { extension: ".webp", mimeType: "image/webp", kind: "IMAGE" };
  }
  if (hasBytes(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { extension: ".webm", mimeType: "video/webm", kind: "VIDEO" };
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12).toLowerCase();
    if (brand === "avif" || brand === "avis") {
      return { extension: ".avif", mimeType: "image/avif", kind: "IMAGE" };
    }
    if (/^(?:iso[2-6]|isom|mp4[12]|avc1|dash|m4v |msnv|qt  )$/.test(brand)) {
      return { extension: ".mp4", mimeType: "video/mp4", kind: "VIDEO" };
    }
  }
  return null;
}
