import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { ChevronRight } from "lucide-react";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import { useReports } from "@/lib/atr-store";
import { atrDisplayLabel } from "@/lib/atr-types";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const user = getCurrentUser();
      if (!user) throw redirect({ to: "/login" });
      if (user.role !== "admin") throw redirect({ to: getHomeRouteForRole(user.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "IQAC Control Room — BCET ATR" },
      {
        name: "description",
        content: "Institutional quality audit and administrative oversight.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const reports = useReports();

  const inProgress = reports.filter((r) =>
    ["coordinator_review", "hod_review", "chief_mentor_review"].includes(r.status),
  ).length;
  const pendingAudit = reports.filter((r) =>
    ["iqac_review", "iqac_pending_scan"].includes(r.status),
  );
  const approved = reports.filter((r) => r.status === "approved").length;
  const rejected = reports.filter((r) => r.status === "rejected").length;

  const deptCounts = reports.reduce<Record<string, number>>((acc, report) => {
    acc[report.department] = (acc[report.department] ?? 0) + 1;
    return acc;
  }, {});

  const topDepartments = Object.entries(deptCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <AppShell>
      <div className="p-6 lg:p-12 space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
            IQAC Control Room
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight">
            Institutional Audit & Oversight
          </h1>
          <p className="text-muted-foreground mt-2">
            Final institutional quality audit for Balasore College of Engineering and Technology.
          </p>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="In Progress" value={inProgress} hint="Mid-stage reports" />
          <StatCard label="Pending Audit" value={pendingAudit.length} tone="accent" hint="Awaiting IQAC sign-off" />
          <StatCard label="Approved" value={approved} tone="growth" hint="Closed successfully" />
          <StatCard label="Rejected" value={rejected} hint="Returned for revisions" />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
          <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden h-fit">
            <div className="px-6 py-4 border-b border-border/60 bg-secondary/40 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Reports Awaiting Audit</h2>
              <span className="text-[10px] font-bold bg-accent/10 text-accent px-2 py-0.5 rounded-full uppercase">
                {pendingAudit.length} Pending
              </span>
            </div>
            <div className="divide-y divide-border/60">
              {pendingAudit.map((r) => (
                <Link
                  key={r.id}
                  to="/atrs/$atrId"
                  params={{ atrId: r.id }}
                  className="flex items-center justify-between gap-4 px-6 py-5 hover:bg-secondary/30 transition-colors group"
                >
                  <div>
                    <p className="font-medium text-sm group-hover:text-growth transition-colors">{atrDisplayLabel(r)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono text-muted-foreground">{r.id}</span>
                      <span className="size-1 rounded-full bg-border" />
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">{r.department}</span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Link>
              ))}
              {pendingAudit.length === 0 && (
                <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                  No reports currently awaiting IQAC audit.
                </div>
              )}
            </div>
          </section>

          <section className="bg-surface rounded-3xl border border-border/60 shadow-card p-6 h-fit">
            <h2 className="text-lg font-medium">Department activity</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Top departments by ATR volume.
            </p>
            <div className="space-y-3">
              {topDepartments.map(([department, count]) => (
                <div
                  key={department}
                  className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3"
                >
                  <span className="text-sm font-medium">{department}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

      </div>
    </AppShell>
  );
}
