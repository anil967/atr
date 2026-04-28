interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "accent" | "growth" | "warning";
}

const TONE: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-foreground",
  accent: "text-accent",
  growth: "text-growth",
  warning: "text-warning-foreground",
};

export function StatCard({ label, value, hint, tone = "default" }: StatCardProps) {
  return (
    <div className="bg-surface p-7 rounded-3xl border border-border/60 shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
        {label}
      </p>
      <p className={`text-4xl font-light tabular-nums ${TONE[tone]}`}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground mt-3">{hint}</p> : null}
    </div>
  );
}
