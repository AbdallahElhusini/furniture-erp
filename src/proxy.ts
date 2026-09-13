import { NextRequest, NextResponse } from "next/server.js";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./lib/session.ts";
import {
  localizedStorefrontPath,
  STOREFRONT_LOCALE_HEADER,
  stripStorefrontLocalePrefix,
} from "./lib/i18n/storefront-paths.ts";

const STOREFRONT_LOCALE_COOKIE = "hatab_storefront_locale";
const STOREFRONT_LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

const PUBLIC_READ_APIS = [
  "/api/catalog",
  "/api/categories",
  "/api/collections",
];

function isPublicApi(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/quotes" && request.method === "POST") return true;
  if (pathname === "/api/analytics/events" && request.method === "POST") return true;

  return (
    request.method === "GET" &&
    PUBLIC_READ_APIS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  );
}

function isSameOrigin(request: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function isStorefrontPath(pathname: string): boolean {
  return pathname === "/"
    || pathname === "/catalog"
    || pathname.startsWith("/catalog/")
    || pathname === "/collections"
    || pathname === "/portfolio"
    || pathname === "/quote"
    || pathname.startsWith("/product/");
}

function cameFromEnglishStorefront(request: NextRequest): boolean {
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const refererUrl = new URL(referer);
    return refererUrl.origin === request.nextUrl.origin
      && (refererUrl.pathname === "/en" || refererUrl.pathname.startsWith("/en/"));
  } catch {
    return false;
  }
}

function localizedStorefrontResponse(
  request: NextRequest,
  locale: "ar" | "en",
  rewritePathname?: string,
) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(STOREFRONT_LOCALE_HEADER, locale);

  const response = rewritePathname
    ? (() => {
        const rewritten = request.nextUrl.clone();
        rewritten.pathname = rewritePathname;
        return NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
      })()
    : NextResponse.next({ request: { headers: requestHeaders } });

  response.cookies.set(STOREFRONT_LOCALE_COOKIE, locale, {
    httpOnly: false,
    maxAge: STOREFRONT_LOCALE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // An English URL is rewritten to the shared unprefixed storefront route.
  // Next can run Proxy again for that rewritten destination. Preserve the
  // locale header on that internal pass instead of treating it as a fresh
  // Arabic request (which previously produced English + Arabic Set-Cookie
  // headers and rendered /en pages in Arabic).
  const routedLocale = request.headers.get(STOREFRONT_LOCALE_HEADER);
  if (
    (routedLocale === "ar" || routedLocale === "en")
    && isStorefrontPath(pathname)
  ) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(STOREFRONT_LOCALE_HEADER, routedLocale);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const isEnglishPath = pathname === "/en" || pathname.startsWith("/en/");
  if (isEnglishPath) {
    const unprefixedPath = stripStorefrontLocalePrefix(pathname);
    if (!isStorefrontPath(unprefixedPath)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return localizedStorefrontResponse(request, "en", unprefixedPath);
  }

  if (isStorefrontPath(pathname)) {
    if (
      request.cookies.get(STOREFRONT_LOCALE_COOKIE)?.value === "en"
      && cameFromEnglishStorefront(request)
    ) {
      const localizedUrl = request.nextUrl.clone();
      localizedUrl.pathname = localizedStorefrontPath("en", pathname);
      return NextResponse.redirect(localizedUrl);
    }
    return localizedStorefrontResponse(request, "ar");
  }

  if (isApi && isPublicApi(request)) return NextResponse.next();

  const session = verifySessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!session) {
    if (isApi) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  if (session.mustChangePassword) {
    if (isApi) {
      return NextResponse.json(
        { error: "Password change required" },
        { status: 403 },
      );
    }

    if (pathname !== "/admin/security") {
      return NextResponse.redirect(new URL("/admin/security", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/en/:path*",
    "/catalog/:path*",
    "/collections",
    "/portfolio",
    "/product/:path*",
    "/quote",
    "/admin/:path*",
    "/api/:path*",
  ],
};
