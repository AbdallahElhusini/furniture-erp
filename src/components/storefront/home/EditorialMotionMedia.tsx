"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface EditorialMotionMediaProps {
  videoSrc?: string;
  posterSrc: string;
  alt: string;
}

export function EditorialMotionMedia({
  videoSrc,
  posterSrc,
  alt,
}: EditorialMotionMediaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setMotionAllowed(!preference.matches);
    syncPreference();
    preference.addEventListener("change", syncPreference);
    return () => preference.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.isIntersecting;
        setVisible(isVisible);
        if (!isVisible) setVideoReady(false);
      },
      { rootMargin: "160px 0px", threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const canShowVideo = Boolean(
    videoSrc && motionAllowed && visible && !videoFailed,
  );

  return (
    <div
      ref={containerRef}
      className="relative isolate h-full min-h-[20rem] overflow-hidden bg-[#f6f6f4] sm:min-h-[30rem]"
    >
      <Image
        src={posterSrc}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 58vw"
        className={`object-cover transition-opacity duration-500 ${
          canShowVideo && videoReady ? "opacity-0" : "opacity-100"
        }`}
      />
      {canShowVideo && videoSrc ? (
        <video
          key={videoSrc}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            videoReady ? "opacity-100" : "opacity-0"
          }`}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          onCanPlay={() => setVideoReady(true)}
          onError={() => {
            setVideoFailed(true);
            setVideoReady(false);
          }}
        >
          <source
            src={videoSrc}
            type={videoSrc.endsWith(".webm") ? "video/webm" : "video/mp4"}
          />
        </video>
      ) : null}
    </div>
  );
}
