import api from "./client";
import type {
  AuthResponse,
  Chat,
  ChatDetail,
  Conversation,
  DashboardData,
  DirectMessage,
  EmbedResponse,
  ExtractResponse,
  ForensicResult,
  LoginResult,
  RedeemInfo,
  RedeemResponse,
  RiskScan,
  SampleImage,
  Settings,
  ShareToken,
  ShareTokenCreateResponse,
  SplitEmbedResponse,
  TokenIssueResponse,
  TwoFactorEnableResponse,
  TwoFactorSetup,
  User,
  UserBrief,
} from "@/types";

// --- Auth ---
export const authApi = {
  register: (body: { username: string; email: string; password: string }) =>
    api.post<AuthResponse>("/auth/register", body).then((r) => r.data),
  login: (body: { identifier: string; password: string }) =>
    api.post<LoginResult>("/auth/login", body).then((r) => r.data),
  logout: (refresh_token: string) =>
    api.post("/auth/logout", { refresh_token }).then((r) => r.data),
  // Two-factor auth
  twoFactorSetup: () =>
    api.post<TwoFactorSetup>("/auth/2fa/setup").then((r) => r.data),
  twoFactorEnable: (code: string) =>
    api
      .post<TwoFactorEnableResponse>("/auth/2fa/enable", { code })
      .then((r) => r.data),
  twoFactorDisable: (password: string) =>
    api.post("/auth/2fa/disable", { password }).then((r) => r.data),
  twoFactorVerify: (challenge_token: string, code: string) =>
    api
      .post<AuthResponse>("/auth/2fa/verify", { challenge_token, code })
      .then((r) => r.data),
  // Email OTP login
  otpVerify: (challenge_token: string, code: string) =>
    api
      .post<AuthResponse>("/auth/otp/verify", { challenge_token, code })
      .then((r) => r.data),
  otpEnable: (password: string) =>
    api.post("/auth/otp/enable", { password }).then((r) => r.data),
  otpDisable: (password: string) =>
    api.post("/auth/otp/disable", { password }).then((r) => r.data),
  forgotPassword: (email: string) =>
    api
      .post<TokenIssueResponse>("/auth/forgot-password", { email })
      .then((r) => r.data),
  resetPassword: (token: string, new_password: string) =>
    api.post("/auth/reset-password", { token, new_password }).then((r) => r.data),
  requestVerification: () =>
    api
      .post<TokenIssueResponse>("/auth/request-verification")
      .then((r) => r.data),
  verifyEmail: (token: string) =>
    api.post("/auth/verify-email", { token }).then((r) => r.data),
  // Signup email OTP verification (token passed explicitly — user not yet in auth store)
  signupVerifyOtp: (code: string, accessToken: string) =>
    api
      .post<{ status: string; already_verified: boolean; user: import("@/types").User; tokens: import("@/types").TokenPair }>(
        "/auth/signup-verify-otp",
        { code },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      .then((r) => r.data),
  signupResendOtp: (accessToken: string) =>
    api
      .post("/auth/signup-resend-otp", {}, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.data),
};

// --- User & settings ---
export const userApi = {
  me: () => api.get<User>("/user").then((r) => r.data),
  update: (body: Partial<Pick<User, "username" | "email" | "bio" | "avatar">>) =>
    api.put<User>("/user", body).then((r) => r.data),
  changePassword: (body: { old_password: string; new_password: string }) =>
    api.post("/user/password", body).then((r) => r.data),
  deleteAccount: () => api.delete("/user").then((r) => r.data),
  getSettings: () => api.get<Settings>("/settings").then((r) => r.data),
  updateSettings: (body: Partial<Settings>) =>
    api.put<Settings>("/settings", body).then((r) => r.data),
};

// --- Stego ---
export const stegoApi = {
  samples: () =>
    api.get<{ samples: SampleImage[] }>("/samples").then((r) => r.data.samples),
  embed: (form: FormData) =>
    api
      .post<EmbedResponse>("/embed", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  extract: (form: FormData) =>
    api
      .post<ExtractResponse>("/extract", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  // Multi-image split embedding
  embedSplit: (form: FormData) =>
    api
      .post<SplitEmbedResponse>("/embed-split", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  extractSplit: (form: FormData) =>
    api
      .post<ExtractResponse>("/extract-split", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  // Universal file-in-file hiding
  hideFile: (form: FormData) =>
    api
      .post<EmbedResponse>("/hide-file", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  revealFile: (form: FormData) =>
    api
      .post<ExtractResponse>("/reveal-file", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  scanRisk: (message: string) =>
    api.post<RiskScan>("/scan-risk", { message }).then((r) => r.data),
  forensics: (file: File) => {
    const form = new FormData();
    form.append("image", file);
    return api
      .post<ForensicResult>("/forensics", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
};

// --- History ---
export const historyApi = {
  list: (params?: { q?: string; favorites_only?: boolean; folder?: string }) =>
    api.get<Chat[]>("/history", { params }).then((r) => r.data),
  get: (id: number) => api.get<ChatDetail>(`/history/${id}`).then((r) => r.data),
  update: (
    id: number,
    body: Partial<Pick<Chat, "title" | "is_pinned" | "is_favorite" | "folder">>,
  ) => api.patch<Chat>(`/history/${id}`, body).then((r) => r.data),
  remove: (id: number) => api.delete(`/history/${id}`).then((r) => r.data),
  clear: () => api.delete("/history").then((r) => r.data),
};

// --- Direct + group messaging ---
export const chatApi = {
  searchUsers: (q: string) =>
    api.get<UserBrief[]>("/users/search", { params: { q } }).then((r) => r.data),
  conversations: (params?: { q?: string; favorites_only?: boolean }) =>
    api.get<Conversation[]>("/conversations", { params }).then((r) => r.data),
  createConversation: (user_id: number) =>
    api.post<Conversation>("/conversations", { user_id }).then((r) => r.data),
  createGroup: (name: string, member_ids: number[]) =>
    api
      .post<Conversation>("/conversations/group", { name, member_ids })
      .then((r) => r.data),
  updateConversation: (
    convId: number,
    body: { name?: string; is_pinned?: boolean; is_favorite?: boolean },
  ) => api.patch<Conversation>(`/conversations/${convId}`, body).then((r) => r.data),
  deleteConversation: (convId: number) =>
    api.delete(`/conversations/${convId}`).then((r) => r.data),
  markRead: (convId: number, message_id: number) =>
    api.post(`/conversations/${convId}/read`, { message_id }).then((r) => r.data),
  messages: (convId: number, after?: number) =>
    api
      .get<DirectMessage[]>(`/conversations/${convId}/messages`, {
        params: after ? { after } : undefined,
      })
      .then((r) => r.data),
  sendText: (convId: number, body: string, expire_minutes?: number | null) =>
    api
      .post<DirectMessage>(`/conversations/${convId}/messages`, {
        body,
        expire_minutes: expire_minutes ?? null,
      })
      .then((r) => r.data),
  sendStego: (convId: number, form: FormData) =>
    api
      .post<DirectMessage>(`/conversations/${convId}/stego`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  reveal: (messageId: number, password: string) =>
    api
      .post<{ message: string }>(`/messages/${messageId}/reveal`, { password })
      .then((r) => r.data),
};

// --- Dashboard ---
export const dashboardApi = {
  get: () => api.get<DashboardData>("/dashboard").then((r) => r.data),
};

// --- Share tokens ---
export const tokenApi = {
  create: (body: {
    stego_filename: string;
    label?: string | null;
    access_password?: string | null;
    ttl_hours?: number | null;
    max_reads?: number | null;
  }) =>
    api
      .post<ShareTokenCreateResponse>("/tokens", body)
      .then((r) => r.data),
  list: () => api.get<ShareToken[]>("/tokens").then((r) => r.data),
  revoke: (id: number) => api.delete(`/tokens/${id}`).then((r) => r.data),
  // Public redeem flow (no auth required).
  info: (token: string) =>
    api.get<RedeemInfo>(`/tokens/redeem/${token}`).then((r) => r.data),
  redeem: (token: string, access_password?: string | null) =>
    api
      .post<RedeemResponse>(`/tokens/redeem/${token}`, {
        access_password: access_password ?? null,
      })
      .then((r) => r.data),
  reveal: (token: string, password: string) =>
    api
      .post<{ message: string }>(`/tokens/redeem/${token}/reveal`, { password })
      .then((r) => r.data),
};
