import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Download,
  FileJson,
  Lock,
  MessagesSquare,
  Pencil,
  Pin,
  Search,
  Star,
  Trash2,
  Unlock,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { apiError } from "@/api/client";
import { historyApi } from "@/api/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Button, Card, Chip, EmptyState, Skeleton, Spinner } from "@/components/ui";
import { downloadJson, formatDateTime, timeAgo } from "@/lib/utils";
import type { Chat } from "@/types";

function ChatDetailView({ chatId }: { chatId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["history-detail", chatId],
    queryFn: () => historyApi.get(chatId),
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-6">
        <Spinner />
      </div>
    );
  }
  if (!data?.messages.length) {
    return <p className="py-4 text-center text-sm text-muted">No messages in this entry.</p>;
  }
  return (
    <ul className="space-y-2 pt-3">
      {data.messages.map((m) => (
        <li
          key={m.id}
          className="flex items-center gap-3 rounded-xl bg-surface-2/50 px-3 py-2.5"
        >
          <div
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
              m.kind === "embed" ? "bg-accent/15 text-accent" : "bg-success/15 text-success"
            }`}
          >
            {m.kind === "embed" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{m.preview || "(encrypted)"}</p>
            <p className="text-xs text-muted">
              {m.kind === "embed" ? "Hidden" : "Revealed"} · {formatDateTime(m.created_at)}
              {m.has_decoy && " · decoy"}
            </p>
          </div>
          {m.stego_filename && (
            <a
              href={`/api/files/${m.stego_filename}`}
              download={m.stego_filename}
              className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-accent"
              aria-label="Download stego image"
              title="Download stego image"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function History() {
  const [q, setQ] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<Chat | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState<Chat | null>(null);
  const [exporting, setExporting] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["history", q, favoritesOnly],
    queryFn: () => historyApi.list({ q: q || undefined, favorites_only: favoritesOnly }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["history"] });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Chat> }) =>
      historyApi.update(id, body),
    onSuccess: invalidate,
    onError: (e) => toast.error(apiError(e, "Update failed")),
  });

  const remove = useMutation({
    mutationFn: (id: number) => historyApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success("Entry deleted");
    },
  });

  const clearAll = useMutation({
    mutationFn: () => historyApi.clear(),
    onSuccess: () => {
      invalidate();
      setConfirmClear(false);
      toast.success("History cleared");
    },
  });

  const exportAll = async () => {
    if (!data?.length) return;
    setExporting(true);
    try {
      const details = await Promise.all(data.map((c) => historyApi.get(c.id)));
      downloadJson(
        { exported_at: new Date().toISOString(), chats: details },
        `stegochat-history-${new Date().toISOString().slice(0, 10)}.json`,
      );
      toast.success("History exported");
    } catch (e) {
      toast.error(apiError(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="History"
        subtitle="Every message you've hidden or revealed, encrypted at rest."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="input pl-10"
            placeholder="Search history…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button
          variant={favoritesOnly ? "primary" : "outline"}
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          <Star className="h-4 w-4" />
          Favorites
        </Button>
        <Button variant="outline" loading={exporting} disabled={!data?.length} onClick={exportAll}>
          <FileJson className="h-4 w-4" />
          Export
        </Button>
        <Button
          variant="outline"
          className="hover:!border-danger/60 hover:!bg-danger/5"
          disabled={!data?.length}
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 className="h-4 w-4" />
          Clear all
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="space-y-3">
          {data.map((chat, i) => (
            <motion.div
              key={chat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <Card className="p-4 transition-colors hover:border-accent/30">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setExpanded(expanded === chat.id ? null : chat.id)}
                    className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  >
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                      <MessagesSquare className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {chat.is_pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" />}
                        <p className="truncate font-medium">{chat.title}</p>
                      </div>
                      <p className="truncate text-sm text-muted">
                        {chat.last_preview || "No messages"}
                      </p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-3 text-xs text-muted sm:flex">
                      <Chip tone="muted">{chat.message_count} msg</Chip>
                      <span>{timeAgo(chat.updated_at)}</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          expanded === chat.id ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconBtn
                      active={chat.is_favorite}
                      onClick={() =>
                        patch.mutate({ id: chat.id, body: { is_favorite: !chat.is_favorite } })
                      }
                      label="Favorite"
                    >
                      <Star
                        className={`h-4 w-4 ${chat.is_favorite ? "fill-warning text-warning" : ""}`}
                      />
                    </IconBtn>
                    <IconBtn
                      active={chat.is_pinned}
                      onClick={() =>
                        patch.mutate({ id: chat.id, body: { is_pinned: !chat.is_pinned } })
                      }
                      label="Pin"
                    >
                      <Pin className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      onClick={() => {
                        setRenaming(chat);
                        setNewTitle(chat.title);
                      }}
                      label="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn onClick={() => setDeleting(chat)} label="Delete" danger>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </div>
                <AnimatePresence>
                  {expanded === chat.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <ChatDetailView chatId={chat.id} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={MessagesSquare}
          title={q ? "No matches" : "No hidden messages yet"}
          description={
            q
              ? "Try a different search term."
              : "Hide or reveal a message in the Studio and it'll show up here."
          }
          action={
            <a href="/app/studio">
              <Button>
                <Lock className="h-4 w-4" /> Open Studio
              </Button>
            </a>
          }
        />
      )}

      {/* Rename */}
      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename entry"
        className="max-w-sm"
      >
        <input
          autoFocus
          className="input"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTitle.trim() && renaming) {
              patch.mutate({ id: renaming.id, body: { title: newTitle.trim() } });
              setRenaming(null);
            }
          }}
        />
        <Button
          className="mt-4 w-full"
          disabled={!newTitle.trim()}
          onClick={() => {
            if (renaming) patch.mutate({ id: renaming.id, body: { title: newTitle.trim() } });
            setRenaming(null);
          }}
        >
          Save
        </Button>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="Delete this entry?"
        description={`"${deleting?.title ?? ""}" and its messages will be removed permanently.`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => clearAll.mutate()}
        title="Clear entire history?"
        description="Every embed and extraction record will be permanently deleted. Consider exporting first."
        confirmLabel="Clear everything"
        danger
        loading={clearAll.isPending}
      />
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  active,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 transition-colors hover:bg-white/5 ${
        danger
          ? "text-muted hover:text-danger"
          : active
            ? "text-accent"
            : "text-muted hover:text-content"
      }`}
    >
      {children}
    </button>
  );
}
