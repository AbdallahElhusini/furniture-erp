"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, CircleAlert, Plus, ShoppingBag } from "lucide-react";
import { formatStorefrontNumber, interpolateStorefrontMessage } from "@/lib/i18n/storefront";
import { STOREFRONT_PAGE_CONTENT_DEFAULTS, type StorefrontPageContent } from "@/lib/storefront-content-defaults";
import { cn } from "@/lib/utils";
import {
  useQuoteCart,
  type CartItemDetails,
} from "./QuoteCartProvider";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";

interface AddToQuoteButtonProps {
  catalogItemId: number;
  name: string;
  quantity?: number;
  details?: CartItemDetails;
  className?: string;
  variant?: "primary" | "gold" | "outline" | "compact";
  iconOnly?: boolean;
  content?: StorefrontPageContent["addToQuote"];
}

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

export function AddToQuoteButton({
  catalogItemId,
  name,
  quantity = 1,
  details,
  className,
  variant = "gold",
  iconOnly = false,
  content,
}: AddToQuoteButtonProps) {
  const { locale } = useStorefrontI18n();
  const copy = content || STOREFRONT_PAGE_CONTENT_DEFAULTS[locale].addToQuote;
  const { addItem, items } = useQuoteCart();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const feedbackId = useId();
  const resetTimer = useRef<number | null>(null);
  const existingQuantity =
    items.find((item) => item.id === catalogItemId)?.quantity || 0;

  useEffect(
    () => () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  const showFeedback = (nextFeedback: FeedbackState) => {
    setFeedback(nextFeedback);
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => setFeedback(null), 2_600);
  };

  const handleAdd = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (existingQuantity >= 999) {
      showFeedback({ tone: "error", message: copy.quantityLimit });
      return;
    }

    const result = addItem(catalogItemId, name, quantity, details);
    if (result.status === "limit") {
      showFeedback({
        tone: "error",
        message: interpolateStorefrontMessage(copy.productLimit, { limit: formatStorefrontNumber(100, locale) }),
      });
      return;
    }
    if (result.status === "invalid") {
      showFeedback({ tone: "error", message: copy.invalid });
      return;
    }

    showFeedback({
      tone: "success",
      message: interpolateStorefrontMessage(copy.saved, { quantity: formatStorefrontNumber(result.quantity, locale) }),
    });
  };

  const isSuccess = feedback?.tone === "success";
  const isError = feedback?.tone === "error";

  const variantStyles = {
    primary:
      "bg-primary text-white shadow-[0_14px_30px_-17px_rgba(100,37,43,0.9)] hover:-translate-y-0.5 hover:bg-primary-dark motion-reduce:transform-none",
    outline:
      "border border-border-strong bg-surface-paper text-primary shadow-contact hover:-translate-y-0.5 hover:border-primary/45 hover:bg-surface-editorial motion-reduce:transform-none",
    compact:
      "bg-forest-800 text-white shadow-contact hover:-translate-y-0.5 hover:bg-forest-900 motion-reduce:transform-none",
    gold: "bg-brass-300 text-walnut-900 shadow-[0_14px_30px_-18px_rgba(74,44,17,0.78)] hover:-translate-y-0.5 hover:bg-brass-500 motion-reduce:transform-none",
  }[variant];

  const stateStyles = isSuccess
    ? "border-transparent bg-[var(--success)] text-white"
    : isError
      ? "border-transparent bg-[var(--danger)] text-white"
      : variantStyles;

  if (iconOnly) {
    return (
      <>
        <button
          type="button"
          onClick={handleAdd}
          aria-describedby={feedbackId}
          aria-label={
            feedback?.message ||
            (existingQuantity > 0
              ? interpolateStorefrontMessage(copy.increase, { name })
              : interpolateStorefrontMessage(copy.addNamed, { name }))
          }
          title={feedback?.message || copy.title}
          className={cn(
            "true-circle motion-composed grid size-11 place-items-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            stateStyles,
            className,
          )}
        >
          {isSuccess ? (
            <Check className="size-5" aria-hidden="true" />
          ) : isError ? (
            <CircleAlert className="size-5" aria-hidden="true" />
          ) : existingQuantity > 0 ? (
            <span className="text-sm font-bold" aria-hidden="true">
              {formatStorefrontNumber(existingQuantity, locale)}
            </span>
          ) : (
            <Plus className="size-5" aria-hidden="true" />
          )}
        </button>
        <span id={feedbackId} className="sr-only" aria-live="polite">
          {feedback?.message}
        </span>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleAdd}
        aria-describedby={feedbackId}
        className={cn(
          "architectural-action motion-composed flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--shape-control)] px-5 py-2.5 text-sm font-bold active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          stateStyles,
          className,
        )}
      >
        {isSuccess ? (
          <Check className="size-4" aria-hidden="true" />
        ) : isError ? (
          <CircleAlert className="size-4" aria-hidden="true" />
        ) : (
          <ShoppingBag className="size-4" aria-hidden="true" />
        )}
        <span>
          {feedback?.message ||
            (existingQuantity > 0
              ? interpolateStorefrontMessage(copy.addMore, { quantity: formatStorefrontNumber(existingQuantity, locale) })
              : copy.add)}
        </span>
      </button>
      <span id={feedbackId} className="sr-only" aria-live="polite">
        {feedback?.message}
      </span>
    </>
  );
}

export default AddToQuoteButton;
