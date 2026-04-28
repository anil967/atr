import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Search, PlusCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { useReports } from "@/lib/atr-store";
import { STATUS_LABELS, type AtrStatus } from "@/lib/atr-types";
import { getCurrentUser } from "@/lib/auth-store";

export const Route = createFileRoute("/atrs/")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getCurrentUser()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "My ATRs — BCET ATR" },
      { name: "description", content: "Filter and search all your action taken reports by status, date and department." },
    ],
  }),
  component: AtrListPage,
});

const STATUS_OPTIONS: (AtrStatus | "all")[] = [
  "all",
  "submitted",
  "coordinator_review",
  "hod_review",
  "chief_mentor_review",
  "approved",
  "rejected",
];

function AtrListPage() {
  const reports = useReports();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AtrStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
      );
    });
  }, [reports, query, statusFilter]);

  return (
    <AppShell>
      <div className="p-6 lg:p-12 space-y-8">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
              Registry
            </p>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight">My ATRs</h1>
            <p className="text-muted-foreground mt-2">
              Filter, search and review every report you've submitted.
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

        {/* Filters */}
        <div className="bg-surface rounded-2xl border border-border/60 shadow-card p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, ID, department…"
              className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-growth/30 focus:border-growth"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap border transition-colors ${
                  statusFilter === s
                    ? "bg-growth text-growth-foreground border-growth"
                    : "bg-background text-muted-foreground border-border hover:border-growth/30"
                }`}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.map((r) => (
            <Link
              key={r.id}
              to="/atrs/$atrId"
              params={{ atrId: r.id }}
              className="group block bg-surface rounded-2xl border border-border/60 shadow-card p-6 hover:border-growth/40 hover:shadow-architectural transition-all"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      {r.id}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <h3 className="text-lg font-medium group-hover:text-growth transition-colors">
                    {r.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                    <span>📅 {format(new Date(r.startDate), "MMM d, yyyy")}</span>
                    <span>👥 {r.students.length} students</span>
                    <span>📂 {r.department}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {filtered.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-dashed border-border p-16 text-center">
              <p className="text-sm text-muted-foreground">
                No reports match your filters.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
