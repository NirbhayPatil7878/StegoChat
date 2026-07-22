import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Ban,
  Copy,
  Eye,
  Infinity as InfinityIcon,
  Link2,
  Lock,
  QrCode,
  Timer,
  WandSparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { apiError } from "@/api/client";
import { tokenApi } from "@/api/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ui/Modal";
import { QRCode } from "@/components/ui/QRCode";
import { Button, Card, Chip, EmptyState, Skeleton } from "@/components/ui";
import { cn, copyToClipboard, formatDateTime, timeUntil } from "@/lib/utils";
import type { ShareToken, ShareTokenStatus } from "@/types";
import { useState } from "react";

const STATUS_TONE: Record<ShareTokenStatus, "success" | "muted" | "warning" | "danger"> = {
  active: "success",
  expired: "muted",
  exhausted: "warning",
  revoked: "danger",
};

function TokenRow({ token, onRevoke }: { token: ShareToken; onRevoke: (t: ShareToken) => void }) {
  const link = `${window.location.origin}${token.share_path}`;
  const [showQr, setShowQr] = useState(false);
  const copy = async () =>
    (await copyToClipboard(link))
      ? toast.success("Link copied")
      : toast.error("Could not copy");

  return (
    <Card className="flex flex-col gap-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
        <Link2 className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{token.label || "Untitled link"}</p>
          <Chip tone={STATUS_TONE[token.status]}>{token.status}</Chip>
          {token.protected && (
            <Chip tone="accent">
              <Lock className="h-3 w-3" /> Protected
            </Chip>
          )}
        </div>
        <button
          onClick={copy}
          className="mt-1 flex max-w-full items-center gap-1.5 text-xs text-muted hover:text-content"
          title="Copy link"
        >
          <span className="truncate font-mono">{token.share_path}</span>
          <Copy className="h-3 w-3 shrink-0" />
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1" title="Opens">
          <Eye className="h-3.5 w-3.5" />
          {token.read_count}
          {token.max_reads != null ? `/${token.max_reads}` : ""}
        </span>
        <span className="flex items-center gap-1" title="Expiry">
          {token.expires_at ? (
            <>
              <Timer className="h-3.5 w-3.5" />
              {token.status === "active" ? timeUntil(token.expires_at) : formatDateTime(token.expires_at)}
            </>
          ) : (
            <>
              <InfinityIcon className="h-3.5 w-3.5" /> No expiry
            </>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={copy}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        <Button
          variant="ghost"
          className={cn("px-3 py-1.5 text-xs", showQr && "text-accent")}
          onClick={() => setShowQr((v) => !v)}
        >
          <QrCode className="h-3.5 w-3.5" /> QR
        </Button>
        {token.status === "active" && (
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-xs text-muted hover:text-danger"
            onClick={() => onRevoke(token)}
          >
            <Ban className="h-3.5 w-3.5" /> Revoke
          </Button>
        )}
      </div>
      </div>
      {showQr && (
        <div className="flex flex-col items-center border-t border-border pt-3">
          <QRCode value={link} size={148} downloadName={`share-${token.token}.png`} />
          <p className="mt-1 text-[11px] text-muted">Scan to open this link on a phone</p>
        </div>
      )}
    </Card>
  );
}

export default function Tokens() {
  const qc = useQueryClient();
  const [revoking, setRevoking] = useState<ShareToken | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["tokens"], queryFn: tokenApi.list });

  const revoke = useMutation({
    mutationFn: (id: number) => tokenApi.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tokens"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setRevoking(null);
      toast.success("Link revoked");
    },
    onError: (e) => toast.error(apiError(e, "Could not revoke")),
  });

  return (
    <div>
      <PageHeader
        title="Share links"
        subtitle="Tokens that let anyone fetch a stego image you've created."
        action={
          <Link to="/app/studio">
            <Button variant="outline">
              <WandSparkles className="h-4 w-4" /> New in Studio
            </Button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="space-y-3">
          {data.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <TokenRow token={t} onRevoke={setRevoking} />
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Link2}
          title="No share links yet"
          description="Hide a message in the Studio, then create a share link to send the image by token."
          action={
            <Link to="/app/studio">
              <Button>
                <WandSparkles className="h-4 w-4" /> Open Studio
              </Button>
            </Link>
          }
        />
      )}

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        title="Revoke this link?"
        description="Anyone holding the link will immediately lose access. This cannot be undone."
        confirmLabel="Revoke"
        danger
        loading={revoke.isPending}
      />
    </div>
  );
}
