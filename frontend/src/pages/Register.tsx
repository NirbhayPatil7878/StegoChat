import { ArrowRight, AtSign, Mail, RefreshCw, User } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { authApi } from "@/api/services";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useRegister, useVerifySignupOtp } from "@/hooks/useAuth";
import { scorePassword } from "@/lib/utils";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="ml-1 block text-[10px] font-bold uppercase tracking-widest text-white/40"
    >
      {children}
    </label>
  );
}

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [resending, setResending] = useState(false);

  const register = useRegister();

  // Access token from the registration response — held in local state so
  // GuestOnly never fires (isAuthenticated stays false until OTP passes).
  const accessToken = register.data?.tokens.access_token ?? "";

  const verifyOtp = useVerifySignupOtp(accessToken);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scorePassword(password).score < 2) {
      toast.error("Please choose a stronger password (8+ chars, mixed case, a number).");
      return;
    }
    register.mutate({ username, email, password });
  };

  const resend = async () => {
    if (!accessToken) return;
    setResending(true);
    try {
      await authApi.signupResendOtp(accessToken);
      toast.success("A new code has been sent to your email.");
    } catch {
      toast.error("Could not resend — please try again.");
    } finally {
      setResending(false);
    }
  };

  // --- OTP verification step ---
  if (register.isSuccess) {
    return (
      <AuthShell
        title="Verify your email"
        subtitle={`We sent a 6-digit code to ${email}. Enter it below to activate your vault.`}
        cta={null}
        footer={
          <button
            type="button"
            onClick={() => {
              register.reset();
              setCode("");
            }}
            className="font-bold text-cyan hover:text-white"
          >
            ← Start over
          </button>
        }
      >
        <form
          className="mt-7 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            verifyOtp.mutate(code);
          }}
        >
          <div className="space-y-2.5">
            <label
              className="ml-1 block text-[10px] font-bold uppercase tracking-widest text-white/40"
              htmlFor="signup-otp"
            >
              Verification code
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="signup-otp"
                className="input-solid pl-11 tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={6}
              />
            </div>
            <p className="px-1 text-[11px] text-white/40">
              Didn't receive it? Check your spam folder or resend below.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              loading={verifyOtp.isPending}
              disabled={code.length !== 6}
              className="group w-full rounded-2xl py-4 font-display font-bold"
            >
              Verify & enter vault
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              loading={resending}
              onClick={resend}
              className="w-full gap-2 text-sm text-white/50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Resend code
            </Button>
          </div>
        </form>
      </AuthShell>
    );
  }

  // --- Registration form ---
  return (
    <AuthShell
      title="Create your vault"
      subtitle="Your messages are encrypted before they ever touch an image."
      cta={{ to: "/login", label: "Sign in" }}
      footer={
        <>
          Already have a vault?{" "}
          <Link to="/login" className="ml-1 font-bold text-cyan hover:text-white">
            Sign in
          </Link>
        </>
      }
    >
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <div className="space-y-2.5">
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="username"
              className="input-solid pl-11"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ghostwriter"
              minLength={3}
              autoComplete="username"
              required
            />
          </div>
        </div>
        <div className="space-y-2.5">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <AtSign className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              type="email"
              className="input-solid pl-11"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />
          </div>
        </div>
        <div className="space-y-2.5">
          <Label htmlFor="new-password">Password</Label>
          <PasswordInput
            id="new-password"
            solid
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Choose something strong"
            autoComplete="new-password"
            showStrength
            required
          />
        </div>
        <Button
          type="submit"
          loading={register.isPending}
          className="group w-full rounded-2xl py-4 font-display font-bold"
        >
          Create vault
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </form>
    </AuthShell>
  );
}
