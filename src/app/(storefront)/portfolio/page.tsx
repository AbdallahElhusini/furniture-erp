import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  LayoutTemplate,
  MessageSquareText,
} from "lucide-react";
import {
  formatStorefrontNumber,
  interpolateStorefrontMessage,
  type StorefrontLocale,
} from "@/lib/i18n/storefront";
import { getStorefrontLocale } from "@/lib/i18n/storefront-server";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import { getStorefrontPageContent, getStorefrontPageContentWithMedia } from "@/lib/site-content-server";
import { buildBreadcrumbJsonLd, buildStorefrontMetadata } from "@/lib/seo";
import { absoluteSiteUrl, serializeJsonLd } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, content] = await Promise.all([getStorefrontLocale(), getStorefrontPageContent()]);
  const copy = content[locale].portfolio;
  return buildStorefrontMetadata({
    locale,
    path: "/portfolio",
    title: copy.metaTitle,
    description: copy.description,
    keywords: locale === "ar"
      ? ["مشروعات تأثيث المكاتب", "تجهيز مساحات العمل", "تصميم مكاتب"]
      : ["office furnishing projects", "workspace fit out", "office design process"],
  });
}

const PROJECT_STEP_ICONS = [LayoutTemplate, FileCheck2, MessageSquareText] as const;

function formatPortfolioIndex(value: number, locale: StorefrontLocale): string {
  return formatStorefrontNumber(value, locale).padStart(2, locale === "ar" ? "٠" : "0");
}

function mediaObjectPosition(metadata: string | undefined): string {
  if (!metadata) return "50% 50%";
  try {
    const parsed = JSON.parse(metadata) as { objectPosition?: unknown };
    if (
      typeof parsed.objectPosition === "string" &&
      parsed.objectPosition.length <= 48 &&
      /^[a-z0-9.%\s-]+$/i.test(parsed.objectPosition)
    ) {
      return parsed.objectPosition;
    }
  } catch {
    // Invalid CMS metadata must never prevent the public page from rendering.
  }
  return "50% 50%";
}

