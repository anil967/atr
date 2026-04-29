import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type ChangeEvent, useMemo } from "react";
import * as XLSX from "xlsx";
import { 
  ArrowLeft, Upload, FileSpreadsheet, ImagePlus, X, Check, Plus, 
  ChevronRight, ChevronLeft, CalendarDays, ClipboardList, Users as UsersIcon, 
  FileCheck, Sparkles, AlertCircle, Paperclip
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
  const [activeStep, setActiveStep] = useState<"basics" | "actions" | "verification">("basics");
  const [submitting, setSubmitting] = useState(false);
  
  const [modal, setModal] = useState({
    isOpen: false,
    rowId: "",
    field: "",
    value: "",
    label: ""
  });

  const openModal = (rowId: string, field: string, value: string, label: string) => {
    setModal({ isOpen: true, rowId, field, value, label });
  };

  const closeModal = () => setModal(m => ({ ...m, isOpen: false }));
  
  const saveModal = () => {
    updateActionRow(modal.rowId, modal.field, modal.value);
    closeModal();
  };

  // Form State
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [actions, setActions] = useState<any[]>([
    { id: crypto.randomUUID(), issue: "", studentCount: 0, actionTaken: "", timeline: "", outcome: "" }
  ]);
  const [students, setStudents] = useState<ParsedStudent[]>([]);
  const [description, setDescription] = useState("");
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
    setActions(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  // Load students for this mentor
  useEffect(() => {
    if (user?.id) {
      import("@/lib/auth-server").then(({ getStudentsFn }) => {
        getStudentsFn({ data: { mentorId: user.id } }).then(remoteStudents => {
          if (remoteStudents && Array.isArray(remoteStudents)) {
            setStudents(remoteStudents);
          }
        });
      });
    }
  }, [user?.id]);

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

  const handleRowFileUpload = (rowId: string, e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setActions(prev => prev.map(a => {
          if (a.id === rowId) {
            const currentFiles = a.evidenceFiles || [];
            return {
              ...a,
              evidenceFiles: [...currentFiles, {
                name: file.name,
                size: file.size,
                type: file.type,
                dataUrl: file.type.startsWith("image/") ? evt.target?.result as string : undefined
              }]
            };
          }
          return a;
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeRowFile = (rowId: string, fileIdx: number) => {
    setActions(prev => prev.map(a => {
      if (a.id === rowId) {
        return {
          ...a,
          evidenceFiles: (a.evidenceFiles || []).filter((_, i) => i !== fileIdx)
        };
      }
      return a;
    }));
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

  const wordCount = useMemo(() => {
    return description.trim() ? description.trim().split(/\s+/).length : 0;
  }, [description]);

  const canSubmit = useMemo(() => {
    return title.trim().length > 0 && 
           wordCount <= 250 &&
           actions.some(a => a.issue.trim() && a.actionTaken.trim());
  }, [title, actions, wordCount]);

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
        description: description.trim(),
      });
      
      try {
        await generateAtrPdf(report);
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

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">Report Description</label>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest",
                        wordCount > 250 ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {wordCount} / 250 Words
                      </span>
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Summarize the overall progress and objectives of this session..."
                      rows={4}
                      className={cn(
                        "w-full px-5 py-4 bg-secondary/20 border rounded-2xl text-base focus:outline-none focus:ring-2 focus:bg-background transition-all resize-none",
                        wordCount > 250 ? "border-destructive focus:ring-destructive/20" : "border-border/50 focus:ring-growth/20"
                      )}
                    />
                    {wordCount > 250 && (
                      <p className="mt-2 text-xs text-destructive flex items-center gap-1.5 font-medium">
                        <AlertCircle className="size-3.5" />
                        Please keep the description within 250 words.
                      </p>
                    )}
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

                <div className="overflow-x-auto pb-6">
                <table className="w-full border-collapse table-fixed min-w-[1200px]">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="py-5 w-16 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">#</th>
                      <th className="px-4 py-5 w-[20%] text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Issue Identified</th>
                      <th className="px-4 py-5 w-32 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No. of Students</th>
                      <th className="px-4 py-5 w-[20%] text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Action Taken</th>
                      <th className="px-4 py-5 w-32 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Timeline</th>
                      <th className="px-4 py-5 w-[20%] text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Outcome</th>
                      <th className="px-4 py-5 w-[20%] text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Evidence</th>
                      <th className="py-5 w-16 text-center"></th>
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-border/40">
                      {actions.map((row, idx) => (
                        <tr key={row.id} className="group hover:bg-secondary/10 transition-colors">
                          <td className="py-4 text-center">
                            <span className="text-xs font-bold text-growth tabular-nums">{idx + 1}</span>
                          </td>
                          <td className="px-4 py-4">
                            <div
                              onClick={() => openModal(row.id, "issue", row.issue, "Issue Identified")}
                              className="w-full px-4 py-3 bg-secondary/20 border-transparent border hover:border-growth/40 hover:bg-secondary/30 cursor-pointer rounded-xl text-sm transition-all min-h-[80px] overflow-hidden line-clamp-3"
                            >
                              {row.issue || <span className="text-muted-foreground/50">Detail the issue...</span>}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={students.length}
                                value={row.studentCount}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  const max = students.length;
                                  if (val > max) {
                                    toast.error(`Limit exceeded: Group only has ${max} students`);
                                    updateActionRow(row.id, "studentCount", max);
                                  } else {
                                    updateActionRow(row.id, "studentCount", Math.max(0, val));
                                  }
                                }}
                                className="w-20 px-2 py-3 bg-secondary/30 border border-border/50 focus:border-growth focus:bg-background focus:outline-none rounded-xl text-sm text-center font-bold transition-all"
                              />
                              <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter">Max: {students.length}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div
                              onClick={() => openModal(row.id, "actionTaken", row.actionTaken, "Action Taken")}
                              className="w-full px-4 py-3 bg-secondary/20 border-transparent border hover:border-growth/40 hover:bg-secondary/30 cursor-pointer rounded-xl text-sm transition-all min-h-[80px] overflow-hidden line-clamp-3"
                            >
                              {row.actionTaken || <span className="text-muted-foreground/50">Execution steps...</span>}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <input
                              type="text"
                              value={row.timeline}
                              onChange={(e) => updateActionRow(row.id, "timeline", e.target.value)}
                              className="w-full px-4 py-3 bg-secondary/20 border-transparent border focus:border-growth focus:bg-background focus:outline-none rounded-xl text-sm transition-all"
                              placeholder="e.g. Day 1"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div
                              onClick={() => openModal(row.id, "outcome", row.outcome, "Outcome")}
                              className="w-full px-4 py-3 bg-secondary/20 border-transparent border hover:border-growth/40 hover:bg-secondary/30 cursor-pointer rounded-xl text-sm transition-all min-h-[80px] overflow-hidden line-clamp-3"
                            >
                              {row.outcome || <span className="text-muted-foreground/50">Measurable results...</span>}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1.5">
                              {(row.evidenceFiles || []).map((file, fIdx) => (
                                <div key={fIdx} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-growth/5 border-growth/10 border rounded-lg group/file">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <FileCheck className="size-2.5 text-growth shrink-0" />
                                    <span className="text-[8px] font-bold truncate text-growth/80">{file.name}</span>
                                  </div>
                                  <button
                                    onClick={() => removeRowFile(row.id, fIdx)}
                                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0 opacity-0 group-hover/file:opacity-100"
                                  >
                                    <X className="size-2.5" />
                                  </button>
                                </div>
                              ))}
                              
                              <label className="flex items-center justify-center gap-2 px-3 py-2 bg-secondary/10 border-border/40 border-dashed border hover:border-growth/50 hover:bg-growth/5 cursor-pointer rounded-lg text-[9px] font-bold uppercase transition-all mt-1">
                                <Plus className="size-2.5 text-muted-foreground" />
                                <span>Add Evidence</span>
                                <input
                                  type="file"
                                  multiple
                                  accept=".pdf,.doc,.docx,image/*"
                                  onChange={(e) => handleRowFileUpload(row.id, e)}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          </td>
                          <td className="py-4 text-center">
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

      {/* Text Entry Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={closeModal} />
          <div className="relative w-full max-w-2xl bg-surface border border-border shadow-2xl rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            <header className="px-8 py-6 border-b border-border/60 flex items-center justify-between bg-secondary/20">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Editing Field</p>
                <h3 className="text-xl font-medium">{modal.label}</h3>
              </div>
              <button onClick={closeModal} className="size-10 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
                <X className="size-5" />
              </button>
            </header>
            
            <div className="p-8">
              <textarea
                autoFocus
                value={modal.value}
                onChange={(e) => setModal(m => ({ ...m, value: e.target.value }))}
                className="w-full h-64 bg-secondary/30 border border-border focus:border-growth focus:bg-background focus:outline-none rounded-2xl p-6 text-base transition-all resize-none leading-relaxed"
                placeholder={`Type your ${modal.label.toLowerCase()} here...`}
              />
            </div>

            <footer className="px-8 py-6 bg-secondary/10 border-t border-border/60 flex items-center justify-end gap-4">
              <button 
                onClick={closeModal}
                className="px-6 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveModal}
                className="bg-foreground text-background px-8 py-3 rounded-xl font-bold hover:opacity-90 transition shadow-lg shadow-foreground/10"
              >
                Confirm Changes
              </button>
            </footer>
          </div>
        </div>
      )}
    </AppShell>
  );
}
