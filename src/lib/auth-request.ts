export function isAllowedAuthOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function safeAdminDestination(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/admin";
  try {
    const base = "https://hatab.local";
    const destination = new URL(value, base);
    if (destination.origin !== base) return "/admin";
    if (destination.pathname !== "/admin" && !destination.pathname.startsWith("/admin/")) return "/admin";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/admin";
  }
}
