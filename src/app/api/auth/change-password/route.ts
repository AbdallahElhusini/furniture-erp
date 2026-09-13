import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, readApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "@/lib/password";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session";
import { AUTHENTICATED_ERP_ROLES } from "@/lib/roles";

export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request, AUTHENTICATED_ERP_ROLES, {
    allowPasswordChangeRequired: true,
  });
  if (unauthorized) return unauthorized;

  const session = readApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmation =
      typeof body.confirmation === "string" ? body.confirmation : "";

    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }
    if (newPassword !== confirmation) {
      return NextResponse.json(
        { error: "تأكيد كلمة المرور غير مطابق" },
        { status: 400 },
      );
    }
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "اختر كلمة مرور مختلفة عن الحالية" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { id: session.sub } });
    if (!user || !user.isActive || !(await verifyPassword(currentPassword, user.password))) {
      return NextResponse.json(
        { error: "كلمة المرور الحالية غير صحيحة" },
        { status: 400 },
      );
    }

    const password = await hashPassword(newPassword);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });

    const token = createSessionToken({
      sub: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      mustChangePassword: false,
      sessionVersion: updatedUser.sessionVersion,
    });
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
    return response;
  } catch (error) {
    console.error("Password update failed", error);
    return NextResponse.json(
      { error: "تعذر تحديث كلمة المرور" },
      { status: 500 },
    );
  }
}
