import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FixedWindowRateLimiter } from "@/lib/fixed-window-rate-limiter";
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  getRequestClientKey,
  isSameOriginBrowserRequest,
  readBoundedJson,
} from "@/lib/public-request-security";
import {
  ANALYTICS_COOKIE_NAME,
  ANALYTICS_SESSION_TIMEOUT_SECONDS,
  isAnalyticsEventName,
  sanitizeAnalyticsLabel,
  sanitizeAnalyticsMetadata,
  sanitizeAnalyticsPath,
  sanitizeAnalyticsSessionId,
} from "@/lib/analytics-contract";
import { applyAnalyticsRetentionIfDue } from "@/lib/analytics-server";

const MAX_BODY_BYTES = 48 * 1024;
const MAX_EVENTS_PER_BATCH = 20;
const PUBLIC_EVENT_NAMES = new Set([
  "page_view",
  "section_dwell",
  "form_start",
  "form_submit",
  "cart_add",
  "cart_update",
  "cart_remove",
  "cart_clear",
  "project_board_snapshot",
  "project_board_open",
]);

const clientLimiter = new FixedWindowRateLimiter({
  limit: 120,
  windowMs: 5 * 60 * 1_000,
  maxEntries: 20_000,
});
const sessionLimiter = new FixedWindowRateLimiter({
  limit: 80,
  windowMs: 5 * 60 * 1_000,
  maxEntries: 50_000,
});

function safeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : null;
}

function safeLanguage(value: unknown): string | null {
  const normalized = safeString(value, 20);
  return normalized && /^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(normalized)
    ? normalized.toLowerCase()
    : null;
}

function safeDevice(value: unknown): string | null {
  return value === "mobile" || value === "tablet" || value === "desktop"
    ? value
    : null;
}

function safeReferrerHost(value: unknown): string | null {
  const normalized = safeString(value, 160)?.toLowerCase().replace(/^www\./, "");
  return normalized && /^(?:[a-z0-9-]+\.)*[a-z0-9-]+(?::\d{1,5})?$/.test(normalized)
    ? normalized
    : null;
}

function safeCampaign(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-");
  return normalized ? normalized.slice(0, 80) : null;
}

function parseOccurredAt(value: unknown, now: Date): Date {
  if (typeof value !== "string") return now;
  const candidate = new Date(value);
  if (Number.isNaN(candidate.getTime())) return now;
  const difference = candidate.getTime() - now.getTime();
  return difference > 5 * 60 * 1_000 || difference < -24 * 60 * 60 * 1_000
    ? now
    : candidate;
}

function limitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Analytics request limit reached" },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOriginBrowserRequest(request)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    return NextResponse.json({ error: "JSON body required" }, { status: 415 });
  }

  let bodyValue: unknown;
  try {
    bodyValue = await readBoundedJson(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    throw error;
  }

  if (!bodyValue || typeof bodyValue !== "object" || Array.isArray(bodyValue)) {
    return NextResponse.json({ error: "Invalid analytics payload" }, { status: 400 });
  }

  const body = bodyValue as Record<string, unknown>;
  const sessionId = sanitizeAnalyticsSessionId(body.sessionId);
  const rawEvents = Array.isArray(body.events) ? body.events : [];
  if (!sessionId || rawEvents.length === 0 || rawEvents.length > MAX_EVENTS_PER_BATCH) {
    return NextResponse.json({ error: "Invalid analytics payload" }, { status: 400 });
  }

  const clientQuota = clientLimiter.consume(getRequestClientKey(request));
  if (!clientQuota.allowed) return limitedResponse(clientQuota.retryAfterSeconds);
  const sessionQuota = sessionLimiter.consume(sessionId);
  if (!sessionQuota.allowed) return limitedResponse(sessionQuota.retryAfterSeconds);

  const now = new Date();
  const events = rawEvents.flatMap((rawEvent) => {
    if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) return [];
    const candidate = rawEvent as Record<string, unknown>;
    if (
      !isAnalyticsEventName(candidate.name) ||
      !PUBLIC_EVENT_NAMES.has(candidate.name)
    ) return [];

    const path = sanitizeAnalyticsPath(candidate.path);
    if (!path) return [];
    const section = sanitizeAnalyticsLabel(candidate.section, 100);
    const entityType = sanitizeAnalyticsLabel(candidate.entityType, 40);
    const entityId = sanitizeAnalyticsLabel(String(candidate.entityId ?? ""), 80);

    return [{
      sessionId,
      name: candidate.name,
      path,
      section,
      entityType,
      entityId,
      metadata: JSON.stringify(sanitizeAnalyticsMetadata(candidate.metadata)),
      occurredAt: parseOccurredAt(candidate.occurredAt, now),
    }];
  });

  if (events.length === 0) {
    return NextResponse.json({ error: "No valid analytics events" }, { status: 400 });
  }

  const sessionValue = body.session;
  const session = sessionValue && typeof sessionValue === "object" && !Array.isArray(sessionValue)
    ? sessionValue as Record<string, unknown>
    : {};
  const landingPath = sanitizeAnalyticsPath(session.landingPath) || events[0].path;
  const lastPath = events.at(-1)?.path || landingPath;
  const referrerHost = safeReferrerHost(session.referrerHost);
  const language = safeLanguage(session.language);
  const deviceType = safeDevice(session.deviceType);
  const campaignSource = safeCampaign(session.campaignSource);
  const campaignMedium = safeCampaign(session.campaignMedium);
  const campaignName = safeCampaign(session.campaignName);

  await prisma.$transaction([
    prisma.analyticsSession.upsert({
      where: { id: sessionId },
      create: {
        id: sessionId,
        landingPath,
        lastPath,
        referrerHost,
        language,
        deviceType,
        campaignSource,
        campaignMedium,
        campaignName,
        lastSeenAt: now,
        eventCount: events.length,
      },
      update: {
        lastPath,
        lastSeenAt: now,
        eventCount: { increment: events.length },
        ...(referrerHost ? { referrerHost } : {}),
        ...(language ? { language } : {}),
        ...(deviceType ? { deviceType } : {}),
        ...(campaignSource ? { campaignSource } : {}),
        ...(campaignMedium ? { campaignMedium } : {}),
        ...(campaignName ? { campaignName } : {}),
      },
    }),
    prisma.analyticsEvent.createMany({ data: events }),
  ]);

  void applyAnalyticsRetentionIfDue().catch((error) => {
    console.error("Analytics retention cleanup failed", error);
  });

  const response = NextResponse.json({ accepted: events.length }, { status: 202 });
  response.cookies.set(ANALYTICS_COOKIE_NAME, sessionId, {
    httpOnly: false,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: ANALYTICS_SESSION_TIMEOUT_SECONDS,
  });
  return response;
}
