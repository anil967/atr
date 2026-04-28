import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { Bell } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useReports } from "@/lib/atr-store";
import { STATUS_LABELS } from "@/lib/atr-types";
import { getCurrentUser } from "@/lib/auth-store";

export const Route = createFileRoute("/notifications")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getCurrentUser()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Notifications — BCET ATR" },
      { name: "description", content: "Updates on your action taken reports as they progress through review." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const reports = useReports();
  const events = reports
    .flatMap((r) =>
      r.timeline.map((t) => ({ ...t, reportId: r.id, reportTitle: r.title }))
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 25);

  return (
    <AppShell>
      <div className="p-6 lg:p-12 max-w-3xl mx-auto space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
            Inbox
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-2">
            Status changes across the multi-level approval workflow.
          </p>
        </header>

        <div className="bg-surface rounded-3xl border border-border/60 shadow-card divide-y divide-border">
          {events.map((e, i) => (
            <Link
              key={`${e.reportId}-${i}`}
              to="/atrs/$atrId"
              params={{ atrId: e.reportId }}
              className="flex items-start gap-4 p-5 hover:bg-secondary/30 transition-colors"
            >
              <div className="size-10 rounded-xl bg-growth/10 text-growth flex items-center justify-center shrink-0">
                <Bell className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{e.reportTitle}</span>{" "}
                  <span className="text-muted-foreground">moved to</span>{" "}
                  <span className="font-medium text-growth">{STATUS_LABELS[e.stage]}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {e.actor} · {format(new Date(e.at), "MMM d, yyyy h:mm a")}
                </p>
                {e.remark ? (
                  <p className="text-xs italic text-muted-foreground mt-1">"{e.remark}"</p>
                ) : null}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
                {e.reportId}
              </span>
            </Link>
          ))}
          {events.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No notifications yet.
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
