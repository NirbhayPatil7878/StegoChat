import { AnimatePresence, motion } from "framer-motion";
import {
  History as HistoryIcon,
  Keyboard,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ScanEye,
  Settings as SettingsIcon,
  WandSparkles,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { MouseGlow } from "@/components/ui/MouseGlow";
import { Particles } from "@/components/ui/Particles";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui";
import { SHORTCUTS, useHotkeys } from "@/hooks/useHotkeys";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useLogout } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/chat", label: "Chats", icon: MessagesSquare },
  { to: "/app/studio", label: "Studio", icon: WandSparkles },
  { to: "/app/tokens", label: "Share links", icon: Link2 },
  { to: "/app/history", label: "History", icon: HistoryIcon },
  { to: "/app/forensics", label: "Forensics", icon: ScanEye },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon },
];

// Chat manages its own inner scroll areas; every other page scrolls in <main>.
const FULL_BLEED = ["/app/chat"];

function NavItem({
  to,
  label,
  icon: Icon,
  collapsed,
  onNavigate,
}: (typeof nav)[number] & { collapsed: boolean; onNavigate: () => void }) {
  const link = (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          collapsed && "justify-center px-0",
          isActive ? "text-content" : "text-muted hover:bg-white/5 hover:text-content",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-xl bg-accent/15 ring-1 ring-accent/30"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && label}
        </>
      )}
    </NavLink>
  );
  return collapsed ? <Tooltip label={label}>{link}</Tooltip> : link;
}

function ShortcutsModal() {
  const { shortcutsOpen, setShortcutsOpen } = useUiStore();
  return (
    <Modal
      open={shortcutsOpen}
      onClose={() => setShortcutsOpen(false)}
      title="Keyboard shortcuts"
      className="max-w-md"
    >
      <ul className="space-y-1">
        {SHORTCUTS.map((s) => (
          <li
            key={s.keys}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm odd:bg-white/[0.03]"
          >
            <span className="text-muted">{s.action}</span>
            <kbd className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs">
              {s.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarCollapsed, toggleSidebar, setShortcutsOpen } = useUiStore();
  useHotkeys();

  // Tablets (md–lg) get a collapsed icon rail regardless of the stored
  // preference; desktops honor the user's choice; phones use a drawer.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const collapsed = !isDesktop || sidebarCollapsed;

  const fullBleed = FULL_BLEED.some((p) => location.pathname.startsWith(p));

  const sidebarContent = (collapsed: boolean) => (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-center py-5",
          collapsed ? "justify-center px-2" : "justify-between px-5",
        )}
      >
        {collapsed ? <Logo size={28} /> : <Logo size={30} withText />}
        <button
          onClick={toggleSidebar}
          className={cn(
            "hidden rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-content lg:block",
            collapsed && "absolute right-1 top-16",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className={cn("flex-1 space-y-1 overflow-y-auto px-3", collapsed && "px-2 pt-8")}>
        {nav.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={collapsed}
            onNavigate={() => setMobileOpen(false)}
          />
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border p-3">
        {collapsed ? (
          <Tooltip label="Keyboard shortcuts">
            <button
              onClick={() => setShortcutsOpen(true)}
              className="flex w-full justify-center rounded-xl p-2.5 text-muted hover:bg-white/5 hover:text-content"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={() => setShortcutsOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-content"
          >
            <Keyboard className="h-[18px] w-[18px]" />
            Shortcuts
            <kbd className="ml-auto rounded border border-border px-1.5 font-mono text-[10px]">
              ?
            </kbd>
          </button>
        )}

        <div
          className={cn(
            "flex items-center gap-3 rounded-xl py-2",
            collapsed ? "justify-center px-0" : "px-3",
          )}
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-cyan text-sm font-semibold text-white">
            {user?.username?.[0]?.toUpperCase() ?? "?"}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.username}</p>
                <p className="truncate text-xs text-muted">{user?.email}</p>
              </div>
              <Tooltip label="Sign out" side="top">
                <button
                  onClick={logout}
                  className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-danger"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden supports-[height:100dvh]:h-dvh">
      <AuroraBackground />
      <Particles />
      <MouseGlow />

      {/* Desktop / tablet sidebar (rail when collapsed) */}
      <aside
        className={cn(
          "relative hidden h-full shrink-0 border-r border-border bg-surface/40 backdrop-blur-xl transition-[width] duration-200 md:block",
          collapsed ? "w-[4.5rem]" : "w-[clamp(13rem,15vw,17rem)]",
        )}
      >
        {sidebarContent(collapsed)}
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 w-[min(16rem,85vw)] border-r border-border bg-surface/95 backdrop-blur-xl md:hidden"
            >
              {sidebarContent(false)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-bg/60 px-4 py-3 backdrop-blur-xl md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 hover:bg-white/5"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo size={26} withText />
        </header>

        <main
          className={cn(
            "min-h-0 flex-1",
            fullBleed ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={cn(
                "h-full",
                fullBleed
                  ? "p-[clamp(0.5rem,1vw,1rem)]"
                  : "mx-auto w-full max-w-[90rem] px-page py-page-y",
              )}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <ShortcutsModal />
    </div>
  );
}
