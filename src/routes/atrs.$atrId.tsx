import { createFileRoute, Link, redirect, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Clock, Users, Paperclip, FileDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalTimeline } from "@/components/approval-timeline";
import { getReport } from "@/lib/atr-store";
import { getCurrentUser } from "@/lib/auth-store";
import { generateAtrPdf } from "@/lib/pdf-utils";
import { reviewReport } from "@/lib/atr-store";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/atrs/$atrId")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getCurrentUser()) {
      throw redirect({ to: "/login" });
    }
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.atrId} — BCET ATR` },
      { name: "description", content: `Action taken report ${params.atrId} with full validation timeline.` },
    ],
  }),
  component: AtrDetailPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="p-12 text-center">
        <h1 className="text-2xl font-medium">Report not found</h1>
        <Link to="/atrs" className="text-growth underline mt-4 inline-block">
          Back to my ATRs
        </Link>
      </div>
    </AppShell>
  ),
});

function AtrDetailPage() {
  const navigate = useNavigate();
  const { atrId } = Route.useParams();
  const user = getCurrentUser();
  const report = getReport(atrId);

  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);

  if (!report) throw notFound();

  const isReviewer = 
    (user?.role === "coordinator" && (report.status === "submitted" || report.status === "coordinator_review")) ||
    (user?.role === "hod" && report.status === "hod_review") ||
    (user?.role === "chief_mentor" && report.status === "chief_mentor_review");

  const handleAction = async (action: "approve" | "reject") => {
    if (!user) return;
    setLoading(true);
    try {
      await reviewReport(report.id, action, remark);
      toast.success(action === "approve" ? "Report approved and forwarded." : "Report rejected.");
      setRemark("");
    } catch (err) {
      toast.error("Action failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="p-6 lg:p-12 max-w-6xl mx-auto space-y-8">
        <Link
          to="/atrs"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-growth transition-colors"
        >
          <ArrowLeft className="size-4" /> Back to my ATRs
        </Link>

        {isReviewer && (
          <section className="bg-surface border-2 border-growth/20 rounded-[2rem] p-8 shadow-xl shadow-growth/5 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-growth font-bold text-[10px] uppercase tracking-widest mb-1">
                  <Clock className="size-3" /> Action Required
                </div>
                <h2 className="text-2xl font-light tracking-tight">Perform <span className="italic font-display text-growth">Validation</span> Audit</h2>
                <p className="text-sm text-muted-foreground">Review report data, add institutional remarks, and finalize status.</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleAction("reject")}
                  disabled={loading}
                  className="px-6 py-3 rounded-2xl text-sm font-bold bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <XCircle className="size-4" /> Reject
                </button>
                <button
                  onClick={() => handleAction("approve")}
                  disabled={loading}
                  className="px-8 py-3 rounded-2xl text-sm font-bold bg-growth text-growth-foreground hover:scale-105 active:scale-95 transition-all shadow-lg shadow-growth/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                  Approve & Forward
                </button>
              </div>
            </div>

            <div className="mt-6 relative">
              <MessageSquare className="absolute left-4 top-4 size-4 text-muted-foreground" />
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Add your review remarks or feedback here..."
                className="w-full pl-11 pr-4 py-4 bg-secondary/20 border border-border/50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-growth/20 transition-all min-h-[100px] resize-none"
              />
            </div>
          </section>
        )}

        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {report.id}
              </span>
              <StatusBadge status={report.status} />
            </div>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight">{report.title}</h1>
            <p className="text-muted-foreground mt-2">
              Submitted by {report.mentorName} · {report.department}
            </p>
          </div>
          <button
            onClick={async () => await generateAtrPdf(report)}
            className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary/80 transition-colors shrink-0"
          >
            <FileDown className="size-4" />
            Download PDF
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Meta */}
            <section className="bg-surface rounded-3xl border border-border/60 shadow-card p-7 grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <Calendar className="size-4 text-growth mb-2" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Start Date
                </p>
                <p className="text-sm font-medium mt-1">
                  {format(new Date(report.startDate), "MMM d, yyyy")}
                </p>
              </div>
              <div>
                <Calendar className="size-4 text-growth mb-2" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  End Date
                </p>
                <p className="text-sm font-medium mt-1">
                  {format(new Date(report.endDate), "MMM d, yyyy")}
                </p>
              </div>
              <div>
                <Users className="size-4 text-growth mb-2" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Students
                </p>
                <p className="text-sm font-medium mt-1">{report.students.length}</p>
              </div>
              <div>
                <Paperclip className="size-4 text-growth mb-2" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Attachments
                </p>
                <p className="text-sm font-medium mt-1">{report.attachments.length}</p>
              </div>
            </section>

            {/* Action Taken Table */}
            <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden">
              <div className="p-7 pb-4">
                <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Action Taken Summary
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[800px]">
                  <thead className="bg-secondary/40">
                    <tr>
                      <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-12 text-center">Sl.</th>
                      <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Issue Identified</th>
                      <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-24">No. of Students</th>
                      <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Action Taken</th>
                      <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Timeline</th>
                      <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.actions?.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-7 py-4 text-center text-xs text-muted-foreground font-mono">{idx + 1}</td>
                        <td className="px-7 py-4 font-medium">{row.issue}</td>
                        <td className="px-7 py-4 text-center">{row.studentCount}</td>
                        <td className="px-7 py-4">{row.actionTaken}</td>
                        <td className="px-7 py-4 whitespace-nowrap">{row.timeline}</td>
                        <td className="px-7 py-4 text-growth font-medium">{row.outcome}</td>
                      </tr>
                    ))}
                    {(!report.actions || report.actions.length === 0) && (
                      <tr>
                        <td colSpan={6} className="px-7 py-8 text-center text-muted-foreground">No action items recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Students */}
            <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden">
              <div className="p-7 pb-4">
                <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Attending students
                </h2>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/40">
                  <tr>
                    <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      #
                    </th>
                    <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Name
                    </th>
                    <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Roll No
                    </th>
                    <th className="px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Department
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.students.map((s, i) => (
                    <tr key={`${s.rollNo}-${i}`}>
                      <td className="px-7 py-3 text-xs text-muted-foreground tabular-nums">
                        {i + 1}
                      </td>
                      <td className="px-7 py-3">{s.name}</td>
                      <td className="px-7 py-3 font-mono text-xs">{s.rollNo}</td>
                      <td className="px-7 py-3 text-xs text-muted-foreground">
                        {s.department ?? report.department}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Attachments */}
            {report.attachments.length > 0 ? (
              <section className="bg-surface rounded-3xl border border-border/60 shadow-card p-7">
                <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4">
                  Attachments
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {report.attachments.map((a, i) => (
                    <div
                      key={`${a.name}-${i}`}
                      className="rounded-xl border border-border overflow-hidden bg-secondary/30"
                    >
                      {a.dataUrl ? (
                        <img src={a.dataUrl} alt={a.name} className="w-full h-32 object-cover" />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center text-muted-foreground">
                          <Paperclip className="size-8" />
                        </div>
                      )}
                      <div className="p-2.5 bg-surface">
                        <p className="text-[11px] font-medium truncate">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(a.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-6">
            <ApprovalTimeline timeline={report.timeline} />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