export default async function PortfolioPage() {
  const [locale, resolved] = await Promise.all([getStorefrontLocale(), getStorefrontPageContentWithMedia()]);
  const copy = resolved.contentByLocale[locale].portfolio;
  const heroMedia = resolved.media["portfolio.hero.image"];
  const ctaMedia = resolved.media["portfolio.ctaBanner.image"];
  const heroObjectPosition = mediaObjectPosition(heroMedia?.metadata);
  const ctaObjectPosition = mediaObjectPosition(ctaMedia?.metadata);
  const referenceLabel = locale === "ar"
    ? "صورة مرجعية للاتجاه البصري — ليست دراسة حالة منشورة"
    : "Editorial reference image — not a published case study";
  const DirectionalChevron = locale === "ar" ? ChevronLeft : ChevronRight;
  const ForwardArrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const canonicalUrl = absoluteSiteUrl(localizedStorefrontPath(locale, "/portfolio"));
  const portfolioJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: copy.metaTitle,
        description: copy.description,
        inLanguage: locale,
        // No Project or ItemList entities are emitted until real public case
        // studies exist. The visible page currently states that explicitly.
      },
      {
        "@id": `${canonicalUrl}#breadcrumbs`,
        ...buildBreadcrumbJsonLd(locale, [
          { name: copy.home, path: "/" },
          { name: copy.projects },
        ]),
      },
    ],
  };
  return (
    <div className="architectural-line-field min-h-screen bg-[var(--surface-editorial)] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(portfolioJsonLd) }}
      />
      <header className="architectural-banner px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:px-8 lg:pb-24">
        <div className="shell-container relative z-10">
          <nav
            aria-label={copy.breadcrumb}
            className="mb-10 flex items-center gap-2 border-b border-[var(--border-ink)] pb-4 text-xs text-[var(--text-muted)]"
          >
            <Link
              href={localizedStorefrontPath(locale, "/")}
              className="transition-colors hover:text-[var(--primary)]"
            >
              {copy.home}
            </Link>
            <DirectionalChevron className="h-3 w-3" aria-hidden="true" />
            <span className="font-bold text-[var(--text-strong)]">
              {copy.projects}
            </span>
          </nav>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.52fr)] lg:items-end lg:gap-20">
            <div>
              <div className="flex items-center gap-5">
                <span className="font-mono text-5xl font-light tracking-[-0.08em] text-[var(--primary)] sm:text-7xl">
                  {formatPortfolioIndex(0, locale)}
                </span>
                <span className="h-px w-14 bg-[var(--border-strong)]" aria-hidden="true" />
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary)]">
                  {copy.documentedSpaces}
                </span>
              </div>
              <h1 className="mt-8 max-w-5xl text-[clamp(3.5rem,8vw,7.5rem)] font-light leading-[0.9] tracking-[-0.05em] text-[var(--text-strong)]">
                {copy.heroLead}
                <span className="block font-extrabold">{copy.heroStrong}</span>
              </h1>
              <p className="mt-8 max-w-2xl border-r border-[var(--primary)] pr-5 text-sm leading-8 text-[var(--text-muted)] sm:text-base">
                {copy.heroBody}
              </p>
            </div>

            <aside className="border-s border-[var(--border-strong)] ps-6 sm:ps-8" aria-label={copy.publicationFrame}>
              <div className="flex items-center justify-between gap-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                  {copy.publicationFrame}
                </span>
                <span className="font-mono text-xs text-[var(--text-soft)]">
                  {formatPortfolioIndex(0, locale)} / {formatPortfolioIndex(0, locale)}
                </span>
              </div>
              <p className="mt-8 text-2xl font-light leading-snug text-[var(--text-strong)] sm:text-3xl">
                {copy.frameLead}
                <span className="block font-extrabold">{copy.frameStrong}</span>
              </p>
              <p className="mt-8 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-soft)]">
                {interpolateStorefrontMessage(copy.axisLabel, { index: formatPortfolioIndex(2, locale) })}
              </p>
            </aside>
          </div>

          <figure className="relative mt-12 overflow-hidden rounded-[var(--shape-panel)] border border-[var(--border)] bg-[var(--surface-subtle)] shadow-stage sm:mt-16">
            <div className="relative min-h-[22rem] sm:min-h-[32rem] lg:min-h-[42rem]">
              {heroMedia?.url ? (
                <Image
                  src={heroMedia.url}
                  alt={(locale === "ar" ? heroMedia.altAr : heroMedia.altEn) || copy.publicationFrame}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 1280px"
                  className="object-cover"
                  style={{ objectPosition: heroObjectPosition }}
                />
              ) : (
                <div className="absolute inset-0 bg-[var(--surface-subtle)]" />
              )}
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/55 to-transparent" aria-hidden="true" />
              <figcaption className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-[0.12em] text-white sm:inset-x-6 sm:bottom-6">
                <span>{referenceLabel}</span>
                <span className="hidden font-mono text-white/70 sm:inline">REF / EDITORIAL</span>
              </figcaption>
            </div>
          </figure>
        </div>
      </header>

      <main className="shell-container pt-16 sm:pt-24">
        <section
          className="grid gap-10 border-b border-[var(--border)] pb-20 lg:grid-cols-[0.56fr_1.1fr] lg:gap-20 sm:pb-28"
          aria-labelledby="portfolio-state-heading"
        >
          <div>
            <span
              className="block font-mono text-[clamp(6rem,16vw,12rem)] font-light leading-none tracking-[-0.1em] text-[color-mix(in_srgb,var(--text-strong)_8%,transparent)]"
              aria-hidden="true"
            >
              {formatPortfolioIndex(0, locale)}
            </span>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              {copy.publishedCases}
            </p>
          </div>

          <div className="max-w-3xl">
            <span className="editorial-crosshair inline-flex h-14 w-14 items-center justify-center rounded-[var(--shape-control)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] text-[var(--primary)]">
              <Building2 className="h-6 w-6" strokeWidth={1.35} aria-hidden="true" />
            </span>
            <h2
              id="portfolio-state-heading"
              className="mt-7 text-4xl font-light leading-tight text-[var(--text-strong)] sm:text-6xl"
            >
              {copy.emptyLead}
              <span className="block font-extrabold">{copy.emptyStrong}</span>
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-8 text-[var(--text-secondary)] sm:text-base">
              {copy.emptyBody}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href={localizedStorefrontPath(locale, "/quote")}
                className="architectural-action inline-flex min-h-12 items-center justify-center gap-3 rounded-[var(--shape-control)] bg-[var(--primary)] px-7 text-sm font-bold text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
              >
                {copy.startProject}
                <ForwardArrow className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={localizedStorefrontPath(locale, "/catalog")}
                className="architectural-action inline-flex min-h-12 items-center justify-center rounded-[var(--shape-control)] border border-[var(--border-strong)] bg-[var(--bg-card)] px-7 text-sm font-bold text-[var(--text-strong)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
              >
                {copy.browseProducts}
              </Link>
            </div>
          </div>
        </section>

        <section
          className="mt-20 sm:mt-28"
          aria-labelledby="project-process-heading"
        >
          <div className="mb-12 grid gap-6 lg:grid-cols-[1fr_0.55fr] lg:items-end">
            <div>
              <span className="section-kicker">{copy.processEyebrow}</span>
              <h2
                id="project-process-heading"
                className="mt-4 text-4xl font-light leading-tight text-[var(--text-strong)] sm:text-6xl"
              >
                {copy.processLead}
                <span className="block font-extrabold">{copy.processStrong}</span>
              </h2>
            </div>
            <p className="text-sm leading-8 text-[var(--text-secondary)]">
              {copy.processBody}
            </p>
          </div>

          <ol className="architectural-panel editorial-crosshair grid !border-[var(--border-inverse)] !bg-[var(--surface-inverse)] text-[var(--text-inverse)] md:grid-cols-3">
            {copy.steps.map((step, index) => {
              const StepIcon = PROJECT_STEP_ICONS[index] || LayoutTemplate;
              const stepNumber = index + 1;
              return (
              <li
                key={stepNumber}
                className="group relative min-h-80 overflow-hidden border-b border-[var(--border-inverse)] p-7 last:border-b-0 md:border-b-0 md:border-l md:last:border-l-0 sm:p-9"
              >
                <span
                  className="absolute -bottom-7 -left-2 font-mono text-9xl font-light tracking-[-0.1em] text-[color-mix(in_srgb,var(--text-inverse)_4%,transparent)] transition-colors group-hover:text-[color-mix(in_srgb,var(--brass-300)_9%,transparent)]"
                  aria-hidden="true"
                >
                  {formatPortfolioIndex(stepNumber, locale)}
                </span>
                <div className="relative flex items-center justify-between">
                  <span className="font-mono text-xs tracking-[0.16em] text-[var(--text-inverse-muted)]">
                    {formatPortfolioIndex(stepNumber, locale)}
                  </span>
                  <StepIcon
                    className="h-5 w-5 text-[var(--brass-300)]"
                    strokeWidth={1.4}
                    aria-hidden="true"
                  />
                </div>
                <div className="relative mt-24">
                  <h3 className="text-2xl font-extrabold">{step.title}</h3>
                  <p className="mt-4 text-sm font-light leading-7 text-[var(--text-inverse-muted)]">
                    {step.description}
                  </p>
                </div>
              </li>
              );
            })}
          </ol>
        </section>

        <section className="architectural-banner mt-20 grid overflow-hidden rounded-[var(--shape-panel)] border border-[var(--border)] sm:mt-28 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative min-h-72 overflow-hidden bg-[var(--surface-subtle)] sm:min-h-96 lg:min-h-[30rem]">
            {ctaMedia?.url ? (
              <Image
                src={ctaMedia.url}
                alt={(locale === "ar" ? ctaMedia.altAr : ctaMedia.altEn) || copy.briefEyebrow}
                fill
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="object-cover"
                style={{ objectPosition: ctaObjectPosition }}
              />
            ) : (
              <div className="absolute inset-0 bg-[var(--surface-subtle)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" aria-hidden="true" />
            <span className="absolute bottom-5 start-5 grid size-11 place-items-center border border-white/55 bg-black/25 font-mono text-2xl text-white backdrop-blur-sm sm:bottom-7 sm:start-7" aria-hidden="true">
              {locale === "ar" ? "←" : "→"}
            </span>
          </div>
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              {copy.briefEyebrow}
            </p>
            <h2 className="mt-4 text-3xl font-light leading-tight text-[var(--text-strong)] sm:text-5xl">
              {copy.briefLead}
              <span className="block font-extrabold">{copy.briefStrong}</span>
            </h2>
            <Link
              href={localizedStorefrontPath(locale, "/catalog")}
              className="architectural-action mt-8 inline-flex min-h-12 items-center gap-3 rounded-[var(--shape-control)] bg-[var(--surface-inverse)] px-7 text-sm font-bold text-[var(--text-inverse)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            >
              {copy.startFromCatalog}
              <ForwardArrow className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
