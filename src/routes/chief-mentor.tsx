import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { Users, Check, AlertCircle, Save, Search, LayoutDashboard, UserPlus, Filter, FileCheck, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import { useReports } from "@/lib/atr-store";
import { getAllUsersByRoleFn, getMentorMappingsFn, saveMentorMappingFn } from "@/lib/auth-server";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chief-mentor")({
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
      { title: "Institutional Governance — BCET" },
    ],
  }),
  component: ChiefMentorPage,
});

function MentorAssignments() {
  const [mentors, setMentors] = useState<any[]>([]);
  const [coordinators, setCoordinators] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      try {
        const [m, c, map] = await Promise.all([
          getAllUsersByRoleFn({ data: { role: "mentor" } }),
          getAllUsersByRoleFn({ data: { role: "coordinator" } }),
          getMentorMappingsFn(),
        ]);
        setMentors(m || []);
        setCoordinators(c || []);
        const mObj: Record<string, string> = {};
        (map || []).forEach((item: any) => {
          mObj[item.mentorId] = item.coordinatorId;
        });
        setMappings(mObj);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async (mentorId: string, coordinatorId: string) => {
    setSaving(mentorId);
    try {
      await saveMentorMappingFn({ data: { mentorId, coordinatorId } });
      setMappings(prev => ({ ...prev, [mentorId]: coordinatorId }));
      toast.success("Assignment updated");
    } catch {
      toast.error("Failed to update assignment");
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

  if (loading) return <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">Initializing governance data...</div>;

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-surface p-4 rounded-2xl border border-border/60 shadow-sm">
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

      {/* Table */}
      <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-secondary/40 border-b border-border/60">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mentor Details</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Department</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Workflow Path (Coordinator)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredMentors.map((m) => (
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
                    <select
                      value={mappings[m.id] || ""}
                      onChange={(e) => handleSave(m.id, e.target.value)}
                      disabled={saving === m.id}
                      className="w-full max-w-[240px] bg-background border border-border/80 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-growth/20 focus:outline-none disabled:opacity-50 transition-all"
                    >
                      <option value="">Choose Coordinator...</option>
                      {coordinators.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.department})</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {filteredMentors.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                    No mentors found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ApprovalQueue() {
  const reports = useReports();
  const finalReview = reports.filter((r) => r.status === "chief_mentor_review");

  return (
    <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden h-fit">
      <div className="px-6 py-4 border-b border-border/60 bg-secondary/40 flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileCheck className="size-4 text-accent" />
          Action Required
        </h2>
        <span className="text-[10px] font-bold bg-accent/10 text-accent px-2 py-0.5 rounded-full uppercase tracking-wider">
          {finalReview.length} Pending Review
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {finalReview.map((r) => (
          <Link
            key={r.id}
            to="/atrs/$atrId"
            params={{ atrId: r.id }}
            className="flex items-center justify-between gap-4 px-6 py-5 hover:bg-secondary/30 transition-colors group"
          >
            <div className="min-w-0">
              <p className="font-medium text-sm group-hover:text-growth transition-colors">{r.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono text-muted-foreground">{r.id}</span>
                <span className="size-1 rounded-full bg-border" />
                <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">{r.department}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={r.status} />
              <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
        {finalReview.length === 0 ? (
          <div className="px-6 py-20 text-center space-y-3">
            <div className="size-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto">
              <Check className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Queue clear! No ATRs awaiting institutional sign-off.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ChiefMentorPage() {
  const [activeTab, setActiveTab] = useState<"queue" | "assignments">("queue");
  const reports = useReports();
  const finalReview = reports.filter((r) => r.status === "chief_mentor_review");
  const approved = reports.filter((r) => r.status === "approved");

  return (
    <AppShell>
      <div className="p-6 lg:p-12 space-y-10">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-growth">
              <ShieldCheck className="size-5" />
              <p className="text-[11px] uppercase tracking-[0.2em] font-bold">Institutional Governance</p>
            </div>
            <h1 className="text-4xl font-light tracking-tight">
              Institutional <span className="italic font-display text-foreground">Sign-off</span>
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm md:text-base leading-relaxed">
              Global oversight for Bhadrak Institute of Engineering & Technology. 
              Manage mentor-coordinator relationships and perform final quality audits on ATR outcomes.
            </p>
          </div>
          
          <div className="flex items-center bg-secondary/50 p-1 rounded-2xl border border-border/40 shrink-0">
            <button
              onClick={() => setActiveTab("queue")}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                activeTab === "queue" ? "bg-surface shadow-md text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutDashboard className="size-4" />
              Review Queue
            </button>
            <button
              onClick={() => setActiveTab("assignments")}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                activeTab === "assignments" ? "bg-surface shadow-md text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <UserPlus className="size-4" />
              Mentor Assignments
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatCard
            label="Institutional Queue"
            value={finalReview.length}
            tone="accent"
            hint="Awaiting final closure"
          />
          <StatCard label="Compliant Reports" value={approved.length} tone="growth" hint="Verified & Published" />
          <StatCard label="Processing Velocity" value="High" hint="Average closure < 2 days" />
        </section>

        <div className="pt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === "queue" ? <ApprovalQueue /> : <MentorAssignments />}
        </div>
      </div>
    </AppShell>
  );
}
