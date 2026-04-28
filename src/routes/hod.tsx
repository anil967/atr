import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import { useReports } from "@/lib/atr-store";

export const Route = createFileRoute("/hod")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const user = getCurrentUser();
      if (!user) throw redirect({ to: "/login" });
      if (user.role !== "hod") throw redirect({ to: getHomeRouteForRole(user.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "HOD Review Board — BCET ATR" },
      {
        name: "description",
        content: "Department-level review board for ATR approvals and remarks.",
      },
    ],
  }),
  component: HodPage,
});

function HodPage() {
  const user = getCurrentUser();
  const reports = useReports();
  
  // Filter reports: Must be in a relevant stage AND from the HOD's department
  const myDeptReports = reports.filter(r => r.department === user?.department);
  
  const reviewItems = myDeptReports.filter((r) => r.status === "hod_review");
  const escalated = myDeptReports.filter((r) => r.status === "chief_mentor_review");
  const approved = myDeptReports.filter((r) => r.status === "approved");

  return (
    <AppShell>
      <div className="p-6 lg:p-12 space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
            Head of Department
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight">
            Department review board
          </h1>
          <p className="text-muted-foreground mt-2">
            Review coordinator-cleared ATRs before they move to chief mentor.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Awaiting HOD"
            value={reviewItems.length}
            tone="accent"
            hint="Needs your decision"
          />
          <StatCard
            label="Sent to Chief Mentor"
            value={escalated.length}
            hint="Escalated this cycle"
          />
          <StatCard
            label="Approved"
            value={approved.length}
            hint="Finalized reports"
          />
        </section>

        <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 bg-secondary/40">
            <h2 className="text-sm font-semibold">HOD Review Queue</h2>
          </div>
          <div className="divide-y divide-border/60">
            {reviewItems.map((r) => (
              <Link
                key={r.id}
                to="/atrs/$atrId"
                params={{ atrId: r.id }}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-secondary/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.id} · {r.department} · {format(new Date(r.date), "MMM d, yyyy")}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
            {reviewItems.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No ATRs are waiting in HOD review.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
