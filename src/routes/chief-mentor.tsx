import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { Users, Check, AlertCircle, Save, Search, LayoutDashboard, UserPlus, Filter, FileCheck, ShieldCheck, ChevronRight, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import { useReports } from "@/lib/atr-store";
import { getAllUsersByRoleFn, deleteAllAtrsFn } from "@/lib/auth-server";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { clearAllAtrs } from "@/lib/atr-store";

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

// MentorAssignments component removed from here and moved to approvals.tsx

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
            <div className="pt-4">
              <button
                onClick={async () => {
                  if (confirm("CRITICAL ACTION: Are you sure you want to permanently delete ALL ATR reports from the database? This cannot be undone.")) {
                    try {
                      await clearAllAtrs();
                      toast.success("Database cleared successfully.");
                      window.location.reload();
                    } catch {
                      toast.error("Failed to clear database.");
                    }
                  }
                }}
                className="text-[10px] font-bold uppercase tracking-widest text-destructive hover:text-destructive/80 transition-colors flex items-center gap-2"
              >
                <Trash2 className="size-3" />
                Clear All ATR Reports
              </button>
            </div>
          </div>
          
// Tabs removed as Assignments moved to Approvals page
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
          <ApprovalQueue />
        </div>
      </div>
    </AppShell>
  );
}
