import { useEffect, useRef } from "react";
import { useThemeStore } from "@/store/theme";

/** Soft accent glow that follows the cursor. Pure transform updates, no re-renders. */
export function MouseGlow() {
  const animations = useThemeStore((s) => s.animations);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animations) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.style.transform = `translate(${e.clientX - 300}px, ${e.clientY - 300}px)`;
        }
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [animations]);

  if (!animations) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-0 h-[600px] w-[600px] rounded-full opacity-[0.07] blur-3xl transition-transform duration-100 ease-out"
      style={{
        background:
          "radial-gradient(circle, rgb(var(--accent)) 0%, transparent 65%)",
      }}
    />
  );
}
