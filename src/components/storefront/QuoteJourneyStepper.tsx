"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStorefrontI18n } from "./i18n/StorefrontI18nProvider";

interface QuoteJourneyStepperProps {
  currentStep: 1 | 2 | 3;
}

export function QuoteJourneyStepper({
  currentStep,
}: QuoteJourneyStepperProps) {
  const { dictionary } = useStorefrontI18n();
  const { stepper } = dictionary.quote;

  return (
    <nav aria-label={stepper.landmark}>
      <ol className="grid overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)] sm:grid-cols-3">
        {stepper.steps.map((step, index) => {
          const stepNumber = (index + 1) as 1 | 2 | 3;
          const isCurrent = currentStep === stepNumber;
          const isComplete = currentStep > stepNumber;

          return (
            <li
              key={stepNumber}
              className={cn(
                "relative flex min-h-20 items-center gap-4 border-b border-[var(--border)] px-4 py-4 transition-colors duration-300 last:border-b-0 sm:min-h-24 sm:border-b-0 sm:border-s sm:px-5 sm:first:border-s-0 motion-reduce:transition-none",
                isCurrent &&
                  "bg-[var(--surface-inverse)] text-[var(--text-inverse)]",
                isComplete && "bg-[var(--surface-subtle)]",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-[0.35rem] border text-[11px] font-black",
                  isCurrent
                    ? "border-[var(--border-inverse)] bg-[var(--primary)] text-[var(--text-inverse)]"
                    : isComplete
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--text-inverse)]"
                      : "border-[var(--border-strong)] text-[var(--text-soft)]",
                )}
                aria-hidden="true"
              >
                {isComplete ? <Check className="size-4" /> : `0${stepNumber}`}
              </span>

              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-[9px] font-bold uppercase tracking-[0.2em]",
                    isCurrent
                      ? "text-[var(--text-inverse-muted)]"
                      : "text-[var(--text-soft)]",
                  )}
                >
                  {isComplete
                    ? stepper.completed
                    : isCurrent
                      ? stepper.current
                      : stepper.next}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-xs font-extrabold sm:text-sm",
                    isCurrent
                      ? "text-[var(--text-inverse)]"
                      : "text-[var(--text-strong)]",
                  )}
                >
                  <span className="sm:hidden">{step.shortLabel}</span>
                  <span className="hidden sm:inline">{step.label}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
