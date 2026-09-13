import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, Sparkles } from "lucide-react";
import {
  formatStorefrontNumber,
  type StorefrontLocale,
} from "@/lib/i18n/storefront";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import { STOREFRONT_PAGE_CONTENT_DEFAULTS, type StorefrontPageContent } from "@/lib/storefront-content-defaults";

export function StorefrontNotFoundView({ locale, content }: { locale: StorefrontLocale; content?: StorefrontPageContent["notFound"] }) {
  const copy = content || STOREFRONT_PAGE_CONTENT_DEFAULTS[locale].notFound;
  const ForwardArrow = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <section
      className="editorial-band stage-grid relative isolate flex min-h-[calc(100svh-6.5rem)] items-center overflow-hidden border-b border-white/10 py-16 sm:py-24 [--stage-grid-line:rgba(255,255,255,0.04)] [--stage-grid-size:5rem]"
      aria-labelledby="not-found-title"
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <span className="absolute inset-y-0 left-[22%] hidden w-px bg-white/8 lg:block" />
        <span className="absolute left-[22%] top-[18%] hidden -translate-x-1/2 font-mono text-[9px] tracking-[0.16em] text-white/28 lg:block">
          {copy.routeUnknown}
        </span>
      </div>

      <div className="editorial-shell editorial-crosshair relative grid overflow-hidden rounded-[var(--shape-panel)] border border-white/12 bg-white/[0.035] lg:grid-cols-[0.72fr_1.28fr]">
        <div className="relative flex min-h-72 flex-col justify-between border-b border-white/10 p-7 sm:min-h-[32rem] sm:p-10 lg:border-b-0 lg:border-l">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] text-white/45">
            <span>{copy.errorRoute}</span>
            <Sparkles className="size-4 text-[var(--brass-300)]" aria-hidden="true" />
          </div>
          <p className="font-mono text-[clamp(7rem,20vw,15rem)] font-light leading-none text-white/10" dir="ltr">
            {formatStorefrontNumber(404, locale)}
          </p>
          <p className="max-w-xs border-t border-white/10 pt-5 text-xs leading-6 text-white/48">
            {copy.savedBoard}
          </p>
        </div>

        <div className="flex flex-col justify-center bg-[linear-gradient(118deg,rgba(255,255,255,0.055),transparent_58%)] p-7 sm:p-12 lg:p-16">
          <span className="editorial-kicker !text-[var(--brass-300)] before:!bg-[var(--brass-300)]">{copy.eyebrow}</span>
          <h1 id="not-found-title" className="editorial-heading mt-6 max-w-3xl">{copy.title}</h1>
          <p className="mt-5 max-w-xl text-sm font-light leading-7 text-white/62 sm:text-base">{copy.body}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href={localizedStorefrontPath(locale, "/catalog")}
              className="architectural-action inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--shape-control)] bg-[var(--surface-paper)] px-7 text-sm font-bold text-[var(--surface-ink)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-ink)]"
            >
              <Search className="size-4" aria-hidden="true" />
              {copy.browse}
            </Link>
            <Link
              href={localizedStorefrontPath(locale, "/")}
              className="architectural-action inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--shape-control)] border border-white/18 bg-white/5 px-7 text-sm font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-ink)]"
            >
              {copy.home}
              <ForwardArrow className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
