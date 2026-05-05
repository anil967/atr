import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowUpRight, PlusCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalTimeline } from "@/components/approval-timeline";
import { atrDisplayLabel } from "@/lib/atr-types";
import { getCurrentUser } from "@/lib/auth-store";
import { useReports } from "@/lib/atr-store";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getCurrentUser()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Dashboard — BCET ATR" },
      { name: "description", content: "Mentor dashboard with ATR statistics, recent reports and validation timeline." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const reports = useReports();

  const pending = reports.filter((r) =>
    ["submitted", "coordinator_review", "hod_review", "chief_mentor_review"].includes(r.status)
  ).length;
  const approved = reports.filter((r) => r.status === "approved").length;
  const rejected = reports.filter((r) => r.status === "rejected").length;
  const total = reports.length;

  const activeReport = reports.find((r) =>
    ["coordinator_review", "hod_review", "chief_mentor_review"].includes(r.status)
  );

  return (
    <AppShell>
      <div className="p-6 lg:p-12 space-y-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
              Mentor Dashboard
            </p>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight">
              Cultivating <span className="italic text-growth font-display">progress</span>
            </h1>
            <p className="text-muted-foreground mt-2 text-pretty max-w-prose">
              Welcome back. Track your action taken reports through every level of review —
              from coordinator to chief proctor.
            </p>
          </div>
          <Link
            to="/atrs/new"
            className="inline-flex items-center gap-2 bg-growth text-growth-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-95 transition shrink-0"
          >
            <PlusCircle className="size-4" />
            Create New ATR
          </Link>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          <StatCard label="Total ATRs" value={total} tone="growth" hint="All time submissions" />
          <StatCard label="Pending" value={pending} tone="accent" hint="Awaiting review" />
          <StatCard label="Approved" value={approved} hint="Closed this year" />
          <StatCard label="Returned" value={rejected} hint="Need revision" />
        </section>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-medium">Recent submissions</h2>
              <Link
                to="/atrs"
                className="text-sm font-medium text-growth border-b border-growth/20 pb-0.5 hover:border-growth"
              >
                View all
              </Link>
            </div>

            <div className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/60 bg-secondary/40">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Reference
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Academic year
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Status
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Date
                    </th>
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {reports.slice(0, 5).map((r) => (
                    <tr key={r.id} className="group hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4 font-medium tabular-nums text-sm text-muted-foreground">
                        {r.id}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-sm">{atrDisplayLabel(r)}</p>
                        <p className="text-[11px] text-muted-foreground">{r.department}</p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground tabular-nums">
                        {format(new Date(r.startDate), "MMM d, yyyy")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to="/atrs/$atrId"
                          params={{ atrId: r.id }}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-growth transition-colors"
                          aria-label={`Open ${r.id}`}
                        >
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {reports.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                        No ATRs yet.{" "}
                        <Link to="/atrs/new" className="text-growth font-medium underline">
                          Create your first one
                        </Link>
                        .
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <aside>
            {activeReport ? (
              <ApprovalTimeline
                timeline={activeReport.timeline}
                currentStatus={activeReport.status}
              />
            ) : (
              <div className="bg-growth text-growth-foreground rounded-3xl p-8 shadow-architectural">
                <h3 className="text-lg font-medium">No active reviews</h3>
                <p className="text-sm text-growth-foreground/70 mt-2">
                  When you submit an ATR, you'll see its progress through coordinator, HOD and
                  chief proctor reviews here.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
