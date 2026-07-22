import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  Database,
  Link2,
  Lock,
  MessagesSquare,
  ShieldCheck,
  Unlock,
  WandSparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dashboardApi } from "@/api/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, EmptyState, Skeleton, StatCard } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { formatBytes, timeAgo } from "@/lib/utils";
import type { ActivityItem } from "@/types";

const ACTION_LABEL: Record<string, string> = {
  embed: "Hid a message in an image",
  extract: "Revealed a hidden message",
  login: "Signed in",
  register: "Created the vault",
  password_change: "Changed password",
  share_create: "Created a share link",
};

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <li className="flex items-start gap-3 rounded-xl px-3 py-2.5 odd:bg-white/[0.02]">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/10">
        <Activity className="h-3.5 w-3.5 text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{ACTION_LABEL[item.action] ?? item.action}</p>
        {item.detail && <p className="truncate text-xs text-muted">{item.detail}</p>}
      </div>
      <span className="shrink-0 text-xs text-muted">{timeAgo(item.created_at)}</span>
    </li>
  );
}

function SecurityScore({ score }: { score: number }) {
  const tone =
    score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-danger";
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <Card className="flex items-center gap-5">
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-border" />
          <motion.circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            className={`stroke-current ${tone}`}
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - score / 100) }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        <span className={`absolute inset-0 grid place-items-center font-display text-lg font-semibold ${tone}`}>
          {score}
        </span>
      </div>
      <div>
        <p className="flex items-center gap-1.5 font-display font-semibold">
          <ShieldCheck className="h-4 w-4 text-accent" /> Security score
        </p>
        <p className="mt-1 text-sm text-muted">
          Based on your password strength, email verification and recent activity.
        </p>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: dashboardApi.get,
  });

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Your vault at a glance." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );
  }

  const { stats, recent_activity, embeds_over_time } = data;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.username ?? "agent"}`}
        subtitle="Your vault at a glance — activity, storage and security posture."
      />

      <div className="grid gap-fluid [grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
        <StatCard icon={Lock} label="Messages hidden" value={stats.total_embeds} hint="Total embeds" />
        <StatCard icon={Unlock} label="Messages revealed" value={stats.total_extracts} hint="Total extractions" />
        <StatCard
          icon={MessagesSquare}
          label="Conversations"
          value={stats.total_chats}
          hint={`${stats.total_messages} messages total`}
        />
        <StatCard
          icon={Database}
          label="Storage used"
          value={formatBytes(stats.storage_bytes)}
          hint={`${stats.storage_files} stego files`}
        />
      </div>

      <div className="mt-fluid grid gap-fluid lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-semibold">Embeds over time</h3>
            <Link to="/app/studio">
              <Button variant="ghost" className="px-3 py-1.5 text-xs">
                <WandSparkles className="h-3.5 w-3.5" /> Open Studio
              </Button>
            </Link>
          </div>
          {embeds_over_time.some((d) => d.count > 0) ? (
            <div className="h-[clamp(11rem,26vh,20rem)]">
              <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={embeds_over_time}>
                <defs>
                  <linearGradient id="embedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "rgb(var(--muted))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  width={28}
                  tick={{ fill: "rgb(var(--muted))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  contentStyle={{
                    background: "rgb(var(--surface))",
                    border: "1px solid rgb(var(--border))",
                    borderRadius: 12,
                    color: "rgb(var(--content))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="rgb(var(--accent))"
                  strokeWidth={2}
                  fill="url(#embedFill)"
                />
              </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={Lock}
              title="Nothing hidden yet"
              description="Embed your first secret and this chart comes alive."
              action={
                <Link to="/app/studio">
                  <Button>
                    <WandSparkles className="h-4 w-4" /> Hide a message
                  </Button>
                </Link>
              }
            />
          )}
        </Card>

        <div className="space-y-fluid">
          <SecurityScore score={stats.security_score} />
          <Link to="/app/tokens">
            <Card className="flex items-center gap-4 transition-colors hover:border-accent/40">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10">
                <Link2 className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-display text-2xl font-semibold">{stats.active_share_tokens}</p>
                <p className="text-sm text-muted">Active share links</p>
              </div>
            </Card>
          </Link>
        </div>
      </div>

      <Card className="mt-fluid">
        <h3 className="mb-3 font-display font-semibold">Recent activity</h3>
        {recent_activity.length ? (
          <ul>
            {recent_activity.map((a) => (
              <ActivityRow key={a.id} item={a} />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted">
            No activity yet — start a chat or hide a message.
          </p>
        )}
      </Card>
    </div>
  );
}
