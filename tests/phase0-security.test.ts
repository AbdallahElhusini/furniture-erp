import assert from "node:assert/strict";
import test from "node:test";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../src/lib/password.ts";
import {
  AUTH_SECRET_MIN_LENGTH,
  createSessionToken,
  resolveSessionSecret,
  verifySessionToken,
} from "../src/lib/session.ts";
import { FixedWindowRateLimiter } from "../src/lib/fixed-window-rate-limiter.ts";
import { isAllowedAuthOrigin, safeAdminDestination } from "../src/lib/auth-request.ts";
import {
  RequestBodyTooLargeError,
  getRequestClientKey,
  isSameOriginBrowserRequest,
  readBoundedJson,
} from "../src/lib/public-request-security.ts";
import {
  isAuthenticatedErpRole,
  isPrivilegedApiRole,
} from "../src/lib/roles.ts";
import {
  getLiveAuthorizationError,
  requireLiveAdminSession,
  readApiSession,
} from "../src/lib/api-auth.ts";

test("passwords are stored as salted scrypt hashes", async () => {
  const hash = await hashPassword("Premium-Office-2026!");

  assert.match(hash, /^scrypt\$/);
  assert.equal(hash.includes("Premium-Office-2026!"), false);
  assert.equal(await verifyPassword("Premium-Office-2026!", hash), true);
  assert.equal(await verifyPassword("incorrect-password", hash), false);
});

test("password policy rejects weak credentials", () => {
  assert.ok(getPasswordValidationError("short"));
  assert.equal(getPasswordValidationError("Premium-Office-2026!"), null);
});

test("authentication redirects cannot escape the admin path", () => {
  for (const destination of ["https://attacker.example", "//attacker.example", "/admin-other", "/admin/../catalog", "/admin/%2e%2e/catalog", "/\\attacker.example"]) {
    assert.equal(safeAdminDestination(destination), "/admin", destination);
  }
  assert.equal(safeAdminDestination("/admin/assistant?from=login"), "/admin/assistant?from=login");
  assert.equal(safeAdminDestination("/admin#overview"), "/admin#overview");
});

test("authentication rejects malformed and cross-origin browser requests", () => {
  for (const origin of ["not-a-url", "https://attacker.example", "http://hatab.example"]) {
    assert.equal(isAllowedAuthOrigin(new Request("https://hatab.example/api/auth/login", { headers: { origin } })), false);
  }
  assert.equal(isAllowedAuthOrigin(new Request("https://hatab.example/api/auth/logout", { headers: { "sec-fetch-site": "cross-site" } })), false);
  assert.equal(isAllowedAuthOrigin(new Request("https://hatab.example/api/auth/login", { headers: { origin: "https://hatab.example" } })), true);
});

test("session verification rejects tampering", () => {
  const token = createSessionToken({
    sub: 1,
    name: "Administrator",
    email: "admin@hatab.local",
    role: "ADMIN",
    mustChangePassword: true,
    sessionVersion: 1,
  });

  assert.equal(verifySessionToken(token)?.email, "admin@hatab.local");
  assert.equal(verifySessionToken(`${token}tampered`), null);
  assert.equal(verifySessionToken(`${token}.ignored`), null);
  assert.equal(verifySessionToken(`${token}.`), null);
  assert.equal(readApiSession(new Request("http://localhost/api/clients", {
    headers: { cookie: "hatab_admin_session=%E0%A4%A" },
  })), null);
});

test("session secrets enforce the deployment minimum", () => {
  assert.throws(
    () => resolveSessionSecret("too-short", "development"),
    new RegExp(String(AUTH_SECRET_MIN_LENGTH)),
  );
  assert.throws(
    () => resolveSessionSecret(undefined, "production"),
    /AUTH_SECRET/,
  );
  assert.equal(
    resolveSessionSecret("  12345678901234567890123456789012  ", "production"),
    "12345678901234567890123456789012",
  );
  assert.ok(
    resolveSessionSecret(undefined, "development").length >=
      AUTH_SECRET_MIN_LENGTH,
  );
});

test("ERP roles keep privileged API access least-privilege", () => {
  assert.equal(isPrivilegedApiRole("ADMIN"), true);
  assert.equal(isPrivilegedApiRole("MANAGER"), true);
  assert.equal(isPrivilegedApiRole("DESIGNER"), false);
  assert.equal(isAuthenticatedErpRole("TECHNICIAN"), true);
  assert.equal(isAuthenticatedErpRole("UNKNOWN"), false);
});

