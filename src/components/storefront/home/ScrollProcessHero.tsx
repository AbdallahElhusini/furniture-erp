"use client";

import {
  ArrowDown,
  ArrowUpLeft,
  ArrowUpRight,
  Armchair,
  Cpu,
  DraftingCompass,
  Hammer,
  Ruler,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useStorefrontI18n } from "@/components/storefront/i18n/StorefrontI18nProvider";
import {
  HOME_PAGE_CONTENT_DEFAULTS,
  type HomePageContentByLocale,
} from "@/lib/home-content-defaults";
import { cn } from "@/lib/utils";

type ProcessStage = {
  id: "design" | "engineer" | "craft" | "coordinate" | "smart-office";
  /** Inclusive start point in the film's normalized 0–1 timeline. */
  threshold: number;
  number: string;
  icon: LucideIcon;
};

const PROCESS_STAGES: readonly ProcessStage[] = [
  { id: "design", number: "01", threshold: 0, icon: DraftingCompass },
  { id: "engineer", number: "02", threshold: 0.17, icon: Ruler },
  { id: "craft", number: "03", threshold: 0.34, icon: Hammer },
  { id: "coordinate", number: "04", threshold: 0.53, icon: Armchair },
  { id: "smart-office", number: "05", threshold: 0.72, icon: Cpu },
] as const;

type ScrollProcessStyle = CSSProperties & {
  "--process-progress": string;
};

export interface ScrollProcessHeroProps {
  /** A public URL is recommended so the browser can preload and seek the film. */
  videoSrc: string;
  fallbackVideoSrc?: string;
  posterSrc?: string;
  content?: HomePageContentByLocale;
  catalogHref?: string;
  projectHref?: string;
  className?: string;
}

const NAVBAR_OFFSET_REM = 6.5;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

/**
 * A sticky, scroll-scrubbed account of the HATAB process. The film never
 * auto-plays: its currentTime follows section progress while copy advances in
 * five legible stages. Visitors who request reduced motion receive a static,
 * complete process summary instead.
 */
