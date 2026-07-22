import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authApi, userApi } from "@/api/services";
import { apiError } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { useThemeStore } from "@/store/theme";
import type { Settings } from "@/types";


export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: async (data) => {
      // Challenges (TOTP or email OTP) are handled by the Login page UI.
      if ("two_factor_required" in data || "otp_email_required" in data) return;
      setSession(data);
      await syncSettings();
      toast.success(`Welcome back, ${data.user.username}`);
      navigate("/app/chat");
    },
    onError: (e) => toast.error(apiError(e, "Login failed")),
  });
}

export function useVerifyTwoFactor() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ challenge, code }: { challenge: string; code: string }) =>
      authApi.twoFactorVerify(challenge, code),
    onSuccess: async (data) => {
      setSession(data);
      await syncSettings();
      toast.success(`Welcome back, ${data.user.username}`);
      navigate("/app/chat");
    },
    onError: (e) => toast.error(apiError(e, "Verification failed")),
  });
}

export function useVerifyEmailOtp() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ challenge, code }: { challenge: string; code: string }) =>
      authApi.otpVerify(challenge, code),
    onSuccess: async (data) => {
      setSession(data);
      await syncSettings();
      toast.success(`Welcome back, ${data.user.username}`);
      navigate("/app/chat");
    },
    onError: (e) => toast.error(apiError(e, "Invalid or expired OTP code")),
  });
}

export function useRegister() {
  // Intentionally does NOT call setSession — that would mark the user as
  // authenticated and trigger the GuestOnly redirect before the OTP screen
  // renders. setSession is called by useVerifySignupOtp after OTP passes.
  return useMutation({
    mutationFn: authApi.register,
    onError: (e) => toast.error(apiError(e, "Registration failed")),
  });
}

export function useVerifySignupOtp(accessToken: string) {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (code: string) => authApi.signupVerifyOtp(code, accessToken),
    onSuccess: async (data) => {
      // Now it's safe to commit the session — email is verified.
      setSession({ user: data.user, tokens: data.tokens });
      await syncSettings();
      toast.success("Email verified. Welcome to StegoChat!");
      navigate("/app/chat");
    },
    onError: (e) => toast.error(apiError(e, "Invalid or expired code")),
  });
}

export function useLogout() {
  const { refreshToken, clear } = useAuthStore.getState();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      /* best effort */
    }
    clear();
    qc.clear();
    navigate("/login");
    toast.success("Signed out");
  };
}

async function syncSettings() {
  try {
    const s: Settings = await userApi.getSettings();
    const { setTheme, setAccent, setAnimations } = useThemeStore.getState();
    setTheme(s.theme);
    if (s.accent) setAccent(s.accent as never);
    setAnimations(s.animations_enabled);
  } catch {
    /* non-fatal */
  }
}
