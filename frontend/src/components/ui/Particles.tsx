import { useEffect, useRef } from "react";
import { useThemeStore } from "@/store/theme";

interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
}

/** Lightweight canvas particle field — drifting dots with subtle linking lines. */
export function Particles({ density = 26 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const animations = useThemeStore((s) => s.animations);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !animations) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let dots: Dot[] = [];
    const mouse = { x: -9999, y: -9999 };

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      const count = Math.round((canvas.offsetWidth * canvas.offsetHeight) / (90000 / density) / density) + density;
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.6,
        a: Math.random() * 0.35 + 0.1,
      }));
    };

    const accentOf = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      return v || "139 92 246";
    };

    const tick = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const accent = accentOf();
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x = (d.x + d.vx + w) % w;
        d.y = (d.y + d.vy + h) % h;
        // Gentle cursor repulsion.
        const mdx = d.x - mouse.x;
        const mdy = d.y - mouse.y;
        const mdist = Math.hypot(mdx, mdy);
        if (mdist < 130 && mdist > 0.01) {
          const force = ((130 - mdist) / 130) * 1.6;
          d.x += (mdx / mdist) * force;
          d.y += (mdy / mdist) * force;
        }
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${accent} / ${d.a})`;
        ctx.fill();
      }
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(dots[i].x, dots[i].y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.strokeStyle = `rgb(${accent} / ${0.08 * (1 - dist / 110)})`;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    resize();
    tick();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
    };
  }, [animations, density]);

  if (!animations) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
