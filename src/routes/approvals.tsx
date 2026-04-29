import { createFileRoute, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Filter, Users, Search, Save, UserPlus, Check, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import {
  getSignupApprovalSummaryFn,
  reviewSignupFn,
  getAllUsersByRoleFn,
  saveMentorMappingFn,
  getMentorMappingsFn,
  deleteUserFn,
  type ApprovedUser,
  type PendingSignup,
} from "@/lib/auth-server";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const [roleFilter, setRoleFilter] = useState<"all" | "mentor" | "coordinator" | "hod">("all");
  const [pendingOpen, setPendingOpen] = useState(true);
  const [approvedOpen, setApprovedOpen] = useState(true);
  const [statusTab, setStatusTab] = useState<"pending" | "approved" | "rejected" | "details" | "assignments">("pending");
  const [coordinators, setCoordinators] = useState<ApprovedUser[]>([]);
  const [selectedCoordinators, setSelectedCoordinators] = useState<Record<string, string>>({});

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
      
      // Load coordinators for assignment
      const coords = await getAllUsersByRoleFn({ data: { role: "coordinator" } });
      setCoordinators(coords || []);

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
    // Filter out HODs
    let items = pendingUsers.filter(u => u.role !== "hod");
    
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
    // Filter out HODs and keep only mentors/coordinators
    let items = approvedUsers.filter(u => u.role !== "hod");

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

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to permanently remove this user? This cannot be undone.")) return;
    setActionLoadingId(userId);
    try {
      await deleteUserFn({ data: { userId } });
      toast.success("User removed from database.");
      await loadSummary();
    } catch (err) {
      toast.error("Failed to remove user.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReview = async (userId: string, action: "approve" | "reject") => {
    setActionLoadingId(userId);
    setError(null);
    try {
      // If it's a mentor and we are approving, check if we assigned a coordinator
      const role = pendingUsers.find(u => u.id === userId)?.role;
      const coordinatorId = selectedCoordinators[userId];

      await reviewSignupFn({ data: { userId, action } });

      if (action === "approve" && role === "mentor" && coordinatorId) {
        await saveMentorMappingFn({ data: { mentorId: userId, coordinatorId } });
        toast.success("Mentor approved and assigned to coordinator.");
      } else if (action === "approve") {
        toast.success("User approved successfully.");
      } else {
        toast.error("Request rejected.");
      }

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
                <option value="mentor">Mentors</option>
                <option value="coordinator">Coordinators</option>
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

        <div className="flex items-center bg-secondary/30 p-1 rounded-[1.25rem] border border-border/40 w-fit">
          <button
            onClick={() => setStatusTab("pending")}
            className={cn(
              "px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              statusTab === "pending" ? "bg-surface shadow-sm text-accent" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Pending
            <span className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px]",
              statusTab === "pending" ? "bg-accent/10" : "bg-secondary"
            )}>
              {pendingUsers.length}
            </span>
          </button>
          <button
            onClick={() => setStatusTab("approved")}
            className={cn(
              "px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              statusTab === "approved" ? "bg-surface shadow-sm text-growth" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Approved
            <span className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px]",
              statusTab === "approved" ? "bg-growth/10" : "bg-secondary"
            )}>
              {sortedApproved.length}
            </span>
          </button>
          <button
            onClick={() => setStatusTab("rejected")}
            className={cn(
              "px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              statusTab === "rejected" ? "bg-surface shadow-sm text-destructive" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Rejected
            <span className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px]",
              statusTab === "rejected" ? "bg-destructive/10" : "bg-secondary"
            )}>
              {rejectedCount}
            </span>
          </button>
          <button
            onClick={() => setStatusTab("details")}
            className={cn(
              "px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              statusTab === "details" ? "bg-surface shadow-sm text-growth" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Users
            <span className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px]",
              statusTab === "details" ? "bg-growth/10" : "bg-secondary"
            )}>
              {sortedApproved.length}
            </span>
          </button>
          <button
            onClick={() => setStatusTab("assignments")}
            className={cn(
              "px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              statusTab === "assignments" ? "bg-surface shadow-sm text-accent" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Assignments
          </button>
        </div>



        {statusTab === "pending" && (
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
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      {u.role === "mentor" && (
                        <select
                          value={selectedCoordinators[u.id] || ""}
                          onChange={(e) => setSelectedCoordinators(prev => ({ ...prev, [u.id]: e.target.value }))}
                          disabled={actionLoadingId === u.id}
                          className="px-3 py-2 rounded-xl border border-border bg-background text-xs focus:ring-2 focus:ring-growth/20 outline-none"
                        >
                          <option value="">Assign Coordinator (Optional)</option>
                          {coordinators.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.department})</option>
                          ))}
                        </select>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleReview(u.id, "approve")}
                          disabled={actionLoadingId === u.id}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-growth text-growth-foreground shadow-lg shadow-growth/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-60"
                        >
                          {u.role === "mentor" && selectedCoordinators[u.id] ? "Approve & Assign" : "Approve"}
                        </button>
                        <button
                          onClick={() => handleReview(u.id, "reject")}
                          disabled={actionLoadingId === u.id}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-destructive/15 text-destructive hover:bg-destructive/20 transition-all disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                )
              ))}
            </div>
            {error ? (
              <div className="px-6 py-3 border-t border-border/60 text-xs text-destructive">
                {error}
              </div>
            ) : null}
          </section>
        )}

        {(statusTab === "approved" || statusTab === "rejected") && (
          <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden transition-all duration-300">
            <button 
              onClick={() => setApprovedOpen(!approvedOpen)}
              className="w-full px-6 py-4 border-b border-border/60 bg-secondary/40 flex items-center justify-between hover:bg-secondary/60 transition-colors"
            >
              <h2 className="text-sm font-semibold flex items-center gap-2">
                {statusTab === "approved" ? "Approved Accounts" : "Rejected Accounts"}
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
                      {statusTab === "approved" ? "Approved At" : "Status"}
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {loading ? (
                    <tr><td colSpan={6} className="px-6 py-6 text-muted-foreground">Loading...</td></tr>
                  ) : (statusTab === "approved" ? sortedApproved : []).length === 0 && (statusTab === "rejected" ? [] : []).length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">No accounts found.</td></tr>
                  ) : (statusTab === "approved" ? sortedApproved : []).map((u) => (
                    <tr key={u.id}>
                      <td className="px-6 py-3">{u.name}</td>
                      <td className="px-6 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-6 py-3 capitalize">{u.role}</td>
                      <td className="px-6 py-3">{u.department}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {u.approvedAt ? format(new Date(u.approvedAt), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          disabled={actionLoadingId === u.id}
                          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {statusTab === "details" && (
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
                    <th className="px-6 py-3 text-xs font-semibold text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-muted-foreground">
                        Loading approved users...
                      </td>
                    </tr>
                  ) : sortedApproved.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">
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
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={actionLoadingId === u.id}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
        
        {statusTab === "assignments" && (
          <MentorAssignments coordinators={coordinators} />
        )}
      </div>
    </AppShell>
  );
}

function MentorAssignments({ coordinators }: { coordinators: ApprovedUser[] }) {
  const [mentors, setMentors] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [selectedCoordinators, setSelectedCoordinators] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [m, map] = await Promise.all([
        getAllUsersByRoleFn({ data: { role: "mentor" } }),
        getMentorMappingsFn(),
      ]);
      setMentors(m || []);
      const mObj: Record<string, string> = {};
      (map || []).forEach((item: any) => {
        mObj[item.mentor_id] = item.coordinator_id;
      });
      setMappings(mObj);
      setSelectedCoordinators(mObj);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (mentorId: string) => {
    const coordinatorId = selectedCoordinators[mentorId];
    if (!coordinatorId) {
      toast.error("Please select a coordinator first");
      return;
    }
    setSaving(mentorId);
    try {
      await saveMentorMappingFn({ data: { mentorId, coordinatorId } });
      setMappings(prev => ({ ...prev, [mentorId]: coordinatorId }));
      toast.success("Assignment saved successfully");
    } catch {
      toast.error("Failed to save assignment");
    } finally {
      setSaving(null);
    }
  };

  const filteredMentors = useMemo(() => {
    return mentors.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
      const matchesBranch = branchFilter === "all" || m.department === branchFilter;
      return matchesSearch && matchesBranch;
    });
  }, [mentors, search, branchFilter]);

  const branches = useMemo(() => {
    const b = new Set(mentors.map(m => m.department));
    return Array.from(b).sort();
  }, [mentors]);

  return (
    <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 border-b border-border/60 bg-secondary/40 flex items-center justify-between hover:bg-secondary/60 transition-colors"
      >
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="size-4 text-growth" />
          Established Mentor-Coordinator Assignments
        </h2>
        {isOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      <div className={`transition-all duration-300 ${isOpen ? "max-h-[2000px] opacity-100 p-6" : "max-h-0 opacity-0 overflow-hidden"}`}>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search mentor by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-secondary/30 border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-growth/20"
              />
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Filter className="size-4 text-muted-foreground shrink-0" />
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="flex-1 md:w-48 bg-secondary/30 border border-border/50 rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="all">All Branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-border/40 rounded-2xl">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-secondary/40 border-b border-border/60">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mentor Details</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Department</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Coordinator Assignment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <tr><td colSpan={3} className="px-6 py-12 text-center text-muted-foreground animate-pulse">Refreshing assignments...</td></tr>
                ) : filteredMentors.map((m) => (
                  <tr key={m.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-growth/10 flex items-center justify-center text-growth font-bold text-xs">
                          {m.name.charAt(0)}
                        </div>
                        <span className="font-medium">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-md bg-secondary text-[10px] font-bold uppercase tracking-wide">
                        {m.department}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedCoordinators[m.id] || ""}
                          onChange={(e) => setSelectedCoordinators(prev => ({ ...prev, [m.id]: e.target.value }))}
                          disabled={saving === m.id}
                          className="w-full max-w-[200px] bg-background border border-border/80 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-growth/20 focus:outline-none disabled:opacity-50 transition-all"
                        >
                          <option value="">Choose Coordinator...</option>
                          {coordinators.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.department})</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleSave(m.id)}
                          disabled={saving === m.id || selectedCoordinators[m.id] === mappings[m.id]}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50",
                            selectedCoordinators[m.id] === mappings[m.id]
                              ? "bg-secondary text-muted-foreground"
                              : "bg-growth text-growth-foreground shadow-lg shadow-growth/20 hover:scale-105 active:scale-95"
                          )}
                        >
                          {saving === m.id ? "..." : selectedCoordinators[m.id] === mappings[m.id] ? <Check className="size-3" /> : "Assign"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredMentors.length === 0 && !loading && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                      No mentors found to assign.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
