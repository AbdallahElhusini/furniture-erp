"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { gsap } from "gsap";
import type { HomeHeroContent } from "@/lib/home-content-defaults";
import type { StorefrontLocale } from "@/lib/i18n/storefront";
import styles from "./EditorialHomeHero.module.css";

export interface EditorialHeroMedia {
  src: string;
  alt: string;
  objectPosition?: string;
}

export interface EditorialHomeHeroProps {
  locale: StorefrontLocale;
  content: HomeHeroContent;
  media: EditorialHeroMedia[];
}

const STAGE_INTERVAL_MS = 5_600;

/**
 * A real, interactive editorial hero inspired by architectural landing-page
 * transitions. The image and copy planes trade sides on a four-column grid;
 * visitors can select any chapter, while reduced-motion users receive the same
 * information without automatic or animated transitions.
 */
export function EditorialHomeHero({
  locale,
  content,
  media,
}: EditorialHomeHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const copyMotionRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(true);

  const stages = useMemo(() => {
    const count = Math.min(
      media.length,
      content.stageLabels.length,
      content.stageNotes.length,
    );
    return Array.from({ length: Math.max(1, count) }, (_, index) => ({
      media: media[index] ?? media[0],
      label: content.stageLabels[index] ?? content.stageLabels[0] ?? "HATAB",
      note: content.stageNotes[index] ?? content.stageNotes[0] ?? content.body,
    }));
  }, [content.body, content.stageLabels, content.stageNotes, media]);

  const safeActiveIndex = Math.min(activeIndex, stages.length - 1);
  const activeStage = stages[safeActiveIndex];
  const visualOnRight =
    locale === "en" ? safeActiveIndex % 2 !== 0 : safeActiveIndex % 2 === 0;
  const paused = userPaused || interactionPaused;
  const pauseLabel = locale === "ar" ? "أوقف حركة الغلاف" : "Pause hero motion";
  const playLabel = locale === "ar" ? "شغّل حركة الغلاف" : "Resume hero motion";

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.38 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (
      reducedMotion ||
      paused ||
      !inView ||
      !pageVisible ||
      stages.length < 2
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % stages.length);
    }, STAGE_INTERVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [inView, pageVisible, paused, reducedMotion, safeActiveIndex, stages.length]);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const copy = copyMotionRef.current;
    const layer = section?.querySelector<HTMLElement>(
      `[data-hero-layer="${safeActiveIndex}"]`,
    );
    if (!section || !copy || !layer) return;

    const context = gsap.context(() => {
      if (reducedMotion) {
        gsap.set(layer, { clearProps: "all", opacity: 1 });
        gsap.set(copy.children, { clearProps: "all" });
        return;
      }

      gsap.fromTo(
        layer,
        { clipPath: "inset(100% 0 0 0)", scale: 1.065, opacity: 0.35 },
        {
          clipPath: "inset(0% 0 0 0)",
          scale: 1,
          opacity: 1,
          duration: 1.18,
          ease: "power3.inOut",
          overwrite: true,
        },
      );
      gsap.fromTo(
        copy.children,
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.72,
          stagger: 0.055,
          ease: "power3.out",
          overwrite: true,
        },
      );
    }, section);

    return () => context.revert();
  }, [reducedMotion, safeActiveIndex]);

  if (!activeStage?.media) return null;

  return (
    <section
      ref={sectionRef}
      aria-labelledby="home-hero-title"
      className={styles.hero}
      data-paused={paused ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-visual-side={visualOnRight ? "right" : "left"}
      onPointerEnter={() => setInteractionPaused(true)}
      onPointerLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInteractionPaused(false);
      }}
    >
      <div className={styles.stage}>
        <div className={styles.gridField} aria-hidden="true" />

        <figure
          className={styles.visual}
          style={
            visualOnRight
              ? { left: "40%", right: 0 }
              : { left: 0, right: "40%" }
          }
        >
          {stages.map((stage, index) => {
            const active = index === safeActiveIndex;
            return (
              <div
                key={`${stage.media.src}-${index}`}
                className={`${styles.imageLayer} ${active ? styles.imageLayerActive : ""}`}
                data-hero-layer={index}
                aria-hidden={!active}
              >
                <Image
                  src={stage.media.src}
                  alt={active ? stage.media.alt : ""}
                  fill
                  priority={index === 0}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  quality={75}
                  sizes="(max-width: 1023px) 100vw, 60vw"
                  className={styles.image}
                  style={{ objectPosition: stage.media.objectPosition ?? "50% 50%" }}
                />
              </div>
            );
          })}
          <div className={styles.imageWash} aria-hidden="true" />
          <div className={styles.frameMark} aria-hidden="true" />
          <div
            key={`detail-${safeActiveIndex}`}
            className={styles.detailPortal}
            aria-hidden="true"
          >
            <Image
              src={activeStage.media.src}
              alt=""
              fill
              sizes="144px"
              quality={75}
              className={styles.detailImage}
              style={{ objectPosition: activeStage.media.objectPosition ?? "50% 50%" }}
            />
            <span dir="ltr">{String(safeActiveIndex + 1).padStart(2, "0")}</span>
          </div>
        </figure>

        <div
          className={styles.copyPlane}
          style={
            visualOnRight
              ? { left: 0, right: "55%" }
              : { left: "55%", right: 0 }
          }
        >
          <div className={styles.brandRail}>
            <Image
              src="/images/brand/hatab-mark.png"
              alt=""
              width={28}
              height={28}
              className={styles.monogram}
              aria-hidden="true"
            />
            <span>{content.eyebrow}</span>
            {!reducedMotion && stages.length > 1 ? (
              <button
                type="button"
                className={styles.motionToggle}
                aria-label={userPaused ? playLabel : pauseLabel}
                aria-pressed={userPaused}
                title={userPaused ? playLabel : pauseLabel}
                onClick={() => setUserPaused((current) => !current)}
              >
                {userPaused ? (
                  <Play className={styles.motionIcon} aria-hidden="true" />
                ) : (
                  <Pause className={styles.motionIcon} aria-hidden="true" />
                )}
              </button>
            ) : null}
          </div>

          <div ref={copyMotionRef} className={styles.copyMotion}>
            <p className={styles.stageIndex} dir="ltr">
              {String(safeActiveIndex + 1).padStart(2, "0")} / {String(stages.length).padStart(2, "0")}
            </p>
            <h1 id="home-hero-title" className={styles.title}>
              {content.title}
            </h1>
            <p className={styles.body}>{content.body}</p>
            <div className={styles.activeNote}>
              <span>{activeStage.label}</span>
              <p>{activeStage.note}</p>
            </div>
          </div>

          <p className={styles.caption}>{content.imageCaption}</p>
        </div>

        <div
          className={styles.stageNavigation}
          role="group"
          aria-label={locale === "ar" ? "مراحل غلاف حطب" : "HATAB hero chapters"}
        >
          {stages.map((stage, index) => {
            const active = index === safeActiveIndex;
            return (
              <button
                key={`${stage.label}-${index}`}
                type="button"
                className={styles.stageButton}
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                onClick={() => setActiveIndex(index)}
              >
                <span className={styles.progress} aria-hidden="true" />
                <span className={styles.buttonNumber} dir="ltr">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.buttonLabel}>{stage.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default EditorialHomeHero;
