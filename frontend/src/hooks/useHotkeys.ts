import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "@/store/ui";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

export const SHORTCUTS = [
  { keys: "G then D", action: "Go to Dashboard" },
  { keys: "G then C", action: "Go to Chats" },
  { keys: "G then S", action: "Go to Studio" },
  { keys: "G then L", action: "Go to Share links" },
  { keys: "G then H", action: "Go to History" },
  { keys: "G then F", action: "Go to Forensics" },
  { keys: "G then ,", action: "Go to Settings" },
  { keys: "[", action: "Collapse / expand sidebar" },
  { keys: "?", action: "Show keyboard shortcuts" },
  { keys: "Esc", action: "Close dialogs" },
] as const;

const GOTO: Record<string, string> = {
  d: "/app/dashboard",
  c: "/app/chat",
  s: "/app/studio",
  l: "/app/tokens",
  h: "/app/history",
  f: "/app/forensics",
  ",": "/app/settings",
};

/** Global app hotkeys: `g`-prefixed navigation, `[` sidebar, `?` help. */
export function useHotkeys() {
  const navigate = useNavigate();
  const { toggleSidebar, setShortcutsOpen } = useUiStore();

  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;

      if (pendingG && Date.now() - pendingG < 1200) {
        const to = GOTO[e.key.toLowerCase()];
        pendingG = 0;
        if (to) {
          e.preventDefault();
          navigate(to);
          return;
        }
      }
      if (e.key.toLowerCase() === "g") {
        pendingG = Date.now();
        return;
      }
      if (e.key === "[") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, toggleSidebar, setShortcutsOpen]);
}
