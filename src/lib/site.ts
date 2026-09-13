const LOCAL_SITE_URL = "http://localhost:3000";

function configuredSiteUrl(value?: string): URL | null {
  const configured = value?.trim()
    || process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || process.env.SITE_URL?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function hasConfiguredSiteUrl(): boolean {
  return configuredSiteUrl() !== null;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return octets[0] === 0
    || octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

/** True only for an HTTPS canonical that is suitable for public indexing. */
export function isPublicSiteUrl(value: string | URL | null | undefined): boolean {
  if (!value) return false;

  try {
    const url = value instanceof URL ? value : new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const reservedName = hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.endsWith(".local")
      || hostname.endsWith(".test")
      || hostname.endsWith(".example")
      || hostname.endsWith(".invalid");
    const privateIpv6 = hostname.includes(":") && (hostname === "::1"
      || hostname.startsWith("fc")
      || hostname.startsWith("fd")
      || /^fe[89ab]/.test(hostname));

    return url.protocol === "https:"
      && !url.username
      && !url.password
      && Boolean(hostname)
      && !reservedName
      && !isPrivateIpv4(hostname)
      && !privateIpv6;
  } catch {
    return false;
  }
}

export function hasPublicSiteUrl(): boolean {
  return isPublicSiteUrl(configuredSiteUrl());
}

export function isSearchIndexingEnabled(
  environment = process.env.NODE_ENV,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim(),
): boolean {
  return environment !== "production" || isPublicSiteUrl(siteUrl);
}

export function getSiteUrl(): URL {
  return configuredSiteUrl() ?? new URL(LOCAL_SITE_URL);
}

export function absoluteSiteUrl(pathname: string): string {
  return new URL(pathname, getSiteUrl()).toString();
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
