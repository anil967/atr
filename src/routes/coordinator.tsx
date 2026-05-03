import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { atrDisplayLabel } from "@/lib/atr-types";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import { useReports } from "@/lib/atr-store";
import { getMentorMappingsFn } from "@/lib/auth-server";

export const Route = createFileRoute("/coordinator")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const user = getCurrentUser();
      if (!user) throw redirect({ to: "/login" });
      if (user.role !== "coordinator")
        throw redirect({ to: getHomeRouteForRole(user.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "Coordinator Console — BCET ATR" },
      {
        name: "description",
        content: "Coordinator queue and review progress for ATR submissions.",
      },
    ],
  }),
  component: CoordinatorPage,
});

function CoordinatorPage() {
  const user = getCurrentUser();
  const reports = useReports();
  const [assignedMentorIds, setAssignedMentorIds] = useState<string[]>([]);
  const [loadingMapping, setLoadingMapping] = useState(true);

  useEffect(() => {
    if (!user) return;
    getMentorMappingsFn()
      .then((mappings) => {
        const myMentors = (mappings ?? [])
          .filter((m) => m.coordinatorId === user.id)
          .map((m) => m.mentorId);
        setAssignedMentorIds(myMentors);
      })
      .finally(() => setLoadingMapping(false));
  }, [user]);

  // Reports for this coordinator: mapping table + payload coordinatorId (set at mentor submit).
  const myReports = reports.filter((r) => {
    if (!user) return false;
    if (r.coordinatorId === user.id) return true;
    return assignedMentorIds.includes(r.mentorId);
  });
  
  const inQueue = myReports.filter((r) =>
    r.status === "coordinator_review" || r.status === "submitted",
  );
  const escalated = myReports.filter((r) => r.status === "hod_review");
  const completed = myReports.filter((r) =>
    ["approved", "rejected"].includes(r.status),
  );

  return (
    <AppShell>
      <div className="p-6 lg:p-12 space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
            Coordinator Workspace
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight">
            Review and forward ATRs
          </h1>
          <p className="text-muted-foreground mt-2">
            Validate submissions, add remarks, and pass approved reports to HOD.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Pending Review"
            value={inQueue.length}
            tone="accent"
            hint="At coordinator stage"
          />
          <StatCard
            label="Forwarded to HOD"
            value={escalated.length}
            hint="Awaiting HOD review"
          />
          <StatCard
            label="Closed"
            value={completed.length}
            hint="Approved or returned"
          />
        </section>

        <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 bg-secondary/40">
            <h2 className="text-sm font-semibold">Coordinator Queue</h2>
          </div>
          <div className="divide-y divide-border/60">
            {inQueue.map((r) => (
              <Link
                key={r.id}
                to="/atrs/$atrId"
                params={{ atrId: r.id }}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-secondary/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{atrDisplayLabel(r)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.id} · {r.department}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
            {inQueue.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                {loadingMapping ? "Syncing assignments..." : "No ATRs are waiting in your coordinator queue."}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
