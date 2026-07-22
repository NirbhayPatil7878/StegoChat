import { useEffect, useRef } from "react";
import { useThemeStore } from "@/store/theme";
import { cn } from "@/lib/utils";

/** Subtle 3D tilt that follows the cursor across the whole window. */
export function TiltCard({
  children,
  className,
  strength = 200,
}: {
  children: React.ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const animations = useThemeStore((s) => s.animations);

  useEffect(() => {
    const el = ref.current;
    if (!el || !animations) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const rx = Math.max(-4, Math.min(4, (e.clientY - (r.top + r.height / 2)) / strength));
        const ry = Math.max(-4, Math.min(4, ((r.left + r.width / 2) - e.clientX) / strength));
        el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
    };
    const onLeave = () => {
      el.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [animations, strength]);

  return (
    <div ref={ref} className={cn("transition-transform duration-300 ease-out", className)}>
      {children}
    </div>
  );
}
