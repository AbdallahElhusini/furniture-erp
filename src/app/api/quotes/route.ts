import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/api-auth";
import { catalogPublicationWhere } from "@/lib/catalog-publication";
import { prisma } from "@/lib/db";
import { FixedWindowRateLimiter } from "@/lib/fixed-window-rate-limiter";
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  getRequestClientKey,
  isSameOriginBrowserRequest,
  readBoundedJson,
} from "@/lib/public-request-security";
import { recordQuoteConversion } from "@/lib/analytics-server";

interface QuoteLineInput {
  catalogItemId?: unknown;
  id?: unknown;
  quantity?: unknown;
}

const QUOTE_LIMIT = 5;
const QUOTE_WINDOW_MS = 60 * 60 * 1000;
const QUOTE_MAX_CLIENTS = 10_000;
const QUOTE_MAX_BODY_BYTES = 32 * 1024;

const quoteLimiter = new FixedWindowRateLimiter({
  limit: QUOTE_LIMIT,
  windowMs: QUOTE_WINDOW_MS,
  maxEntries: QUOTE_MAX_CLIENTS,
});

function getText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : null;
}

function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "تم إرسال عدة طلبات. يرجى المحاولة لاحقاً" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
        "RateLimit-Limit": String(QUOTE_LIMIT),
        "RateLimit-Remaining": "0",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOriginBrowserRequest(request)) {
    return NextResponse.json(
      { error: "مصدر الطلب غير مسموح" },
      { status: 403 },
    );
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    return NextResponse.json(
      { error: "يجب إرسال الطلب بصيغة JSON" },
      { status: 415 },
    );
  }

  const clientKey = getRequestClientKey(request);
  const currentQuota = quoteLimiter.check(clientKey);
  if (!currentQuota.allowed) {
    return rateLimitResponse(currentQuota.retryAfterSeconds);
  }

  try {
    let bodyValue: unknown;
    try {
      bodyValue = await readBoundedJson(request, QUOTE_MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          { error: "حجم الطلب أكبر من الحد المسموح" },
          { status: 413 },
        );
      }
      if (error instanceof InvalidJsonBodyError) {
        return NextResponse.json(
          { error: "بيانات الطلب غير صحيحة" },
          { status: 400 },
        );
      }
      throw error;
    }

    if (!bodyValue || typeof bodyValue !== "object" || Array.isArray(bodyValue)) {
      return NextResponse.json(
        { error: "بيانات الطلب غير صحيحة" },
        { status: 400 },
      );
    }

    const body = bodyValue as Record<string, unknown>;
    const clientName = getText(body.clientName, 120);
    const clientPhone = getText(body.clientPhone ?? body.phone, 32);
    const clientEmail = getText(body.clientEmail ?? body.email, 254);
    const company = getText(body.company ?? body.companyName, 160);
    const message = getText(body.message ?? body.notes, 2_000);
    const rawItems = Array.isArray(body.items)
      ? (body.items as QuoteLineInput[])
      : [];

    if (
      !clientName ||
      !clientPhone ||
      !/^[+\d\s()\-]{7,32}$/.test(clientPhone)
    ) {
      return NextResponse.json(
        { error: "يرجى إدخال الاسم ورقم هاتف صحيح" },
        { status: 400 },
      );
    }

    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return NextResponse.json(
        { error: "البريد الإلكتروني غير صحيح" },
        { status: 400 },
      );
    }

    if (rawItems.length === 0 || rawItems.length > 100) {
      return NextResponse.json(
        { error: "أضف منتجاً واحداً على الأقل إلى طلب عرض السعر" },
        { status: 400 },
      );
    }

    const quantities = new Map<number, number>();
    for (const item of rawItems) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return NextResponse.json(
          { error: "بيانات المنتجات غير صحيحة" },
          { status: 400 },
        );
      }

      const catalogItemId = Number(item.catalogItemId ?? item.id);
      const quantity = Number(item.quantity);

      if (
        !Number.isSafeInteger(catalogItemId) ||
        catalogItemId <= 0 ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 999
      ) {
        return NextResponse.json(
          { error: "بيانات المنتجات غير صحيحة" },
          { status: 400 },
        );
      }

      quantities.set(
        catalogItemId,
        Math.min(999, (quantities.get(catalogItemId) || 0) + quantity),
      );
    }

    const productIds = [...quantities.keys()];
    const availableProducts = await prisma.catalogItem.findMany({
      where: { id: { in: productIds }, ...catalogPublicationWhere() },
      select: { id: true },
    });
    if (availableProducts.length !== productIds.length) {
      return NextResponse.json(
        { error: "أحد المنتجات لم يعد متاحاً. حدّث السلة وحاول مجدداً" },
        { status: 400 },
      );
    }

    const consumedQuota = quoteLimiter.consume(clientKey);
    if (!consumedQuota.allowed) {
      return rateLimitResponse(consumedQuota.retryAfterSeconds);
    }

    const quote = await prisma.quoteRequest.create({
      data: {
        clientName,
        clientPhone,
        clientEmail,
        company,
        message,
        status: "NEW",
        items: {
          create: productIds.map((catalogItemId) => ({
            catalogItemId,
            quantity: quantities.get(catalogItemId)!,
          })),
        },
      },
      select: { id: true },
    });

    await recordQuoteConversion(
      request,
      quote.id,
      productIds.length,
      [...quantities.values()].reduce((sum, quantity) => sum + quantity, 0),
    ).catch((error) => {
      console.error("Failed to record anonymous quote conversion", error);
    });

    return NextResponse.json(
      {
        success: true,
        quoteId: quote.id,
        message: "تم إرسال طلب عرض السعر بنجاح",
      },
      {
        status: 201,
        headers: {
          "RateLimit-Limit": String(QUOTE_LIMIT),
          "RateLimit-Remaining": String(consumedQuota.remaining),
        },
      },
    );
  } catch (error) {
    console.error("Error creating quote request:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء حفظ طلب عرض السعر. يرجى المحاولة مرة أخرى." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;

  try {
    const status = request.nextUrl.searchParams.get("status");
    const search = getText(request.nextUrl.searchParams.get("search"), 120);
    const where: Prisma.QuoteRequestWhereInput = {};

    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { clientName: { contains: search } },
        { clientPhone: { contains: search } },
        { company: { contains: search } },
      ];
    }

    const quotes = await prisma.quoteRequest.findMany({
      where,
      include: { items: { include: { catalogItem: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(quotes);
  } catch (error) {
    console.error("Error fetching quotes:", error);
    return NextResponse.json(
      { error: "Failed to load quotes." },
      { status: 500 },
    );
  }
}
