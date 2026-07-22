import { motion } from "framer-motion";
import {
  ArrowRight,
  Eye,
  Fingerprint,
  KeyRound,
  Layers,
  Lock,
  ScanEye,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
import { MouseGlow } from "@/components/ui/MouseGlow";
import { Logo } from "@/components/ui/Logo";
import { Particles } from "@/components/ui/Particles";

const features = [
  { icon: Lock, title: "AES-256 + PBKDF2", desc: "Authenticated encryption with a random salt and IV before a single pixel is touched." },
  { icon: Layers, title: "LSB steganography", desc: "Ciphertext scattered across pixels in a password-seeded order — invisible to eyes and statistics." },
  { icon: Eye, title: "Decoy messages", desc: "A second message under a different password. Reveal the harmless one under duress." },
  { icon: Timer, title: "Share links", desc: "Send a stego image by token link — no account needed. Expire on a timer, cap the opens, or revoke any time." },
  { icon: ScanEye, title: "Forensics lab", desc: "Scan any image for entropy anomalies and hidden-data fingerprints before you trust it." },
  { icon: Fingerprint, title: "Zero plaintext at rest", desc: "History stores ciphertext only. Your passwords never leave your browser." },
];

const steps = [
  { icon: KeyRound, title: "Write & lock", desc: "Type your secret, set a password. AES-256, instantly." },
  { icon: Layers, title: "Hide in pixels", desc: "Pick a cover image — the ciphertext dissolves into it." },
  { icon: ShieldCheck, title: "Share safely", desc: "Send an ordinary-looking image. Only the password unlocks it." },
];

const stats = [
  { k: "AES-256-GCM", v: "Authenticated encryption" },
  { k: "200k", v: "PBKDF2 iterations" },
  { k: "0", v: "Plaintext stored" },
];

const fade = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5 },
};

export default function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#0a0a0b] text-white supports-[height:100dvh]:min-h-[100dvh]">
      <Particles />
      <MouseGlow />

      {/* Nav */}
      <nav className="z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/">
          <Logo size={28} withText bold />
        </Link>
        <div className="hidden items-center gap-9 md:flex">
          {[
            { to: "/about", label: "About" },
            { to: "/docs", label: "Docs" },
            { to: "/faq", label: "FAQ" },
            { to: "/contact", label: "Contact" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="font-display text-sm font-medium tracking-tight text-white/40 transition-colors hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-5">
          <Link
            to="/login"
            className="font-display text-sm font-medium text-white/50 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="border-b-2 border-cyan/70 px-1 pb-1 font-display text-sm font-bold tracking-tight transition-colors hover:border-white"
          >
            Sign up
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="z-10 mx-auto w-full max-w-5xl flex-1 px-6">
        <section className="flex flex-col items-center pb-[clamp(3rem,8vh,6rem)] pt-[clamp(2rem,6vh,5rem)] text-center">
          <motion.div {...fade} className="w-full">
            <Logo size={60} withText className="justify-center" />
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/40">
              The digital vault
            </p>
            <h1 className="mx-auto mt-10 max-w-2xl font-display text-[clamp(1.9rem,1.1rem+2.4vw,3.4rem)] font-bold leading-tight tracking-tight">
              Hide what matters <span className="gradient-text">inside plain sight</span>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-white/45">
              Encrypted messaging where any image can carry a secret. AES-256 encrypts your
              words; steganography makes them disappear into pixels.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register">
                <Button className="group rounded-2xl px-7 py-3.5 font-display font-bold">
                  Create your vault
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link to="/docs">
                <Button
                  variant="ghost"
                  className="rounded-2xl border border-white/10 bg-white/5 px-7 py-3.5 font-display hover:bg-white/10"
                >
                  How it works
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Stats strip */}
          <motion.div
            {...fade}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-20 grid w-full max-w-3xl grid-cols-1 divide-y divide-white/[0.06] rounded-[2rem] border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          >
            {stats.map((s) => (
              <div key={s.k} className="px-6 py-6">
                <p className="font-display text-xl font-semibold gradient-text">{s.k}</p>
                <p className="mt-1 text-xs text-white/40">{s.v}</p>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Three steps */}
        <section className="pb-24">
          <motion.div {...fade} className="grid gap-10 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="text-center md:text-left">
                <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] md:mx-0">
                  <s.icon className="h-[18px] w-[18px] text-cyan" />
                </div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">
                  Step {i + 1}
                </p>
                <h3 className="mt-1 font-display font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-white/40">{s.desc}</p>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Features */}
        <section className="pb-24">
          <motion.h2 {...fade} className="mb-10 text-center font-display text-2xl font-semibold">
            Built for the genuinely paranoid
          </motion.h2>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                {...fade}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="group flex items-start gap-4"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] transition-colors group-hover:bg-accent/15">
                  <f.icon className="h-[18px] w-[18px] text-accent" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/40">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="pb-28">
          <motion.div
            {...fade}
            className="mx-auto max-w-2xl rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-10 text-center backdrop-blur-xl"
          >
            <h2 className="font-display text-2xl font-semibold">
              Your secrets deserve better than a chat app.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/45">
              Spin up a vault in seconds. Free, open, and encrypted end to end.
            </p>
            <Link to="/register" className="mt-7 inline-block">
              <Button className="group rounded-2xl px-7 py-3.5 font-display font-bold">
                Start hiding messages
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </motion.div>
        </section>
      </main>

      {/* Slim footer */}
      <footer className="z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-7 md:flex-row">
          <p className="text-[10px] font-medium text-white/30">
            © {new Date().getFullYear()} StegoChat · Encrypted communication
          </p>
          <div className="flex gap-7">
            {[
              { to: "/about", label: "About" },
              { to: "/docs", label: "Docs" },
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
        </div>
      </footer>
    </div>
  );
}
