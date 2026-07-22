import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { MouseGlow } from "@/components/ui/MouseGlow";
import { Particles } from "@/components/ui/Particles";
import { TiltCard } from "@/components/ui/TiltCard";

/**
 * Minimal near-black auth surface: interactive particle wordmark,
 * glass card with subtle tilt, slim nav and footer.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  cta = { to: "/register", label: "Sign up" },
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  cta?: { to: string; label: string } | null;
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#0a0a0b] text-white supports-[height:100dvh]:min-h-[100dvh]">
      <Particles />
      <MouseGlow />

      {/* Slim nav */}
      <nav className="z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/">
          <Logo size={28} withText bold />
        </Link>
        {cta && (
          <Link
            to={cta.to}
            className="border-b-2 border-cyan/70 px-1 pb-1 font-display text-sm font-bold tracking-tight transition-colors hover:border-white"
          >
            {cta.label}
          </Link>
        )}
      </nav>

      {/* Centered content */}
      <main className="z-10 flex flex-1 items-center justify-center px-4 pb-14 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex flex-col items-center gap-3">
            <Logo size={60} withText />
            <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/40">
              The digital vault
            </p>
          </div>

          <TiltCard className="w-full rounded-[2rem] border border-white/[0.08] bg-white/[0.04] p-[clamp(1.5rem,4vw,2.5rem)] shadow-2xl backdrop-blur-2xl">
            <h1 className="font-display text-xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-white/45">{subtitle}</p>}
            {children}
          </TiltCard>

          {footer && (
            <p className="mt-8 text-center text-xs font-medium text-white/40">{footer}</p>
          )}
        </motion.div>
      </main>

      {/* Slim footer */}
      <footer className="z-10 flex w-full flex-col items-center justify-center gap-4 px-8 py-7 md:flex-row md:gap-8">
        <p className="text-[10px] font-medium text-white/30">
          © {new Date().getFullYear()} StegoChat · Encrypted communication
        </p>
        <div className="flex gap-7">
          {[
            { to: "/privacy", label: "Privacy" },
            { to: "/terms", label: "Terms" },
            { to: "/faq", label: "Help" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-[10px] font-bold uppercase tracking-widest text-white/30 transition-colors hover:text-white/60"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
