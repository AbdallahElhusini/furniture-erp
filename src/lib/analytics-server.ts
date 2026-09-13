import { prisma } from "@/lib/db";
import {
  ANALYTICS_COOKIE_NAME,
  sanitizeAnalyticsSessionId,
} from "@/lib/analytics-contract";

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = part.trim().split("=");
    if (cookieName === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

export function readAnalyticsSessionId(request: Request): string | null {
  return sanitizeAnalyticsSessionId(
    readCookie(request.headers.get("cookie"), ANALYTICS_COOKIE_NAME),
  );
}

export async function recordQuoteConversion(
  request: Request,
  quoteId: number,
  itemCount: number,
  pieceCount: number,
): Promise<void> {
  const sessionId = readAnalyticsSessionId(request);
  if (!sessionId) return;

  const now = new Date();
  await prisma.$transaction([
    prisma.analyticsSession.upsert({
      where: { id: sessionId },
      create: {
        id: sessionId,
        landingPath: "/quote",
        lastPath: "/quote",
        lastSeenAt: now,
        convertedAt: now,
        eventCount: 1,
      },
      update: {
        lastPath: "/quote",
        lastSeenAt: now,
        convertedAt: now,
        eventCount: { increment: 1 },
      },
    }),
    prisma.analyticsEvent.create({
      data: {
        sessionId,
        name: "quote_success",
        path: "/quote",
        entityType: "quote",
        entityId: String(quoteId),
        metadata: JSON.stringify({ itemCount, pieceCount }),
        occurredAt: now,
      },
    }),
  ]);
}

let lastRetentionRun = 0;

export async function applyAnalyticsRetentionIfDue(now = Date.now()): Promise<void> {
  if (now - lastRetentionRun < 6 * 60 * 60 * 1_000) return;
  lastRetentionRun = now;

  const configuredDays = Number(process.env.ANALYTICS_RETENTION_DAYS || 400);
  const retentionDays = Number.isFinite(configuredDays)
    ? Math.max(30, Math.min(730, Math.round(configuredDays)))
    : 400;
  const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1_000);
  await prisma.analyticsSession.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });
}

