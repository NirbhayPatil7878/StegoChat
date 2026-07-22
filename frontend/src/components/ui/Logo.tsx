import { cn } from "@/lib/utils";

function textSizeClass(iconSize: number) {
  if (iconSize >= 56) return "text-3xl";
  if (iconSize >= 40) return "text-xl";
  if (iconSize >= 28) return "text-xl";
  return "text-lg";
}

export function Logo({
  size = 32,
  className,
  withText = false,
  bold = false,
}: {
  size?: number;
  className?: string;
  withText?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src="/logo-icon.png"
        alt="StegoChat logo"
        width={size}
        height={size}
        className="rounded-[22%] drop-shadow-[0_0_12px_rgb(var(--accent)/0.35)]"
      />
      {withText && (
        <span className={cn("font-display tracking-tight", bold ? "font-bold" : "font-semibold", textSizeClass(size))}>
          stego<span className="gradient-text">chat</span>
        </span>
      )}
    </div>
  );
}
