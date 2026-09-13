"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { gsap } from "gsap";
import type { HomeHeroContent } from "@/lib/home-content-defaults";
import type { StorefrontLocale } from "@/lib/i18n/storefront";
import styles from "./CinematicHero.module.css";

/* ── Static hero stage definitions ── */
const HERO_STAGES = [
  {
    image: "/images/editorial/hero-desk-detail.jpg",
    altAr: "تفاصيل مكتب تنفيذي بخشب الجوز والجلد الفاخر",
    altEn: "Executive walnut desk with leather detail",
  },
  {
    image: "/images/editorial/hero-chair-detail.jpg",
    altAr: "تفاصيل كرسي مكتبي مريح بإطار ألمنيوم",
    altEn: "Ergonomic mesh chair with aluminum frame detail",
  },
  {
    cabinetClosed: "/images/editorial/hero-cabinet-closed.jpg",
    cabinetOpen: "/images/editorial/hero-cabinet-open.jpg",
    altAr: "خزانة مكتبية بتشطيب خشب بلوط",
    altEn: "Office cabinet with oak wood finish",
  },
  {
    image: "/images/editorial/hero-workspace-wide.jpg",
    altAr: "مساحة عمل تنفيذية متكاملة بأثاث حطب",
    altEn: "Complete executive workspace by HATAB",
  },
] as const;

const STAGE_LABELS = {
  ar: ["حرفتنا", "خاماتنا", "تخزيننا", "مساحاتنا"],
  en: ["Our Craft", "Our Materials", "Our Storage", "Our Workspaces"],
} as const;

const STAGE_INTERVAL_MS = 6_000;

export interface CinematicHeroProps {
  locale: StorefrontLocale;
  content: HomeHeroContent;
}

/**
 * Premium cinematic hero with 4-column grid, floating animations,
 * interactive cabinet hover, and GSAP-powered entrance sequence.
 */
