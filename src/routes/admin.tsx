import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import { useReports } from "@/lib/atr-store";

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
      { title: "Admin Control Room — BCET ATR" },
      {
        name: "description",
        content: "Administrative oversight for ATR workflow throughput and outcomes.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const reports = useReports();

  const submitted = reports.filter((r) => r.status === "submitted").length;
  const inProgress = reports.filter((r) =>
    ["coordinator_review", "hod_review", "chief_mentor_review"].includes(r.status),
  ).length;
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
            Admin Control Room
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight">
            System-wide ATR oversight
          </h1>
          <p className="text-muted-foreground mt-2">
            Monitor throughput, bottlenecks, and completion rates across all roles.
          </p>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Submitted" value={submitted} hint="Awaiting coordinator pickup" />
          <StatCard label="In Review" value={inProgress} tone="accent" hint="Mid-stage reports" />
          <StatCard label="Approved" value={approved} tone="growth" hint="Closed successfully" />
          <StatCard label="Rejected" value={rejected} hint="Returned for revisions" />
        </section>

        <section className="bg-surface rounded-3xl border border-border/60 shadow-card p-6">
          <h2 className="text-lg font-medium">Department activity</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Top departments by ATR volume in current dataset.
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
            {topDepartments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reports available yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
