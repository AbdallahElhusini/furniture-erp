import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isAllowedAuthOrigin, safeAdminDestination } from "@/lib/auth-request";
import { FixedWindowRateLimiter } from "@/lib/fixed-window-rate-limiter";
import { getRequestClientKey, InvalidJsonBodyError, readBoundedJson, RequestBodyTooLargeError } from "@/lib/public-request-security";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session";

const attempts = new FixedWindowRateLimiter({ limit: 5, windowMs: 15 * 60 * 1_000, maxEntries: 5_000 });
const clientAttempts = new FixedWindowRateLimiter({ limit: 50, windowMs: 15 * 60 * 1_000, maxEntries: 5_000 });

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }
  try {
    const input = await readBoundedJson(request, 8_192);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new InvalidJsonBodyError("Expected an object");
    }
    const body = input as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const clientKey = getRequestClientKey(request);
    const key = `${clientKey}:${email}`;

    if (!email || !password || email.length > 254 || password.length > 128) {
      return NextResponse.json(
        { error: "بيانات الدخول غير صحيحة" },
        { status: 400 },
      );
    }

    const clientLimit = clientAttempts.consume(clientKey);
    const accountLimit = clientLimit.allowed ? attempts.consume(key) : clientLimit;
    if (!clientLimit.allowed || !accountLimit.allowed) {
      return NextResponse.json(
        { error: "محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة" },
        { status: 429, headers: { "Retry-After": String(accountLimit.retryAfterSeconds) } },
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordIsValid = user
      ? await verifyPassword(password, user.password)
      : (await hashPassword(password), false);

    if (!user || !user.isActive || !passwordIsValid) {
      return NextResponse.json(
        { error: "بيانات الدخول غير صحيحة" },
        { status: 401 },
      );
    }

    attempts.reset(key);
    const mustChangePassword = user.mustChangePassword !== false;
    const token = createSessionToken({
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword,
      sessionVersion: user.sessionVersion,
    });

    const redirectTo = mustChangePassword
      ? "/admin/security"
      : safeAdminDestination(body.next);
    const response = NextResponse.json({ success: true, redirectTo });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
    return response;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError || error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: error instanceof RequestBodyTooLargeError ? 413 : 400 });
    }
    console.error("Login failed", error);
    return NextResponse.json(
      { error: "تعذر تسجيل الدخول حالياً" },
      { status: 500 },
    );
  }
}