export function ScrollProcessHero({
  videoSrc,
  fallbackVideoSrc,
  posterSrc,
  content,
  catalogHref = "/catalog",
  projectHref = "/quote",
  className,
}: ScrollProcessHeroProps) {
  const { direction, locale } = useStorefrontI18n();
  const copy = (content ?? HOME_PAGE_CONTENT_DEFAULTS)[locale].process;
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageCopyRefs = useRef<Array<HTMLElement | null>>([]);
  const frameRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const activeStageIndexRef = useRef(0);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isIntersecting = true;
    let isPageVisible = document.visibilityState === "visible";
    let metadataReady = video.readyState >= HTMLMediaElement.HAVE_METADATA;
    let lastStageIndex = activeStageIndexRef.current;
    let targetProgress = 0;
    let scrollController: ScrollTrigger | null = null;
    let progressTween: gsap.core.Tween | null = null;
    let nativeFallbackInstalled = false;
    let initialRefreshTimer: number | null = null;
    const stageElements = stageCopyRefs.current.filter(
      (stageElement): stageElement is HTMLElement => stageElement !== null,
    );

    gsap.registerPlugin(ScrollTrigger);

    stageCopyRefs.current.forEach((stageElement, stageIndex) => {
      if (!stageElement) return;
      const isCurrent = stageIndex === lastStageIndex;
      gsap.set(stageElement, {
        autoAlpha: isCurrent ? 1 : 0,
        y: isCurrent ? 0 : 22,
        filter: isCurrent ? "blur(0px)" : "blur(3px)",
      });
    });

    const stopFrame = () => {
      if (frameRef.current === null) return;
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };

    const animateStageReplacement = (
      nextStageIndex: number,
      previousStageIndex: number,
    ) => {
      const previousStage = stageCopyRefs.current[previousStageIndex];
      const nextStage = stageCopyRefs.current[nextStageIndex];
      if (!nextStage || reducedMotionRef.current) return;

      const movingForward = nextStageIndex > previousStageIndex;
      if (previousStage && previousStage !== nextStage) {
        gsap.to(previousStage, {
          autoAlpha: 0,
          y: movingForward ? -18 : 18,
          filter: "blur(3px)",
          duration: 0.28,
          ease: "power2.in",
          overwrite: "auto",
        });
      }

      gsap.fromTo(
        nextStage,
        {
          autoAlpha: 0,
          y: movingForward ? 24 : -24,
          filter: "blur(4px)",
        },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.58,
          ease: "power3.out",
          overwrite: "auto",
        },
      );
    };

    const renderProgress = () => {
      frameRef.current = null;
      if (
        reducedMotionRef.current ||
        !isIntersecting ||
        !isPageVisible
      ) {
        return;
      }

      const progress = clamp(targetProgress, 0, 1);

      section.style.setProperty("--process-progress", progress.toFixed(5));

      const nextStageIndex = PROCESS_STAGES.reduce(
        (resolvedIndex, stage, stageIndex) =>
          progress >= stage.threshold ? stageIndex : resolvedIndex,
        0,
      );
      if (nextStageIndex !== lastStageIndex) {
        const previousStageIndex = lastStageIndex;
        lastStageIndex = nextStageIndex;
        activeStageIndexRef.current = nextStageIndex;
        setActiveStageIndex(nextStageIndex);
        animateStageReplacement(nextStageIndex, previousStageIndex);
      }

      if (metadataReady && Number.isFinite(video.duration) && video.duration > 0) {
        const playableDuration = Math.max(0, video.duration - 0.06);
        const targetTime = playableDuration * progress;

        // Avoid asking the decoder to seek multiple times for an imperceptible
        // frame difference while still keeping the film tightly coupled to scroll.
        if (Math.abs(video.currentTime - targetTime) > 1 / 45) {
          try {
            video.currentTime = targetTime;
          } catch {
            // Some mobile decoders briefly reject seeks while metadata settles.
            // The next passive scroll/resize frame retries without blocking input.
          }
        }
      }
    };

    const queueProgress = (nextProgress: number) => {
      targetProgress = clamp(nextProgress, 0, 1);
      if (
        frameRef.current !== null ||
        reducedMotionRef.current ||
        !isIntersecting ||
        !isPageVisible
      ) {
        return;
      }
      frameRef.current = window.requestAnimationFrame(renderProgress);
    };

    const getNavbarOffset = () => {
      const rootFontSize = Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize,
      );
      return (Number.isFinite(rootFontSize) ? rootFontSize : 16) * NAVBAR_OFFSET_REM;
    };

    const getNativeProgress = () => {
      const navbarOffset = getNavbarOffset();
      const availableViewport = Math.max(1, window.innerHeight - navbarOffset);
      const scrollDistance = Math.max(
        1,
        section.offsetHeight - availableViewport,
      );
      return clamp(
        (navbarOffset - section.getBoundingClientRect().top) / scrollDistance,
        0,
        1,
      );
    };

    const handleNativeScroll = () => queueProgress(getNativeProgress());

    const removeNativeFallback = () => {
      if (!nativeFallbackInstalled) return;
      nativeFallbackInstalled = false;
      window.removeEventListener("scroll", handleNativeScroll);
      window.removeEventListener("resize", handleNativeScroll);
    };

    const installNativeFallback = () => {
      if (nativeFallbackInstalled || reducedMotionRef.current) return;
      nativeFallbackInstalled = true;
      window.addEventListener("scroll", handleNativeScroll, { passive: true });
      window.addEventListener("resize", handleNativeScroll, { passive: true });
      handleNativeScroll();
    };

    const destroyScrollSync = () => {
      scrollController?.kill();
      progressTween?.kill();
      scrollController = null;
      progressTween = null;
      removeNativeFallback();
    };

    const installScrollSync = () => {
      if (reducedMotionRef.current) return;

      try {
        const scrubState = { progress: 0 };
        progressTween = gsap.to(scrubState, {
          progress: 1,
          duration: 1,
          paused: true,
          ease: "none",
          onUpdate: () => queueProgress(scrubState.progress),
        });
        scrollController = ScrollTrigger.create({
          trigger: section,
          start: () => `top ${getNavbarOffset()}px`,
          end: "bottom bottom",
          animation: progressTween,
          scrub: 0.18,
          invalidateOnRefresh: true,
          onRefresh: (self) => queueProgress(self.progress),
        });
        queueProgress(scrollController.progress);
      } catch {
        progressTween?.kill();
        progressTween = null;
        scrollController = null;
        installNativeFallback();
      }
    };

    const handleMetadata = () => {
      metadataReady = true;
      video.pause();
      scrollController?.refresh();
      queueProgress(targetProgress);
    };

    const handleMediaReady = () => {
      metadataReady = video.readyState >= HTMLMediaElement.HAVE_METADATA;
      video.pause();
      setHasVideoError(false);
      setIsVideoReady(true);
      // A hot reload or restored page can reset the media element to frame 0
      // after the scroll state is already correct. Re-read the geometry when
      // decoding is ready so the film and active process copy cannot diverge.
      queueProgress(getNativeProgress());
    };

    const handleMotionPreference = () => {
      reducedMotionRef.current = reducedMotion.matches;
      stopFrame();

      if (reducedMotion.matches) {
        section.style.setProperty("--process-progress", "0");
        lastStageIndex = 0;
        activeStageIndexRef.current = 0;
        setActiveStageIndex(0);
        video.pause();
        if (metadataReady) video.currentTime = 0;
        destroyScrollSync();
        return;
      }

      installScrollSync();
    };

    const handleVisibility = () => {
      isPageVisible = document.visibilityState === "visible";
      if (isPageVisible) queueProgress(targetProgress);
      else stopFrame();
    };

    const synchronizeRestoredScroll = () => {
      if (reducedMotionRef.current) return;
      if (scrollController) {
        scrollController.refresh();
      }
      // Browsers can restore scroll position after ScrollTrigger's first
      // measurement. Read the geometry directly once so reload/back-forward
      // navigation paints the correct frame before the next wheel event.
      queueProgress(getNativeProgress());
    };

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry.isIntersecting;
        if (isIntersecting) queueProgress(targetProgress);
        else stopFrame();
      },
      { rootMargin: "20% 0px" },
    );
    const resizeObserver = new ResizeObserver(() => {
      if (scrollController) scrollController.refresh();
      else if (nativeFallbackInstalled) handleNativeScroll();
    });

    reducedMotionRef.current = reducedMotion.matches;
    section.style.setProperty("--process-progress", "0");
    video.pause();
    intersectionObserver.observe(section);
    resizeObserver.observe(section);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", synchronizeRestoredScroll);
    video.addEventListener("loadedmetadata", handleMetadata);
    video.addEventListener("durationchange", handleMetadata);
    video.addEventListener("loadeddata", handleMediaReady);
    video.addEventListener("canplay", handleMediaReady);
    reducedMotion.addEventListener("change", handleMotionPreference);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      handleMediaReady();
    }
    if (!reducedMotion.matches) installScrollSync();
    initialRefreshTimer = window.setTimeout(synchronizeRestoredScroll, 160);

    return () => {
      stopFrame();
      if (initialRefreshTimer !== null) {
        window.clearTimeout(initialRefreshTimer);
      }
      destroyScrollSync();
      gsap.killTweensOf(stageElements);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", synchronizeRestoredScroll);
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.removeEventListener("durationchange", handleMetadata);
      video.removeEventListener("loadeddata", handleMediaReady);
      video.removeEventListener("canplay", handleMediaReady);
      reducedMotion.removeEventListener("change", handleMotionPreference);
    };
  }, [fallbackVideoSrc, videoSrc]);

  const scrollToStage = useCallback((stageIndex: number) => {
    const section = sectionRef.current;
    if (!section) return;

    const rootFontSize = Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    );
    const navbarOffset =
      (Number.isFinite(rootFontSize) ? rootFontSize : 16) * NAVBAR_OFFSET_REM;
    const sectionTop = window.scrollY + section.getBoundingClientRect().top;
    const availableViewport = Math.max(1, window.innerHeight - navbarOffset);
    const scrollDistance = Math.max(
      0,
      section.offsetHeight - availableViewport,
    );
    const stage = PROCESS_STAGES[stageIndex] ?? PROCESS_STAGES[0];
    const nextThreshold = PROCESS_STAGES[stageIndex + 1]?.threshold ?? 1;
    // Land inside the selected chapter rather than exactly on its threshold.
    // ScrollTrigger scrubbing can otherwise leave the preceding stage active
    // by a fraction of a frame, especially on mobile browsers.
    const stageProgress =
      stageIndex === 0 ? 0 : (stage.threshold + nextThreshold) / 2;

    window.scrollTo({
      top: sectionTop - navbarOffset + scrollDistance * stageProgress,
      behavior: reducedMotionRef.current ? "auto" : "smooth",
    });
  }, []);

  const activeStage = PROCESS_STAGES[activeStageIndex] ?? PROCESS_STAGES[0];
  const activeStageCopy = copy.stages[activeStageIndex] ?? copy.stages[0];
  const CornerArrow = locale === "ar" ? ArrowUpLeft : ArrowUpRight;
  const processStyle: ScrollProcessStyle = { "--process-progress": "0" };

  return (
    <section
      ref={sectionRef}
      aria-label={copy.sectionLabel}
      data-process-stage={activeStage.id}
      dir={direction}
      style={processStyle}
      className={cn(
        "relative min-h-[300svh] border-y border-[var(--forest-950)]/10 bg-[#F6F6F6] text-[var(--forest-950)] sm:min-h-[320svh] lg:min-h-[350svh] motion-reduce:min-h-0",
        className,
      )}
    >
      <h2 className="sr-only">{copy.heading}</h2>
      <div className="sticky top-[6.5rem] h-[calc(100svh-6.5rem)] overflow-hidden motion-reduce:hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(20,36,28,.026) 1px,transparent 1px),linear-gradient(90deg,rgba(20,36,28,.026) 1px,transparent 1px)",
            backgroundSize:
              "var(--stage-grid-size) var(--stage-grid-size),var(--stage-grid-size) var(--stage-grid-size)",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 12%, black 78%, transparent 100%)",
          }}
        />

        <div className="editorial-shell relative z-10 grid h-full min-h-0 grid-rows-[minmax(0,.68fr)_minmax(0,1.32fr)] gap-2 py-2 sm:grid-rows-[minmax(0,.72fr)_minmax(0,1.28fr)] sm:gap-3 sm:py-3 lg:max-w-[84rem] lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,.92fr)] lg:grid-rows-1 lg:gap-6 lg:py-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(26rem,.98fr)] xl:gap-8">
          <div className="relative min-h-0 overflow-hidden rounded-[var(--shape-panel)] border border-[var(--forest-950)]/10 bg-[#F6F6F6] shadow-[0_18px_48px_rgba(20,36,28,.055)] sm:rounded-[var(--shape-frame)] lg:h-full lg:max-h-[42rem] lg:self-center">
            <video
              key={`${videoSrc}:${fallbackVideoSrc ?? ""}`}
              ref={videoRef}
              poster={posterSrc}
              preload="auto"
              muted
              playsInline
              disablePictureInPicture
              controlsList="nodownload noplaybackrate nofullscreen"
              aria-hidden="true"
              tabIndex={-1}
              onLoadStart={() => {
                setIsVideoReady(false);
                setHasVideoError(false);
              }}
              onLoadedData={() => setIsVideoReady(true)}
              onCanPlay={() => setIsVideoReady(true)}
              onError={() => {
                setIsVideoReady(false);
                setHasVideoError(true);
              }}
              className={cn(
                "pointer-events-none absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity duration-700 [filter:contrast(1.15)_brightness(.985)_saturate(1.02)]",
                isVideoReady && !hasVideoError && "opacity-100",
              )}
            >
              <source src={videoSrc} type={videoSrc.toLowerCase().includes(".webm") ? "video/webm" : undefined} />
              {fallbackVideoSrc && fallbackVideoSrc !== videoSrc && (
                <source
                  src={fallbackVideoSrc}
                  type={fallbackVideoSrc.toLowerCase().includes(".mp4") ? "video/mp4" : undefined}
                />
              )}
            </video>

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_76%,rgba(246,246,246,.72))]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-2 border border-[var(--forest-950)]/9 sm:inset-3 lg:inset-4"
            >
              <span className="absolute -left-px -top-px h-4 w-4 border-l border-t border-[var(--forest-950)]/32" />
              <span className="absolute -right-px -top-px h-4 w-4 border-r border-t border-[var(--forest-950)]/32" />
              <span className="absolute -bottom-px -left-px h-4 w-4 border-b border-l border-[var(--forest-950)]/32" />
              <span className="absolute -bottom-px -right-px h-4 w-4 border-b border-r border-[var(--forest-950)]/32" />
            </div>

            {!isVideoReady && !hasVideoError && (
              <div className="absolute inset-0 grid place-items-center bg-[#F6F6F6]/72 backdrop-blur-[2px]">
                <div className="flex items-center gap-2 border border-[var(--forest-950)]/12 bg-white/58 px-3 py-2 text-[10px] font-bold text-[var(--forest-950)]/66 sm:text-xs">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 animate-pulse rounded-full bg-[var(--oxblood-700)]"
                  />
                  {copy.loading}
                </div>
              </div>
            )}

            {hasVideoError && (
              <div className="absolute inset-0 grid place-items-center bg-[#F6F6F6] p-8 text-center">
                <div className="max-w-sm border-s-2 border-[var(--oxblood-700)] ps-4">
                  <p className="text-sm font-bold text-[var(--forest-950)]/82">
                    {copy.unavailable}
                  </p>
                </div>
              </div>
            )}

            <div className="absolute inset-x-5 top-5 hidden items-center justify-between gap-4 text-[9px] font-extrabold text-[var(--forest-950)]/46 sm:flex lg:inset-x-6 lg:top-6 lg:text-[10px]" dir="ltr">
              <span>HATAB / PROCESS FILM</span>
              <span>SCROLL SYNC · {activeStage.number}</span>
            </div>

            <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-4 sm:inset-x-5 sm:bottom-5 lg:inset-x-6 lg:bottom-6">
              <div className="border-s border-[var(--forest-950)]/22 ps-2.5">
                <p className="hidden text-[9px] font-bold text-[var(--forest-950)]/42 sm:block">
                  {copy.filmLabel}
                </p>
                <p className="text-[10px] font-bold text-[var(--forest-950)]/82 sm:mt-1 sm:text-xs">
                  {activeStageCopy.label}
                </p>
              </div>
              <span
                className="text-3xl font-light leading-none text-[var(--forest-950)]/56 sm:text-5xl lg:text-6xl"
                dir="ltr"
              >
                {activeStage.number}
              </span>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-col border-t border-[var(--forest-950)]/10 px-1 pt-3 pb-[5.5rem] sm:px-2 sm:pt-4 sm:pb-[6.25rem] lg:border-s lg:border-t-0 lg:px-0 lg:pt-3 lg:pb-[6.5rem] lg:ps-6 xl:ps-8">
            <div className="hidden shrink-0 lg:block">
              <p className="flex items-center gap-3 text-xs font-extrabold text-[var(--brass-700)]">
                <span className="h-px w-8 bg-current" aria-hidden="true" />
                {copy.eyebrow}
              </p>
            </div>

            <div className="relative my-1 min-h-0 flex-1 overflow-hidden sm:my-2 lg:my-3">
              {PROCESS_STAGES.map((stage, stageIndex) => {
                const StageIcon = stage.icon;
                const stageContent = copy.stages[stageIndex] ?? copy.stages[0];
                const isActive = stageIndex === activeStageIndex;
                const isPast = stageIndex < activeStageIndex;

                return (
                  <article
                    key={stage.id}
                    ref={(element) => {
                      stageCopyRefs.current[stageIndex] = element;
                    }}
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-0 flex flex-col justify-center py-1 will-change-[opacity,transform] sm:py-3 lg:py-5",
                      isActive && "translate-y-0 opacity-100 blur-0",
                      !isActive && isPast && "-translate-y-5 opacity-0 blur-[2px]",
                      !isActive && !isPast && "translate-y-5 opacity-0 blur-[2px]",
                    )}
                  >
                    <div className="flex items-center gap-2.5 text-[var(--brass-700)]">
                      <StageIcon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.4} />
                      <span className="text-[9px] font-extrabold sm:text-[11px]">
                        {copy.stageLabel} {stage.number} · {stageContent.label}
                      </span>
                    </div>
                    <h3 className="mt-2 max-w-lg text-pretty text-[clamp(1.4rem,6vw,1.75rem)] font-semibold leading-[1.06] sm:mt-3 sm:text-[clamp(1.9rem,4.2vw,2.55rem)] lg:text-[clamp(1.8rem,2.2vw,2.55rem)]">
                      {stageContent.title}
                    </h3>
                    <p className="mt-2 max-w-[46ch] text-pretty text-[11px] leading-[1.55] text-[var(--forest-950)]/62 sm:mt-3 sm:text-sm sm:leading-6">
                      {stageContent.description}
                    </p>
                    <p className="mt-3 hidden border-t border-[var(--forest-950)]/12 pt-3 text-[10px] font-bold text-[var(--forest-950)]/44">
                      {stageContent.detail}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="shrink-0">
              <div className="mb-2 grid grid-cols-2 gap-2 sm:mb-3">
                <Link
                  href={catalogHref}
                  className="flex h-10 w-full items-center justify-between border border-[var(--forest-950)] bg-[var(--forest-950)] px-3 text-[9px] font-extrabold text-white transition-colors hover:bg-[var(--forest-800)] sm:text-[11px]"
                >
                  {copy.catalogCta}
                  <CornerArrow className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <Link
                  href={projectHref}
                  className="flex h-10 w-full items-center justify-between border border-[var(--forest-950)]/20 bg-white/28 px-3 text-[9px] font-extrabold text-[var(--forest-950)] transition-colors hover:border-[var(--forest-950)]/42 hover:bg-white/64 sm:text-[11px]"
                >
                  {copy.projectCta}
                  <CornerArrow className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
              <div className="mb-1.5 flex items-center justify-end gap-4 text-[9px] font-bold text-[var(--forest-950)]/44 sm:mb-2 sm:justify-between sm:text-[10px]">
                <span className="hidden items-center gap-2 sm:flex">
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  {copy.instruction}
                </span>
                <span dir="ltr">{activeStage.number} / 05</span>
              </div>
              <div
                role="progressbar"
                aria-label={copy.progressLabel}
                aria-valuemin={0}
                aria-valuemax={5}
                aria-valuenow={activeStageIndex + 1}
                className="h-px overflow-hidden bg-[var(--forest-950)]/16"
              >
                <span
                  className="block h-full w-full bg-[var(--oxblood-700)] will-change-transform"
                  style={{
                    transform: "scaleX(var(--process-progress))",
                    transformOrigin: direction === "rtl" ? "right" : "left",
                  }}
                />
              </div>

              <ol
                aria-label={copy.progressLabel}
                className="mt-2 grid grid-cols-5 gap-1 sm:mt-3"
              >
                {PROCESS_STAGES.map((stage, stageIndex) => (
                  <li key={stage.id}>
                    <button
                      type="button"
                      aria-label={`${copy.jumpTo} ${copy.stages[stageIndex]?.label ?? copy.stages[0].label}`}
                      aria-current={
                        stageIndex === activeStageIndex ? "step" : undefined
                      }
                      onClick={() => scrollToStage(stageIndex)}
                      className={cn(
                        "h-6 w-full border-t px-1 text-[8px] font-extrabold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oxblood-700)] sm:h-8 sm:text-[9px]",
                        stageIndex === activeStageIndex
                          ? "border-[var(--oxblood-700)] text-[var(--forest-950)]"
                          : "border-[var(--forest-950)]/14 text-[var(--forest-950)]/34 hover:border-[var(--forest-950)]/38 hover:text-[var(--forest-950)]/72",
                      )}
                      dir="ltr"
                    >
                      {stage.number}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="editorial-shell hidden py-16 motion-reduce:block">
        <div className="border-s-2 border-[var(--oxblood-700)] ps-5">
          <p className="text-xs font-extrabold text-[var(--brass-700)]">
            {copy.eyebrow}
          </p>
          <h2 className="mt-3 max-w-3xl text-balance text-3xl font-semibold sm:text-5xl">
            {copy.reducedHeading}
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-[var(--forest-950)]/64">
            {copy.reducedDescription}
          </p>
        </div>
        <ol className="mt-10 grid gap-px bg-[var(--forest-950)]/12 sm:grid-cols-2 lg:grid-cols-5">
          {PROCESS_STAGES.map((stage, stageIndex) => {
            const StageIcon = stage.icon;
            const stageContent = copy.stages[stageIndex] ?? copy.stages[0];
            return (
              <li key={stage.id} className="bg-[var(--surface-paper)] p-6">
                <div className="flex items-center justify-between gap-4 text-[var(--brass-700)]">
                  <StageIcon className="h-5 w-5" strokeWidth={1.4} />
                  <span className="text-xs font-extrabold" dir="ltr">
                    {stage.number}
                  </span>
                </div>
                <h3 className="mt-7 text-xl font-semibold">
                  {stageContent.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[var(--forest-950)]/58">
                  {stageContent.description}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <ol className="sr-only">
        {PROCESS_STAGES.map((stage, stageIndex) => (
          <li key={stage.id}>
            {stage.number}. {copy.stages[stageIndex]?.label}: {copy.stages[stageIndex]?.title}{" "}
            {copy.stages[stageIndex]?.description}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default ScrollProcessHero;
