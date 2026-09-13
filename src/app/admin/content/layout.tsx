import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLiveAuthorizationError } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export default async function SiteContentAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const session = verifySessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) redirect("/login?next=/admin/content");
  if (session.mustChangePassword) redirect("/admin/security");

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
  const authorizationError = getLiveAuthorizationError(
    session,
    user,
    ["ADMIN"],
  );
  if (authorizationError?.status === 401) {
    redirect("/login?next=/admin/content");
  }
  if (authorizationError) redirect("/admin");

  return children;
}
