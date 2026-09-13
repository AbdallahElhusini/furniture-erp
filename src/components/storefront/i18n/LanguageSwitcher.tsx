"use client";

import { Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STOREFRONT_LOCALES,
} from "@/lib/i18n/storefront";
import { useStorefrontI18n } from "./StorefrontI18nProvider";

interface LanguageSwitcherProps {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  compact = false,
  inverse = false,
  className,
}: LanguageSwitcherProps) {
  const { locale, dictionary, dictionaries, isChangingLocale, setLocale } =
    useStorefrontI18n();

  if (compact) {
    const nextLocale = locale === "ar" ? "en" : "ar";
    const nextDictionary = dictionaries[nextLocale];

    return (
      <button
        type="button"
        onClick={() => setLocale(nextLocale)}
        disabled={isChangingLocale}
        className={cn(
          "inline-flex h-10 min-w-12 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-extrabold tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none",
          inverse
            ? "border-white/20 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-offset-[var(--surface-ink)]"
            : "border-[var(--border-ink)] bg-[var(--surface-paper)] text-[var(--surface-ink)] hover:bg-[var(--surface-editorial)] focus-visible:ring-offset-[var(--surface-paper)]",
          className,
        )}
        aria-label={dictionary.language.switchTo}
        title={dictionary.language.switchTo}
      >
        <Globe2 className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
        <span dir={nextLocale === "ar" ? "rtl" : "ltr"}>
          {nextDictionary.language.shortName}
        </span>
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={dictionary.language.switcherLabel}
      className={cn(
        "inline-flex h-10 items-center rounded-md border p-1",
        inverse
          ? "border-white/20 bg-white/5"
          : "border-[var(--border-ink)] bg-[var(--surface-paper)]",
        className,
      )}
    >
      <Globe2
        className={cn(
          "mx-1.5 size-3.5",
          inverse ? "text-white/65" : "text-[var(--text-soft)]",
        )}
        strokeWidth={1.7}
        aria-hidden="true"
      />
      {STOREFRONT_LOCALES.map((candidate) => {
        const candidateDictionary = dictionaries[candidate];
        const active = candidate === locale;
        return (
          <button
            key={candidate}
            type="button"
            onClick={() => setLocale(candidate)}
            disabled={active || isChangingLocale}
            aria-pressed={active}
            lang={candidate}
            dir={candidate === "ar" ? "rtl" : "ltr"}
            className={cn(
              "grid h-7 min-w-8 place-items-center rounded-[0.25rem] px-1.5 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-default motion-reduce:transition-none",
              active
                ? inverse
                  ? "bg-white text-[var(--surface-ink)]"
                  : "bg-[var(--surface-ink)] text-white"
                : inverse
                  ? "text-white/65 hover:text-white"
                  : "text-[var(--text-soft)] hover:text-[var(--surface-ink)]",
            )}
            aria-label={candidateDictionary.language.name}
          >
            {candidate === "ar" ? "ع" : "EN"}
          </button>
        );
      })}
    </div>
  );
}