test("live admin authorization accepts a current active admin", () => {
  const session = {
    sub: 1,
    name: "Stale session name",
    email: "stale@example.com",
    role: "ADMIN",
    mustChangePassword: false,
    sessionVersion: 4,
    exp: Math.floor(Date.now() / 1_000) + 60,
  };
  const liveUser = {
    id: 1,
    name: "HATAB Administrator",
    email: "admin@hatab.local",
    role: "ADMIN",
    isActive: true,
    mustChangePassword: false,
    sessionVersion: 4,
  };

  assert.equal(getLiveAuthorizationError(session, liveUser), null);
});

test("live admin helper returns the denied discriminant before database access", async () => {
  const result = await requireLiveAdminSession(
    new Request("https://hatab.example/api/admin/data-transfer"),
  );

  assert.equal(result.response?.status, 401);
  assert.equal(result.session, null);
  assert.equal(result.user, null);
});

test("live admin authorization rejects revoked and non-admin sessions", () => {
  const session = {
    sub: 1,
    name: "HATAB Administrator",
    email: "admin@hatab.local",
    role: "ADMIN",
    mustChangePassword: false,
    sessionVersion: 4,
    exp: Math.floor(Date.now() / 1_000) + 60,
  };
  const activeAdmin = {
    id: 1,
    name: "HATAB Administrator",
    email: "admin@hatab.local",
    role: "ADMIN",
    isActive: true,
    mustChangePassword: false,
    sessionVersion: 4,
  };

  assert.deepEqual(getLiveAuthorizationError(session, null), {
    status: 401,
    error: "Authentication required",
  });
  assert.deepEqual(
    getLiveAuthorizationError(session, {
      ...activeAdmin,
      isActive: false,
    }),
    { status: 401, error: "Authentication required" },
  );
  assert.deepEqual(
    getLiveAuthorizationError(session, {
      ...activeAdmin,
      sessionVersion: 5,
    }),
    { status: 401, error: "Authentication required" },
  );
  assert.deepEqual(
    getLiveAuthorizationError(session, {
      ...activeAdmin,
      mustChangePassword: true,
    }),
    {
      status: 403,
      error: "Password change required",
    },
  );
  assert.deepEqual(
    getLiveAuthorizationError(session, {
      ...activeAdmin,
      role: "MANAGER",
    }),
    {
      status: 403,
      error: "Insufficient permissions",
    },
  );
  assert.deepEqual(
    getLiveAuthorizationError(
      { ...session, role: "MANAGER" },
      activeAdmin,
    ),
    { status: 403, error: "Insufficient permissions" },
  );
});

test("fixed-window limiter expires entries and remains bounded", () => {
  const limiter = new FixedWindowRateLimiter({
    limit: 2,
    windowMs: 1_000,
    maxEntries: 2,
  });

  assert.deepEqual(limiter.consume("one", 1), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 1,
  });
  assert.equal(limiter.consume("one", 2).allowed, true);
  assert.equal(limiter.consume("one", 3).allowed, false);
  limiter.reset("one");
  assert.equal(limiter.check("one", 3).remaining, 2);

  limiter.consume("two", 4);
  limiter.consume("three", 5);
  assert.equal(limiter.size, 2);
  assert.equal(limiter.consume("one", 1_002).allowed, true);
});

test("public browser requests require a same-origin signal", () => {
  const sameOrigin = new Request("https://hatab.example/api/quotes", {
    method: "POST",
    headers: {
      origin: "https://hatab.example",
      "sec-fetch-site": "same-origin",
      "x-real-ip": "192.0.2.10",
      "x-forwarded-for": "198.51.100.22",
    },
  });
  const crossOrigin = new Request("https://hatab.example/api/quotes", {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
  });
  const noBrowserSignal = new Request("https://hatab.example/api/quotes", {
    method: "POST",
  });

  assert.equal(isSameOriginBrowserRequest(sameOrigin), true);
  assert.equal(getRequestClientKey(sameOrigin), "192.0.2.10");
  assert.equal(isSameOriginBrowserRequest(crossOrigin), false);
  assert.equal(isSameOriginBrowserRequest(noBrowserSignal), false);
});

test("JSON request bodies are read with a hard byte limit", async () => {
  const valid = new Request("https://hatab.example/api/quotes", {
    method: "POST",
    body: JSON.stringify({ clientName: "HATAB" }),
  });
  assert.deepEqual(await readBoundedJson(valid, 64), { clientName: "HATAB" });

  const oversized = new Request("https://hatab.example/api/quotes", {
    method: "POST",
    body: JSON.stringify({ message: "x".repeat(100) }),
  });
  await assert.rejects(
    () => readBoundedJson(oversized, 32),
    RequestBodyTooLargeError,
  );
});
