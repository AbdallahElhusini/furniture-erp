"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  MoveUpLeft,
  MoveUpRight,
} from "lucide-react";
import { interpolateStorefrontMessage } from "@/lib/i18n/storefront";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { locale, dictionary } = useStorefrontI18n();
  const { footer } = dictionary;
  const isRtl = locale === "ar";
  const ForwardArrow = isRtl ? ArrowLeft : ArrowRight;
  const UpForwardArrow = isRtl ? MoveUpLeft : MoveUpRight;

  return (
    <footer
      className="relative overflow-hidden bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
      aria-labelledby="footer-heading"
    >
      <div className="border-b border-[var(--border-inverse)] bg-[var(--primary)]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-12 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end lg:px-8">
          <span
            className="font-mono text-5xl font-light tracking-[-0.08em] text-[var(--text-inverse-muted)] sm:text-6xl"
            aria-hidden="true"
          >
            03
          </span>
          <div className="max-w-3xl">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-inverse-muted)]">
              {footer.eyebrow}
            </span>
            <h2
              id="footer-heading"
              className="mt-3 text-3xl font-light leading-tight sm:text-5xl"
            >
              {footer.titleLead}
              <span className="block font-extrabold">
                {footer.titleStrong}
              </span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--text-inverse-muted)]">
              {footer.intro}
            </p>
          </div>
          <Link
            href={localizedStorefrontPath(locale, "/quote")}
            className="group inline-flex min-h-12 items-center justify-between gap-8 rounded-md bg-[var(--bg-card)] px-6 py-3 text-sm font-extrabold text-[var(--primary)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-inverse)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--primary)] md:justify-center motion-reduce:transform-none motion-reduce:transition-none"
          >
            {footer.cta}
            <ForwardArrow
              className="h-4 w-4 transition-transform group-hover:translate-x-[var(--direction-shift,0)] motion-reduce:transform-none motion-reduce:transition-none"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-7 pt-14 sm:px-6 lg:px-8 lg:pt-20">
        <div className="grid gap-12 border-b border-[var(--border-inverse)] pb-14 md:grid-cols-2 lg:grid-cols-[1.45fr_0.7fr_1fr_1.05fr] lg:gap-10">
          <div className="max-w-md">
            <Link
              href={localizedStorefrontPath(locale, "/")}
              className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--surface-inverse)]"
              aria-label={dictionary.common.brandHome}
            >
              <Image
                src="/images/brand/hatab-wordmark.png"
                alt=""
                width={220}
                height={74}
                className="h-[4.35rem] w-auto object-contain brightness-0 invert"
              />
            </Link>
            <p className="mt-7 text-sm font-light leading-8 text-[var(--text-inverse-muted)]">
              {footer.about}
            </p>
            <LanguageSwitcher inverse className="mt-7" />
          </div>

          <nav aria-label={footer.siteLinksLabel}>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brass-300)]">
              {footer.exploreHeading}
            </h3>
            <ul className="mt-6 space-y-3.5">
              {footer.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={localizedStorefrontPath(locale, link.href)}
                    className="inline-flex rounded-sm text-sm text-[var(--text-inverse-muted)] transition-colors hover:text-[var(--text-inverse)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)] motion-reduce:transition-none"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={footer.categoryLinksLabel}>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brass-300)]">
              {footer.categoriesHeading}
            </h3>
            <ul className="mt-6 space-y-3.5">
              {footer.categories.map((link) => (
                <li key={link.slug}>
                  <Link
                    href={localizedStorefrontPath(locale, `/catalog?category=${link.slug}`)}
                    className="inline-flex rounded-sm text-sm text-[var(--text-inverse-muted)] transition-colors hover:text-[var(--text-inverse)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)] motion-reduce:transition-none"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brass-300)]">
              {footer.journeyHeading}
            </h3>
            <div className="mt-6 border-t border-[var(--border-inverse)] pt-5">
              <FileText
                className="h-5 w-5 text-[var(--brass-300)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <p className="mt-4 text-sm leading-7 text-[var(--text-inverse-muted)]">
                {footer.journeyBody}
              </p>
              <Link
                href={localizedStorefrontPath(locale, "/quote")}
                className="group mt-5 inline-flex items-center gap-2 rounded-sm text-xs font-extrabold text-[var(--text-inverse)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)]"
              >
                {footer.journeyCta}
                <UpForwardArrow
                  className="h-3.5 w-3.5 transition-transform motion-reduce:transform-none motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </div>
        </div>

        <div className="relative pt-7">
          <div className="flex flex-col gap-3 text-[11px] text-[var(--text-inverse-muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>
              {interpolateStorefrontMessage(footer.copyright, {
                year: currentYear,
              })}
            </p>
            <p dir={locale === "ar" ? "rtl" : "ltr"} className="tracking-[0.12em]">
              {footer.signature}
            </p>
          </div>
          <p
            dir="ltr"
            className="pointer-events-none mt-8 select-none overflow-hidden whitespace-nowrap text-center font-sans text-[clamp(4.8rem,15vw,12rem)] font-black leading-[0.72] tracking-[-0.06em] text-[color-mix(in_srgb,var(--text-inverse)_5%,transparent)]"
            aria-hidden="true"
          >
            HATAB
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
