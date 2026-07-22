import { useEffect, useRef } from "react";
import { useThemeStore } from "@/store/theme";
import { cn } from "@/lib/utils";

interface Dot {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

interface Props {
  text?: string;
  fontSize?: number;
  height?: number;
  className?: string;
}

/**
 * The StegoChat wordmark rendered as an interactive particle field:
 * text is rasterized offscreen, sampled into dots that shimmer and
 * scatter away from the cursor, then spring back into place.
 */
export function ParticleLogo({
  text = "stegochat",
  fontSize = 52,
  height = 110,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animations = useThemeStore((s) => s.animations);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !animations) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let dots: Dot[] = [];
    const mouse = { x: -9999, y: -9999 };
    const dpr = Math.min(devicePixelRatio || 1, 2);

    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--cyan").trim() ||
      "34 211 238";

    const init = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Rasterize the wordmark, sample it, then clear.
      // Font scales down with the container so the mark never clips on
      // narrow screens.
      const fs = Math.min(fontSize, (w / text.length) * 1.55);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${fs}px "Space Grotesk", sans-serif`;
      ctx.fillText(text, w / 2, h / 2);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      ctx.clearRect(0, 0, w, h);

      dots = [];
      const step = Math.max(2, Math.floor(2 * dpr));
      const cy = accent();
      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          if (img[(y * canvas.width + x) * 4 + 3] > 128) {
            const r = Math.random();
            dots.push({
              x: x / dpr,
              y: y / dpr,
              baseX: x / dpr,
              baseY: y / dpr,
              vx: 0,
              vy: 0,
              size: Math.random() * 1.1 + 0.5,
              color:
                r > 0.82
                  ? `rgb(${cy} / 1)`
                  : r > 0.4
                    ? "rgba(255,255,255,1)"
                    : "rgba(255,255,255,0.65)",
            });
          }
        }
      }
    };

    const tick = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        // Occasional shimmer pop, easing back to base size.
        if (Math.random() > 0.985) d.size = Math.random() * 2.2 + 1;
        else d.size = d.size * 0.96 + 0.7 * 0.04;

        d.vx += (d.baseX - d.x) * 0.08;
        d.vy += (d.baseY - d.y) * 0.08;

        const mdx = d.x - mouse.x;
        const mdy = d.y - mouse.y;
        const mdist = Math.hypot(mdx, mdy);
        if (mdist < 70 && mdist > 0.01) {
          const force = ((70 - mdist) / 70) * 10;
          d.vx += (mdx / mdist) * force;
          d.vy += (mdy / mdist) * force;
        }

        d.vx *= 0.94;
        d.vy *= 0.94;
        d.x += d.vx;
        d.y += d.vy;

        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    const onResize = () => init();

    // Wait for the display font so the raster isn't sampled from a fallback.
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      init();
      tick();
    });

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", onLeave);
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, [animations, text, fontSize]);

  if (!animations) {
    return (
      <div className={cn("grid place-items-center", className)} style={{ height }}>
        <span className="font-display text-5xl font-bold tracking-tight">
          stego<span className="gradient-text">chat</span>
        </span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label={text}
      role="img"
      className={cn("block w-full", className)}
      style={{ height }}
    />
  );
}
