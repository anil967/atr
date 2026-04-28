import { createFileRoute, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Filter, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import {
  getSignupApprovalSummaryFn,
  reviewSignupFn,
  type ApprovedUser,
  type PendingSignup,
} from "@/lib/auth-server";

type BranchSort = "branch_asc" | "branch_desc" | "requested_newest";

export const Route = createFileRoute("/approvals")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const user = getCurrentUser();
      if (!user) throw redirect({ to: "/login" });
      if (user.role !== "chief_mentor")
        throw redirect({ to: getHomeRouteForRole(user.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "Approvals — BCET ATR" },
      {
        name: "description",
        content:
          "Chief Proctor approval panel for mentor/coordinator signup requests.",
      },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const [pendingUsers, setPendingUsers] = useState<PendingSignup[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [approvedMentors, setApprovedMentors] = useState(0);
  const [approvedCoordinators, setApprovedCoordinators] = useState(0);
  const [sortBy, setSortBy] = useState<BranchSort>("branch_asc");
  const [roleFilter, setRoleFilter] = useState<"all" | "mentor" | "coordinator">("all");
  const [pendingOpen, setPendingOpen] = useState(true);
  const [approvedOpen, setApprovedOpen] = useState(true);

  // Retry with backoff — Cloudflare Workers cold-start can cause silent
  // timeouts on the first request. Retry up to 3 times before showing error.
  const loadSummary = async (attempt = 1) => {
    if (attempt === 1) {
      setLoading(true);
      setError(null);
    }
    try {
      const summary = await getSignupApprovalSummaryFn();
      if (!summary) throw new Error("Server returned no data");
      setPendingUsers(summary.pendingRequests || []);
      setApprovedUsers(summary.approvedUsers || []);
      setApprovedCount(summary.approved || 0);
      setRejectedCount(summary.rejected || 0);
      setApprovedMentors(summary.approvedMentors || 0);
      setApprovedCoordinators(summary.approvedCoordinators || 0);
      setError(null);
      setLoading(false);
    } catch (err) {
      if (attempt < 3) {
        // Auto-retry after 1.5s: handles Cloudflare cold-start silently
        setTimeout(() => loadSummary(attempt + 1), 1500);
        return;
      }
      setError(
        err instanceof Error ? err.message : "Failed to load approvals. Please refresh."
      );
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);


  const sortedPending = useMemo(() => {
    let items = [...pendingUsers];
    
    // Filter by Role
    if (roleFilter !== "all") {
      items = items.filter(u => u.role === roleFilter);
    }

    if (sortBy === "branch_asc") {
      items.sort((a, b) => a.department.localeCompare(b.department));
    } else if (sortBy === "branch_desc") {
      items.sort((a, b) => b.department.localeCompare(a.department));
    } else {
      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return items;
  }, [pendingUsers, sortBy, roleFilter]);

  const sortedApproved = useMemo(() => {
    let items = [...approvedUsers];

    // Filter by Role
    if (roleFilter !== "all") {
      items = items.filter(u => u.role === roleFilter);
    }

    if (sortBy === "branch_asc") {
      items.sort((a, b) => a.department.localeCompare(b.department));
    } else if (sortBy === "branch_desc") {
      items.sort((a, b) => b.department.localeCompare(a.department));
    } else {
      items.sort(
        (a, b) =>
          new Date(b.approvedAt ?? 0).getTime() - new Date(a.approvedAt ?? 0).getTime(),
      );
    }
    return items;
  }, [approvedUsers, sortBy, roleFilter]);

  const handleReview = async (userId: string, action: "approve" | "reject") => {
    setActionLoadingId(userId);
    setError(null);
    try {
      await reviewSignupFn({ data: { userId, action } });
      await loadSummary();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update approval status.",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <AppShell>
      <div className="p-6 lg:p-12 space-y-8">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
              Chief Proctor
            </p>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight">
              Signup Approvals
            </h1>
            <p className="text-muted-foreground mt-2">
              Approve or reject Mentor and Coordinator signup requests.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <div className="w-full md:w-48">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 flex items-center gap-1.5">
                <Users className="size-3" />
                Filter Role
              </label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-2 focus:ring-growth/20 outline-none transition-all"
              >
                <option value="all">All Roles</option>
                <option value="mentor">Mentors Only</option>
                <option value="coordinator">Coordinators Only</option>
              </select>
            </div>
            <div className="w-full md:w-48">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 flex items-center gap-1.5">
                <Filter className="size-3" />
                Sort Branch
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as BranchSort)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-2 focus:ring-growth/20 outline-none transition-all"
              >
                <option value="branch_asc">Branch A → Z</option>
                <option value="branch_desc">Branch Z → A</option>
                <option value="requested_newest">Requested (Newest)</option>
              </select>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Pending"
            value={pendingUsers.length}
            tone="accent"
            hint="Needs approval action"
          />
          <StatCard label="Approved" value={approvedCount} hint="Total approved users" />
          <StatCard label="Rejected" value={rejectedCount} hint="Total rejected users" />
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            label="Available Mentors"
            value={approvedMentors}
            hint="Approved mentor accounts"
          />
          <StatCard
            label="Available Coordinators"
            value={approvedCoordinators}
            hint="Approved coordinator accounts"
          />
        </section>

        <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setPendingOpen(!pendingOpen)}
            className="w-full px-6 py-4 border-b border-border/60 bg-secondary/40 flex items-center justify-between hover:bg-secondary/60 transition-colors"
          >
            <h2 className="text-sm font-semibold flex items-center gap-2">
              Pending Requests
              <span className="bg-accent/10 text-accent px-2 py-0.5 rounded-full text-[10px]">
                {sortedPending.length}
              </span>
            </h2>
            {pendingOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          </button>
          <div className={`divide-y divide-border/60 transition-all duration-300 ${pendingOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}>

            {loading ? (
              <div className="px-6 py-8 text-sm text-muted-foreground">
                Loading requests...
              </div>
            ) : sortedPending.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No pending signup requests.
              </div>
            ) : (
              sortedPending.map((u) => (
                <div
                  key={u.id}
                  className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.email} · {u.role} · {u.department}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Requested {format(new Date(u.createdAt), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReview(u.id, "approve")}
                      disabled={actionLoadingId === u.id}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-growth text-growth-foreground disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReview(u.id, "reject")}
                      disabled={actionLoadingId === u.id}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-destructive/15 text-destructive disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {error ? (
            <div className="px-6 py-3 border-t border-border/60 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </section>

        <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setApprovedOpen(!approvedOpen)}
            className="w-full px-6 py-4 border-b border-border/60 bg-secondary/40 flex items-center justify-between hover:bg-secondary/60 transition-colors"
          >
            <h2 className="text-sm font-semibold flex items-center gap-2">
              Available Mentor & Coordinator Details
              <span className="bg-growth/10 text-growth px-2 py-0.5 rounded-full text-[10px]">
                {sortedApproved.length}
              </span>
            </h2>
            {approvedOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          </button>
          <div className={`overflow-x-auto transition-all duration-300 ${approvedOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}>

            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-6 py-3 text-xs font-semibold text-muted-foreground">Name</th>
                  <th className="px-6 py-3 text-xs font-semibold text-muted-foreground">Email</th>
                  <th className="px-6 py-3 text-xs font-semibold text-muted-foreground">Role</th>
                  <th className="px-6 py-3 text-xs font-semibold text-muted-foreground">Branch</th>
                  <th className="px-6 py-3 text-xs font-semibold text-muted-foreground">
                    Approved At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-muted-foreground">
                      Loading approved users...
                    </td>
                  </tr>
                ) : sortedApproved.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                      No approved mentor/coordinator accounts yet.
                    </td>
                  </tr>
                ) : (
                  sortedApproved.map((u) => (
                    <tr key={u.id}>
                      <td className="px-6 py-3">{u.name}</td>
                      <td className="px-6 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-6 py-3 capitalize">{u.role}</td>
                      <td className="px-6 py-3">{u.department}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {u.approvedAt
                          ? format(new Date(u.approvedAt), "MMM d, yyyy h:mm a")
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
