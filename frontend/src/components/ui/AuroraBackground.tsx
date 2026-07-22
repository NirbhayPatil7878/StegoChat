import { motion } from "framer-motion";
import { useThemeStore } from "@/store/theme";

/**
 * Ambient animated background: floating gradient orbs + subtle grid.
 * Respects the "animations" setting and prefers-reduced-motion.
 */
export function AuroraBackground() {
  const animations = useThemeStore((s) => s.animations);
  const orbs = [
    { c: "rgb(var(--accent))", x: "10%", y: "15%", s: 420, d: 0 },
    { c: "rgb(var(--cyan))", x: "75%", y: "10%", s: 360, d: 1.5 },
    { c: "rgb(var(--accent-2))", x: "60%", y: "70%", s: 480, d: 3 },
  ];
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.5] bg-grid-fade" />
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-[110px]"
          style={{
            left: o.x,
            top: o.y,
            width: o.s,
            height: o.s,
            background: o.c,
            opacity: 0.16,
          }}
          animate={
            animations
              ? { y: [0, -40, 0], x: [0, 30, 0], scale: [1, 1.12, 1] }
              : undefined
          }
          transition={{
            duration: 14,
            delay: o.d,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
