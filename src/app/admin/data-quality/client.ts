import type { ApiErrorShape } from "./types";

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;

  constructor(status: number, error: ApiErrorShape) {
    super(error.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = error.code;
    this.fields = error.fields;
  }
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ data: T; pagination?: import("./types").PaginationMeta }> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError(response.status, {
      code: "INVALID_RESPONSE",
      message: "استجابة الخادم غير صالحة. حاول مرة أخرى.",
    });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiRequestError(response.status, {
      code: "INVALID_RESPONSE",
      message: "استجابة الخادم غير متوقعة.",
    });
  }

  const record = payload as Record<string, unknown>;
  if (!response.ok || record.ok !== true) {
    const nested =
      record.error && typeof record.error === "object" && !Array.isArray(record.error)
        ? (record.error as Record<string, unknown>)
        : null;
    const legacyMessage = typeof record.error === "string" ? record.error : null;
    const message =
      (nested && typeof nested.message === "string" && nested.message) ||
      legacyMessage ||
      (response.status === 401
        ? "انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة."
        : response.status === 403
          ? "لا تملك الصلاحية اللازمة لهذه العملية."
          : "تعذر إكمال الطلب.");

    throw new ApiRequestError(response.status, {
      code: nested && typeof nested.code === "string" ? nested.code : undefined,
      message,
      fields:
        nested && nested.fields && typeof nested.fields === "object"
          ? (nested.fields as Record<string, string>)
          : undefined,
    });
  }

  const meta =
    record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
      ? (record.meta as Record<string, unknown>)
      : null;
  const pagination =
    meta?.pagination &&
    typeof meta.pagination === "object" &&
    !Array.isArray(meta.pagination)
      ? (meta.pagination as import("./types").PaginationMeta)
      : undefined;

  return { data: record.data as T, pagination };
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError || error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
