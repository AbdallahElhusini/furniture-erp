"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { STOREFRONT_PAGE_CONTENT_DEFAULTS, type StorefrontPageContent } from "@/lib/storefront-content-defaults";
import { interpolateStorefrontMessage } from "@/lib/i18n/storefront";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";

interface CommerceQuantityControlProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  content?: StorefrontPageContent["quantity"];
}

export function CommerceQuantityControl({
  value,
  onChange,
  label,
  className,
  compact = false,
  disabled = false,
  min = 1,
  max = 999,
  content,
}: CommerceQuantityControlProps) {
  const { locale } = useStorefrontI18n();
  const copy = content || STOREFRONT_PAGE_CONTENT_DEFAULTS[locale].quantity;
  const message = (template: string) => interpolateStorefrontMessage(template, { name: label });
  const safeValue = Math.max(min, Math.min(max, Math.round(value) || min));
  const buttonSize = compact ? "size-8" : "size-11";
  const inputSize = compact ? "h-8 w-10" : "h-11 w-14";

  const commit = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return;
    onChange(Math.max(min, Math.min(max, Math.round(nextValue))));
  };

  return (
    <div
      className={cn(
        "inline-flex items-center overflow-hidden rounded-[var(--shape-control)] border border-[var(--border)] bg-white shadow-sm",
        className,
      )}
      dir="ltr"
      role="group"
      aria-label={message(copy.group)}
    >
      <button
        type="button"
        onClick={() => commit(safeValue - 1)}
        disabled={disabled || safeValue <= min}
        className={cn(
          buttonSize,
          "grid place-items-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--primary)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-35",
        )}
        aria-label={message(copy.decrease)}
      >
        <Minus className={compact ? "size-3.5" : "size-4"} />
      </button>

      <input
        type="number"
        min={min}
        max={max}
        step={1}
        inputMode="numeric"
        value={safeValue}
        disabled={disabled}
        onChange={(event) => commit(event.currentTarget.valueAsNumber)}
        className={cn(
          inputSize,
          "border-x border-[var(--border)] bg-transparent px-1 text-center text-sm font-bold text-[var(--text-primary)] outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50",
        )}
        aria-label={message(copy.input)}
      />

      <button
        type="button"
        onClick={() => commit(safeValue + 1)}
        disabled={disabled || safeValue >= max}
        className={cn(
          buttonSize,
          "grid place-items-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--primary)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-35",
        )}
        aria-label={message(copy.increase)}
      >
        <Plus className={compact ? "size-3.5" : "size-4"} />
      </button>
    </div>
  );
}
