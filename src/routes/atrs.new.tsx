import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ChangeEvent, useMemo } from "react";
import * as XLSX from "xlsx";
import { 
  ArrowLeft, Upload, FileSpreadsheet, ImagePlus, X, Check, Plus, 
  ChevronRight, ChevronLeft, CalendarDays, ClipboardList, Users as UsersIcon, 
  FileCheck, Sparkles, AlertCircle
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser, useCurrentUser } from "@/lib/auth-store";
import { createReport } from "@/lib/atr-store";
import type { AtrAttachment, ParsedStudent } from "@/lib/atr-types";
import { generateAtrPdf } from "@/lib/pdf-utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/atrs/new")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const user = getCurrentUser();
      if (!user || user.role !== "mentor") throw redirect({ to: "/login" });
    }
  },
  component: NewAtrPage,
});

type Step = "basics" | "actions" | "verification";

function NewAtrPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState<Step>("basics");
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [actions, setActions] = useState<any[]>([
    { id: crypto.randomUUID(), issue: "", studentCount: 0, actionTaken: "", timeline: "", outcome: "" }
  ]);
  const [students, setStudents] = useState<ParsedStudent[]>([]);
  const [excelName, setExcelName] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AtrAttachment[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const addActionRow = () => {
    setActions([...actions, { id: crypto.randomUUID(), issue: "", studentCount: 0, actionTaken: "", timeline: "", outcome: "" }]);
  };

  const removeActionRow = (id: string) => {
    if (actions.length > 1) {
      setActions(actions.filter(a => a.id !== id));
    }
  };

  const updateActionRow = (id: string, field: string, value: any) => {
    setActions(actions.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleExcel = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelName(file.name);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const parsed: ParsedStudent[] = data.map(row => {
          const pick = (keys: string[]) => {
            const k = Object.keys(row).find(rk => keys.some(kk => rk.toLowerCase().includes(kk.toLowerCase())));
            return k ? String(row[k]) : undefined;
          };
          return {
            name: pick(["name", "student", "full name"]) || "Unknown",
            rollNo: pick(["roll", "reg", "id", "no"]) || "N/A",
            department: pick(["dept", "branch", "stream"]),
          };
        });
        setStudents(parsed);
      } catch (err) {
        setParseError("Failed to parse Excel. Please check columns.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAttachments = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setAttachments(prev => [...prev, {
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: file.type.startsWith("image/") ? evt.target?.result as string : undefined
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const canSubmit = useMemo(() => {
    return title.trim().length > 0 && 
           actions.some(a => a.issue.trim() && a.actionTaken.trim());
  }, [title, actions]);

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const report = await createReport({
        title: title.trim(),
        startDate,
        endDate,
        mentorId: user.id,
        mentorName: user.name,
        department: user.department,
        students,
        actions: actions.filter(a => a.issue.trim() && a.actionTaken.trim()),
        attachments,
      });
      
      try {
        generateAtrPdf(report);
      } catch (err) {
        console.error("PDF gen failed", err);
      }

      navigate({ to: "/atrs/$atrId", params: { atrId: report.id } });
    } catch (err) {
      toast.error("Failed to submit ATR");
      setSubmitting(false);
    }
  };

  const StepIndicator = ({ step, current, label, icon: Icon }: { step: Step, current: Step, label: string, icon: any }) => (
    <div className={cn(
      "flex flex-col items-center gap-2 transition-all duration-300",
      current === step ? "opacity-100 scale-105" : "opacity-40"
    )}>
      <div className={cn(
        "size-10 rounded-2xl flex items-center justify-center border shadow-sm transition-colors",
        current === step ? "bg-growth text-growth-foreground border-growth" : "bg-surface text-muted-foreground border-border"
      )}>
        <Icon className="size-5" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </div>
  );

  return (
    <AppShell>
      <div className="p-6 lg:p-12 max-w-[1400px] mx-auto min-h-[calc(100vh-64px)] flex flex-col">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
          <div className="space-y-3">
            <Link to="/atrs" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-growth transition-colors mb-2">
              <ArrowLeft className="size-3" /> Back to My ATRs
            </Link>
            <h1 className="text-4xl font-light tracking-tight">
              Submit <span className="italic font-display text-growth">Session Progress</span>
            </h1>
            <p className="text-muted-foreground text-sm max-w-md">
              Complete your institutional action taken report through our guided structured workflow.
            </p>
          </div>

          {/* Stepper Navigation */}
          <div className="flex items-center gap-4 bg-surface p-4 rounded-3xl border border-border/60 shadow-sm">
            <StepIndicator step="basics" current={activeStep} label="Basics" icon={CalendarDays} />
            <div className="w-8 h-px bg-border" />
            <StepIndicator step="actions" current={activeStep} label="Action Plan" icon={ClipboardList} />
            <div className="w-8 h-px bg-border" />
            <StepIndicator step="verification" current={activeStep} label="Verification" icon={Sparkles} />
          </div>
        </div>

        {/* Form Content Area */}
        <div className="flex-1">
          {activeStep === "basics" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <section className="bg-surface rounded-3xl border border-border/60 shadow-card p-8 space-y-6">
                <div className="flex items-center gap-3 text-growth mb-2">
                  <div className="size-8 rounded-xl bg-growth/10 flex items-center justify-center">
                    <CalendarDays className="size-4" />
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-[0.15em]">Session Identification</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Session Title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Technical Review — 3rd Year CSE"
                      className="w-full px-5 py-4 bg-secondary/20 border border-border/50 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-growth/20 focus:bg-background transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Cycle Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-5 py-4 bg-secondary/20 border border-border/50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-growth/20 focus:bg-background transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Cycle End Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-5 py-4 bg-secondary/20 border border-border/50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-growth/20 focus:bg-background transition-all"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <div className="flex justify-end">
                <button
                  onClick={() => setActiveStep("actions")}
                  disabled={!title.trim()}
                  className="inline-flex items-center gap-2 bg-foreground text-background px-8 py-4 rounded-2xl font-bold hover:opacity-90 transition disabled:opacity-30 group"
                >
                  Continue to Actions
                  <ChevronRight className="size-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {activeStep === "actions" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <section className="bg-surface rounded-[2rem] border border-border/60 shadow-card overflow-hidden">
                <div className="p-8 border-b border-border/40 bg-secondary/10 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-growth">
                    <div className="size-8 rounded-xl bg-growth/10 flex items-center justify-center">
                      <ClipboardList className="size-4" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-[0.15em]">Action Taken Framework</h2>
                  </div>
                  <button
                    onClick={addActionRow}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-growth text-growth-foreground rounded-xl text-xs font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-growth/20"
                  >
                    <Plus className="size-3" /> Add Outcome
                  </button>
                </div>

                <div className="w-full">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-secondary/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="px-8 py-5 w-16 text-center">#</th>
                        <th className="px-4 py-5 w-[22%]">Issue Identified</th>
                        <th className="px-4 py-5 w-28 text-center">Qty</th>
                        <th className="px-4 py-5 w-[25%]">Action Taken</th>
                        <th className="px-4 py-5 w-40">Timeline</th>
                        <th className="px-4 py-5 w-[25%]">Outcome</th>
                        <th className="px-8 py-5 w-16 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {actions.map((row, idx) => (
                        <tr key={row.id} className="group hover:bg-secondary/10 transition-colors">
                          <td className="px-8 py-8 text-center text-xs text-muted-foreground font-mono">{idx + 1}</td>
                          <td className="px-2 py-6">
                            <textarea
                              value={row.issue}
                              onChange={(e) => updateActionRow(row.id, "issue", e.target.value)}
                              rows={2}
                              className="w-full px-4 py-3 bg-secondary/20 border-transparent border focus:border-growth focus:bg-background focus:outline-none rounded-xl text-sm transition-all resize-none"
                              placeholder="Detail the issue..."
                            />
                          </td>
                          <td className="px-2 py-4">
                            <div className="flex justify-center">
                              <input
                                type="number"
                                value={row.studentCount}
                                onChange={(e) => updateActionRow(row.id, "studentCount", Number(e.target.value))}
                                className="w-20 px-3 py-3 bg-secondary/30 border border-border/50 focus:border-growth focus:bg-background focus:outline-none rounded-xl text-sm text-center font-bold transition-all"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-4">
                            <textarea
                              value={row.actionTaken}
                              onChange={(e) => updateActionRow(row.id, "actionTaken", e.target.value)}
                              rows={2}
                              className="w-full px-4 py-3 bg-secondary/20 border-transparent border focus:border-growth focus:bg-background focus:outline-none rounded-xl text-sm transition-all resize-none"
                              placeholder="Execution steps..."
                            />
                          </td>
                          <td className="px-2 py-4">
                            <input
                              type="text"
                              value={row.timeline}
                              onChange={(e) => updateActionRow(row.id, "timeline", e.target.value)}
                              className="w-full px-4 py-3 bg-secondary/20 border-transparent border focus:border-growth focus:bg-background focus:outline-none rounded-xl text-sm transition-all"
                              placeholder="e.g. Day 1"
                            />
                          </td>
                          <td className="px-2 py-4">
                            <textarea
                              value={row.outcome}
                              onChange={(e) => updateActionRow(row.id, "outcome", e.target.value)}
                              rows={2}
                              className="w-full px-4 py-3 bg-secondary/20 border-transparent border focus:border-growth focus:bg-background focus:outline-none rounded-xl text-sm transition-all resize-none"
                              placeholder="Measurable results..."
                            />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => removeActionRow(row.id)}
                              disabled={actions.length === 1}
                              className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all disabled:pointer-events-none"
                            >
                              <X className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="flex justify-between items-center">
                <button
                  onClick={() => setActiveStep("basics")}
                  className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors px-6 py-4"
                >
                  <ChevronLeft className="size-5" />
                  Back to Basics
                </button>
                <button
                  onClick={() => setActiveStep("verification")}
                  disabled={!actions.some(a => a.issue.trim())}
                  className="inline-flex items-center gap-2 bg-foreground text-background px-8 py-4 rounded-2xl font-bold hover:opacity-90 transition disabled:opacity-30 group"
                >
                  Verification Data
                  <ChevronRight className="size-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {activeStep === "verification" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Excel Section */}
                <section className="bg-surface rounded-[2rem] border border-border/60 shadow-card p-8 flex flex-col">
                  <div className="flex items-center gap-3 text-growth mb-6">
                    <div className="size-8 rounded-xl bg-growth/10 flex items-center justify-center">
                      <UsersIcon className="size-4" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-[0.15em]">Student Attendance</h2>
                  </div>
                  
                  <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl p-10 text-center group hover:border-growth/50 hover:bg-growth/5 transition-all cursor-pointer relative overflow-hidden">
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcel} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <div className="size-16 rounded-full bg-secondary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="size-8 text-muted-foreground group-hover:text-growth" />
                    </div>
                    {excelName ? (
                      <div>
                        <p className="text-sm font-bold text-growth">{excelName}</p>
                        <p className="text-xs text-muted-foreground mt-1">{students.length} students synchronized</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-bold">Import Attendance Sheet</p>
                        <p className="text-xs text-muted-foreground mt-2 max-w-[200px]">Drag & drop or click to upload the .xlsx file</p>
                      </>
                    )}
                  </div>
                </section>

                {/* Evidence Section */}
                <section className="bg-surface rounded-[2rem] border border-border/60 shadow-card p-8">
                  <div className="flex items-center gap-3 text-growth mb-6">
                    <div className="size-8 rounded-xl bg-growth/10 flex items-center justify-center">
                      <ImagePlus className="size-4" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-[0.15em]">Supporting Evidence</h2>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="aspect-square rounded-3xl border-2 border-dashed border-border flex flex-col items-center justify-center text-center hover:border-growth/50 hover:bg-growth/5 transition-all cursor-pointer group">
                      <input type="file" multiple onChange={handleAttachments} className="hidden" />
                      <Plus className="size-6 text-muted-foreground group-hover:text-growth mb-2" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Add Files</span>
                    </label>
                    {attachments.map((a, i) => (
                      <div key={i} className="aspect-square rounded-3xl border border-border overflow-hidden relative group shadow-sm">
                        {a.dataUrl ? (
                          <img src={a.dataUrl} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-secondary flex items-center justify-center text-muted-foreground">
                             <FileCheck className="size-8" />
                          </div>
                        )}
                        <button onClick={() => removeAttachment(i)} className="absolute top-2 right-2 size-7 rounded-full bg-destructive/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="size-3.5" />
                        </button>
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-surface/90 backdrop-blur-sm border-t border-border">
                          <p className="text-[9px] font-bold truncate">{a.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Submit Final */}
              <div className="flex justify-between items-center pt-8 border-t border-border/40">
                <button
                  onClick={() => setActiveStep("actions")}
                  className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors px-6 py-4"
                >
                  <ChevronLeft className="size-5" />
                  Review Actions
                </button>
                <div className="flex items-center gap-6">
                   <div className="hidden md:flex flex-col items-end">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Ready to go?</p>
                      <p className="text-[10px] text-muted-foreground">Routes to coordinator upon submission</p>
                   </div>
                   <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitting}
                    className="inline-flex items-center gap-3 bg-growth text-growth-foreground px-12 py-5 rounded-[2rem] font-bold hover:scale-105 active:scale-95 transition-all shadow-xl shadow-growth/30 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    {submitting ? "Processing..." : "Submit Institutional ATR"}
                    <Sparkles className="size-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
