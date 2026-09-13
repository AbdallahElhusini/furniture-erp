"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Minus,
  PackageOpen,
  Phone,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { QuoteJourneyStepper } from "@/components/storefront/QuoteJourneyStepper";
import {
  useQuoteCart,
  type QuoteProjectContext,
} from "@/components/storefront/QuoteCartProvider";
import { useStorefrontI18n } from "@/components/storefront/i18n/StorefrontI18nProvider";
import {
  formatStorefrontNumber,
  interpolateStorefrontMessage,
  pickStorefrontText,
  type StorefrontDictionary,
  type StorefrontLocale,
} from "@/lib/i18n/storefront";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";
import { cn } from "@/lib/utils";

type JourneyStep = 1 | 2 | 3;
type ContactField = "clientName" | "companyName" | "phone" | "email";
type FieldErrors = Partial<Record<ContactField, true>>;
type QuoteCopy = StorefrontDictionary["quote"];

interface SubmissionError {
  kind: "server" | "unexpected";
  serverMessage?: string;
}

function findLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
) {
  return options.find((option) => option.value === value)?.label || "";
}

function buildProjectMessage(
  context: QuoteProjectContext,
  projectCopy: QuoteCopy["project"],
) {
  const details = [
    context.spaceType
      ? `${projectCopy.messageSpaceType}: ${findLabel(projectCopy.spaceTypes, context.spaceType)}`
      : "",
    context.targetDate
      ? `${projectCopy.messageTargetDate}: ${context.targetDate}`
      : "",
    context.budgetBand
      ? `${projectCopy.messageBudget}: ${findLabel(projectCopy.budgetBands, context.budgetBand)}`
      : "",
    context.notes
      ? `${projectCopy.messageNotes}: ${context.notes.trim()}`
      : "",
  ].filter(Boolean);

  return details.length > 0 ? details.join(" | ").slice(0, 2_000) : null;
}

function validateContact(
  formData: {
    clientName: string;
    companyName: string;
    phone: string;
    email: string;
  },
): FieldErrors {
  const errors: FieldErrors = {};
  const normalizedPhone = formData.phone.trim();

  if (formData.clientName.trim().length < 2) errors.clientName = true;
  if (!/^[+\d\s()\-]{7,32}$/.test(normalizedPhone)) errors.phone = true;
  if (
    formData.email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())
  ) {
    errors.email = true;
  }
  if (formData.companyName.trim().length > 160) errors.companyName = true;

  return errors;
}

function resolveSubmissionError(
  error: SubmissionError,
  locale: StorefrontLocale,
  validation: QuoteCopy["validation"],
) {
  if (error.kind === "unexpected") return validation.unexpected;
  if (locale === "ar" && error.serverMessage) return error.serverMessage;
  if (error.serverMessage && validation.apiErrors[error.serverMessage]) {
    return validation.apiErrors[error.serverMessage];
  }
  return validation.submitFailed;
}

interface QuoteQuantityControlProps {
  value: number;
  name: string;
  onChange: (value: number) => void;
  copy: QuoteCopy["selection"];
}

