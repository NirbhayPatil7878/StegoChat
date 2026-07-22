import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { apiError } from "@/api/client";
import { authApi } from "@/api/services";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const request = useMutation({
    mutationFn: () => authApi.forgotPassword(email),
    onError: (e) => toast.error(apiError(e, "Request failed")),
  });

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {request.data ? (
        <div className="mt-6 space-y-4 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/15">
            <MailCheck className="h-7 w-7 text-success" />
          </div>
          <p className="text-sm text-muted">{request.data.message}</p>
          {request.data.dev_token && (
            <Link to={`/reset-password?token=${request.data.dev_token}`}>
              <Button variant="outline" className="w-full">
                Continue to reset (dev mode)
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate();
          }}
        >
          <div>
            <label className="ml-1 mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/40">
              Email
            </label>
            <input
              type="email"
              className="input-solid"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <Button type="submit" loading={request.isPending} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
