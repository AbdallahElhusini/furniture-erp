"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpLeft,
  ArrowUpRight,
  Armchair,
  Layers3,
  Move3d,
  Palette,
} from "lucide-react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStorefrontI18n } from "@/components/storefront/i18n/StorefrontI18nProvider";
import { cn } from "@/lib/utils";

export interface HeroSceneProps {
  executiveImage?: string;
  chairImage?: string;
  executiveHref: string;
  chairHref: string;
}

const FINISHES = [
  {
    id: "walnut",
    labelAr: "جوز",
    labelEn: "Walnut",
    swatch: "#765039",
    accent: "#9b704d",
    glow: "rgba(180, 138, 80, 0.28)",
    surface: "#fffaf2",
  },
  {
    id: "oxblood",
    labelAr: "عنّابي",
    labelEn: "Oxblood",
    swatch: "#86363d",
    accent: "#9f5258",
    glow: "rgba(134, 54, 61, 0.24)",
    surface: "#fff8f7",
  },
  {
    id: "sage",
    labelAr: "مريمية",
    labelEn: "Sage",
    swatch: "#687963",
    accent: "#7f9178",
    glow: "rgba(104, 121, 99, 0.28)",
    surface: "#f9fbf7",
  },
] as const;

const WORKSPACE_STEPS = [
  { id: "desk", number: "01", label: { ar: "المكتب", en: "Desk" } },
  { id: "chair", number: "02", label: { ar: "المقعد", en: "Chair" } },
  { id: "finish", number: "03", label: { ar: "التشطيب", en: "Finish" } },
] as const;

const sceneCopy = {
  ar: {
    sceneLabel: "معاينة تفاعلية لتكوين مساحة عمل",
    deskLink: "استكشف تكوين المكتب التنفيذي",
    deskAlt: "تكوين مكتب تنفيذي من كتالوج حطب",
    imageReview: "الصورة قيد المراجعة",
    moodTitle: "إضاءة تنسيقية",
    moodGroup: "غيّر المزاج اللوني للمشهد",
    visualOnly: "معاينة بصرية فقط",
    moodNote: "يغيّر أجواء العرض فقط، لا مواصفات المنتج.",
    chairLink: "أكمل مساحة العمل بكرسي عمل",
    chairAlt: "كرسي عمل يكمل تكوين المكتب",
    complete: "أكمل المساحة",
    stepsLabel: "مراحل معاينة مساحة العمل",
    focusStep: "ركّز المعاينة على",
    selectedMood: "المزاج البصري المختار",
    selectedFocus: "تركيز المعاينة",
  },
  en: {
    sceneLabel: "Interactive workspace composition preview",
    deskLink: "Explore the executive desk composition",
    deskAlt: "HATAB executive desk workspace composition",
    imageReview: "Image under review",
    moodTitle: "Scene lighting",
    moodGroup: "Change the visual mood of the scene",
    visualOnly: "visual preview only",
    moodNote: "Changes the presentation mood, not the product specification.",
    chairLink: "Complete the workspace with a task chair",
    chairAlt: "Task chair completing the desk composition",
    complete: "Complete the space",
    stepsLabel: "Workspace preview stages",
    focusStep: "Focus the preview on",
    selectedMood: "Selected visual mood",
    selectedFocus: "Preview focus",
  },
} as const;

type FinishId = (typeof FINISHES)[number]["id"];
type WorkspaceStep = (typeof WORKSPACE_STEPS)[number]["id"];

