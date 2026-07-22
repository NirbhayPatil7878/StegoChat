import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCheck,
  ImagePlus,
  Info,
  Lock,
  MessagesSquare,
  MoreVertical,
  Pencil,
  Pin,
  Search,
  Send,
  Shuffle,
  Star,
  Timer,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  VenetianMask,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiError } from "@/api/client";
import { chatApi, stegoApi } from "@/api/services";
import { Dropzone } from "@/components/ui/Dropzone";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Button, EmptyState, Spinner } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { randomDecoyMessage, randomDecoyPassword } from "@/lib/decoy";
import { EXPIRE_OPTIONS, cn, timeAgo, timeUntil } from "@/lib/utils";
import type { Conversation, DirectMessage, SampleImage, UserBrief } from "@/types";

function convName(conv: Conversation): string {
  return conv.is_group ? conv.name : (conv.other_user?.username ?? "Unknown");
}

function Avatar({ conv, user, size = "md" }: { conv?: Conversation; user?: UserBrief; size?: "md" | "sm" }) {
  const cls = cn(
    "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-cyan font-semibold text-white",
    size === "md" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs",
  );
  if (conv?.is_group) {
    return (
      <div className={cls}>
        <Users className={size === "md" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />
      </div>
    );
  }
  const name = user?.username ?? conv?.other_user?.username ?? "?";
  return <div className={cls}>{name[0]?.toUpperCase() ?? "?"}</div>;
}

function preview(msg: DirectMessage | null): string {
  if (!msg) return "No messages yet";
  if (msg.kind === "stego") return "🖼️ Hidden message";
  return msg.body ?? "";
}

// --- New chat modal: direct message or group -------------------------------
function NewChatModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
}) {
  const [tab, setTab] = useState<"dm" | "group">("dm");
  const [q, setQ] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<UserBrief[]>([]);

  const { data: users, isLoading } = useQuery({
    queryKey: ["user-search", q],
    queryFn: () => chatApi.searchUsers(q),
    enabled: open,
  });

  const startDm = useMutation({
    mutationFn: (u: UserBrief) => chatApi.createConversation(u.id),
    onSuccess: onCreated,
    onError: (e) => toast.error(apiError(e, "Could not start conversation")),
  });

  const createGroup = useMutation({
    mutationFn: () =>
      chatApi.createGroup(groupName.trim(), selected.map((u) => u.id)),
    onSuccess: (conv) => {
      toast.success("Group created");
      onCreated(conv);
    },
    onError: (e) => toast.error(apiError(e, "Could not create group")),
  });

  const reset = () => {
    setQ("");
    setGroupName("");
    setSelected([]);
    setTab("dm");
  };

  const toggleMember = (u: UserBrief) =>
    setSelected((prev) =>
      prev.some((s) => s.id === u.id)
        ? prev.filter((s) => s.id !== u.id)
        : [...prev, u],
    );

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Start a conversation"
    >
      <div className="mb-4 flex gap-1 rounded-xl bg-surface-2/60 p-1">
        {(
          [
            { key: "dm", label: "Direct message", icon: UserPlus },
            { key: "group", label: "Group chat", icon: Users },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "bg-accent/20 text-content" : "text-muted hover:text-content",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "group" && (
        <div className="mb-3">
          <input
            className="input"
            placeholder="Group name…"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          {selected.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggleMember(u)}
                  className="chip bg-accent/15 text-accent hover:bg-accent/25"
                >
                  {u.username}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          className="input py-2 pl-10"
          placeholder="Search people…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mt-2 max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : users?.length ? (
          users.map((u) => {
            const isSelected = selected.some((s) => s.id === u.id);
            return (
              <button
                key={u.id}
                onClick={() => (tab === "dm" ? startDm.mutate(u) : toggleMember(u))}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5",
                  isSelected && "bg-accent/10",
                )}
              >
                <Avatar user={u} size="sm" />
                <span className="flex-1 truncate text-sm font-medium">{u.username}</span>
                {tab === "group" && isSelected && <Check className="h-4 w-4 text-accent" />}
              </button>
            );
          })
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted">No users found</p>
        )}
      </div>

      {tab === "group" && (
        <Button
          className="mt-3 w-full"
          disabled={!groupName.trim() || selected.length === 0}
          loading={createGroup.isPending}
          onClick={() => createGroup.mutate()}
        >
          <Users className="h-4 w-4" />
          Create group ({selected.length} member{selected.length === 1 ? "" : "s"})
        </Button>
      )}
    </Modal>
  );
}

