import { ArrowRight, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui";
import { useLogin, useVerifyEmailOtp, useVerifyTwoFactor } from "@/hooks/useAuth";
import { isOtpEmailChallenge, isTwoFactorChallenge } from "@/types";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [code, setCode] = useState("");
  const login = useLogin();
  const verifyTotp = useVerifyTwoFactor();
  const verifyOtp = useVerifyEmailOtp();

  const totpChallenge =
    login.data && isTwoFactorChallenge(login.data) ? login.data.challenge_token : null;
  const otpChallenge =
    login.data && isOtpEmailChallenge(login.data) ? login.data.challenge_token : null;

  // --- Email OTP step ---
  if (otpChallenge) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="We sent a 6-digit code to your email address. It expires in 10 minutes."
        cta={{ to: "/register", label: "Sign up" }}
        footer={
          <button
            type="button"
            onClick={() => {
              login.reset();
              setCode("");
            }}
            className="font-bold text-cyan hover:text-white"
          >
            ← Back to sign in
          </button>
        }
      >
        <form
          className="mt-7 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            verifyOtp.mutate({ challenge: otpChallenge, code });
          }}
        >
          <div className="space-y-2.5">
            <label
              className="ml-1 block text-[10px] font-bold uppercase tracking-widest text-white/40"
              htmlFor="otp-code"
            >
              One-time code
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="otp-code"
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
              Didn't receive it? Check your spam folder or go back and try again.
            </p>
          </div>

          <Button
            type="submit"
            loading={verifyOtp.isPending}
            disabled={code.length !== 6}
            className="group w-full rounded-2xl py-4 font-display font-bold"
          >
            Verify
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </form>
      </AuthShell>
    );
  }

  // --- TOTP authenticator-app step ---
  if (totpChallenge) {
    return (
      <AuthShell
        title="Two-factor authentication"
        subtitle="Enter the 6-digit code from your authenticator app."
        cta={{ to: "/register", label: "Sign up" }}
        footer={
          <button
            type="button"
            onClick={() => {
              login.reset();
              setCode("");
            }}
            className="font-bold text-cyan hover:text-white"
          >
            ← Back to sign in
          </button>
        }
      >
        <form
          className="mt-7 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            verifyTotp.mutate({ challenge: totpChallenge, code });
          }}
        >
          <div className="space-y-2.5">
            <label
              className="ml-1 block text-[10px] font-bold uppercase tracking-widest text-white/40"
              htmlFor="code"
            >
              Authentication code
            </label>
            <div className="relative">
              <ShieldCheck className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="code"
                className="input-solid pl-11 tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>
            <p className="px-1 text-[11px] text-white/40">
              Lost your device? Enter one of your recovery codes instead.
            </p>
          </div>

          <Button
            type="submit"
            loading={verifyTotp.isPending}
            className="group w-full rounded-2xl py-4 font-display font-bold"
          >
            Verify
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to unlock your encrypted vault."
      cta={{ to: "/register", label: "Sign up" }}
      footer={
        <>
          New to StegoChat?{" "}
          <Link to="/register" className="ml-1 font-bold text-cyan hover:text-white">
            Create account
          </Link>
        </>
      }
    >
      <form
        className="mt-7 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ identifier, password });
        }}
      >
        <div className="space-y-2.5">
          <label
            className="ml-1 block text-[10px] font-bold uppercase tracking-widest text-white/40"
            htmlFor="identifier"
          >
            Username or email
          </label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="identifier"
              className="input-solid pl-11"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="name@company.com"
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <label
              className="block text-[10px] font-bold uppercase tracking-widest text-white/40"
              htmlFor="password"
            >
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-[10px] font-bold uppercase tracking-wider text-white/40 transition-colors hover:text-white"
            >
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              type={visible ? "text" : "password"}
              className="input-solid pl-11 pr-16"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setVisible((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700"
            >
              {visible ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          loading={login.isPending}
          className="group w-full rounded-2xl py-4 font-display font-bold"
        >
          Sign in
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </form>
    </AuthShell>
  );
}
