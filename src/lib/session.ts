import { createHmac, timingSafeEqual } from "node:crypto";
import { isAuthenticatedErpRole } from "./roles.ts";

export const SESSION_COOKIE_NAME = "hatab_admin_session";
export const SESSION_DURATION_SECONDS = 8 * 60 * 60;
export const AUTH_SECRET_MIN_LENGTH = 32;

const DEVELOPMENT_SESSION_SECRET =
  "hatab-development-session-secret-change-before-production";

export interface SessionPayload {
  sub: number;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  sessionVersion: number;
  exp: number;
}

export function resolveSessionSecret(
  configuredValue = process.env.AUTH_SECRET,
  environment = process.env.NODE_ENV,
): string {
  const configuredSecret = configuredValue?.trim();
  if (configuredSecret) {
    if (configuredSecret.length < AUTH_SECRET_MIN_LENGTH) {
      throw new Error(
        `AUTH_SECRET must contain at least ${AUTH_SECRET_MIN_LENGTH} characters`,
      );
    }

    return configuredSecret;
  }

  if (environment === "production") {
    throw new Error(
      `AUTH_SECRET must be configured with at least ${AUTH_SECRET_MIN_LENGTH} characters in production`,
    );
  }

  return DEVELOPMENT_SESSION_SECRET;
}

function sign(value: string): string {
  return createHmac("sha256", resolveSessionSecret())
    .update(value)
    .digest("base64url");
}

export function createSessionToken(
  payload: Omit<SessionPayload, "exp">,
): string {
  const session: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url",
  );

  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token || token.length > 8192) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature || !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;

    if (
      !Number.isSafeInteger(payload.sub) ||
      payload.sub <= 0 ||
      typeof payload.name !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      !isAuthenticatedErpRole(payload.role) ||
      typeof payload.mustChangePassword !== "boolean" ||
      !Number.isSafeInteger(payload.sessionVersion) ||
      payload.sessionVersion <= 0 ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DURATION_SECONDS,
};