function QuoteQuantityControl({
  value,
  name,
  onChange,
  copy,
}: QuoteQuantityControlProps) {
  const safeValue = Math.max(1, Math.min(999, Math.round(value) || 1));
  const commit = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return;
    onChange(Math.max(1, Math.min(999, Math.round(nextValue))));
  };

  return (
    <div
      className="inline-flex items-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-card)]"
      dir="ltr"
      role="group"
      aria-label={interpolateStorefrontMessage(copy.quantityGroup, { name })}
    >
      <button
        type="button"
        onClick={() => commit(safeValue - 1)}
        disabled={safeValue <= 1}
        className="grid size-9 place-items-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--primary)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-35"
        aria-label={interpolateStorefrontMessage(copy.decreaseQuantity, {
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
        className="h-9 w-12 border-x border-[var(--border)] bg-transparent px-1 text-center text-sm font-bold text-[var(--text-primary)] outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
        aria-label={interpolateStorefrontMessage(copy.quantityGroup, { name })}
      />
      <button
        type="button"
        onClick={() => commit(safeValue + 1)}
        disabled={safeValue >= 999}
        className="grid size-9 place-items-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--primary)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-35"
        aria-label={interpolateStorefrontMessage(copy.increaseQuantity, {
          name,
        })}
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function QuoteRequestPage() {
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    itemCount,
    isLoaded,
    projectContext,
    updateProjectContext,
    resetProjectContext,
  } = useQuoteCart();
  const { locale, dictionary } = useStorefrontI18n();
  const copy = dictionary.quote;
  const isRtl = locale === "ar";
  const ForwardArrow = isRtl ? ArrowLeft : ArrowRight;
  const BackArrow = isRtl ? ArrowRight : ArrowLeft;
  const [currentStep, setCurrentStep] = useState<JourneyStep>(1);
  const [formData, setFormData] = useState({
    clientName: "",
    companyName: "",
    phone: "",
    email: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [quoteId, setQuoteId] = useState<number | null>(null);
  const [submissionError, setSubmissionError] =
    useState<SubmissionError | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const journeyTopRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const productCount = formatStorefrontNumber(items.length, locale);
  const totalPieceCount = formatStorefrontNumber(itemCount, locale);

  const moveToStep = (step: JourneyStep) => {
    setCurrentStep(step);
    setSubmissionError(null);
    journeyTopRef.current?.scrollIntoView({ block: "start" });
  };

  const updateContact = (field: ContactField, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (items.length === 0 || isSubmitting) return;

    const nextErrors = validateContact(formData);
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      const firstField = Object.keys(nextErrors)[0] as ContactField;
      window.setTimeout(() => document.getElementById(firstField)?.focus(), 0);
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: formData.clientName.trim(),
          company: formData.companyName.trim() || null,
          clientPhone: formData.phone.trim(),
          clientEmail: formData.email.trim() || null,
          message: buildProjectMessage(projectContext, copy.project),
          items: items.map((item) => ({
            catalogItemId: item.id,
            quantity: item.quantity,
          })),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        quoteId?: number;
      } | null;

      if (!response.ok) {
        setSubmissionError({
          kind: "server",
          serverMessage: payload?.error,
        });
        window.setTimeout(() => errorRef.current?.focus(), 0);
        return;
      }

      setQuoteId(
        typeof payload?.quoteId === "number" ? payload.quoteId : null,
      );
      setIsSuccess(true);
      clearCart();
      resetProjectContext();
    } catch {
      setSubmissionError({ kind: "unexpected" });
      window.setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-[70vh] bg-[var(--surface-inverse)] px-4 py-16">
        <div
          className="mx-auto max-w-6xl animate-pulse space-y-5"
          role="status"
          aria-label={copy.loadingBoard}
        >
          <div className="h-5 w-40 rounded-sm bg-[var(--surface-inverse-soft)]" />
          <div className="h-36 max-w-3xl rounded-lg bg-[var(--surface-inverse-soft)]" />
          <div className="h-80 rounded-lg bg-[var(--surface-inverse-soft)]" />
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-[78vh] bg-[var(--bg-primary)] px-4 py-14 sm:px-6 sm:py-24 lg:px-8">
        <section
          className="mx-auto grid max-w-6xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)] lg:grid-cols-[0.42fr_1fr]"
          aria-labelledby="quote-success-title"
          aria-live="polite"
        >
          <div className="relative flex min-h-72 flex-col justify-between overflow-hidden bg-[var(--surface-inverse)] p-7 text-[var(--text-inverse)] sm:p-10 lg:min-h-[38rem]">
            <div className="ambient-grid pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />
            <div className="relative flex items-start justify-between">
              <span className="font-mono text-6xl font-light tracking-[-0.08em] text-[var(--brass-300)]">
                03
              </span>
              <CheckCircle2
                className="size-9 text-[var(--brass-300)]"
                strokeWidth={1.25}
                aria-hidden="true"
              />
            </div>
            <div className="relative">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brass-300)]">
                {copy.success.eyebrow}
              </p>
              <p className="mt-4 text-3xl font-light leading-tight sm:text-4xl">
                {copy.success.stageLead}
                <span className="block font-extrabold">
                  {copy.success.stageStrong}
                </span>
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-10 lg:p-14">
            <p className="text-xs font-bold tracking-[0.18em] text-[var(--accent-dark)]">
              {copy.success.received}
            </p>
            <h1
              id="quote-success-title"
              className="mt-4 text-4xl font-light leading-tight text-[var(--text-strong)] sm:text-6xl"
            >
              {copy.success.titleLead}
              <span className="block font-extrabold">
                {copy.success.titleStrong}
              </span>
            </h1>
            {quoteId && (
              <p className="mt-4 font-mono text-sm font-bold text-[var(--primary)]">
                {interpolateStorefrontMessage(copy.success.requestNumber, {
                  id: formatStorefrontNumber(quoteId, locale),
                })}
              </p>
            )}
            <p className="mt-6 max-w-xl text-sm leading-8 text-[var(--text-secondary)]">
              {copy.success.description}
            </p>

            <ol className="mt-8 divide-y divide-[var(--border)] border-y border-[var(--border)] text-start">
              {copy.success.process.map((label, index) => (
                <li
                  key={label}
                  className="flex items-center gap-4 py-4 text-sm font-bold text-[var(--text-strong)]"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-[0.3rem] border border-[var(--border-strong)] text-[10px] text-[var(--primary)]">
                    {index === 0 ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      `0${index + 1}`
                    )}
                  </span>
                  {label}
                </li>
              ))}
            </ol>

            <p className="mt-7 border-s border-[var(--brass)] ps-4 text-xs leading-6 text-[var(--text-secondary)]">
              {copy.success.disclaimer}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={localizedStorefrontPath(locale, "/catalog")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-7 text-sm font-bold text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
              >
                {copy.success.browseMore}
                <ForwardArrow className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href={localizedStorefrontPath(locale, "/")}
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-card)] px-7 text-sm font-bold text-[var(--text-strong)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
              >
                {copy.success.home}
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
      <header className="relative overflow-hidden bg-[var(--surface-inverse)] text-[var(--text-inverse)]">
        <div className="ambient-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-y-0 start-[12%] w-px bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute end-[8%] top-[28%] size-2 rounded-full bg-[var(--brass-300)] shadow-[0_0_0_8px_color-mix(in_srgb,var(--brass-300)_12%,transparent)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <Link
            href={localizedStorefrontPath(locale, "/catalog")}
            className="inline-flex items-center gap-2 text-xs font-bold text-[var(--text-inverse-muted)] transition-colors hover:text-[var(--text-inverse)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)]"
          >
            <BackArrow className="size-3.5" aria-hidden="true" />
            {copy.hero.backToCatalog}
          </Link>
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-16">
            <div className="max-w-4xl">
              <div className="flex items-center gap-5">
                <span className="font-mono text-5xl font-light tracking-[-0.08em] text-[var(--brass-300)] sm:text-7xl">
                  03
                </span>
                <span className="h-px w-14 bg-[var(--border-inverse)]" aria-hidden="true" />
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brass-300)]">
                  {copy.hero.eyebrow}
                </p>
              </div>
              <h1 className="mt-8 text-[clamp(3.5rem,8vw,7.5rem)] font-light leading-[0.9] tracking-[-0.05em]">
                {copy.hero.titleLead}
                <span className="block font-extrabold">
                  {copy.hero.titleStrong}
                </span>
              </h1>
              <p className="mt-8 max-w-2xl border-s border-[var(--brass-300)] ps-5 text-sm font-light leading-8 text-[var(--text-inverse-muted)] sm:text-base">
                {copy.hero.description}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border-inverse)] bg-[var(--surface-inverse-soft)] p-6">
              <div className="flex items-center justify-between">
                <ShoppingBag
                  className="size-6 text-[var(--brass-300)]"
                  strokeWidth={1.35}
                  aria-hidden="true"
                />
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-inverse-muted)]">
                  {copy.hero.savedLocally}
                </span>
              </div>
              <dl className="mt-10 grid grid-cols-2 gap-4 border-t border-[var(--border-inverse)] pt-5">
                <div>
                  <dt className="text-[10px] text-[var(--text-inverse-muted)]">
                    {copy.hero.products}
                  </dt>
                  <dd className="mt-1 text-3xl font-light">{productCount}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-[var(--text-inverse-muted)]">
                    {copy.hero.totalPieces}
                  </dt>
                  <dd className="mt-1 text-3xl font-light">
                    {totalPieceCount}
                  </dd>
                </div>
              </dl>
              <p className="mt-5 flex items-center gap-2 text-xs text-[var(--text-inverse-muted)]">
                <ShieldCheck
                  className="size-4 shrink-0 text-[var(--brass-300)]"
                  aria-hidden="true"
                />
                {copy.hero.savedOnDevice}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div
        ref={journeyTopRef}
        className="scroll-mt-24 mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
      >
        {items.length === 0 ? (
          <section className="mx-auto grid max-w-5xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)] lg:grid-cols-[0.48fr_1fr]">
            <div className="ambient-grid flex min-h-64 items-center justify-center bg-[var(--surface-subtle)] p-8">
              <div className="grid size-32 place-items-center rounded-lg border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--bg-card)_70%,transparent)] text-[var(--accent-dark)]">
                <PackageOpen
                  className="size-11"
                  strokeWidth={1.15}
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="p-7 sm:p-10 lg:p-14">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                {copy.empty.eyebrow}
              </p>
              <h2 className="mt-4 text-4xl font-light leading-tight text-[var(--text-strong)] sm:text-6xl">
                {copy.empty.titleLead}
                <span className="block font-extrabold">
                  {copy.empty.titleStrong}
                </span>
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-8 text-[var(--text-secondary)]">
                {copy.empty.description}
              </p>
              <Link
                href={localizedStorefrontPath(locale, "/catalog")}
                className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-7 text-sm font-bold text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
              >
                {copy.empty.cta}
                <ForwardArrow className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        ) : (
          <>
            <div className="mx-auto max-w-4xl">
              <QuoteJourneyStepper currentStep={currentStep} />
            </div>

            <div className="mt-14 sm:mt-20">
              {currentStep === 1 && (
                <section aria-labelledby="selection-heading">
                  <div className="mb-10 grid gap-6 border-b border-[var(--border)] pb-8 lg:grid-cols-[auto_1fr_auto] lg:items-end">
                    <span className="font-mono text-6xl font-light tracking-[-0.08em] text-[color-mix(in_srgb,var(--text-strong)_14%,transparent)] sm:text-7xl" aria-hidden="true">
                      01
                    </span>
                    <div className="max-w-2xl">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-dark)]">
                        {copy.selection.eyebrow}
                      </p>
                      <h2
                        id="selection-heading"
                        className="mt-3 text-3xl font-light leading-tight text-[var(--text-strong)] sm:text-5xl"
                      >
                        {copy.selection.titleLead}
                        <span className="block font-extrabold">
                          {copy.selection.titleStrong}
                        </span>
                      </h2>
                      <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
                        {copy.selection.description}
                      </p>
                    </div>

                    {confirmClear ? (
                      <div
                        className="flex items-center gap-2 rounded-md border border-red-100 bg-red-50 p-1.5 text-xs"
                        role="group"
                        aria-label={copy.selection.clearBoardAria}
                      >
                        <span className="px-2 font-bold text-red-700">
                          {copy.selection.clearPrompt}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            clearCart();
                            setConfirmClear(false);
                          }}
                          className="rounded-[0.3rem] bg-red-600 px-3 py-1.5 font-bold text-[var(--text-inverse)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          {copy.selection.confirm}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClear(false)}
                          className="rounded-[0.3rem] px-3 py-1.5 font-bold text-red-700 hover:bg-[var(--bg-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          {copy.selection.cancel}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmClear(true)}
                        className="inline-flex items-center gap-2 self-start rounded-md px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        {copy.selection.clearBoard}
                      </button>
                    )}
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
                    <div className="space-y-3">
                      {items.map((item, index) => {
                        const itemName =
                          pickStorefrontText(locale, item.name, item.nameEn) ||
                          copy.selection.officeFurniture;
                        const itemCategory =
                          locale === "ar"
                            ? item.category || copy.selection.officeFurniture
                            : copy.selection.officeFurniture;

                        return (
                          <article
                            key={item.id}
                            className="group flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 transition-colors hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] sm:gap-5 sm:p-4"
                          >
                            <Link
                              href={localizedStorefrontPath(locale, `/product/${item.id}`)}
                              className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:size-36"
                              aria-label={interpolateStorefrontMessage(
                                copy.selection.viewDetails,
                                { name: itemName },
                              )}
                            >
                              {item.image ? (
                                <Image
                                  src={item.image}
                                  alt=""
                                  width={128}
                                  height={128}
                                  className="size-full object-contain p-2 mix-blend-multiply transition-transform duration-500 motion-reduce:transition-none group-hover:scale-[1.03]"
                                />
                              ) : (
                                <span className="px-3 text-center text-[10px] font-bold tracking-wider text-[var(--text-secondary)]">
                                  {item.sku || copy.selection.officeFurniture}
                                </span>
                              )}
                            </Link>

                            <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="flex items-center gap-2 text-[10px] font-bold tracking-wide text-[var(--accent-dark)]">
                                    <span className="font-mono text-[var(--text-soft)]">
                                      {String(index + 1).padStart(2, "0")}
                                    </span>
                                    {itemCategory}
                                  </p>
                                  <Link
                                    href={localizedStorefrontPath(locale, `/product/${item.id}`)}
                                    className="mt-1 line-clamp-2 block text-sm font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:text-base"
                                  >
                                    {itemName}
                                  </Link>
                                  {item.sku && (
                                    <p className="mt-1 font-mono text-[10px] text-[var(--text-secondary)]" dir="ltr">
                                      {item.sku}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  className="grid size-9 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                  aria-label={interpolateStorefrontMessage(
                                    copy.selection.removeItem,
                                    { name: itemName },
                                  )}
                                >
                                  <Trash2 className="size-4" aria-hidden="true" />
                                </button>
                              </div>

                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-xs font-medium text-[var(--text-secondary)]">
                                  {copy.selection.quantity}
                                </span>
                                <QuoteQuantityControl
                                  value={item.quantity}
                                  onChange={(nextQuantity) =>
                                    updateQuantity(item.id, nextQuantity)
                                  }
                                  name={itemName}
                                  copy={copy.selection}
                                />
                              </div>
                            </div>
                          </article>
                        );
                      })}

                      <Link
                        href={localizedStorefrontPath(locale, "/catalog")}
                        className="flex min-h-14 items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--bg-card)_56%,transparent)] text-sm font-bold text-[var(--primary)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--bg-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      >
                        {copy.selection.addMore}
                        <ForwardArrow className="size-4" aria-hidden="true" />
                      </Link>
                    </div>

                    <aside className="h-fit rounded-lg bg-[var(--surface-inverse)] p-5 text-[var(--text-inverse)] lg:sticky lg:top-28 sm:p-7">
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--brass-300)]">
                        {copy.selection.summaryEyebrow}
                      </p>
                      <h3 className="mt-2 text-xl font-extrabold">
                        {copy.selection.summaryTitle}
                      </h3>
                      <dl className="mt-5 space-y-3 text-sm">
                        <div className="flex items-center justify-between border-b border-[var(--border-inverse)] pb-3">
                          <dt className="text-[var(--text-inverse-muted)]">
                            {copy.selection.distinctProducts}
                          </dt>
                          <dd className="font-bold">{productCount}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-[var(--text-inverse-muted)]">
                            {copy.selection.totalPieces}
                          </dt>
                          <dd className="font-bold">{totalPieceCount}</dd>
                        </div>
                      </dl>
                      <div className="mt-6 border-s border-[var(--brass-300)] ps-4 text-xs leading-6 text-[var(--text-inverse-muted)]">
                        {copy.selection.priceNote}
                      </div>
                      <button
                        type="button"
                        onClick={() => moveToStep(2)}
                        className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-6 text-sm font-bold text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]"
                      >
                        {copy.selection.next}
                        <ForwardArrow className="size-4" aria-hidden="true" />
                      </button>
                    </aside>
                  </div>
                </section>
              )}

              {currentStep === 2 && (
                <section aria-labelledby="project-heading">
                  <div className="mb-10 grid gap-6 border-b border-[var(--border)] pb-8 lg:grid-cols-[auto_1fr] lg:items-end">
                    <span className="font-mono text-6xl font-light tracking-[-0.08em] text-[color-mix(in_srgb,var(--text-strong)_14%,transparent)] sm:text-7xl" aria-hidden="true">
                      02
                    </span>
                    <div className="max-w-3xl">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-dark)]">
                        {copy.project.eyebrow}
                      </p>
                      <h2
                        id="project-heading"
                        className="mt-3 text-3xl font-light leading-tight text-[var(--text-strong)] sm:text-5xl"
                      >
                        {copy.project.titleLead}
                        <span className="block font-extrabold">
                          {copy.project.titleStrong}
                        </span>
                      </h2>
                      <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
                        {copy.project.description}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
                    <div className="space-y-8 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-8">
                      <fieldset>
                        <legend className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                          <Building2 className="size-4 text-[var(--accent-dark)]" aria-hidden="true" />
                          {copy.project.spaceType}
                          <span className="text-xs font-normal text-[var(--text-secondary)]">
                            ({copy.project.optional})
                          </span>
                        </legend>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {copy.project.spaceTypes.map((option) => (
                            <label key={option.value} className="cursor-pointer">
                              <input
                                type="radio"
                                name="spaceType"
                                value={option.value}
                                checked={projectContext.spaceType === option.value}
                                onChange={() =>
                                  updateProjectContext({ spaceType: option.value })
                                }
                                className="peer sr-only"
                              />
                              <span className="flex min-h-14 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-center text-xs font-bold text-[var(--text-secondary)] transition peer-checked:border-[var(--primary)] peer-checked:bg-[var(--primary)] peer-checked:text-[var(--text-inverse)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--primary)] peer-focus-visible:ring-offset-2 hover:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]">
                                {option.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      <div>
                        <label
                          htmlFor="targetDate"
                          className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"
                        >
                          <CalendarDays className="size-4 text-[var(--accent-dark)]" aria-hidden="true" />
                          {copy.project.targetDate}
                          <span className="text-xs font-normal text-[var(--text-secondary)]">
                            ({copy.project.optional})
                          </span>
                        </label>
                        <input
                          id="targetDate"
                          type="date"
                          value={projectContext.targetDate}
                          onInput={(event) =>
                            updateProjectContext({
                              targetDate: event.currentTarget.value,
                            })
                          }
                          className="mt-3 min-h-12 w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_15%,transparent)] sm:max-w-xs"
                          dir="ltr"
                        />
                      </div>

                      <fieldset>
                        <legend className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                          <Wallet className="size-4 text-[var(--accent-dark)]" aria-hidden="true" />
                          {copy.project.budgetDirection}
                          <span className="text-xs font-normal text-[var(--text-secondary)]">
                            ({copy.project.optional})
                          </span>
                        </legend>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                          {copy.project.budgetHelper}
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {copy.project.budgetBands.map((option) => (
                            <label key={option.value} className="cursor-pointer">
                              <input
                                type="radio"
                                name="budgetBand"
                                value={option.value}
                                checked={projectContext.budgetBand === option.value}
                                onChange={() =>
                                  updateProjectContext({ budgetBand: option.value })
                                }
                                className="peer sr-only"
                              />
                              <span className="flex min-h-12 items-center rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--text-secondary)] transition peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent)] peer-checked:text-[var(--text-inverse)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2 hover:border-[color-mix(in_srgb,var(--accent)_50%,var(--border))]">
                                {option.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <label
                            htmlFor="projectNotes"
                            className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"
                          >
                            <MessageSquare className="size-4 text-[var(--accent-dark)]" aria-hidden="true" />
                            {copy.project.notes}
                          </label>
                          <span className="text-[10px] text-[var(--text-secondary)]" aria-live="polite">
                            <bdi>
                              {formatStorefrontNumber(projectContext.notes.length, locale)} / {formatStorefrontNumber(1_200, locale)}
                            </bdi>
                          </span>
                        </div>
                        <textarea
                          id="projectNotes"
                          rows={5}
                          maxLength={1_200}
                          value={projectContext.notes}
                          onChange={(event) =>
                            updateProjectContext({ notes: event.target.value })
                          }
                          placeholder={copy.project.notesPlaceholder}
                          className="mt-3 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-soft)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_15%,transparent)]"
                        />
                      </div>
                    </div>

                    <aside className="h-fit rounded-lg bg-[var(--surface-inverse)] p-5 text-[var(--text-inverse)] lg:sticky lg:top-28 sm:p-7">
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--brass-300)]">
                        {copy.project.afterEyebrow}
                      </p>
                      <h3 className="mt-2 text-xl font-extrabold">
                        {copy.project.afterTitle}
                      </h3>
                      <ol className="mt-6 space-y-4 text-xs leading-6 text-[var(--text-inverse-muted)]">
                        {copy.project.afterSteps.map((step, index) => (
                          <li key={step} className="flex gap-3">
                            <span className="grid size-7 shrink-0 place-items-center rounded-[0.3rem] border border-[var(--border-inverse)] font-mono font-bold text-[var(--brass-300)]">
                              0{index + 1}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                      <div className="mt-6 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => moveToStep(3)}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--bg-card)] px-6 text-sm font-bold text-[var(--primary)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]"
                        >
                          {copy.project.next}
                          <ForwardArrow className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveToStep(1)}
                          className="min-h-11 rounded-md text-xs font-bold text-[var(--text-inverse-muted)] transition-colors hover:bg-[var(--surface-inverse-soft)] hover:text-[var(--text-inverse)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)]"
                        >
                          {copy.project.back}
                        </button>
                      </div>
                    </aside>
                  </div>
                </section>
              )}

              {currentStep === 3 && (
                <section aria-labelledby="contact-heading">
                  <div className="mb-10 grid gap-6 border-b border-[var(--border)] pb-8 lg:grid-cols-[auto_1fr] lg:items-end">
                    <span className="font-mono text-6xl font-light tracking-[-0.08em] text-[color-mix(in_srgb,var(--text-strong)_14%,transparent)] sm:text-7xl" aria-hidden="true">
                      03
                    </span>
                    <div className="max-w-3xl">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-dark)]">
                        {copy.contact.eyebrow}
                      </p>
                      <h2
                        id="contact-heading"
                        className="mt-3 text-3xl font-light leading-tight text-[var(--text-strong)] sm:text-5xl"
                      >
                        {copy.contact.titleLead}
                        <span className="block font-extrabold">
                          {copy.contact.titleStrong}
                        </span>
                      </h2>
                      <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
                        {copy.contact.description}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <form
                      onSubmit={handleSubmit}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-8"
                      noValidate
                    >
                      {submissionError && (
                        <div
                          ref={errorRef}
                          role="alert"
                          tabIndex={-1}
                          className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700 outline-none focus:ring-2 focus:ring-red-500"
                        >
                          {resolveSubmissionError(
                            submissionError,
                            locale,
                            copy.validation,
                          )}
                        </div>
                      )}

                      <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="clientName"
                            className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]"
                          >
                            <User className="size-4 text-[var(--accent-dark)]" aria-hidden="true" />
                            {copy.contact.clientName}
                            <span className="text-[var(--primary)]">*</span>
                          </label>
                          <input
                            id="clientName"
                            type="text"
                            required
                            minLength={2}
                            maxLength={120}
                            autoComplete="name"
                            placeholder={copy.contact.clientNamePlaceholder}
                            value={formData.clientName}
                            onChange={(event) =>
                              updateContact("clientName", event.target.value)
                            }
                            aria-invalid={Boolean(fieldErrors.clientName)}
                            aria-describedby={
                              fieldErrors.clientName
                                ? "clientName-error"
                                : undefined
                            }
                            className={cn(
                              "mt-2 min-h-12 w-full rounded-md border bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-soft)] focus:ring-2",
                              fieldErrors.clientName
                                ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
                                : "border-[var(--border)] focus:border-[var(--primary)] focus:ring-[var(--primary)]/15",
                            )}
                          />
                          {fieldErrors.clientName && (
                            <p id="clientName-error" className="mt-1.5 text-xs text-red-600">
                              {copy.validation.clientName}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="companyName"
                            className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]"
                          >
                            <Building2 className="size-4 text-[var(--accent-dark)]" aria-hidden="true" />
                            {copy.contact.companyName}
                            <span className="font-normal text-[var(--text-secondary)]">
                              ({copy.contact.optional})
                            </span>
                          </label>
                          <input
                            id="companyName"
                            type="text"
                            maxLength={160}
                            autoComplete="organization"
                            placeholder={copy.contact.companyPlaceholder}
                            value={formData.companyName}
                            onChange={(event) =>
                              updateContact("companyName", event.target.value)
                            }
                            aria-invalid={Boolean(fieldErrors.companyName)}
                            aria-describedby={
                              fieldErrors.companyName
                                ? "companyName-error"
                                : undefined
                            }
                            className={cn(
                              "mt-2 min-h-12 w-full rounded-md border bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-soft)] focus:ring-2",
                              fieldErrors.companyName
                                ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
                                : "border-[var(--border)] focus:border-[var(--primary)] focus:ring-[var(--primary)]/15",
                            )}
                          />
                          {fieldErrors.companyName && (
                            <p id="companyName-error" className="mt-1.5 text-xs text-red-600">
                              {copy.validation.companyName}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="phone"
                            className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]"
                          >
                            <Phone className="size-4 text-[var(--accent-dark)]" aria-hidden="true" />
                            {copy.contact.phone}
                            <span className="text-[var(--primary)]">*</span>
                          </label>
                          <input
                            id="phone"
                            type="tel"
                            required
                            minLength={7}
                            maxLength={32}
                            inputMode="tel"
                            autoComplete="tel"
                            dir="ltr"
                            placeholder={copy.contact.phonePlaceholder}
                            value={formData.phone}
                            onChange={(event) =>
                              updateContact("phone", event.target.value)
                            }
                            aria-invalid={Boolean(fieldErrors.phone)}
                            aria-describedby={
                              fieldErrors.phone ? "phone-error" : "phone-hint"
                            }
                            className={cn(
                              "mt-2 min-h-12 w-full rounded-md border bg-[var(--bg-card)] px-4 text-left text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-soft)] focus:ring-2",
                              fieldErrors.phone
                                ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
                                : "border-[var(--border)] focus:border-[var(--primary)] focus:ring-[var(--primary)]/15",
                            )}
                          />
                          {fieldErrors.phone ? (
                            <p id="phone-error" className="mt-1.5 text-xs text-red-600">
                              {copy.validation.phone}
                            </p>
                          ) : (
                            <p id="phone-hint" className="mt-1.5 text-[10px] text-[var(--text-secondary)]">
                              {copy.contact.phoneHint}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="email"
                            className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]"
                          >
                            <Mail className="size-4 text-[var(--accent-dark)]" aria-hidden="true" />
                            {copy.contact.email}
                            <span className="font-normal text-[var(--text-secondary)]">
                              ({copy.contact.optional})
                            </span>
                          </label>
                          <input
                            id="email"
                            type="email"
                            maxLength={254}
                            inputMode="email"
                            autoComplete="email"
                            dir="ltr"
                            placeholder={copy.contact.emailPlaceholder}
                            value={formData.email}
                            onChange={(event) =>
                              updateContact("email", event.target.value)
                            }
                            aria-invalid={Boolean(fieldErrors.email)}
                            aria-describedby={
                              fieldErrors.email ? "email-error" : undefined
                            }
                            className={cn(
                              "mt-2 min-h-12 w-full rounded-md border bg-[var(--bg-card)] px-4 text-left text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-soft)] focus:ring-2",
                              fieldErrors.email
                                ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
                                : "border-[var(--border)] focus:border-[var(--primary)] focus:ring-[var(--primary)]/15",
                            )}
                          />
                          {fieldErrors.email && (
                            <p id="email-error" className="mt-1.5 text-xs text-red-600">
                              {copy.validation.email}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-7 border-s border-[var(--brass)] bg-[var(--surface-subtle)] p-4">
                        <div className="flex items-start gap-3">
                          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--accent-dark)]" aria-hidden="true" />
                          <div>
                            <p className="text-xs font-bold text-[var(--text-primary)]">
                              {copy.contact.humanReviewTitle}
                            </p>
                            <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">
                              {copy.contact.humanReviewBody}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() => moveToStep(2)}
                          disabled={isSubmitting}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-xs font-bold text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50"
                        >
                          <BackArrow className="size-4" aria-hidden="true" />
                          {copy.contact.back}
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting || items.length === 0}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-8 text-sm font-bold text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[var(--border-strong)]"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                              {copy.contact.submitting}
                            </>
                          ) : (
                            <>
                              {copy.contact.submit}
                              <ForwardArrow className="size-4" aria-hidden="true" />
                            </>
                          )}
                        </button>
                      </div>
                    </form>

                    <aside className="h-fit space-y-4 lg:sticky lg:top-28">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-base font-bold text-[var(--text-primary)]">
                            {copy.contact.finalReview}
                          </h3>
                          <button
                            type="button"
                            onClick={() => moveToStep(1)}
                            className="text-xs font-bold text-[var(--primary)] hover:text-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                          >
                            {copy.contact.editProducts}
                          </button>
                        </div>
                        <dl className="mt-4 space-y-3 text-xs">
                          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                            <dt className="text-[var(--text-secondary)]">
                              {copy.contact.products}
                            </dt>
                            <dd className="font-bold text-[var(--text-primary)]">
                              {productCount}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                            <dt className="text-[var(--text-secondary)]">
                              {copy.contact.totalPieces}
                            </dt>
                            <dd className="font-bold text-[var(--text-primary)]">
                              {totalPieceCount}
                            </dd>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <dt className="text-[var(--text-secondary)]">
                              {copy.contact.spaceType}
                            </dt>
                            <dd className="text-end font-bold text-[var(--text-primary)]">
                              {findLabel(
                                copy.project.spaceTypes,
                                projectContext.spaceType,
                              ) || copy.contact.notSpecified}
                            </dd>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <dt className="text-[var(--text-secondary)]">
                              {copy.contact.targetDate}
                            </dt>
                            <dd className="font-bold text-[var(--text-primary)]" dir={projectContext.targetDate ? "ltr" : undefined}>
                              {projectContext.targetDate ||
                                copy.contact.notSpecified}
                            </dd>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <dt className="text-[var(--text-secondary)]">
                              {copy.contact.budgetDirection}
                            </dt>
                            <dd className="max-w-[11rem] text-end font-bold text-[var(--text-primary)]">
                              {findLabel(
                                copy.project.budgetBands,
                                projectContext.budgetBand,
                              ) || copy.contact.notSpecified}
                            </dd>
                          </div>
                        </dl>
                        <button
                          type="button"
                          onClick={() => moveToStep(2)}
                          className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] text-xs font-bold text-[var(--primary)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        >
                          <FileText className="size-3.5" aria-hidden="true" />
                          {copy.contact.editProject}
                        </button>
                      </div>

                      <div className="rounded-lg bg-[var(--surface-inverse)] p-5 text-[var(--text-inverse)] sm:p-7">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--brass-300)]">
                          {copy.contact.finalEyebrow}
                        </p>
                        <h3 className="mt-2 text-lg font-extrabold">
                          {copy.contact.finalTitle}
                        </h3>
                        <ul className="mt-4 space-y-3 text-xs leading-6 text-[var(--text-inverse-muted)]">
                          {copy.contact.finalChecklist.map((item) => (
                            <li key={item} className="flex gap-2">
                              <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--brass-300)]" aria-hidden="true" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </aside>
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
