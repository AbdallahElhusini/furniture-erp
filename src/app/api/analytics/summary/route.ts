import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

const MAX_RANGE_DAYS = 90;

function parseRange(request: NextRequest) {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1_000);
  defaultFrom.setUTCHours(0, 0, 0, 0);
  const defaultTo = new Date(now);
  defaultTo.setUTCHours(23, 59, 59, 999);

  const fromValue = request.nextUrl.searchParams.get("from");
  const toValue = request.nextUrl.searchParams.get("to");
  const from = fromValue && /^\d{4}-\d{2}-\d{2}$/.test(fromValue)
    ? new Date(`${fromValue}T00:00:00.000Z`)
    : defaultFrom;
  const to = toValue && /^\d{4}-\d{2}-\d{2}$/.test(toValue)
    ? new Date(`${toValue}T23:59:59.999Z`)
    : defaultTo;

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from > to ||
    to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1_000
  ) {
    return null;
  }
  return { from, to };
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;

  const range = parseRange(request);
  if (!range) {
    return NextResponse.json(
      { error: `Date range must be valid and no longer than ${MAX_RANGE_DAYS} days` },
      { status: 400 },
    );
  }
  const occurredAt = { gte: range.from, lte: range.to };

  const [
    sessionRows,
    pageViews,
    topPageGroups,
    sectionRows,
    conversionGroups,
    recentEvents,
    sessionActivityGroups,
    projectBoardOpens,
    formSubmits,
    quoteSuccesses,
    quoteSuccessSessionGroups,
    productPageViews,
    pageViewTimeline,
  ] = await Promise.all([
    prisma.analyticsSession.findMany({
      where: { events: { some: { occurredAt } } },
      select: {
        referrerHost: true,
        campaignSource: true,
        deviceType: true,
      },
    }),
    prisma.analyticsEvent.count({ where: { name: "page_view", occurredAt } }),
    prisma.analyticsEvent.groupBy({
      by: ["path"],
      where: { name: "page_view", occurredAt },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { name: "section_dwell", occurredAt, section: { not: null } },
      select: { path: true, section: true, metadata: true },
      orderBy: { occurredAt: "desc" },
      take: 15_000,
    }),
    prisma.analyticsEvent.groupBy({
      by: ["name"],
      where: {
        occurredAt,
        name: { in: ["cart_add", "project_board_open", "form_submit", "quote_success"] },
      },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { occurredAt },
      select: {
        id: true,
        name: true,
        path: true,
        section: true,
        entityType: true,
        entityId: true,
        metadata: true,
        occurredAt: true,
        session: { select: { deviceType: true, campaignSource: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    prisma.analyticsEvent.groupBy({
      by: ["sessionId"],
      where: { occurredAt },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
    }),
    prisma.analyticsEvent.count({ where: { name: "project_board_open", occurredAt } }),
    prisma.analyticsEvent.count({ where: { name: "form_submit", occurredAt } }),
    prisma.analyticsEvent.count({ where: { name: "quote_success", occurredAt } }),
    prisma.analyticsEvent.groupBy({
      by: ["sessionId"],
      where: { name: "quote_success", occurredAt },
    }),
    prisma.analyticsEvent.count({
      where: { name: "page_view", path: { startsWith: "/product/" }, occurredAt },
    }),
    prisma.analyticsEvent.findMany({
      where: { name: "page_view", occurredAt },
      select: { occurredAt: true },
      orderBy: { occurredAt: "asc" },
      take: 25_000,
    }),
  ]);

  const sectionMap = new Map<string, {
    path: string;
    section: string;
    views: number;
    totalDurationMs: number;
  }>();
  for (const row of sectionRows) {
    if (!row.section) continue;
    const key = `${row.path}\u0000${row.section}`;
    const current = sectionMap.get(key) || {
      path: row.path,
      section: row.section,
      views: 0,
      totalDurationMs: 0,
    };
    const duration = Number(parseMetadata(row.metadata).durationMs || 0);
    current.views += 1;
    current.totalDurationMs += Number.isFinite(duration)
      ? Math.max(0, Math.min(duration, 4 * 60 * 60 * 1_000))
      : 0;
    sectionMap.set(key, current);
  }

  const sourceMap = new Map<string, number>();
  for (const session of sessionRows) {
    const source = session.campaignSource || session.referrerHost || "direct";
    sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
  }

  const dailyMap = new Map<string, number>();
  for (const row of pageViewTimeline) {
    const day = row.occurredAt.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
  }

  const deviceMap = new Map<string, number>();
  for (const session of sessionRows) {
    const device = session.deviceType || "unknown";
    deviceMap.set(device, (deviceMap.get(device) || 0) + 1);
  }

  const sessionDurationTotal = sessionActivityGroups.reduce((sum, session) => {
    const duration = (session._max.occurredAt?.getTime() || 0) -
      (session._min.occurredAt?.getTime() || 0);
    return sum + Math.max(0, Math.min(duration, 4 * 60 * 60 * 1_000));
  }, 0);
  const uniqueSessions = sessionActivityGroups.length;
  const convertedSessions = quoteSuccessSessionGroups.length;

  const response = NextResponse.json({
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      maxDays: MAX_RANGE_DAYS,
    },
    overview: {
      uniqueSessions,
      pageViews,
      pagesPerSession: uniqueSessions ? pageViews / uniqueSessions : 0,
      averageSessionSeconds: uniqueSessions
        ? Math.round(sessionDurationTotal / uniqueSessions / 1_000)
        : 0,
      convertedSessions,
      conversionRate: uniqueSessions ? convertedSessions / uniqueSessions : 0,
    },
    funnel: [
      { key: "sessions", label: "Sessions", count: uniqueSessions },
      { key: "product_views", label: "Product views", count: productPageViews },
      { key: "project_board", label: "Project board opens", count: projectBoardOpens },
      { key: "form_submit", label: "Form submits", count: formSubmits },
      { key: "quote_success", label: "Quote successes", count: quoteSuccesses },
    ],
    topPages: topPageGroups
      .map((row) => ({ path: row.path, views: row._count._all }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 15),
    topSections: [...sectionMap.values()]
      .map((row) => ({
        ...row,
        averageDurationSeconds: row.views
          ? Math.round(row.totalDurationMs / row.views / 1_000)
          : 0,
      }))
      .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
      .slice(0, 15),
    conversions: conversionGroups
      .map((row) => ({ name: row.name, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    devices: [...deviceMap.entries()]
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count),
    sources: [...sourceMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    daily: [...dailyMap.entries()].map(([date, views]) => ({ date, views })),
    recentEvents: recentEvents.map((event) => ({
      ...event,
      metadata: parseMetadata(event.metadata),
    })),
    sampling: {
      sectionEventsTruncated: sectionRows.length === 15_000,
      pageViewTimelineTruncated: pageViewTimeline.length === 25_000,
    },
    integrations: {
      meta: {
        enabled: process.env.META_ADS_ENABLED === "true",
        pixelConfigured: Boolean(process.env.META_PIXEL_ID?.trim()),
        capiConfigured: Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim()),
        testModeConfigured: Boolean(process.env.META_CAPI_TEST_EVENT_CODE?.trim()),
        consentRequired: process.env.META_MARKETING_CONSENT_REQUIRED !== "false",
        // IDs and tokens are intentionally never returned to the dashboard.
        browserReady:
          process.env.META_ADS_ENABLED === "true" &&
          Boolean(process.env.META_PIXEL_ID?.trim()),
        serverReady:
          process.env.META_ADS_ENABLED === "true" &&
          Boolean(process.env.META_PIXEL_ID?.trim()) &&
          Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim()),
      },
    },
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
