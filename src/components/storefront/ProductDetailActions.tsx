"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, ShoppingBag } from "lucide-react";
import { formatStorefrontNumber, interpolateStorefrontMessage } from "@/lib/i18n/storefront";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import { STOREFRONT_PAGE_CONTENT_DEFAULTS, type StorefrontPageContent } from "@/lib/storefront-content-defaults";
import { cn } from "@/lib/utils";
import { CommerceQuantityControl } from "./CommerceQuantityControl";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";
import {
  useQuoteCart,
  type CartItemDetails,
} from "./QuoteCartProvider";

interface ProductDetailActionsProps {
  catalogItemId: number;
  name: string;
  details?: CartItemDetails;
  content?: StorefrontPageContent["productActions"];
  quantityContent?: StorefrontPageContent["quantity"];
}

interface ActionFeedback {
  tone: "success" | "error";
  message: string;
}

export function ProductDetailActions({
  catalogItemId,
  name,
  details,
  content,
  quantityContent,
}: ProductDetailActionsProps) {
  const { locale } = useStorefrontI18n();
  const copy = content || STOREFRONT_PAGE_CONTENT_DEFAULTS[locale].productActions;
  const ForwardArrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const { addItem, items } = useQuoteCart();
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const feedbackId = useId();
  const disclaimerId = useId();
  const resetTimer = useRef<number | null>(null);
  const existingQuantity =
    items.find((item) => item.id === catalogItemId)?.quantity || 0;
  const remainingQuantity = Math.max(1, 999 - existingQuantity);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  const showFeedback = (nextFeedback: ActionFeedback) => {
    setFeedback(nextFeedback);
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => setFeedback(null), 3_200);
  };

  const handleAdd = () => {
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
    setQuantity(1);
  };

  return (
    <section
      className="architectural-panel editorial-crosshair relative p-4 sm:p-5"
      aria-labelledby="product-project-actions"
    >
      <span className="absolute left-4 top-3 font-mono text-[8px] font-bold tracking-[0.16em] text-text-soft" dir={locale === "ar" ? "rtl" : "ltr"} aria-hidden="true">
        {copy.coordinate}
      </span>
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <span className="editorial-kicker">{copy.eyebrow}</span>
          <h2
            id="product-project-actions"
            className="mt-2 text-xl font-bold leading-8 text-text-strong"
          >
            {copy.title}
          </h2>
          <p className="mt-1 text-xs leading-6 text-text-muted">
            {copy.body}
          </p>
        </div>
        {existingQuantity > 0 && (
          <span className="shrink-0 rounded-[var(--shape-control)] border border-primary/15 bg-oxblood-100 px-3 py-2 text-xs font-bold text-primary">
            {interpolateStorefrontMessage(copy.inBoard, { quantity: formatStorefrontNumber(existingQuantity, locale) })}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <CommerceQuantityControl
          value={quantity}
          onChange={setQuantity}
          label={name}
          max={remainingQuantity}
          disabled={existingQuantity >= 999}
          content={quantityContent}
          className="w-full justify-between border-border-strong bg-surface-paper sm:w-auto"
        />

        <button
          type="button"
          onClick={handleAdd}
          disabled={existingQuantity >= 999}
          aria-describedby={`${disclaimerId} ${feedbackId}`}
          className={cn(
            "architectural-action motion-composed flex min-h-12 w-full items-center justify-center gap-2.5 rounded-[var(--shape-control)] px-6 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-text-soft disabled:shadow-none",
            feedback?.tone === "success"
              ? "bg-[var(--success)] shadow-[0_16px_34px_-20px_rgba(47,118,85,0.95)]"
              : feedback?.tone === "error"
                ? "bg-[var(--danger)] shadow-none"
                : "bg-primary shadow-[0_18px_38px_-20px_rgba(100,37,43,0.9)] hover:-translate-y-0.5 hover:bg-primary-dark motion-reduce:transform-none",
          )}
        >
          {feedback?.tone === "success" ? (
            <Check className="size-4.5" aria-hidden="true" />
          ) : feedback?.tone === "error" ? (
            <CircleAlert className="size-4.5" aria-hidden="true" />
          ) : (
            <ShoppingBag className="size-4.5" aria-hidden="true" />
          )}
          <span>
            {existingQuantity > 0 ? copy.addQuantity : copy.add}
          </span>
        </button>
      </div>

      <span id={feedbackId} className="sr-only" aria-live="polite">
        {feedback?.message}
      </span>

      {feedback && (
        <div
          className={cn(
            "mt-3 flex items-center gap-2 rounded-[var(--shape-control)] border px-3.5 py-2.5 text-xs font-semibold",
            feedback.tone === "success"
              ? "border-emerald-200/80 bg-emerald-50 text-emerald-800"
              : "border-red-200/80 bg-red-50 text-red-800",
          )}
          aria-hidden="true"
        >
          {feedback.tone === "success" ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <CircleAlert className="size-3.5" aria-hidden="true" />
          )}
          {feedback.message}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-4 text-xs leading-6 text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <span id={disclaimerId}>
          {copy.disclaimer}
        </span>
        {existingQuantity > 0 && (
          <Link
            href={localizedStorefrontPath(locale, "/quote")}
            className="inline-flex shrink-0 items-center gap-1.5 font-bold text-primary transition-colors hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {copy.review}
            <ForwardArrow className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}

export default ProductDetailActions;
