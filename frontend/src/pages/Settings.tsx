import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Bell,
  Check,
  Copy,
  FileJson,
  Globe,
  KeyRound,
  Layers,
  MailWarning,
  Palette,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { apiError } from "@/api/client";
import { authApi, historyApi, userApi } from "@/api/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ui/Modal";
import { QRCode } from "@/components/ui/QRCode";
import { Toggle } from "@/components/ui/Toggle";
import { Button, Card, Chip } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useAuthStore } from "@/store/auth";
import { useLogout } from "@/hooks/useAuth";
import { copyToClipboard, downloadJson } from "@/lib/utils";
import type { StegoMethod, TwoFactorSetup } from "@/types";
import { Accent, ThemeMode, useThemeStore } from "@/store/theme";

const accents: { key: Accent; color: string }[] = [
  { key: "violet", color: "#8B5CF6" },
  { key: "cyan", color: "#22D3EE" },
  { key: "blue", color: "#3B82F6" },
  { key: "emerald", color: "#10B981" },
  { key: "rose", color: "#F43E5E" },
  { key: "grey", color: "#9CA3AF" },
];
const themes: { key: ThemeMode; label: string }[] = [
  { key: "dark", label: "Dark" },
  { key: "light", label: "Light" },
  { key: "system", label: "System" },
];
const stegoMethods: { key: StegoMethod; name: string; desc: string; capacity: string }[] = [
  {
    key: "lsb",
    name: "LSB Blue Channel",
    desc: "1 bit per pixel in the blue channel, scattered in a password-seeded order.",
    capacity: "1×",
  },
  {
    key: "lsb-rgb",
    name: "LSB RGB",
    desc: "1 bit per channel across R, G and B — 3× the capacity of LSB blue.",
    capacity: "3×",
  },
  {
    key: "lsb-2bit",
    name: "LSB 2-Bit",
    desc: "2 bits per pixel in the blue channel. Double capacity, marginally less invisible.",
    capacity: "2×",
  },
  {
    key: "pvd",
    name: "Pixel Value Differencing",
    desc: "Encodes 3 bits in each pixel-pair difference. More natural in edge regions.",
    capacity: "1.5×",
  },
  {
    key: "dct",
    name: "DCT Block",
    desc: "Modifies mid-frequency 8×8 DCT coefficients. Most resistant to statistical analysis.",
    capacity: "0.25×",
  },
];

