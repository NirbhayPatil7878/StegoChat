import { motion, HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// --- Button ---
type Variant = "primary" | "ghost" | "outline";
interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  loading?: boolean;
  children?: React.ReactNode;
}
const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  outline: "btn-outline",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", loading, disabled, children, className, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      className={cn(variantClass[variant], className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  ),
);
Button.displayName = "Button";

// --- Card ---
export function Card({
  children,
  className,
  gradient,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { gradient?: boolean }) {
  return (
    <div
      className={cn("card p-card", gradient && "gradient-border", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// --- Spinner ---
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-accent", className)} />;
}

// --- Skeleton ---
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

// --- Chip ---
export function Chip({
  children,
  tone = "accent",
  className,
}: {
  children: React.ReactNode;
  tone?: "accent" | "success" | "danger" | "warning" | "muted";
  className?: string;
}) {
  const tones: Record<string, string> = {
    accent: "bg-accent/15 text-accent",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
    warning: "bg-warning/15 text-warning",
    muted: "bg-white/5 text-muted",
  };
  return <span className={cn("chip", tones[tone], className)}>{children}</span>;
}

// --- Empty state ---
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-accent/10">
        <Icon className="h-8 w-8 text-accent" />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// --- Tooltip ---
export function Tooltip({
  label,
  side = "right",
  children,
}: {
  label: string;
  side?: "right" | "top" | "bottom";
  children: React.ReactNode;
}) {
  const pos: Record<string, string> = {
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  };
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-content opacity-0 shadow-card transition-opacity duration-150 group-hover/tip:opacity-100",
          pos[side],
        )}
      >
        {label}
      </span>
    </span>
  );
}

// --- Stat card ---
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {label}
          </p>
          <p className="mt-1.5 truncate font-display text-[clamp(1.25rem,1rem+0.7vw,1.75rem)] font-semibold">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10">
          <Icon className="h-5 w-5 text-accent" />
        </div>
      </div>
    </Card>
  );
}
