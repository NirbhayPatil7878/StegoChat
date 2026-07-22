import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, MailWarning } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "@/api/services";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui";
import { useAuthStore } from "@/store/auth";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const isAuthed = useAuthStore((s) => s.isAuthenticated);

  const verify = useMutation({ mutationFn: (t: string) => authApi.verifyEmail(t) });

  // Auto-verify when the link carries a token.
  useEffect(() => {
    const t = params.get("token");
    if (t) verify.mutate(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell
      title="Verify your email"
      footer={
        <Link
          to={isAuthed ? "/app/chat" : "/login"}
          className="font-medium text-accent hover:underline"
        >
          {isAuthed ? "Back to the app" : "Go to sign in"}
        </Link>
      }
    >
      {verify.isSuccess ? (
        <div className="mt-6 space-y-3 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/15">
            <BadgeCheck className="h-7 w-7 text-success" />
          </div>
          <p className="text-sm">Your email is verified. You're all set.</p>
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (token) verify.mutate(token);
          }}
        >
          {verify.isError && (
            <p className="flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
              <MailWarning className="h-4 w-4 shrink-0" />
              Verification failed — the token may have expired.
            </p>
          )}
          <div>
            <label className="ml-1 mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/40">
              Verification token
            </label>
            <input
              className="input-solid font-mono text-xs"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token from your email"
              required
            />
          </div>
          <Button type="submit" loading={verify.isPending} disabled={!token} className="w-full">
            Verify email
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
