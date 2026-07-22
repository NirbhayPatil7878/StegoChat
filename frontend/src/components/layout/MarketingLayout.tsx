import { motion } from "framer-motion";
import { Github } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

const navLinks = [
  { to: "/about", label: "About" },
  { to: "/docs", label: "Docs" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
];

export const footerLinks = [
  {
    title: "Product",
    links: [
      { to: "/docs", label: "Documentation" },
      { to: "/faq", label: "FAQ" },
      { to: "/login", label: "Sign in" },
      { to: "/register", label: "Create a vault" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/privacy", label: "Privacy policy" },
      { to: "/terms", label: "Terms of service" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo size={26} withText />
          <p className="mt-3 max-w-xs text-sm text-muted">
            Encrypted steganographic messaging — hide what matters inside plain sight.
          </p>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm text-muted hover:text-content"
          >
            <Github className="h-4 w-4" /> Source
          </a>
        </div>
        {footerLinks.map((group) => (
          <div key={group.title}>
            <p className="mb-3 text-sm font-semibold">{group.title}</p>
            <ul className="space-y-2">
              {group.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-muted hover:text-content">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted">
        © {new Date().getFullYear()} StegoChat · Built for privacy
      </div>
    </footer>
  );
}

export function MarketingLayout() {
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      <AuroraBackground />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/">
          <Logo size={30} withText />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "text-content" : "text-muted hover:text-content",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {isAuthed ? (
            <Link to="/app/chat">
              <Button>Open app</Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link to="/register">
                <Button>Get started</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Outlet />
        </motion.div>
      </main>

      <MarketingFooter />
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-10 text-center">
      <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mx-auto mt-3 max-w-xl text-muted">{subtitle}</p>}
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-content [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-content [&_strong]:text-content [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-accent">
      {children}
    </div>
  );
}