const languages = [
  { key: "en", label: "English" },
  { key: "es", label: "Español" },
  { key: "fr", label: "Français" },
  { key: "de", label: "Deutsch" },
  { key: "hi", label: "हिन्दी" },
];

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useLogout();
  const qc = useQueryClient();
  const { theme, accent, animations, setTheme, setAccent, setAnimations } = useThemeStore();

  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: serverSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: userApi.getSettings,
  });

  const saveSettings = useMutation({
    mutationFn: (patch: Record<string, unknown>) => userApi.updateSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
    onError: (e) => toast.error(apiError(e, "Could not save setting")),
  });

  const profile = useMutation({
    mutationFn: () => userApi.update({ username, bio }),
    onSuccess: (u) => {
      setUser(u);
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(apiError(e, "Update failed")),
  });

  const requestVerification = useMutation({
    mutationFn: authApi.requestVerification,
    onSuccess: (r) => {
      if (r.dev_token) {
        window.open(`/verify-email?token=${r.dev_token}`, "_blank");
      } else {
        toast.success(r.message);
      }
    },
    onError: (e) => toast.error(apiError(e, "Could not send verification")),
  });

  const password = useMutation({
    mutationFn: () => userApi.changePassword({ old_password: oldPw, new_password: newPw }),
    onSuccess: () => {
      toast.success("Password changed — please sign in again.");
      setTimeout(logout, 1200);
    },
    onError: (e) => toast.error(apiError(e, "Could not change password")),
  });

  const del = useMutation({
    mutationFn: () => userApi.deleteAccount(),
    onSuccess: () => {
      qc.clear();
      logout();
    },
    onError: (e) => toast.error(apiError(e, "Could not delete account")),
  });

  const exportData = async () => {
    setExporting(true);
    try {
      const [me, settings, chats] = await Promise.all([
        userApi.me(),
        userApi.getSettings(),
        historyApi.list(),
      ]);
      const details = await Promise.all(chats.map((c) => historyApi.get(c.id)));
      downloadJson(
        { exported_at: new Date().toISOString(), profile: me, settings, history: details },
        `stegochat-export-${new Date().toISOString().slice(0, 10)}.json`,
      );
      toast.success("Your data has been exported");
    } catch (e) {
      toast.error(apiError(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Manage your vault, appearance and security." />

      <div className="space-y-6">
        {/* Appearance */}
        <Section icon={Palette} title="Appearance">
          <div>
            <label className="label">Theme</label>
            <div className="flex gap-2">
              {themes.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTheme(t.key);
                    saveSettings.mutate({ theme: t.key });
                  }}
                  className={`btn flex-1 ${theme === t.key ? "btn-primary" : "btn-outline"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Accent</label>
            <div className="flex gap-3">
              {accents.map((a) => (
                <button
                  key={a.key}
                  onClick={() => {
                    setAccent(a.key);
                    saveSettings.mutate({ accent: a.key });
                  }}
                  className="relative h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-surface transition-all"
                  style={{
                    background: a.color,
                    // @ts-expect-error CSS var
                    "--tw-ring-color": accent === a.key ? a.color : "transparent",
                  }}
                  aria-label={a.key}
                >
                  {accent === a.key && (
                    <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5">
            <Toggle
              checked={animations}
              onChange={(v) => {
                setAnimations(v);
                saveSettings.mutate({ animations_enabled: v });
              }}
              label="Animations"
              description="Particles, transitions and motion effects."
            />
          </div>
        </Section>

        {/* Preferences */}
        <Section icon={Bell} title="Preferences">
          <Toggle
            checked={serverSettings?.notifications_enabled ?? true}
            onChange={(v) => saveSettings.mutate({ notifications_enabled: v })}
            label="Notifications"
            description="Toast alerts for new messages and completed operations."
          />
          <div className="mt-5">
            <label className="label flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Language
            </label>
            <select
              className="input"
              value={serverSettings?.language ?? "en"}
              onChange={(e) => saveSettings.mutate({ language: e.target.value })}
            >
              {languages.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </Section>

        {/* Steganography method */}
        <Section icon={Layers} title="Steganography method">
          <p className="mb-4 text-sm text-muted">
            Choose how messages are hidden inside images. The method is stored per-account and
            applied to all new embeds. Extract auto-detects the method if a match is not found.
          </p>
          <div className="space-y-2">
            {stegoMethods.map((m) => {
              const active = (serverSettings?.stego_method ?? "lsb") === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => saveSettings.mutate({ stego_method: m.key })}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-accent/50 bg-accent/10"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      active ? "border-accent bg-accent" : "border-white/30"
                    }`}
                  >
                    {active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold">{m.name}</span>
                      <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-white/50">
                        {m.capacity}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{m.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Profile */}
        <Section icon={User} title="Profile">
          <div className="mb-4 flex items-center gap-2">
            {user?.email_verified ? (
              <Chip tone="success">
                <BadgeCheck className="h-3 w-3" /> Email verified
              </Chip>
            ) : (
              <>
                <Chip tone="warning">
                  <MailWarning className="h-3 w-3" /> Email not verified
                </Chip>
                <Button
                  variant="ghost"
                  className="px-3 py-1.5 text-xs"
                  loading={requestVerification.isPending}
                  onClick={() => requestVerification.mutate()}
                >
                  Verify now
                </Button>
              </>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input opacity-60" value={user?.email ?? ""} disabled />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Bio</label>
            <textarea
              className="input min-h-[70px] resize-y"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short note about you…"
            />
          </div>
          <Button className="mt-4" loading={profile.isPending} onClick={() => profile.mutate()}>
            Save profile
          </Button>
        </Section>

        {/* Security */}
        <Section icon={ShieldCheck} title="Security">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Current password</label>
              <PasswordInput value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
            </div>
            <div>
              <label className="label">New password</label>
              <PasswordInput
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                showStrength
              />
            </div>
          </div>
          <Button
            className="mt-4"
            variant="outline"
            loading={password.isPending}
            disabled={!oldPw || !newPw}
            onClick={() => password.mutate()}
          >
            Change password
          </Button>
        </Section>

        {/* Two-factor auth */}
        <Section icon={KeyRound} title="Two-factor authentication">
          <TwoFactorSection />
        </Section>

        {/* Data */}
        <Section icon={FileJson} title="Your data">
          <p className="text-sm text-muted">
            Download a copy of your profile, settings and full history as JSON. Message contents
            stay encrypted — the export contains ciphertext previews only.
          </p>
          <Button className="mt-4" variant="outline" loading={exporting} onClick={exportData}>
            <FileJson className="h-4 w-4" /> Export my data
          </Button>
        </Section>

        {/* Danger zone */}
        <Card className="border-danger/30">
          <div className="flex items-center gap-2 text-danger">
            <Trash2 className="h-5 w-5" />
            <h3 className="font-display font-semibold">Danger zone</h3>
          </div>
          <p className="mt-2 text-sm text-muted">
            Deleting your account permanently removes your vault, history and every stego file.
            This cannot be undone.
          </p>
          <Button
            className="mt-4 !bg-danger/90 !bg-none hover:!bg-danger"
            onClick={() => setConfirmDelete(true)}
          >
            Delete my account
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate()}
        title="Delete your account?"
        description="Your vault, all conversations, history and stego files are removed permanently. There is no way back."
        confirmLabel="Delete everything"
        danger
        loading={del.isPending}
      />
    </div>
  );
}

function TwoFactorSection() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disablePw, setDisablePw] = useState("");

  const begin = useMutation({
    mutationFn: authApi.twoFactorSetup,
    onSuccess: setSetup,
    onError: (e) => toast.error(apiError(e, "Could not start 2FA setup")),
  });
  const enable = useMutation({
    mutationFn: () => authApi.twoFactorEnable(code),
    onSuccess: (r) => {
      setRecovery(r.recovery_codes);
      setSetup(null);
      setCode("");
      if (user) setUser({ ...user, totp_enabled: true });
      toast.success("Two-factor authentication enabled");
    },
    onError: (e) => toast.error(apiError(e, "Invalid code")),
  });
  const disable = useMutation({
    mutationFn: () => authApi.twoFactorDisable(disablePw),
    onSuccess: () => {
      if (user) setUser({ ...user, totp_enabled: false });
      setDisablePw("");
      setRecovery(null);
      toast.success("Two-factor authentication disabled");
    },
    onError: (e) => toast.error(apiError(e, "Could not disable 2FA")),
  });

  // Freshly-generated recovery codes — show once.
  if (recovery) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Save these <strong>recovery codes</strong> somewhere safe. Each works once if you lose
          your authenticator. They won't be shown again.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2/60 p-3 font-mono text-sm sm:grid-cols-2">
          {recovery.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () =>
              (await copyToClipboard(recovery.join("\n")))
                ? toast.success("Recovery codes copied")
                : toast.error("Could not copy")
            }
          >
            <Copy className="h-4 w-4" /> Copy codes
          </Button>
          <Button variant="ghost" onClick={() => setRecovery(null)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (user?.totp_enabled) {
    return (
      <div className="space-y-3">
        <Chip tone="success">
          <ShieldCheck className="h-3 w-3" /> Two-factor is on
        </Chip>
        <p className="text-sm text-muted">
          Your account requires an authenticator code at sign-in. To turn it off, confirm your
          password.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PasswordInput
            placeholder="Account password"
            value={disablePw}
            onChange={(e) => setDisablePw(e.target.value)}
          />
          <Button
            variant="outline"
            className="shrink-0 !border-danger/40 !text-danger"
            loading={disable.isPending}
            disabled={!disablePw}
            onClick={() => disable.mutate()}
          >
            Disable 2FA
          </Button>
        </div>
      </div>
    );
  }

  if (setup) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password),
          then enter the 6-digit code it shows.
        </p>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <QRCode value={setup.otpauth_uri} />
          <div className="text-xs text-muted">
            <p className="mb-1">Can't scan? Enter this key manually:</p>
            <code className="break-all rounded bg-surface-2/60 px-2 py-1 font-mono">
              {setup.secret}
            </code>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input tracking-[0.3em] sm:max-w-[12rem]"
            placeholder="123456"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button
            className="shrink-0"
            loading={enable.isPending}
            disabled={code.length < 6}
            onClick={() => enable.mutate()}
          >
            <Check className="h-4 w-4" /> Verify & enable
          </Button>
          <Button variant="ghost" onClick={() => setSetup(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Add a second layer of protection — an authenticator app code will be required alongside
        your password at sign-in.
      </p>
      <Button variant="outline" loading={begin.isPending} onClick={() => begin.mutate()}>
        <KeyRound className="h-4 w-4" /> Enable two-factor auth
      </Button>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Icon className="h-5 w-5 text-accent" />
          <h3 className="font-display font-semibold">{title}</h3>
        </div>
        {children}
      </Card>
    </motion.div>
  );
}