export function CinematicHero({ locale, content }: CinematicHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const cabinetClosedRef = useRef<HTMLDivElement>(null);
  const cabinetOpenRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [entryDone, setEntryDone] = useState(false);
  const hasAnimated = useRef(false);

  const paused = interactionPaused;
  const ForwardArrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const labels = STAGE_LABELS[locale];

  /* ── Detect reduced motion ── */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /* ── Intersection observer ── */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => setInView(Boolean(e?.isIntersecting)),
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ── Page visibility ── */
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  /* ── Auto-advance stages ── */
  useEffect(() => {
    if (reducedMotion || paused || !inView || !pageVisible || !entryDone) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((c) => (c + 1) % 4);
    }, STAGE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, inView, pageVisible, paused, reducedMotion, entryDone]);

  /* ── GSAP entry sequence ── */
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section || hasAnimated.current) return;
    if (reducedMotion) {
      setTimeout(() => setEntryDone(true), 0);
      return;
    }
    hasAnimated.current = true;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => setEntryDone(true),
      });

      // 1. Grid lines fade in
      tl.to(`.${styles.gridLines}`, {
        opacity: 1,
        duration: 0.6,
      });

      // 2. Column headers stagger in
      tl.to(
        `.${styles.colHeader}`,
        { opacity: 1, duration: 0.45, stagger: 0.08 },
        "-=0.3",
      );

      // 3. Images clip-path reveal (bottom → top)
      const cabinetClosedSel = "." + styles.cabinetClosed.split(" ").join(".");
      const cabinetOpenSel = "." + styles.cabinetOpen.split(" ").join(".");
      const imageCellSel = "." + styles.imageCellInner.split(" ").join(".");

      tl.to(
        `${imageCellSel}, ${cabinetClosedSel}`,
        {
          clipPath: "inset(0% 0 0 0)",
          duration: 0.95,
          ease: "power3.inOut",
          stagger: 0.12,
        },
        "-=0.2",
      );

      // Also reveal cabinet open (behind closed)
      tl.to(
        cabinetOpenSel,
        {
          clipPath: "inset(0% 0 0 0)",
          duration: 0.8,
          ease: "power3.inOut",
        },
        "-=0.7",
      );

      // 4. Title, body, CTAs sweep up
      tl.fromTo(
        `.${styles.stageIndex}`,
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5 },
        "-=0.5",
      );
      tl.fromTo(
        `.${styles.title}`,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.65 },
        "-=0.35",
      );
      tl.fromTo(
        `.${styles.body}`,
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5 },
        "-=0.4",
      );
      tl.fromTo(
        `.${styles.ctaRow}`,
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45 },
        "-=0.3",
      );

      // 5. Navigation bar
      tl.to(
        `.${styles.stageNav}`,
        { opacity: 1, duration: 0.4 },
        "-=0.3",
      );
    }, section);

    return () => ctx.revert();
  }, [reducedMotion]);

  /* ── Cabinet hover animation ── */
  const handleCabinetEnter = useCallback(() => {
    if (reducedMotion) return;
    const closed = cabinetClosedRef.current;
    const open = cabinetOpenRef.current;
    if (!closed || !open) return;

    gsap.to(closed, {
      opacity: 0,
      rotateY: -15,
      transformOrigin: "left center",
      duration: 0.55,
      ease: "power2.inOut",
    });
    gsap.to(open, {
      opacity: 1,
      scale: 1,
      duration: 0.5,
      ease: "power2.out",
    });
  }, [reducedMotion]);

  const handleCabinetLeave = useCallback(() => {
    if (reducedMotion) return;
    const closed = cabinetClosedRef.current;
    const open = cabinetOpenRef.current;
    if (!closed || !open) return;

    gsap.to(closed, {
      opacity: 1,
      rotateY: 0,
      duration: 0.5,
      ease: "power2.inOut",
    });
    gsap.to(open, {
      opacity: 0.3,
      scale: 0.98,
      duration: 0.45,
      ease: "power2.in",
    });
  }, [reducedMotion]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="ch-hero-title"
      className={styles.hero}
      data-paused={paused ? "true" : "false"}
      onPointerEnter={() => setInteractionPaused(true)}
      onPointerLeave={() => setInteractionPaused(false)}
    >
      <div className={styles.stage}>
        {/* Grid lines */}
        <div className={styles.gridLines} aria-hidden="true" />

        {/* 4-column grid */}
        <div ref={columnsRef} className={styles.columns}>
          {/* ── Column 1: Brand + Desk detail ── */}
          <div className={styles.column}>
            <div className={styles.colHeaderBrand}>
              <Image
                src="/images/brand/hatab-mark.png"
                alt=""
                width={26}
                height={26}
                className={styles.brandMark}
                aria-hidden="true"
              />
              <span className={styles.brandLabel}>{content.eyebrow}</span>
            </div>
            <div className={styles.imageCell}>
              <div className={`${styles.imageCellInner} ${styles.floating}`}>
                <Image
                  src={HERO_STAGES[0].image}
                  alt={locale === "ar" ? HERO_STAGES[0].altAr : HERO_STAGES[0].altEn}
                  fill
                  preload
                  quality={80}
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
                  className={styles.heroImage}
                />
              </div>
            </div>
          </div>

          {/* ── Column 2: Chair detail ── */}
          <div className={styles.column}>
            <div className={styles.colHeader}>
              <span className={styles.brandLabel}>
                {locale === "ar" ? "حيث الشكل يلتقي الوظيفة" : "Where Form and Function Unite"}
              </span>
            </div>
            <div className={styles.imageCell}>
              <div className={`${styles.imageCellInner} ${styles.floating}`} style={{ animationDelay: "-1.5s" }}>
                <Image
                  src={HERO_STAGES[1].image}
                  alt={locale === "ar" ? HERO_STAGES[1].altAr : HERO_STAGES[1].altEn}
                  fill
                  loading="eager"
                  quality={80}
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
                  className={styles.heroImage}
                />
              </div>
            </div>
          </div>

          {/* ── Column 3: Interactive cabinet ── */}
          <div className={styles.column}>
            <div className={styles.colHeader}>
              <span className={styles.brandLabel}>
                {locale === "ar" ? "تخزين ذكي" : "Smart Storage"}
              </span>
            </div>
            <div
              className={styles.cabinetCell}
              onMouseEnter={handleCabinetEnter}
              onMouseLeave={handleCabinetLeave}
            >
              {/* Closed state (on top) */}
              <div ref={cabinetClosedRef} className={styles.cabinetClosed}>
                <Image
                  src={HERO_STAGES[2].cabinetClosed}
                  alt={locale === "ar" ? HERO_STAGES[2].altAr : HERO_STAGES[2].altEn}
                  fill
                  loading="eager"
                  quality={80}
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
                  className={styles.cabinetImage}
                />
              </div>
              {/* Open state (behind) */}
              <div ref={cabinetOpenRef} className={styles.cabinetOpen} style={{ opacity: 0.3 }}>
                <Image
                  src={HERO_STAGES[2].cabinetOpen}
                  alt=""
                  fill
                  loading="eager"
                  quality={80}
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
                  className={styles.cabinetImage}
                />
              </div>
              <span className={styles.cabinetLabel}>
                {locale === "ar" ? "مرّر للاستكشاف" : "HOVER TO EXPLORE"}
              </span>
            </div>
          </div>

          {/* ── Column 4: Title + Body + CTAs ── */}
          <div className={styles.column}>
            <div className={styles.colHeader}>
              <span className={styles.brandLabel}>
                {locale === "ar"
                  ? `${String(activeIndex + 1).padStart(2, "0")} / 04`
                  : `${String(activeIndex + 1).padStart(2, "0")} / 04`}
              </span>
            </div>
            <div className={styles.copyColumn}>
              <p className={styles.stageIndex} dir="ltr">
                {String(activeIndex + 1).padStart(2, "0")} / {String(HERO_STAGES.length).padStart(2, "0")}
              </p>
              <h1 id="ch-hero-title" className={styles.title}>
                {content.title}
              </h1>
              <p className={styles.body}>{content.body}</p>
              <div className={styles.ctaRow}>
                <Link href="/catalog" className={styles.ctaPrimary}>
                  {content.catalogCta}
                  <ForwardArrow className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/quote" className={styles.ctaSecondary}>
                  {content.projectCta}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stage navigation */}
        <nav
          className={styles.stageNav}
          role="group"
          aria-label={locale === "ar" ? "أقسام الغلاف" : "Hero chapters"}
        >
          {labels.map((label, i) => {
            const active = i === activeIndex;
            return (
              <button
                key={label}
                type="button"
                className={styles.navButton}
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                onClick={() => setActiveIndex(i)}
              >
                <span className={styles.navProgress} aria-hidden="true" />
                <span className={styles.navNumber} dir="ltr">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={styles.navLabel}>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </section>
  );
}

export default CinematicHero;
