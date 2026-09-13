"use client";

import { useEffect, useRef } from "react";

type FieldPoint = {
  x: number;
  y: number;
  phase: number;
  drift: number;
  accent: boolean;
};

const TAU = Math.PI * 2;

/**
 * A quiet architectural line field for the home stage. It is deliberately
 * canvas-only decoration: content, navigation, and product interactions never
 * depend on it. Motion is suspended outside the viewport and reduced to one
 * static frame for reduced-motion or coarse-pointer visitors.
 */
export function HeroLineField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !host || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    let motionEnabled = !reducedMotion.matches && !coarsePointer.matches;
    let inView = true;
    let pageVisible = document.visibilityState === "visible";
    let frameId: number | null = null;
    let width = 1;
    let height = 1;
    let points: FieldPoint[] = [];
    let scrollOffset = window.scrollY * 0.035;
    const pointer = { x: -1000, y: -1000, active: false };

    const buildField = () => {
      const bounds = host.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const spacing = Math.max(76, Math.min(112, width / 13));
      const columns = Math.ceil(width / spacing) + 2;
      const rows = Math.ceil(height / spacing) + 2;
      points = [];

      for (let row = -1; row < rows; row += 1) {
        for (let column = -1; column < columns; column += 1) {
          const index = (row + 1) * columns + column + 1;
          points.push({
            x: column * spacing + (row % 2 === 0 ? spacing * 0.22 : 0),
            y: row * spacing,
            phase: (index * 2.399) % TAU,
            drift: 3.5 + (index % 5) * 0.85,
            accent: index % 11 === 0,
          });
        }
      }
    };

    const resolvePoint = (point: FieldPoint, time: number) => {
      const wave = motionEnabled ? time * 0.00018 : 0;
      let x = point.x + Math.sin(wave + point.phase) * point.drift;
      let y = point.y + Math.cos(wave * 0.82 + point.phase) * point.drift;
      y += Math.sin((point.x + scrollOffset) * 0.006) * 4;

      if (motionEnabled && pointer.active) {
        const deltaX = x - pointer.x;
        const deltaY = y - pointer.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance > 0 && distance < 170) {
          const influence = (1 - distance / 170) * 12;
          x += (deltaX / distance) * influence;
          y += (deltaY / distance) * influence;
        }
      }

      return { x, y };
    };

    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height);
      const resolved = points.map((point) => resolvePoint(point, time));

      context.lineWidth = 0.65;
      for (let index = 0; index < resolved.length; index += 1) {
        const origin = resolved[index];
        for (let neighbor = index + 1; neighbor < resolved.length; neighbor += 1) {
          const target = resolved[neighbor];
          const distance = Math.hypot(origin.x - target.x, origin.y - target.y);
          if (distance > 126) continue;
          const opacity = (1 - distance / 126) * 0.11;
          context.strokeStyle = `rgba(20, 36, 28, ${opacity.toFixed(3)})`;
          context.beginPath();
          context.moveTo(origin.x, origin.y);
          context.lineTo(target.x, target.y);
          context.stroke();
        }
      }

      resolved.forEach((point, index) => {
        const fieldPoint = points[index];
        context.beginPath();
        context.arc(point.x, point.y, fieldPoint.accent ? 2.1 : 1.25, 0, TAU);
        context.fillStyle = fieldPoint.accent
          ? "rgba(134, 54, 61, 0.48)"
          : "rgba(20, 36, 28, 0.26)";
        context.fill();
      });
    };

    const tick = (time: number) => {
      frameId = null;
      if (!motionEnabled || !inView || !pageVisible) return;
      draw(time);
      frameId = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (frameId !== null || !motionEnabled || !inView || !pageVisible) return;
      frameId = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frameId === null) return;
      window.cancelAnimationFrame(frameId);
      frameId = null;
    };

    const syncMotion = () => {
      motionEnabled = !reducedMotion.matches && !coarsePointer.matches;
      pointer.active = false;
      stop();
      draw();
      start();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!motionEnabled) return;
      const bounds = host.getBoundingClientRect();
      pointer.active = true;
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const handleScroll = () => {
      scrollOffset = window.scrollY * 0.035;
    };

    const handleVisibility = () => {
      pageVisible = document.visibilityState === "visible";
      if (pageVisible) start();
      else stop();
    };

    const resizeObserver = new ResizeObserver(() => {
      buildField();
      draw();
    });
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) start();
        else stop();
      },
      { rootMargin: "80px" },
    );

    buildField();
    draw();
    start();
    resizeObserver.observe(host);
    intersectionObserver.observe(host);
    host.addEventListener("pointermove", handlePointerMove, { passive: true });
    host.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotion.addEventListener("change", syncMotion);
    coarsePointer.addEventListener("change", syncMotion);

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", syncMotion);
      coarsePointer.removeEventListener("change", syncMotion);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-75 [mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_100%)]"
    />
  );
}