// --- Conversation actions menu ----------------------------------------------
function ConvMenu({ conv, onRename }: { conv: Conversation; onRename: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["conversations"] });

  const patch = useMutation({
    mutationFn: (body: { is_pinned?: boolean; is_favorite?: boolean }) =>
      chatApi.updateConversation(conv.id, body),
    onSuccess: invalidate,
    onError: (e) => toast.error(apiError(e, "Update failed")),
  });

  const del = useMutation({
    mutationFn: () => chatApi.deleteConversation(conv.id),
    onSuccess: () => {
      invalidate();
      toast.success(conv.is_group ? "Left conversation" : "Conversation deleted");
    },
    onError: (e) => toast.error(apiError(e, "Delete failed")),
  });

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-content"
        aria-label="Conversation options"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="glass-strong absolute right-0 top-full z-30 mt-1 w-48 rounded-xl p-1.5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={item}
              onClick={() => {
                patch.mutate({ is_pinned: !conv.is_pinned });
                setOpen(false);
              }}
            >
              <Pin className="h-4 w-4" />
              {conv.is_pinned ? "Unpin" : "Pin"}
            </button>
            <button
              className={item}
              onClick={() => {
                patch.mutate({ is_favorite: !conv.is_favorite });
                setOpen(false);
              }}
            >
              <Star className="h-4 w-4" />
              {conv.is_favorite ? "Unfavorite" : "Favorite"}
            </button>
            {conv.is_group && (
              <button
                className={item}
                onClick={() => {
                  onRename();
                  setOpen(false);
                }}
              >
                <Pencil className="h-4 w-4" />
                Rename
              </button>
            )}
            <button
              className={cn(item, "text-danger hover:bg-danger/10")}
              onClick={() => {
                setConfirmDelete(true);
                setOpen(false);
              }}
            >
              <Trash2 className="h-4 w-4" />
              {conv.is_group ? "Leave / delete" : "Delete"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          del.mutate();
          setConfirmDelete(false);
        }}
        title={conv.is_group ? "Leave or delete group?" : "Delete conversation?"}
        description={
          conv.is_group
            ? "If you created this group it is deleted for everyone; otherwise you just leave it."
            : "This removes the conversation and its messages for you. This cannot be undone."
        }
        confirmLabel={conv.is_group ? "Leave / delete" : "Delete"}
        danger
        loading={del.isPending}
      />
    </div>
  );
}

