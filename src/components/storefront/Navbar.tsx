"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  FileText,
  Layers3,
  Menu,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  localizedStorefrontPath,
  stripStorefrontLocalePrefix,
} from "@/lib/i18n/storefront-paths";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";
import { useQuoteCart } from "./QuoteCartProvider";

const focusableSelector =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Navbar() {
  const pathname = usePathname();
  const { itemCount, isLoaded } = useQuoteCart();
  const { locale, dictionary } = useStorefrontI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [catalogMenuOpen, setCatalogMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const catalogButtonRef = useRef<HTMLButtonElement>(null);
  const catalogMenuRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const isRtl = locale === "ar";
  const ForwardArrow = isRtl ? ArrowLeft : ArrowRight;
  const { navigation } = dictionary;
  const storefrontPathname = stripStorefrontLocalePrefix(pathname);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12);
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
      if (window.innerWidth < 1024) setCatalogMenuOpen(false);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      mobilePanelRef.current
        ?.querySelector<HTMLElement>(focusableSelector)
        ?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !mobilePanelRef.current) return;

      const focusable = Array.from(
        mobilePanelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!catalogMenuOpen) return;

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Node
        && !catalogMenuRef.current?.contains(event.target)
      ) {
        setCatalogMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCatalogMenuOpen(false);
      catalogButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [catalogMenuOpen]);

  const isActive = (href: string) =>
    href === "/"
      ? storefrontPathname === href
      : storefrontPathname.startsWith(href);

  const closeMenus = () => {
    setCatalogMenuOpen(false);
    setMobileMenuOpen(false);
  };

  const handleCatalogBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setCatalogMenuOpen(false);
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 w-full border-b border-[var(--border-ink)] bg-[var(--surface-paper)] transition-shadow duration-300 motion-reduce:transition-none",
        mobileMenuOpen ? "z-[120]" : "z-50",
        scrolled && "shadow-[var(--depth-contact)]",
      )}
    >
      <div className="h-7 border-t-[3px] border-[var(--primary)] bg-[var(--surface-paper)] text-[var(--text-muted)]">
        <div className="editorial-shell flex h-full items-center justify-between gap-6 text-[9px] font-semibold sm:text-[10px]">
          <span
            dir="ltr"
            className="tracking-[0.16em] text-[var(--surface-ink)]"
          >
            HATAB / OFFICE FURNITURE
          </span>
          <span className="hidden border-s border-[var(--border-ink)] ps-4 text-[var(--text-soft)] sm:inline">
            {navigation.tagline}
          </span>
        </div>
      </div>

      <div className="relative bg-[color-mix(in_srgb,var(--surface-paper)_96%,transparent)] backdrop-blur-xl">
        <div className="editorial-shell flex h-[4.75rem] items-center justify-between gap-3 sm:gap-5">
          <Link
            href={localizedStorefrontPath(locale, "/")}
            onClick={closeMenus}
            className="group flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--surface-paper)]"
            aria-label={dictionary.common.brandHome}
          >
            <Image
              src="/images/brand/hatab-wordmark.png"
              alt=""
              width={178}
              height={60}
              priority
              className="h-[2.55rem] w-auto object-contain transition-opacity duration-300 group-hover:opacity-80 sm:h-[3rem] motion-reduce:transition-none"
            />
          </Link>

          <nav
            className="hidden h-full items-center gap-1 lg:flex"
            aria-label={navigation.landmark}
          >
            <Link
              href={localizedStorefrontPath(locale, "/")}
              aria-current={isActive("/") ? "page" : undefined}
              className={cn(
                "relative flex h-full items-center px-4 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] motion-reduce:transition-none",
                isActive("/")
                  ? "text-[var(--surface-ink)] after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-[var(--primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--surface-ink)]",
              )}
            >
              {navigation.primaryLinks[0].label}
            </Link>

            <div
              ref={catalogMenuRef}
              className="relative flex h-full items-center"
              onBlur={handleCatalogBlur}
            >
              <button
                ref={catalogButtonRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={catalogMenuOpen}
                aria-controls="catalog-mega-menu"
                onClick={() => setCatalogMenuOpen((open) => !open)}
                className={cn(
                  "relative flex h-full items-center gap-1.5 px-4 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] motion-reduce:transition-none",
                  isActive("/catalog")
                    ? "text-[var(--surface-ink)] after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-[var(--primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--surface-ink)]",
                )}
              >
                {navigation.products}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
                    catalogMenuOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>

              {catalogMenuOpen && (
                <div
                  id="catalog-mega-menu"
                  className="fixed left-1/2 top-[6.5rem] w-[min(60rem,calc(100vw-3rem))] -translate-x-1/2 pt-2"
                >
                  <div className="overflow-hidden rounded-xl border border-[var(--border-ink)] bg-[color-mix(in_srgb,var(--surface-paper)_98%,transparent)] shadow-[var(--depth-float)] backdrop-blur-xl motion-safe:animate-[fadeIn_180ms_ease-out]">
                    <div className="grid grid-cols-[1fr_1fr_1fr_0.86fr]">
                      {navigation.catalogGroups.map((group, groupIndex) => (
                        <div
                          key={group.title}
                          className="border-s border-[var(--border-subtle)] p-6 first:border-s-0"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-soft)]">
                              {group.eyebrow}
                            </span>
                            <span
                              dir="ltr"
                              className="text-[9px] font-bold tracking-[0.12em] text-[var(--primary)]"
                            >
                              0{groupIndex + 1}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-extrabold text-[var(--surface-ink)]">
                            {group.title}
                          </p>
                          <ul className="mt-5 space-y-1">
                            {group.links.map((link) => (
                              <li key={link.slug}>
                                <Link
                                  href={localizedStorefrontPath(locale, `/catalog?category=${link.slug}`)}
                                  onClick={closeMenus}
                                  className="group/link flex items-center justify-between rounded-md px-3 py-2.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-editorial)] hover:text-[var(--surface-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] motion-reduce:transition-none"
                                >
                                  {link.label}
                                  <ForwardArrow
                                    className={cn(
                                      "h-3 w-3 opacity-0 transition-all group-hover/link:opacity-100 motion-reduce:transform-none motion-reduce:transition-none",
                                      isRtl
                                        ? "-translate-x-1 group-hover/link:translate-x-0"
                                        : "translate-x-1 group-hover/link:translate-x-0",
                                    )}
                                    aria-hidden="true"
                                  />
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}

                      <div className="flex flex-col justify-between bg-[var(--surface-ink)] p-7 text-[var(--text-inverse)]">
                        <Layers3
                          className="h-7 w-7 text-[var(--text-inverse-muted)]"
                          aria-hidden="true"
                        />
                        <div className="mt-8">
                          <p className="text-xl font-light leading-8">
                            {navigation.megaMessage}
                          </p>
                          <Link
                            href={localizedStorefrontPath(locale, "/catalog")}
                            onClick={closeMenus}
                            className="mt-5 inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2.5 text-xs font-bold transition-colors hover:bg-[var(--text-inverse)] hover:text-[var(--surface-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-inverse)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-ink)] motion-reduce:transition-none"
                          >
                            {dictionary.common.catalog}
                            <ForwardArrow className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {navigation.primaryLinks.slice(1).map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={localizedStorefrontPath(locale, link.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full items-center px-4 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] motion-reduce:transition-none",
                    active
                      ? "text-[var(--surface-ink)] after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-[var(--primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--surface-ink)]",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <LanguageSwitcher compact />

            <Link
              href={localizedStorefrontPath(locale, "/catalog")}
              onClick={closeMenus}
              className="group hidden h-10 items-center justify-center gap-2 rounded-md border border-[var(--border-ink)] bg-[var(--surface-paper)] px-3 text-[var(--surface-ink)] transition-colors hover:bg-[var(--surface-editorial)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-paper)] sm:inline-flex lg:px-3.5 motion-reduce:transition-none"
              aria-label={navigation.searchCatalog}
            >
              <Search
                className="h-[1.1rem] w-[1.1rem]"
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <span className="hidden text-xs font-bold xl:inline">
                {dictionary.common.search}
              </span>
            </Link>

            <Link
              href={localizedStorefrontPath(locale, "/quote")}
              onClick={closeMenus}
              className="group relative inline-flex h-10 items-center gap-2 rounded-md bg-[var(--primary)] px-3 text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-paper)] sm:px-4 motion-reduce:transition-none"
              aria-label={
                isLoaded && itemCount > 0
                  ? navigation.quoteWithCount.replace(
                      "{count}",
                      String(itemCount),
                    )
                  : dictionary.common.quote
              }
            >
              <FileText
                className="h-[1.1rem] w-[1.1rem]"
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <span className="hidden text-xs font-extrabold sm:inline">
                {navigation.quoteShort}
              </span>
              {isLoaded && itemCount > 0 && (
                <span className="flex min-w-5 items-center justify-center rounded-[0.25rem] bg-[var(--text-inverse)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--primary)]" aria-hidden="true">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--surface-ink)] text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-paper)] lg:hidden motion-reduce:transition-none"
              aria-label={
                mobileMenuOpen ? navigation.closeMenu : navigation.openMenu
              }
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-[6.5rem] z-50 bg-[color-mix(in_srgb,var(--surface-ink)_34%,transparent)] backdrop-blur-sm lg:hidden motion-safe:animate-[fadeIn_160ms_ease-out]"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setMobileMenuOpen(false);
          }}
        >
          <div
            ref={mobilePanelRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={navigation.mobileDialog}
            className="ms-auto h-full w-[min(26rem,92vw)] overflow-y-auto border-s border-[var(--border-ink)] bg-[var(--surface-paper)] px-5 pb-10 pt-6 shadow-[var(--depth-stage)] motion-safe:animate-[fadeIn_180ms_ease-out]"
          >
            <div className="mb-5 flex items-center justify-between border-b border-[var(--border-ink)] pb-4">
              <span
                dir="ltr"
                className="text-xs font-black tracking-[0.16em] text-[var(--surface-ink)]"
              >
                HATAB / MENU
              </span>
              <div className="flex items-center gap-2">
                <LanguageSwitcher />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--surface-ink)] text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] motion-reduce:transition-none"
                  aria-label={navigation.closeMenu}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <nav aria-label={navigation.mobileLandmark}>
              <Link
                href={localizedStorefrontPath(locale, "/catalog")}
                onClick={closeMenus}
                className="mb-4 flex items-center justify-between rounded-md bg-[var(--surface-ink)] px-5 py-3.5 text-sm font-bold text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] motion-reduce:transition-none"
                aria-label={navigation.searchCatalog}
              >
                <span className="flex items-center gap-3">
                  <Search className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  {navigation.searchCatalog}
                </span>
                <ForwardArrow className="h-4 w-4" aria-hidden="true" />
              </Link>

              <div className="space-y-1 border-b border-[var(--border-subtle)] pb-5">
                {navigation.primaryLinks.map((link) => {
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={localizedStorefrontPath(locale, link.href)}
                      onClick={closeMenus}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between rounded-md px-4 py-3.5 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] motion-reduce:transition-none",
                        active
                          ? "bg-[var(--surface-ink)] text-[var(--text-inverse)]"
                          : "text-[var(--text-strong)] hover:bg-[var(--surface-editorial)]",
                      )}
                    >
                      {link.label}
                      <ForwardArrow className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>

              <div className="py-6">
                <div className="mb-5 flex items-center justify-between px-1">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
                      {navigation.catalogEyebrow}
                    </span>
                    <h2 className="mt-1 text-lg font-extrabold text-[var(--surface-ink)]">
                      {navigation.browseProducts}
                    </h2>
                  </div>
                  <Link
                    href={localizedStorefrontPath(locale, "/catalog")}
                    onClick={closeMenus}
                    className="rounded-md border border-[var(--border-ink)] px-3 py-2 text-xs font-bold text-[var(--surface-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  >
                    {navigation.browseAll}
                  </Link>
                </div>

                <div className="space-y-6">
                  {navigation.catalogGroups.map((group) => (
                    <div key={group.title}>
                      <p className="mb-2 px-1 text-xs font-extrabold text-[var(--text-muted)]">
                        {group.title}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {group.links.map((link) => (
                          <Link
                            key={link.slug}
                            href={localizedStorefrontPath(locale, `/catalog?category=${link.slug}`)}
                            onClick={closeMenus}
                            className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-editorial)] px-3 py-3 text-xs font-bold leading-5 text-[var(--text-strong)] transition-colors hover:border-[var(--border-ink)] hover:bg-[var(--surface-paper)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] motion-reduce:transition-none"
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </nav>

            <Link
              href={localizedStorefrontPath(locale, "/quote")}
              onClick={closeMenus}
              className="mt-2 flex w-full items-center justify-between rounded-md bg-[var(--primary)] px-5 py-4 text-sm font-extrabold text-[var(--text-inverse)] shadow-[var(--depth-contact)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
            >
              <span>{navigation.quoteStart}</span>
              <span className="flex items-center gap-2 text-xs text-[var(--text-inverse-muted)]">
                {isLoaded && itemCount > 0
                  ? `${itemCount} ${dictionary.common.product}`
                  : navigation.startNow}
                <ForwardArrow className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
