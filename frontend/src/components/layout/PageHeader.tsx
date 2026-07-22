export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-[clamp(1.25rem,3vh,2rem)] flex flex-wrap items-end justify-between gap-fluid">
      <div className="min-w-0">
        <h1 className="font-display text-[clamp(1.4rem,1.1rem+0.9vw,2rem)] font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
