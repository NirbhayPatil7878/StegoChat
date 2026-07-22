import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Eye, Link2, Lock, Timer, Unlock } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { apiError } from "@/api/client";
import { tokenApi } from "@/api/services";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button, Chip, Spinner } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { formatDateTime, timeUntil } from "@/lib/utils";
import type { RedeemResponse } from "@/types";

export default function ShareRedeem() {
  const { token = "" } = useParams();
  const [accessPassword, setAccessPassword] = useState("");
  const [stegoPassword, setStegoPassword] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const info = useQuery({
    queryKey: ["share-info", token],
    queryFn: () => tokenApi.info(token),
    retry: false,
  });

  const redeem = useMutation<RedeemResponse, Error>({
    mutationFn: () => tokenApi.redeem(token, accessPassword || null),
    onError: (e) => toast.error(apiError(e, "Could not open this link")),
  });

  const reveal = useMutation({
    mutationFn: () => tokenApi.reveal(token, stegoPassword),
    onSuccess: (r) => setRevealed(r.message),
    onError: () => toast.error("Wrong password or no hidden message"),
  });

  const image = redeem.data;

  return (
    <AuthShell
      title="Shared image"
      subtitle="Someone shared an image with you via a StegoChat link."
    >
      <div className="mt-6 space-y-4">
        {info.isLoading ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : info.isError ? (
          <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
            This link doesn't exist, has expired, run out of opens, or was revoked.
          </p>
        ) : image ? (
          // --- Image fetched: show it + reveal flow ---
          <div className="space-y-3">
            <img
              src={image.stego_url}
              alt="Shared"
              className="max-h-[min(20rem,45vh)] w-full rounded-xl border border-border object-contain"
            />
            <a href={image.stego_url} download={image.filename}>
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4" /> Download image
              </Button>
            </a>

            <div className="rounded-xl border border-border p-3">
              {revealed !== null ? (
                <div className="flex items-start gap-2 text-sm">
                  <Unlock className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <p className="whitespace-pre-wrap break-words">{revealed}</p>
                </div>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (stegoPassword) reveal.mutate();
                  }}
                >
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <Lock className="h-3.5 w-3.5" /> Hidden message password
                  </p>
                  <PasswordInput
                    solid
                    value={stegoPassword}
                    onChange={(e) => setStegoPassword(e.target.value)}
                    placeholder="Reveal what's hidden inside"
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    loading={reveal.isPending}
                    disabled={!stegoPassword}
                  >
                    <Eye className="h-4 w-4" /> Reveal hidden message
                  </Button>
                </form>
              )}
            </div>
          </div>
        ) : (
          // --- Not yet opened: optional access password + open button ---
          <>
            <div className="flex flex-wrap items-center gap-2">
              {info.data?.protected && (
                <Chip tone="accent">
                  <Lock className="h-3 w-3" /> Password protected
                </Chip>
              )}
              {info.data?.expires_at && (
                <Chip tone="muted">
                  <Timer className="h-3 w-3" /> Expires in {timeUntil(info.data.expires_at)}
                </Chip>
              )}
              {info.data?.reads_remaining != null && (
                <Chip tone="muted">{info.data.reads_remaining} opens left</Chip>
              )}
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                redeem.mutate();
              }}
            >
              {info.data?.protected && (
                <PasswordInput
                  solid
                  autoFocus
                  value={accessPassword}
                  onChange={(e) => setAccessPassword(e.target.value)}
                  placeholder="Access password"
                />
              )}
              <Button
                type="submit"
                className="w-full"
                loading={redeem.isPending}
                disabled={info.data?.protected && !accessPassword}
              >
                <Link2 className="h-4 w-4" /> Open image
              </Button>
            </form>
            {info.data?.expires_at && (
              <p className="text-center text-xs text-muted">
                Link expires {formatDateTime(info.data.expires_at)}
              </p>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
