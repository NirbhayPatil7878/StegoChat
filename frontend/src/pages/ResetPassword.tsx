import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { apiError } from "@/api/client";
import { authApi } from "@/api/services";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token, password),
    onSuccess: () => {
      toast.success("Password reset — sign in with your new password.");
      navigate("/login");
    },
    onError: (e) => toast.error(apiError(e, "Reset failed — token may have expired")),
  });

  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Paste your reset token if it isn't filled in already."
      footer={
        <>
          Need a new token?{" "}
          <Link to="/forgot-password" className="font-medium text-accent hover:underline">
            Request again
          </Link>
        </>
      }
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch) reset.mutate();
        }}
      >
        <div>
          <label className="ml-1 mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/40">
            Reset token
          </label>
          <input
            className="input-solid font-mono text-xs"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token from your email"
            required
          />
        </div>
        <div>
          <label className="ml-1 mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/40">
            New password
          </label>
          <PasswordInput
            solid
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            showStrength
            required
          />
        </div>
        <div>
          <label className="ml-1 mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/40">
            Confirm password
          </label>
          <PasswordInput
            solid
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {mismatch && <p className="mt-1 text-xs text-danger">Passwords don't match.</p>}
        </div>
        <Button
          type="submit"
          loading={reset.isPending}
          disabled={!token || !password || mismatch}
          className="w-full"
        >
          Reset password
        </Button>
      </form>
    </AuthShell>
  );
}
