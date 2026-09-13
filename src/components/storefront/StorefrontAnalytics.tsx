"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  ANALYTICS_COOKIE_NAME,
  ANALYTICS_ACTIVITY_STORAGE_KEY,
  ANALYTICS_EVENT_ENDPOINT,
  ANALYTICS_OPT_OUT_KEY,
  ANALYTICS_SESSION_TIMEOUT_SECONDS,
  ANALYTICS_STORAGE_KEY,
  isAnalyticsEventName,
  sanitizeAnalyticsLabel,
  sanitizeAnalyticsMetadata,
  sanitizeAnalyticsPath,
  sanitizeAnalyticsSessionId,
  type AnalyticsEventInput,
} from "@/lib/analytics-contract";
import { STOREFRONT_ANALYTICS_EVENT } from "@/lib/storefront-analytics";

interface QueuedEvent {
  name: AnalyticsEventInput["name"];
  path: string;
  section?: string;
  entityType?: string;
  entityId?: string;
  metadata: Record<string, string | number | boolean>;
  occurredAt: string;
}

interface SectionTiming {
  name: string;
  path: string;
  visibleSince: number | null;
  durationMs: number;
}

interface NavigatorPrivacy extends Navigator {
  globalPrivacyControl?: boolean;
}

const FLUSH_INTERVAL_MS = 4_000;
const MIN_SECTION_DWELL_MS = 3_000;

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(";")) {
    const [cookieName, ...valueParts] = part.trim().split("=");
    if (cookieName === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function readSessionStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Cookie-only sessions remain functional when storage is unavailable.
  }
}

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function createSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function persistSessionId(sessionId: string): void {
  writeSessionStorage(ANALYTICS_STORAGE_KEY, sessionId);
  writeSessionStorage(ANALYTICS_ACTIVITY_STORAGE_KEY, String(Date.now()));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANALYTICS_COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${ANALYTICS_SESSION_TIMEOUT_SECONDS}; SameSite=Lax${secure}`;
}

function getOrCreateSessionId(): string {
  const fromCookie = sanitizeAnalyticsSessionId(readCookie(ANALYTICS_COOKIE_NAME));
  const fromStorage = sanitizeAnalyticsSessionId(
    readSessionStorage(ANALYTICS_STORAGE_KEY),
  );
  const storedActivity = Number(
    readSessionStorage(ANALYTICS_ACTIVITY_STORAGE_KEY),
  );
  const storageIsCurrent = Number.isFinite(storedActivity) &&
    Date.now() - storedActivity <= ANALYTICS_SESSION_TIMEOUT_SECONDS * 1_000;
  const sessionId = fromCookie || (storageIsCurrent ? fromStorage : null) || createSessionId();
  persistSessionId(sessionId);
  return sessionId;
}

function trackingIsDisabled(): boolean {
  const navigatorPrivacy = navigator as NavigatorPrivacy;
  return (
    readLocalStorage(ANALYTICS_OPT_OUT_KEY) === "true" ||
    navigatorPrivacy.globalPrivacyControl === true ||
    navigator.doNotTrack === "1"
  );
}

function deviceType(): "mobile" | "tablet" | "desktop" {
  if (window.innerWidth < 768) return "mobile";
  if (window.innerWidth < 1100) return "tablet";
  return "desktop";
}

function referrerHost(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin ? undefined : referrer.host;
  } catch {
    return undefined;
  }
}

function formIdentifier(form: HTMLFormElement): string {
  const explicit = form.dataset.analyticsForm || form.id;
  if (explicit) return sanitizeAnalyticsLabel(explicit, 80) || "storefront-form";
  const forms = [...document.querySelectorAll("main form")];
  return `form-${Math.max(0, forms.indexOf(form)) + 1}`;
}

export function StorefrontAnalytics() {
  const pathname = usePathname();
  const enabledRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const landingPathRef = useRef("/");
  const currentPathRef = useRef("/");
  const lastActivityAtRef = useRef(0);
  const queueRef = useRef<QueuedEvent[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sectionTimingsRef = useRef(new Map<Element, SectionTiming>());
  const startedFormsRef = useRef(new WeakSet<HTMLFormElement>());

  const sessionContext = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      landingPath: landingPathRef.current,
      referrerHost: referrerHost(),
      language: navigator.language,
      deviceType: deviceType(),
      campaignSource: params.get("utm_source") || undefined,
      campaignMedium: params.get("utm_medium") || undefined,
      campaignName: params.get("utm_campaign") || undefined,
    };
  }, []);

  const flush = useCallback((useBeacon = false) => {
    const sessionId = sessionIdRef.current;
    if (!enabledRef.current || !sessionId || queueRef.current.length === 0) return;

    const events = queueRef.current.splice(0, 20);
    const body = JSON.stringify({
      sessionId,
      session: sessionContext(),
      events,
    });

    if (useBeacon && typeof navigator.sendBeacon === "function") {
      const accepted = navigator.sendBeacon(
        ANALYTICS_EVENT_ENDPOINT,
        new Blob([body], { type: "application/json" }),
      );
      if (accepted) return;
    }

    void fetch(ANALYTICS_EVENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      // Analytics must never interrupt shopping. A later interaction will
      // retry only new events, keeping the queue bounded and non-invasive.
    });
  }, [sessionContext]);

  const enqueue = useCallback((input: AnalyticsEventInput) => {
    if (!enabledRef.current || !isAnalyticsEventName(input.name)) return;
    const now = Date.now();
    if (
      lastActivityAtRef.current > 0 &&
      now - lastActivityAtRef.current > ANALYTICS_SESSION_TIMEOUT_SECONDS * 1_000
    ) {
      const nextSessionId = createSessionId();
      sessionIdRef.current = nextSessionId;
      landingPathRef.current = currentPathRef.current;
      queueRef.current = [{
        name: "page_view",
        path: currentPathRef.current,
        metadata: {},
        occurredAt: new Date(now).toISOString(),
      }];
      persistSessionId(nextSessionId);
    }
    lastActivityAtRef.current = now;
    writeSessionStorage(ANALYTICS_ACTIVITY_STORAGE_KEY, String(now));
    const path = sanitizeAnalyticsPath(input.path || currentPathRef.current);
    if (!path || input.name === "quote_success") return;

    queueRef.current.push({
      name: input.name,
      path,
      section: sanitizeAnalyticsLabel(input.section, 100) || undefined,
      entityType: sanitizeAnalyticsLabel(input.entityType, 40) || undefined,
      entityId: sanitizeAnalyticsLabel(String(input.entityId ?? ""), 80) || undefined,
      metadata: sanitizeAnalyticsMetadata(input.metadata),
      occurredAt: input.occurredAt || new Date().toISOString(),
    });
    if (queueRef.current.length >= 10) flush();
  }, [flush]);

  const finishSectionTimings = useCallback(() => {
    const now = performance.now();
    for (const timing of sectionTimingsRef.current.values()) {
      const durationMs = timing.durationMs + (
        timing.visibleSince === null ? 0 : now - timing.visibleSince
      );
      if (durationMs >= MIN_SECTION_DWELL_MS) {
        enqueue({
          name: "section_dwell",
          path: timing.path,
          section: timing.name,
          metadata: { durationMs },
        });
      }
    }
    sectionTimingsRef.current.clear();
  }, [enqueue]);

  const observeSections = useCallback((path: string) => {
    observerRef.current?.disconnect();
    sectionTimingsRef.current.clear();

    const explicitlyNamed = [...document.querySelectorAll("main [data-analytics-section]")];
    const candidates = explicitlyNamed.length > 0
      ? explicitlyNamed
      : [...document.querySelectorAll("main > section, main > div > section")];
    const uniqueCandidates = [...new Set(candidates)].slice(0, 40);

    const observer = new IntersectionObserver((entries) => {
      const now = performance.now();
      for (const entry of entries) {
        const timing = sectionTimingsRef.current.get(entry.target);
        if (!timing) continue;
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        if (visible && timing.visibleSince === null) {
          timing.visibleSince = now;
        } else if (!visible && timing.visibleSince !== null) {
          timing.durationMs += now - timing.visibleSince;
          timing.visibleSince = null;
        }
      }
    }, { threshold: [0, 0.5, 0.75] });

    uniqueCandidates.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      const sectionName = sanitizeAnalyticsLabel(
        htmlElement.dataset.analyticsSection || htmlElement.id || `section-${index + 1}`,
        100,
      ) || `section-${index + 1}`;
      sectionTimingsRef.current.set(element, {
        name: sectionName,
        path,
        visibleSince: null,
        durationMs: 0,
      });
      observer.observe(element);
    });
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    if (trackingIsDisabled()) return;
    enabledRef.current = true;
    sessionIdRef.current = getOrCreateSessionId();
    lastActivityAtRef.current = Date.now();
    landingPathRef.current = sanitizeAnalyticsPath(window.location.pathname) || "/";
    currentPathRef.current = landingPathRef.current;

    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<AnalyticsEventInput>).detail;
      if (detail) enqueue(detail);
    };
    const handleFocus = (event: FocusEvent) => {
      const form = (event.target as Element | null)?.closest("main form") as HTMLFormElement | null;
      if (!form || startedFormsRef.current.has(form)) return;
      startedFormsRef.current.add(form);
      enqueue({
        name: "form_start",
        entityType: "form",
        entityId: formIdentifier(form),
        metadata: { formId: formIdentifier(form) },
      });
    };
    const handleSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || !form.closest("main")) return;
      enqueue({
        name: "form_submit",
        entityType: "form",
        entityId: formIdentifier(form),
        metadata: { formId: formIdentifier(form) },
      });
      flush();
    };
    const handlePageHide = () => {
      finishSectionTimings();
      flush(true);
    };

    window.addEventListener(STOREFRONT_ANALYTICS_EVENT, handleCustomEvent);
    document.addEventListener("focusin", handleFocus);
    document.addEventListener("submit", handleSubmit);
    window.addEventListener("pagehide", handlePageHide);
    const intervalId = window.setInterval(() => flush(), FLUSH_INTERVAL_MS);

    return () => {
      finishSectionTimings();
      flush(true);
      observerRef.current?.disconnect();
      window.clearInterval(intervalId);
      window.removeEventListener(STOREFRONT_ANALYTICS_EVENT, handleCustomEvent);
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("submit", handleSubmit);
      window.removeEventListener("pagehide", handlePageHide);
      enabledRef.current = false;
    };
  }, [enqueue, finishSectionTimings, flush]);

  useEffect(() => {
    if (!enabledRef.current) return;
    const path = sanitizeAnalyticsPath(pathname) || "/";
    if (currentPathRef.current !== path) finishSectionTimings();
    observerRef.current?.disconnect();
    currentPathRef.current = path;
    enqueue({ name: "page_view", path });
    const frameId = window.requestAnimationFrame(() => observeSections(path));
    return () => window.cancelAnimationFrame(frameId);
  }, [enqueue, finishSectionTimings, observeSections, pathname]);

  return null;
}
