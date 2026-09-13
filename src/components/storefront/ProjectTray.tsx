"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Minus,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  formatStorefrontNumber,
  interpolateStorefrontMessage,
  pickStorefrontText,
} from "@/lib/i18n/storefront";
import {
  localizedStorefrontPath,
  stripStorefrontLocalePrefix,
} from "@/lib/i18n/storefront-paths";
import { cn } from "@/lib/utils";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";
import { useQuoteCart } from "./QuoteCartProvider";

interface ProjectQuantityControlProps {
  value: number;
  name: string;
  onChange: (value: number) => void;
  labels: {
    quantity: string;
    decreaseQuantity: string;
    increaseQuantity: string;
  };
}

function ProjectQuantityControl({
  value,
  name,
  onChange,
  labels,
}: ProjectQuantityControlProps) {
  const safeValue = Math.max(1, Math.min(999, Math.round(value) || 1));
  const commit = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return;
    onChange(Math.max(1, Math.min(999, Math.round(nextValue))));
  };

  return (
    <div
      className="inline-flex items-center overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-paper)]"
      dir="ltr"
      role="group"
      aria-label={interpolateStorefrontMessage(labels.quantity, { name })}
    >
      <button
        type="button"
        onClick={() => commit(safeValue - 1)}
        disabled={safeValue <= 1}
        className="grid size-8 place-items-center text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-editorial)] hover:text-[var(--primary)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-35"
        aria-label={interpolateStorefrontMessage(labels.decreaseQuantity, {
          name,
        })}
      >
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <input
        type="number"
        min={1}
        max={999}
        step={1}
        inputMode="numeric"
        value={safeValue}
        onChange={(event) => commit(event.currentTarget.valueAsNumber)}
        className="h-8 w-11 border-x border-[var(--border-subtle)] bg-transparent px-1 text-center text-sm font-bold text-[var(--text-strong)] outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
        aria-label={interpolateStorefrontMessage(labels.quantity, { name })}
      />
      <button
        type="button"
        onClick={() => commit(safeValue + 1)}
        disabled={safeValue >= 999}
        className="grid size-8 place-items-center text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-editorial)] hover:text-[var(--primary)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-35"
        aria-label={interpolateStorefrontMessage(labels.increaseQuantity, {
          name,
        })}
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ProjectTray() {
  const { items, itemCount, isLoaded, updateQuantity, removeItem } =
    useQuoteCart();
  const { locale, dictionary } = useStorefrontI18n();
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();
  const storefrontPathname = stripStorefrontLocalePrefix(pathname);
  const isRtl = locale === "ar";
  const ForwardArrow = isRtl ? ArrowLeft : ArrowRight;
  const { project } = dictionary;

  useEffect(() => {
    if (!expanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  if (!isLoaded || itemCount === 0 || storefrontPathname === "/quote") {
    return null;
  }

  const productCount = formatStorefrontNumber(items.length, locale);
  const pieceCount = formatStorefrontNumber(itemCount, locale);

  return (
    <>
      <div className="h-20 shrink-0 sm:h-24" aria-hidden="true" />
      {expanded && (
        <button
          type="button"
          aria-label={project.closeBoard}
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-[90] cursor-default bg-[var(--surface-ink)]/30 backdrop-blur-[2px] motion-reduce:backdrop-blur-none"
        />
      )}

      <aside
        className="pointer-events-none fixed inset-x-0 bottom-2 z-[100] px-2.5 sm:bottom-4 sm:px-5"
        aria-label={project.landmark}
      >
        <div
          className={cn(
            "pointer-events-auto overflow-hidden border bg-[color-mix(in_srgb,var(--surface-ink)_96%,transparent)] text-[var(--text-inverse)] shadow-[var(--depth-float)] backdrop-blur-xl transition-[max-height,max-width,border-radius,transform] duration-[var(--duration-slow)] motion-reduce:transition-none",
            expanded
              ? "mx-auto max-h-[80vh] max-w-6xl rounded-xl border-[var(--border-inverse)]"
              : "mx-auto max-h-16 max-w-[38rem] rounded-lg border-white/10 lg:ms-auto lg:me-0",
          )}
        >
          <div className="flex min-h-16 items-center gap-2 px-2.5 sm:px-3">
            <button
              type="button"
              onClick={() => setExpanded((current) => {
                const next = !current;
                if (next) {
                  trackStorefrontEvent({
                    name: "project_board_open",
                    entityType: "project-board",
                    entityId: "local-board",
                    metadata: {
                      itemCount: items.length,
                      pieceCount: itemCount,
                    },
                  });
                }
                return next;
              })}
              aria-expanded={expanded}
              aria-controls="project-tray-content"
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-inverse)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-ink)]"
            >
              <span className="relative grid size-10 shrink-0 place-items-center rounded-md bg-[var(--primary)] text-white shadow-[var(--depth-contact)]">
                <ClipboardList className="size-[1.1rem]" aria-hidden="true" />
                <span className="absolute -start-1 -top-1 grid min-w-5 place-items-center rounded-[0.25rem] border-2 border-[var(--surface-ink)] bg-[var(--text-inverse)] px-1 text-[9px] font-bold leading-4 text-[var(--surface-ink)]">
                  {productCount}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-[var(--text-inverse)]">
                  {project.compactTitle}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-[var(--text-inverse-muted)]">
                  {interpolateStorefrontMessage(project.summary, {
                    products: productCount,
                    pieces: pieceCount,
                  })}
                </span>
              </span>

              <span className="hidden items-center -space-x-2 rtl:space-x-reverse md:flex" aria-hidden="true">
                {items.slice(0, 3).map((item) => (
                  <span
                    key={item.id}
                    className="grid size-8 place-items-center overflow-hidden rounded-md border-2 border-[var(--surface-ink)] bg-[var(--surface-paper)]"
                  >
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt=""
                        width={32}
                        height={32}
                        className="size-full object-contain p-0.5 mix-blend-multiply"
                      />
                    ) : (
                      <span className="text-[7px] font-bold text-[var(--text-muted)]">
                        {item.sku?.slice(0, 4) || "HATAB"}
                      </span>
                    )}
                  </span>
                ))}
              </span>

              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 text-[var(--text-inverse-muted)] transition-colors group-hover:border-white/25 group-hover:text-[var(--text-inverse)]">
                {expanded ? (
                  <ChevronDown className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronUp className="size-4" aria-hidden="true" />
                )}
              </span>
            </button>

            <Link
              href={localizedStorefrontPath(locale, "/quote")}
              onNavigate={() => setExpanded(false)}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 text-[11px] font-bold text-white transition-colors hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-inverse)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-ink)] sm:px-5"
            >
              <span className="hidden sm:inline">{project.reviewAndSend}</span>
              <span className="sm:hidden">{project.review}</span>
              <ForwardArrow className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          {expanded && (
            <div
              id="project-tray-content"
              className="max-h-[calc(80vh-4rem)] overflow-y-auto border-t border-[var(--border-inverse)] bg-[var(--surface-paper)] px-3 py-5 text-[var(--text-strong)] custom-scrollbar sm:px-6 sm:py-6"
            >
              <div className="mb-5 flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
                    {project.eyebrow} / {productCount}
                  </span>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--text-strong)]">
                    {project.expandedTitle}
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">
                    {project.description}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-3 py-2 text-[10px] font-bold text-[var(--accent-dark)]">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  {project.privacy}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => {
                  const itemName =
                    pickStorefrontText(locale, item.name, item.nameEn) ||
                    project.productFallback;

                  return (
                    <article
                      key={item.id}
                      className="flex gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-editorial)] p-2.5 transition-colors hover:border-[var(--border-ink)] hover:bg-[var(--surface-paper)]"
                    >
                      <Link
                        href={localizedStorefrontPath(locale, `/product/${item.id}`)}
                        onNavigate={() => setExpanded(false)}
                        className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        aria-label={interpolateStorefrontMessage(
                          project.viewItem,
                          { name: itemName },
                        )}
                      >
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt=""
                            width={80}
                            height={80}
                            className="size-full object-contain p-1 mix-blend-multiply"
                          />
                        ) : (
                          <span className="px-2 text-center text-[9px] font-bold tracking-wide text-[var(--text-muted)]">
                            {item.sku || "HATAB"}
                          </span>
                        )}
                      </Link>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={localizedStorefrontPath(locale, `/product/${item.id}`)}
                              onNavigate={() => setExpanded(false)}
                              className="line-clamp-1 rounded-sm text-sm font-bold text-[var(--text-strong)] transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                            >
                              {itemName}
                            </Link>
                            <p
                              className="mt-1 truncate text-[9px] font-semibold tracking-[0.08em] text-[var(--text-soft)]"
                              dir="ltr"
                            >
                              {item.sku ||
                                item.category ||
                                project.productFallback}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="grid size-8 shrink-0 place-items-center rounded-md text-[var(--text-soft)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]"
                            aria-label={interpolateStorefrontMessage(
                              project.removeItem,
                              { name: itemName },
                            )}
                          >
                            <X className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <div className="mt-3">
                          <ProjectQuantityControl
                            value={item.quantity}
                            onChange={(nextQuantity) =>
                              updateQuantity(item.id, nextQuantity)
                            }
                            name={itemName}
                            labels={project}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-end border-t border-[var(--border-subtle)] pt-5">
                <Link
                  href={localizedStorefrontPath(locale, "/quote")}
                  onNavigate={() => setExpanded(false)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--surface-ink)] px-7 text-sm font-bold text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 sm:w-auto"
                >
                  {project.completeDetails}
                  <ForwardArrow className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