// --- Stego composer modal ----------------------------------------------------
function StegoComposer({
  convId,
  onSent,
  onClose,
}: {
  convId: number;
  onSent: () => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sample, setSample] = useState<string | null>(null);
  const [decoyOn, setDecoyOn] = useState(false);
  const [decoyMessage, setDecoyMessage] = useState("");
  const [decoyPassword, setDecoyPassword] = useState("");
  const [expireMinutes, setExpireMinutes] = useState(0);

  const { data: samples } = useQuery({ queryKey: ["samples"], queryFn: stegoApi.samples });

  const pickRandom = (list: SampleImage[]) => {
    const s = list[Math.floor(Math.random() * list.length)];
    setSample(s.name);
    setFile(null);
  };

  // One-click plausible decoy: harmless message, a distinct password, and a
  // random cover image if none is chosen yet.
  const autoGenerateDecoy = () => {
    setDecoyOn(true);
    setDecoyMessage(randomDecoyMessage());
    let pw = randomDecoyPassword();
    while (pw === password) pw = randomDecoyPassword();
    setDecoyPassword(pw);
    if (!file && !sample && samples?.length) pickRandom(samples);
  };

  const decoyReady = !decoyOn || (decoyMessage.trim() && decoyPassword);
  const decoyDistinct = !decoyOn || decoyPassword !== password;

  const send = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("message", message);
      form.append("password", password);
      if (file) form.append("image", file);
      else if (sample) form.append("sample", sample);
      if (decoyOn && decoyMessage.trim() && decoyPassword) {
        form.append("decoy_message", decoyMessage);
        form.append("decoy_password", decoyPassword);
      }
      if (expireMinutes > 0) form.append("expire_minutes", String(expireMinutes));
      return chatApi.sendStego(convId, form);
    },
    onSuccess: () => {
      toast.success("Hidden message sent");
      onSent();
    },
    onError: (e) => toast.error(apiError(e, "Failed to send")),
  });

  const canSend =
    message.trim() && password && (file || sample) && decoyReady && decoyDistinct;

  return (
    <Modal open onClose={onClose} title="Send a hidden message" className="max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="label">Secret message</label>
            <textarea
              className="input min-h-[96px] resize-y"
              placeholder="The text to hide inside the image…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <PasswordInput
              placeholder="Recipient needs this to reveal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Self-destruct timer */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" /> Disappears after
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRE_OPTIONS.map((o) => (
                <button
                  key={o.minutes}
                  type="button"
                  onClick={() => setExpireMinutes(o.minutes)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    expireMinutes === o.minutes
                      ? "bg-accent/20 text-content ring-1 ring-accent/40"
                      : "bg-surface-2/60 text-muted hover:text-content",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Decoy channel */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDecoyOn((v) => !v)}
                className="label flex items-center gap-1.5 hover:text-content"
              >
                <VenetianMask className="h-3.5 w-3.5" />
                {decoyOn ? "Hide decoy message" : "Add decoy message"}
              </button>
              <button
                type="button"
                onClick={autoGenerateDecoy}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-accent hover:underline"
              >
                <Wand2 className="h-3 w-3" /> Auto-generate
              </button>
            </div>
            <AnimatePresence initial={false}>
              {decoyOn && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-2 overflow-hidden pt-1"
                >
                  <p className="text-xs text-muted">
                    A second message under a different password — reveal this one
                    under duress instead of the real one.
                  </p>
                  <textarea
                    className="input min-h-[60px] resize-y"
                    placeholder="Harmless decoy text…"
                    value={decoyMessage}
                    onChange={(e) => setDecoyMessage(e.target.value)}
                  />
                  <PasswordInput
                    placeholder="Decoy password (must differ)"
                    value={decoyPassword}
                    onChange={(e) => setDecoyPassword(e.target.value)}
                  />
                  {decoyOn && decoyPassword && decoyPassword === password && (
                    <p className="text-xs text-danger">
                      Decoy password must differ from the real password.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0">Cover image</label>
            {samples?.length ? (
              <button
                onClick={() => pickRandom(samples)}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Shuffle className="h-3 w-3" /> Random
              </button>
            ) : null}
          </div>
          {sample && !file ? (
            <div className="relative overflow-hidden rounded-2xl border border-border">
              <img
                src={samples?.find((s) => s.name === sample)?.url}
                alt="Selected sample"
                className="max-h-40 w-full object-cover"
              />
              <button
                onClick={() => setSample(null)}
                className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
                aria-label="Remove sample"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Dropzone
              file={file}
              onFile={(f) => {
                setFile(f);
                if (f) setSample(null);
              }}
            />
          )}
          {!file && samples?.length ? (
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              {samples.slice(0, 12).map((s) => (
                <button
                  key={s.name}
                  onClick={() => setSample(sample === s.name ? null : s.name)}
                  className={cn(
                    "overflow-hidden rounded-lg border-2 transition-colors",
                    sample === s.name
                      ? "border-accent"
                      : "border-transparent hover:border-border",
                  )}
                >
                  <img src={s.url} alt={s.name} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <Button
        className="mt-5 w-full"
        disabled={!canSend}
        loading={send.isPending}
        onClick={() => send.mutate()}
      >
        <Lock className="h-4 w-4" /> Embed &amp; send
        {(decoyOn || expireMinutes > 0) && (
          <span className="ml-1 flex items-center gap-1.5 text-xs opacity-80">
            {decoyOn && <VenetianMask className="h-3.5 w-3.5" />}
            {expireMinutes > 0 && (
              <>
                <Timer className="h-3.5 w-3.5" />
                {EXPIRE_OPTIONS.find((o) => o.minutes === expireMinutes)?.label}
              </>
            )}
          </span>
        )}
      </Button>
    </Modal>
  );
}

// --- Stego bubble with reveal flow -------------------------------------------
function StegoBubble({ msg, mine }: { msg: DirectMessage; mine: boolean }) {
  const [revealing, setRevealing] = useState(false);
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const reveal = useMutation({
    mutationFn: () => chatApi.reveal(msg.id, password),
    onSuccess: (r) => {
      setRevealed(r.message);
      setRevealing(false);
    },
    onError: () => toast.error("Wrong password or no hidden message"),
  });

  return (
    <div className="space-y-2">
      {msg.stego_url && (
        <a href={msg.stego_url} target="_blank" rel="noreferrer">
          <img
            src={msg.stego_url}
            alt="Image with hidden message"
            className="max-h-[min(16rem,35vh)] w-full rounded-xl object-contain"
          />
        </a>
      )}
      {revealed ? (
        <div className="flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm">
          <Unlock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          <p className="whitespace-pre-wrap break-words">{revealed}</p>
        </div>
      ) : revealing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) reveal.mutate();
          }}
        >
          <input
            autoFocus
            type="password"
            className="input flex-1 py-1.5 text-xs"
            placeholder="Password…"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="submit"
            variant="ghost"
            className="px-3 py-1.5 text-xs"
            loading={reveal.isPending}
            disabled={!password}
          >
            <Unlock className="h-3.5 w-3.5" />
          </Button>
        </form>
      ) : (
        <button
          onClick={() => setRevealing(true)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
            mine
              ? "bg-white/10 hover:bg-white/20"
              : "bg-accent/15 text-accent hover:bg-accent/25",
          )}
        >
          <Lock className="h-3 w-3" /> Reveal hidden message
        </button>
      )}
    </div>
  );
}

// --- Details / preview panel (wide monitors) ----------------------------------
function DetailsPanel({ conv, onClose }: { conv: Conversation; onClose: () => void }) {
  // Reuses the thread's message cache to surface shared stego images.
  const { data: messages } = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: () => chatApi.messages(conv.id),
  });
  const stego = (messages ?? []).filter((m) => m.kind === "stego" && m.stego_url);

  return (
    <aside className="hidden w-[clamp(14rem,17vw,19rem)] shrink-0 flex-col border-l border-border xl:flex">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-display text-sm font-semibold">Details</h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted hover:bg-white/5"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col items-center pb-4 text-center">
          <Avatar conv={conv} />
          <p className="mt-2 truncate text-sm font-semibold">{convName(conv)}</p>
          <p className="text-xs text-muted">
            {conv.is_group ? `Group · ${conv.member_count} members` : "Direct message"}
          </p>
          <div className="mt-2 flex gap-1.5">
            {conv.is_pinned && (
              <span className="chip bg-accent/15 text-accent">
                <Pin className="h-3 w-3" /> Pinned
              </span>
            )}
            {conv.is_favorite && (
              <span className="chip bg-warning/15 text-warning">
                <Star className="h-3 w-3" /> Favorite
              </span>
            )}
          </div>
        </div>

        {conv.is_group && (
          <div className="border-t border-border py-4">
            <p className="label">Members</p>
            <ul className="space-y-2">
              {conv.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <Avatar user={m} size="sm" />
                  <span className="truncate text-sm">{m.username}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-border py-4">
          <p className="label">Shared stego images</p>
          {stego.length ? (
            <div className="grid grid-cols-3 gap-1.5">
              {stego.slice(-12).map((m) => (
                <a key={m.id} href={m.stego_url!} target="_blank" rel="noreferrer">
                  <img
                    src={m.stego_url!}
                    alt="Shared stego"
                    className="aspect-square w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">Nothing hidden here yet.</p>
          )}
        </div>
      </div>
    </aside>
  );
}

// --- Self-destruct timer picker for the text composer -------------------------
function ExpirePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (m: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = EXPIRE_OPTIONS.find((o) => o.minutes === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded-xl p-2.5 transition-colors hover:bg-accent/10",
          value > 0 ? "text-accent" : "text-muted hover:text-accent",
        )}
        title={value > 0 ? `Disappears after ${active?.label}` : "Set disappearing timer"}
        aria-label="Set disappearing timer"
      >
        <Timer className="h-5 w-5" />
        {value > 0 && (
          <span className="text-[10px] font-semibold leading-none">{active?.label}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.12 }}
            className="glass-strong absolute bottom-full left-0 z-30 mb-2 w-40 rounded-xl p-1.5 shadow-card"
          >
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Disappears after
            </p>
            {EXPIRE_OPTIONS.map((o) => (
              <button
                key={o.minutes}
                onClick={() => {
                  onChange(o.minutes);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-white/5",
                  value === o.minutes && "text-accent",
                )}
              >
                {o.label}
                {value === o.minutes && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Message thread -----------------------------------------------------------
function Thread({
  conv,
  onBack,
  onToggleDetails,
}: {
  conv: Conversation;
  onBack: () => void;
  onToggleDetails?: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [textExpire, setTextExpire] = useState(0);
  const [stegoOpen, setStegoOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(conv.name);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMarkedRef = useRef(0);

  const { data: allMessages, isLoading } = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: () => chatApi.messages(conv.id),
    refetchInterval: 4000,
  });

  // Re-render every second so countdowns update and locally-expired messages
  // vanish immediately (the server also purges them on the next refetch).
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const messages = useMemo(
    () =>
      allMessages?.filter(
        (m) => !m.expires_at || new Date(m.expires_at).getTime() > Date.now(),
      ),
    [allMessages],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["messages", conv.id] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
  };

  const sendText = useMutation({
    mutationFn: (body: string) => chatApi.sendText(conv.id, body, textExpire || null),
    onSuccess: () => {
      setText("");
      invalidate();
    },
    onError: (e) => toast.error(apiError(e, "Failed to send message")),
  });

  const rename = useMutation({
    mutationFn: () => chatApi.updateConversation(conv.id, { name: newName.trim() }),
    onSuccess: () => {
      setRenaming(false);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Group renamed");
    },
    onError: (e) => toast.error(apiError(e, "Rename failed")),
  });

  // Read receipts: tell the server how far we've seen.
  useEffect(() => {
    const last = messages?.[messages.length - 1];
    if (last && last.id > lastMarkedRef.current) {
      lastMarkedRef.current = last.id;
      chatApi
        .markRead(conv.id, last.id)
        .then(() => qc.invalidateQueries({ queryKey: ["conversations"] }))
        .catch(() => {});
    }
  }, [messages, conv.id, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const submit = () => {
    const body = text.trim();
    if (body && !sendText.isPending) sendText.mutate(body);
  };

  const subtitle = conv.is_group
    ? `${conv.member_count} members · ${conv.members.map((m) => m.username).join(", ")}`
    : "End-to-end hidden messages available";

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-muted hover:bg-white/5 sm:hidden"
          aria-label="Back to chats"
        >
          <X className="h-4 w-4" />
        </button>
        <Avatar conv={conv} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {convName(conv)}
            {conv.is_pinned && <Pin className="h-3 w-3 text-accent" />}
            {conv.is_favorite && <Star className="h-3 w-3 fill-warning text-warning" />}
          </p>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        {onToggleDetails && (
          <button
            onClick={onToggleDetails}
            className="hidden rounded-lg p-2 text-muted hover:bg-white/5 hover:text-content xl:block"
            title="Conversation details"
            aria-label="Toggle details panel"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
        <ConvMenu conv={conv} onRename={() => setRenaming(true)} />
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        ) : messages?.length ? (
          messages.map((m) => {
            const mine = m.sender_id === me?.id;
            const read = !conv.is_group && m.id <= conv.other_last_read_id;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm",
                    mine ? "rounded-br-md bg-accent/90 text-white" : "rounded-bl-md bg-surface-2/90",
                  )}
                >
                  {conv.is_group && !mine && (
                    <p className="mb-0.5 text-[11px] font-semibold text-accent">
                      {m.sender_username}
                    </p>
                  )}
                  {m.kind === "stego" ? (
                    <StegoBubble msg={m} mine={mine} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  )}
                  <p
                    className={cn(
                      "mt-1 flex items-center justify-end gap-1 text-[10px]",
                      mine ? "text-white/60" : "text-muted",
                    )}
                  >
                    {m.expires_at && (
                      <span
                        className={cn(
                          "mr-auto flex items-center gap-0.5 font-medium",
                          mine ? "text-white/80" : "text-warning",
                        )}
                        title={`Disappears in ${timeUntil(m.expires_at)}`}
                      >
                        <Timer className="h-2.5 w-2.5" />
                        {timeUntil(m.expires_at)}
                      </span>
                    )}
                    {timeAgo(m.created_at)}
                    {mine &&
                      !conv.is_group &&
                      (read ? (
                        <CheckCheck className="h-3 w-3 text-cyan" aria-label="Read" />
                      ) : (
                        <Check className="h-3 w-3" aria-label="Sent" />
                      ))}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="grid h-full place-items-center">
            <EmptyState
              icon={Lock}
              title="No messages yet"
              description={`Say hi to ${convName(conv)} — or send a secret hidden inside an image.`}
            />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2">
          <button
            onClick={() => setStegoOpen(true)}
            className="rounded-xl p-2.5 text-muted transition-colors hover:bg-accent/10 hover:text-accent"
            title="Send hidden message in image"
            aria-label="Send hidden message in image"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <ExpirePicker value={textExpire} onChange={setTextExpire} />
          <textarea
            rows={1}
            className="input max-h-32 min-h-[44px] flex-1 resize-none py-2.5"
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button
            className="px-3.5 py-2.5"
            disabled={!text.trim()}
            loading={sendText.isPending}
            onClick={submit}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {stegoOpen && (
          <StegoComposer
            convId={conv.id}
            onClose={() => setStegoOpen(false)}
            onSent={() => {
              setStegoOpen(false);
              invalidate();
            }}
          />
        )}
      </AnimatePresence>

      <Modal open={renaming} onClose={() => setRenaming(false)} title="Rename group" className="max-w-sm">
        <input
          autoFocus
          className="input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newName.trim() && rename.mutate()}
        />
        <Button
          className="mt-4 w-full"
          disabled={!newName.trim()}
          loading={rename.isPending}
          onClick={() => rename.mutate()}
        >
          Save
        </Button>
      </Modal>
    </div>
  );
}

// --- Page ----------------------------------------------------------------------
export default function Chat() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [q, setQ] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const qc = useQueryClient();

  // Wide monitors (≥1920) open the preview panel by default; it stays
  // toggleable down to xl and is never rendered below that.
  const isWide = useMediaQuery("(min-width: 1920px)");
  const [detailsOpen, setDetailsOpen] = useState<boolean | null>(null);
  const showDetails = detailsOpen ?? isWide;

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", q, favoritesOnly],
    queryFn: () =>
      chatApi.conversations({
        q: q || undefined,
        favorites_only: favoritesOnly || undefined,
      }),
    refetchInterval: 5000,
  });

  const sorted = useMemo(() => {
    if (!conversations) return [];
    return [...conversations].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [conversations]);

  const selected = sorted.find((c) => c.id === selectedId) ?? null;

  const onCreated = (conv: Conversation) => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
    setSelectedId(conv.id);
    setNewChatOpen(false);
  };

  return (
    <div className="card flex h-full overflow-hidden p-0">
      {/* Conversation list */}
      <aside
        className={cn(
          "w-full flex-col border-r border-border sm:flex sm:w-[clamp(15rem,22vw,21rem)] sm:shrink-0",
          selected ? "hidden sm:flex" : "flex",
        )}
      >
        <div className="shrink-0 space-y-2.5 border-b border-border p-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display font-semibold">Chats</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFavoritesOnly((v) => !v)}
                className={cn(
                  "rounded-lg p-2 transition-colors hover:bg-white/5",
                  favoritesOnly ? "text-warning" : "text-muted hover:text-content",
                )}
                title="Show favorites only"
                aria-label="Show favorites only"
              >
                <Star className={cn("h-4 w-4", favoritesOnly && "fill-warning")} />
              </button>
              <button
                onClick={() => setNewChatOpen(true)}
                className="rounded-lg p-2 text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                title="New chat"
                aria-label="New chat"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input py-2 pl-10 text-sm"
              placeholder="Search chats…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="grid place-items-center py-8">
              <Spinner />
            </div>
          ) : sorted.length ? (
            sorted.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                  selectedId === c.id ? "bg-accent/15" : "hover:bg-white/5",
                )}
              >
                <Avatar conv={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1 text-sm font-medium">
                      {c.is_pinned && <Pin className="h-3 w-3 shrink-0 text-accent" />}
                      <span className="truncate">{convName(c)}</span>
                      {c.is_favorite && (
                        <Star className="h-3 w-3 shrink-0 fill-warning text-warning" />
                      )}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted">
                      {timeAgo(c.last_message?.created_at ?? c.updated_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted">{preview(c.last_message)}</p>
                    {c.unread_count > 0 && (
                      <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title={q || favoritesOnly ? "No matches" : "No chats yet"}
              description={
                q || favoritesOnly
                  ? "Try a different search or filter."
                  : "Find someone to talk to — every image you send can carry a secret."
              }
              action={
                !q &&
                !favoritesOnly && (
                  <Button variant="outline" onClick={() => setNewChatOpen(true)}>
                    <UserPlus className="h-4 w-4" /> New chat
                  </Button>
                )
              }
            />
          )}
        </div>
      </aside>

      {/* Thread + details */}
      {selected ? (
        <>
          <Thread
            conv={selected}
            onBack={() => setSelectedId(null)}
            onToggleDetails={() => setDetailsOpen(!showDetails)}
          />
          {showDetails && (
            <DetailsPanel conv={selected} onClose={() => setDetailsOpen(false)} />
          )}
        </>
      ) : (
        <div className="hidden flex-1 sm:grid sm:place-items-center">
          <EmptyState
            icon={MessagesSquare}
            title="Select a conversation"
            description="Chat normally, or hide your words inside an image with a password. Press ? for shortcuts."
            action={
              <Button variant="outline" onClick={() => setNewChatOpen(true)}>
                <UserPlus className="h-4 w-4" /> Start a conversation
              </Button>
            }
          />
        </div>
      )}

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onCreated={onCreated}
      />
    </div>
  );
}
