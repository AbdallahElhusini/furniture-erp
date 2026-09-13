const ALLOWED_IMAGE_PREFIXES = ["/uploads/catalog/", "/images/"] as const;
const ALLOWED_IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function normalizeQuoteCartImagePath(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().slice(0, 512);
  if (!normalized || /[?#\\\u0000-\u001f]/.test(normalized)) {
    return undefined;
  }

  const allowedPrefix = ALLOWED_IMAGE_PREFIXES.find((prefix) =>
    normalized.startsWith(prefix),
  );
  if (!allowedPrefix) return undefined;

  const pathSegments = normalized.slice(allowedPrefix.length).split("/");
  if (
    pathSegments.length === 0 ||
    pathSegments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !SAFE_PATH_SEGMENT.test(segment),
    ) ||
    !ALLOWED_IMAGE_EXTENSION.test(pathSegments[pathSegments.length - 1])
  ) {
    return undefined;
  }

  return normalized;
}
