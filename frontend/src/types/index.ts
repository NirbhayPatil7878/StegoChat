export interface User {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  bio: string | null;
  is_admin: boolean;
  email_verified: boolean;
  totp_enabled: boolean;
  email_otp_enabled: boolean;
  created_at: string;
  last_login: string | null;
}

// --- Two-factor auth (TOTP authenticator app) ---
export interface TwoFactorChallenge {
  two_factor_required: true;
  challenge_token: string;
}

// --- Email OTP login (code sent to inbox) ---
export interface OtpEmailChallenge {
  otp_email_required: true;
  challenge_token: string;
}

export type LoginResult = AuthResponse | TwoFactorChallenge | OtpEmailChallenge;

export function isTwoFactorChallenge(r: LoginResult): r is TwoFactorChallenge {
  return (r as TwoFactorChallenge).two_factor_required === true;
}

export function isOtpEmailChallenge(r: LoginResult): r is OtpEmailChallenge {
  return (r as OtpEmailChallenge).otp_email_required === true;
}

export interface TwoFactorSetup {
  secret: string;
  otpauth_uri: string;
}

export interface TwoFactorEnableResponse {
  status: string;
  recovery_codes: string[];
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthResponse {
  user: User;
  tokens: TokenPair;
}

export type StegoMethod = "lsb" | "lsb-rgb" | "lsb-2bit" | "pvd" | "dct";

export interface Settings {
  theme: "dark" | "light" | "system";
  accent: string;
  animations_enabled: boolean;
  notifications_enabled: boolean;
  language: string;
  auto_delete_messages: boolean;
  default_encryption: string;
  stego_method: StegoMethod;
}

export interface ChatMessage {
  id: number;
  chat_id: number;
  kind: "embed" | "extract";
  preview: string | null;
  original_filename: string | null;
  stego_filename: string | null;
  has_decoy: boolean;
  size_bytes: number | null;
  created_at: string;
}

export interface Chat {
  id: number;
  title: string;
  is_pinned: boolean;
  is_favorite: boolean;
  folder: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_preview: string | null;
}

export interface ChatDetail extends Chat {
  messages: ChatMessage[];
}

export interface EmbedResponse {
  status: string;
  stego_url: string;
  stego_filename: string;
  message_id: number | null;
  chat_id: number | null;
  decoy_enabled: boolean;
}

// --- Multi-image split embedding ---
export interface SplitPart {
  index: number;
  stego_url: string;
  stego_filename: string;
}

export interface SplitEmbedResponse {
  status: string;
  total: number;
  parts: SplitPart[];
}

// --- Share tokens ---
export type ShareTokenStatus = "active" | "expired" | "exhausted" | "revoked";

export interface ShareToken {
  id: number;
  token: string;
  share_path: string;
  label: string | null;
  protected: boolean;
  status: ShareTokenStatus;
  read_count: number;
  max_reads: number | null;
  reads_remaining: number | null;
  expires_at: string | null;
  created_at: string;
}

export interface ShareTokenCreateResponse {
  status: string;
  token: string;
  share_path: string;
  protected: boolean;
  expires_at: string | null;
}

export interface RedeemInfo {
  label: string | null;
  protected: boolean;
  status: ShareTokenStatus;
  reads_remaining: number | null;
  expires_at: string | null;
}

export interface RedeemResponse {
  status: string;
  stego_url: string;
  filename: string;
  label: string | null;
}

export interface ExtractResponse {
  status: string;
  kind: "text" | "file";
  message: string | null;
  filename: string | null;
  mime: string | null;
  payload_url: string | null;
}

export interface RiskScan {
  level: "safe" | "risky" | "suspicious";
  findings: string[];
  should_hide: boolean;
}

export interface ForensicResult {
  level: "safe" | "risky" | "suspicious";
  malformed: boolean;
  reasons: string[];
  entropy: number;
  lsb_anomaly_score: number;
  lsb_density: number;
  size_bytes: number;
  image: {
    width: number | null;
    height: number | null;
    mode: string | null;
    format: string | null;
  };
}

export interface ActivityItem {
  id: number;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_embeds: number;
  total_extracts: number;
  total_chats: number;
  total_messages: number;
  active_share_tokens: number;
  storage_bytes: number;
  storage_files: number;
  security_score: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recent_activity: ActivityItem[];
  embeds_over_time: { date: string; count: number }[];
}

export interface SampleImage {
  name: string;
  url: string;
}

// --- Direct + group messaging ---
export interface UserBrief {
  id: number;
  username: string;
  avatar: string | null;
}

export interface DirectMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_username: string;
  kind: "text" | "stego";
  body: string | null;
  stego_url: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface Conversation {
  id: number;
  is_group: boolean;
  name: string;
  other_user: UserBrief | null;
  members: UserBrief[];
  member_count: number;
  last_message: DirectMessage | null;
  unread_count: number;
  is_pinned: boolean;
  is_favorite: boolean;
  other_last_read_id: number;
  updated_at: string;
}

export interface TokenIssueResponse {
  status: string;
  message: string;
  dev_token: string | null;
}