type HeroSceneStyle = CSSProperties & {
  "--hero-accent": string;
  "--hero-glow": string;
  "--hero-surface": string;
  "--hero-rotate-x": string;
  "--hero-rotate-y": string;
  "--hero-far-x": string;
  "--hero-far-y": string;
  "--hero-near-x": string;
  "--hero-near-y": string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function HeroScene({
  executiveImage,
  chairImage,
  executiveHref,
  chairHref,
}: HeroSceneProps) {
  const { locale } = useStorefrontI18n();
  const copy = sceneCopy[locale];
  const CornerArrow = locale === "ar" ? ArrowUpLeft : ArrowUpRight;
  const [finishId, setFinishId] = useState<FinishId>("walnut");
  const [activeStep, setActiveStep] = useState<WorkspaceStep>("desk");
  const sceneRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const tiltEnabledRef = useRef(false);

  const finish =
    FINISHES.find((option) => option.id === finishId) ?? FINISHES[0];

  const resetTilt = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const scene = sceneRef.current;
    if (!scene) return;
    scene.style.setProperty("--hero-rotate-x", "0deg");
    scene.style.setProperty("--hero-rotate-y", "0deg");
    scene.style.setProperty("--hero-far-x", "0px");
    scene.style.setProperty("--hero-far-y", "0px");
    scene.style.setProperty("--hero-near-x", "0px");
    scene.style.setProperty("--hero-near-y", "0px");
  }, []);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const syncInteractionMode = () => {
      tiltEnabledRef.current = finePointer.matches && !reducedMotion.matches;
      if (!tiltEnabledRef.current) resetTilt();
    };

    syncInteractionMode();
    finePointer.addEventListener("change", syncInteractionMode);
    reducedMotion.addEventListener("change", syncInteractionMode);

    return () => {
      finePointer.removeEventListener("change", syncInteractionMode);
      reducedMotion.removeEventListener("change", syncInteractionMode);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [resetTilt]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tiltEnabledRef.current) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedX = clamp(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -1,
      1,
    );
    const normalizedY = clamp(
      ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
      -1,
      1,
    );
    const scene = event.currentTarget;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      scene.style.setProperty(
        "--hero-rotate-x",
        `${(-normalizedY * 2.5).toFixed(2)}deg`,
      );
      scene.style.setProperty(
        "--hero-rotate-y",
        `${(normalizedX * 2.5).toFixed(2)}deg`,
      );
      scene.style.setProperty(
        "--hero-far-x",
        `${(-normalizedX * 4).toFixed(2)}px`,
      );
      scene.style.setProperty(
        "--hero-far-y",
        `${(-normalizedY * 3).toFixed(2)}px`,
      );
      scene.style.setProperty(
        "--hero-near-x",
        `${(normalizedX * 10).toFixed(2)}px`,
      );
      scene.style.setProperty(
        "--hero-near-y",
        `${(normalizedY * 7).toFixed(2)}px`,
      );
      animationFrameRef.current = null;
    });
  };

  const sceneStyle: HeroSceneStyle = {
    "--hero-accent": finish.accent,
    "--hero-glow": finish.glow,
    "--hero-surface": finish.surface,
    "--hero-rotate-x": "0deg",
    "--hero-rotate-y": "0deg",
    "--hero-far-x": "0px",
    "--hero-far-y": "0px",
    "--hero-near-x": "0px",
    "--hero-near-y": "0px",
  };

  return (
    <section
      ref={sceneRef}
      aria-label={copy.sceneLabel}
      data-finish={finishId}
      data-workspace-step={activeStep}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
      style={{ ...sceneStyle, perspective: "1200px" }}
      className="relative isolate mx-auto min-h-[360px] w-full max-w-[760px] overflow-hidden rounded-[var(--shape-frame)] border border-[var(--forest-950)]/24 bg-[var(--surface-ink)] shadow-[var(--depth-stage)] sm:min-h-[500px] lg:min-h-[clamp(470px,58svh,580px)]"
    >
      <div className="pointer-events-none absolute inset-x-3 top-2 z-30 flex items-center justify-between text-[8px] font-bold tracking-[0.14em] text-white/36 sm:inset-x-5 sm:top-3" aria-hidden="true" dir="ltr">
        <span>HATAB / SPACE COMPOSER</span>
        <span>POINTER FIELD · 01</span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
          backgroundSize: "3.75rem 3.75rem",
          maskImage: "linear-gradient(to bottom, black, transparent 92%)",
          transform:
            "translate3d(var(--hero-far-x), var(--hero-far-y), -38px)",
        }}
      />

      <div
        className="absolute inset-3 transition-transform duration-300 ease-out will-change-transform sm:inset-5"
        style={{
          transform:
            "rotateX(var(--hero-rotate-x)) rotateY(var(--hero-rotate-y))",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[3%] bottom-[4%] top-[4%] overflow-hidden rounded-[var(--shape-sm)] border border-white/65 bg-[var(--hero-surface)] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_34px_75px_-52px_rgba(0,0,0,0.82)] transition-colors duration-500"
          style={{
            transform:
              "translate3d(var(--hero-far-x), var(--hero-far-y), 0px)",
          }}
        >
          <span
            className="absolute inset-x-[18%] top-[-22%] h-[72%] rounded-b-[45%] rounded-t-full border border-white/75 bg-white/26"
            style={{
              boxShadow: "inset 0 -50px 90px var(--hero-glow)",
            }}
          />
          <span
            className="absolute inset-x-[9%] bottom-[8%] h-[28%] rounded-[50%] opacity-80 blur-2xl transition-colors duration-500"
            style={{ background: "var(--hero-glow)" }}
          />
          <span className="absolute inset-x-[7%] bottom-[7%] h-[18%] rounded-[50%] border border-[#5f4939]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(112,78,51,0.13))] shadow-[0_22px_38px_-30px_rgba(48,33,23,0.62)]" />
          <span className="absolute right-[5%] top-[5%] text-[clamp(2.5rem,7vw,6.5rem)] font-black leading-none text-[var(--forest-950)] opacity-[0.045]" dir="ltr">
            WORKSPACE
          </span>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[10%] top-[14%] h-24 w-24 border-l border-t border-white/35 opacity-55 blur-sm sm:h-36 sm:w-36"
          style={{
            background: "var(--hero-glow)",
            transform:
              "translate3d(var(--hero-far-x), var(--hero-far-y), 18px)",
          }}
        />

        <Link
          href={executiveHref}
          aria-label={copy.deskLink}
          className={cn(
            "absolute inset-x-[3%] bottom-[8%] top-[10%] z-20 overflow-hidden rounded-[var(--shape-sm)] border border-white/55 bg-white/55 transition-[opacity,filter] duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--forest-950)]",
            activeStep === "desk"
              ? "opacity-100"
              : "opacity-90 saturate-[0.92]",
          )}
          style={{
            transform:
              "translate3d(var(--hero-near-x), var(--hero-near-y), 58px)",
          }}
        >
          {executiveImage ? (
            <Image
              src={executiveImage}
              alt={copy.deskAlt}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(max-width: 640px) 96vw, (max-width: 1024px) 82vw, 48vw"
              className="object-contain p-2 mix-blend-multiply drop-shadow-[0_38px_28px_rgba(54,37,25,0.24)] transition-transform duration-700 ease-out hover:scale-[1.018] sm:p-4"
            />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-3 text-[var(--forest-700)]/45">
              <Layers3 className="h-20 w-20" strokeWidth={0.8} aria-hidden="true" />
              <span className="text-xs font-bold">{copy.imageReview}</span>
            </span>
          )}
        </Link>

        <div
          className={cn(
            "absolute left-[4%] top-[7%] z-40 w-[9.5rem] rounded-[var(--shape-sm)] border border-white/70 bg-white/76 p-3 text-[var(--forest-900)] shadow-[var(--depth-raised)] backdrop-blur-xl transition-[transform,box-shadow] duration-500 sm:left-[6%] sm:top-[9%] sm:w-[11rem] sm:p-4",
            activeStep === "finish" &&
              "shadow-[0_26px_55px_-25px_var(--hero-glow)]",
          )}
          style={{
            transform:
              "translate3d(var(--hero-near-x), var(--hero-near-y), 84px)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[9px] font-extrabold tracking-[0.12em] text-[var(--forest-600)]">
                STUDIO MOOD
              </p>
              <p className="mt-1 text-xs font-bold">{copy.moodTitle}</p>
            </div>
            <Palette className="h-4 w-4 text-[var(--hero-accent)]" aria-hidden="true" />
          </div>

          <div className="mt-3 flex items-center gap-2" role="group" aria-label={copy.moodGroup}>
            {FINISHES.map((option) => {
              const selected = option.id === finishId;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-label={`${locale === "ar" ? option.labelAr : option.labelEn} — ${copy.visualOnly}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setFinishId(option.id);
                    setActiveStep("finish");
                  }}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full border bg-white transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oxblood-700)] focus-visible:ring-offset-2",
                    selected
                      ? "scale-105 border-[var(--forest-900)]/45 shadow-[0_0_0_3px_rgba(255,255,255,0.8)]"
                      : "border-white/70",
                  )}
                >
                  <span
                    className="h-5 w-5 rounded-full border border-black/5"
                    style={{ backgroundColor: option.swatch }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
          <p className="mt-2 truncate text-[9px] text-[var(--text-muted)]">
            {locale === "ar" ? `${finish.labelAr} · ${finish.labelEn}` : finish.labelEn}
          </p>
          <p className="mt-1 text-[8px] leading-4 text-[var(--text-muted)]/75">
            {copy.moodNote}
          </p>
        </div>

        <Link
          href={chairHref}
          aria-label={copy.chairLink}
          className={cn(
            "group absolute bottom-[8%] right-[4%] z-40 h-32 w-28 overflow-hidden rounded-[var(--shape-sm)] border border-white/75 bg-white/86 shadow-[var(--depth-float)] backdrop-blur-lg transition-[transform,box-shadow] duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--forest-950)] sm:bottom-[7%] sm:right-[5%] sm:h-40 sm:w-36",
            activeStep === "chair" &&
              "shadow-[0_26px_65px_-26px_var(--hero-glow)]",
          )}
          style={{
            transform:
              "translate3d(var(--hero-near-x), var(--hero-near-y), 96px)",
          }}
        >
          <span className="relative block h-[72%] overflow-hidden bg-[var(--hero-surface)] transition-colors duration-500">
            {chairImage ? (
              <Image
                src={chairImage}
                alt={copy.chairAlt}
                fill
                sizes="144px"
                className="object-contain p-2 mix-blend-multiply transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-[var(--forest-700)]/35">
                <Armchair className="h-9 w-9" strokeWidth={1.1} aria-hidden="true" />
              </span>
            )}
          </span>
          <span className="flex h-[28%] items-center justify-between gap-1 px-2.5 text-[9px] font-bold text-[var(--forest-900)] sm:px-3 sm:text-[10px]">
            {copy.complete}
            <CornerArrow className="h-3.5 w-3.5 shrink-0 text-[var(--hero-accent)] transition-transform duration-300 group-hover:-translate-y-0.5" aria-hidden="true" />
          </span>
        </Link>

        <nav
          aria-label={copy.stepsLabel}
          className="absolute bottom-[15%] left-[4%] z-50 flex items-center rounded-[var(--shape-sm)] border border-white/65 bg-[var(--forest-900)]/88 p-1 text-white shadow-[var(--depth-contact)] backdrop-blur-xl sm:bottom-[11%] sm:left-[6%] lg:bottom-[12%]"
          style={{
            transform:
              "translate3d(var(--hero-near-x), var(--hero-near-y), 112px)",
          }}
        >
          <Move3d className="mx-2 hidden h-3.5 w-3.5 text-white/55 sm:block" aria-hidden="true" />
          {WORKSPACE_STEPS.map((step) => {
            const selected = step.id === activeStep;
            return (
              <button
                key={step.id}
                type="button"
                aria-pressed={selected}
                aria-label={`${copy.focusStep} ${step.label[locale]}`}
                onClick={() => setActiveStep(step.id)}
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-[0.3rem] px-2 text-[9px] font-bold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--forest-900)] sm:h-9 sm:px-3",
                  selected
                    ? "bg-white text-[var(--forest-900)]"
                    : "text-white/58 hover:bg-white/10 hover:text-white",
                )}
              >
                <span dir="ltr">{step.number}</span>
                <span className="hidden sm:inline">{step.label[locale]}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <p className="sr-only" aria-live="polite">
        {copy.selectedMood}: {locale === "ar" ? finish.labelAr : finish.labelEn}. {copy.selectedFocus}: {WORKSPACE_STEPS.find((step) => step.id === activeStep)?.label[locale]}.
      </p>
    </section>
  );
}

export default HeroScene;
