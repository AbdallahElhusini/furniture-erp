import { NextResponse } from "next/server.js";
import { prisma } from "./db.ts";
import {
  SESSION_COOKIE_NAME,
  type SessionPayload,
  verifySessionToken,
} from "./session.ts";
import {
  PRIVILEGED_API_ROLES,
  isPrivilegedApiRole,
} from "./roles.ts";

interface RequireApiSessionOptions {
  allowPasswordChangeRequired?: boolean;
}

export interface LiveAuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
}

type LiveAuthorizationError = {
  status: 401 | 403;
  error:
    | "Authentication required"
    | "Password change required"
    | "Insufficient permissions";
};

export type LiveAdminSessionResult =
  | { response: NextResponse; session: null; user: null }
  | {
      response: null;
      session: SessionPayload;
      user: LiveAuthenticatedUser;
    };

const ADMIN_ONLY_ROLES = ["ADMIN"] as const;

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = part.trim().split("=");
    if (cookieName === name) {
      try {
        return decodeURIComponent(valueParts.join("="));
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function hasValidOrigin(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    return true;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function getLiveAuthorizationError(
  session: SessionPayload,
  user: LiveAuthenticatedUser | null,
  allowedRoles: readonly string[] = ADMIN_ONLY_ROLES,
): LiveAuthorizationError | null {
  if (
    !user ||
    !user.isActive ||
    user.sessionVersion !== session.sessionVersion
  ) {
    return { status: 401, error: "Authentication required" };
  }

  if (session.mustChangePassword || user.mustChangePassword) {
    return { status: 403, error: "Password change required" };
  }

  if (
    user.role !== session.role ||
    !allowedRoles.includes(user.role)
  ) {
    return { status: 403, error: "Insufficient permissions" };
  }

  return null;
}

export function readApiSession(request: Request): SessionPayload | null {
  const token = readCookie(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME,
  );
  return verifySessionToken(token);
}

export function readPrivilegedApiSession(
  request: Request,
): SessionPayload | null {
  const session = readApiSession(request);
  if (
    !session ||
    session.mustChangePassword ||
    !isPrivilegedApiRole(session.role)
  ) {
    return null;
  }

  return session;
}

export function requireApiSession(
  request: Request,
  allowedRoles: readonly string[] = PRIVILEGED_API_ROLES,
  options: RequireApiSessionOptions = {},
): NextResponse | null {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const session = readApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (session.mustChangePassword && !options.allowPasswordChangeRequired) {
    return NextResponse.json(
      { error: "Password change required" },
      { status: 403 },
    );
  }

  if (!allowedRoles.includes(session.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  return null;
}

export async function requireLiveAdminSession(
  request: Request,
  allowedRoles: readonly string[] = ADMIN_ONLY_ROLES,
): Promise<LiveAdminSessionResult> {
  const unauthorized = requireApiSession(request, allowedRoles);
  if (unauthorized) {
    return { response: unauthorized, session: null, user: null };
  }

  const session = readApiSession(request);
  if (!session) {
    return {
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
      session: null,
      user: null,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      sessionVersion: true,
    },
  });
  const liveError = getLiveAuthorizationError(session, user, allowedRoles);
  if (liveError || !user) {
    const denied = liveError ?? {
      status: 401 as const,
      error: "Authentication required" as const,
    };
    return {
      response: NextResponse.json(
        { error: denied.error },
        { status: denied.status },
      ),
      session: null,
      user: null,
    };
  }

  return { response: null, session, user };
}
