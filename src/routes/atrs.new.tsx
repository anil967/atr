import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, type ChangeEvent, type KeyboardEvent } from "react";
import * as XLSX from "xlsx";
import { 
  ArrowLeft, Upload, FileSpreadsheet, ImagePlus, X, Plus, 
  ChevronRight, ChevronLeft, ChevronDown, CalendarDays, ClipboardList, Users as UsersIcon, 
  FileCheck, Sparkles, AlertCircle, Paperclip, FileDown,
  Search, ListChecks, Copy, Save, Trash2, GripVertical,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser, useCurrentUser } from "@/lib/auth-store";
import { createReport, MAX_ATR_PER_ACADEMIC_YEAR, useReports } from "@/lib/atr-store";
import {
  actionItemEffectiveStudentCount,
  type AtrSession,
  formatAcademicYearHuman,
  type AtrAttachment,
  type ParsedStudent,
} from "@/lib/atr-types";
import { MenteeTagField } from "@/components/mentee-tag-field";
import { ensureStudentIds, parseStudentRowsFromSheet } from "@/lib/student-excel";
import { uploadAtrFileFn } from "@/lib/auth-server";
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

const TIMELINE_MILESTONES = ["Week 1", "Mid-term", "Session end", "Ongoing"];

/**
 * Indian academic year: April → March. Stored key is 2024-2025; display is 2024 - 2025.
 * Past pairs are included for historical reports; the March-ending year cannot exceed the current calendar year.
 */

function buildAllowedAcademicYears(): { key: string; display: string }[] {
  const calY = new Date().getFullYear();
  const minStart = calY - 20;
  const maxStart = calY - 1;
  const out: { key: string; display: string }[] = [];
  for (let start = minStart; start <= maxStart; start++) {
    const end = start + 1;
    if (end > calY) continue;
    out.push({ key: `${start}-${end}`, display: `${start} - ${end}` });
  }
  return out;
}

function maybeAutocompleteAcademicYear(raw: string): string {
  const m = raw.match(/^(\d{4})\s*-\s*$/);
  if (m) {
    const y = parseInt(m[1], 10);
    return `${y} - ${y + 1}`;
  }
  const m2 = raw.match(/^(\d{4})-\s*$/);
  if (m2) {
    const y = parseInt(m2[1], 10);
    return `${y} - ${y + 1}`;
  }
  return raw;
}

function parseAcademicYearToKey(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  const m = t.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (b !== a + 1) return null;
  return `${a}-${b}`;
}

/** Session windows inside April-March academic year. */
function academicYearKeyToSessionIsoRange(
  key: string,
  session: AtrSession,
): { min: string; max: string } | null {
  const parts = key.trim().split("-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const y1 = parseInt(parts[0], 10);
  const y2 = parseInt(parts[1], 10);
  if (Number.isNaN(y1) || Number.isNaN(y2) || y2 !== y1 + 1) return null;
  if (session === "session_1") {
    return { min: `${y1}-04-01`, max: `${y1}-09-30` };
  }
  return { min: `${y1}-10-01`, max: `${y2}-03-31` };
}

function autosizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${Math.min(280, Math.max(88, el.scrollHeight))}px`;
}

/** Every mentor issue must satisfy this before Verification / Submit. */
function isIssueFullyComplete(row: {
  issue?: unknown;
  studentCount?: unknown;
  actionTaken?: unknown;
  timeline?: unknown;
  outcome?: unknown;
  evidenceFiles?: unknown;
}) {
  if (!String(row.issue ?? "").trim()) return false;
  if (!String(row.actionTaken ?? "").trim()) return false;
  if (!String(row.timeline ?? "").trim()) return false;
  if (!String(row.outcome ?? "").trim()) return false;
  if (actionItemEffectiveStudentCount(row as { studentCount: number; taggedStudents?: unknown }) < 1)
    return false;
  const ev = row.evidenceFiles;
  return Array.isArray(ev) && ev.length > 0;
}

/** Labels missing required inputs for mentor-facing alerts (order matches form importance). */
function missingIssueFieldLabels(row: {
  issue?: unknown;
  studentCount?: unknown;
  actionTaken?: unknown;
  timeline?: unknown;
  outcome?: unknown;
  evidenceFiles?: unknown;
}): string[] {
  const missing: string[] = [];
  if (!String(row.issue ?? "").trim()) missing.push("Issue identified");
  if (actionItemEffectiveStudentCount(row as { studentCount: number; taggedStudents?: unknown }) < 1)
    missing.push("Students (@ mention at least one mentee)");
  if (!String(row.actionTaken ?? "").trim()) missing.push("Action taken");
  if (!String(row.timeline ?? "").trim()) missing.push("Timeline or milestone date");
  if (!String(row.outcome ?? "").trim()) missing.push("Outcome / impact");
  const ev = row.evidenceFiles;
  if (!Array.isArray(ev) || ev.length === 0) missing.push("Supporting evidence (at least one file)");
  return missing;
}

/** One line per incomplete issue — for toasts / alerts. */
function incompleteIssuesBulletLines(actions: any[]): string[] {
  return actions
    .map((row, i) =>
      isIssueFullyComplete(row) ? null : `Issue #${i + 1}: ${missingIssueFieldLabels(row).join(" • ")}`,
    )
    .filter((line): line is string => Boolean(line));
}

/** One segment per required field → 100% only when mentor completed the whole row. */
function rowCompletionPctForIssue(row: {
  issue?: unknown;
  studentCount?: unknown;
  actionTaken?: unknown;
  timeline?: unknown;
  outcome?: unknown;
  evidenceFiles?: unknown;
}) {
  let n = 0;
  if (String(row.issue ?? "").trim()) n++;
  if (actionItemEffectiveStudentCount(row as { studentCount: number; taggedStudents?: unknown }) > 0) n++;
  if (String(row.actionTaken ?? "").trim()) n++;
  if (String(row.timeline ?? "").trim()) n++;
  if (String(row.outcome ?? "").trim()) n++;
  if (Array.isArray(row.evidenceFiles) && row.evidenceFiles.length > 0) n++;
  return Math.round((n / 6) * 100);
}

function nextAvailableSlot(usedSlots: Set<string>): { session: AtrSession; atrNo: 1 | 2 } | null {
  const order: Array<{ session: AtrSession; atrNo: 1 | 2 }> = [
    { session: "session_1", atrNo: 1 },
    { session: "session_1", atrNo: 2 },
    { session: "session_2", atrNo: 1 },
    { session: "session_2", atrNo: 2 },
  ];
  return order.find((slot) => !usedSlots.has(`${slot.session}-${slot.atrNo}`)) ?? null;
}

function NewAtrPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const mentorReports = useReports();
  const [activeStep, setActiveStep] = useState<"basics" | "actions" | "verification">("basics");
  const [submitting, setSubmitting] = useState(false);
  
  // Form State
  /** Normalized key e.g. `2024-2025` */
  const [academicYear, setAcademicYear] = useState("");
  /** Typed display e.g. `2024 - 2025` — hyphen triggers auto-complete of end year. */
  const [academicYearDraft, setAcademicYearDraft] = useState("");
  const allowedAcademicYearOptions = useMemo(() => buildAllowedAcademicYears(), []);
  const allowedAcademicYearKeySet = useMemo(
    () => new Set(allowedAcademicYearOptions.map((o) => o.key)),
    [allowedAcademicYearOptions],
  );
  const filteredAcademicYearHints = useMemo(() => {
    const t = academicYearDraft.trim();
    if (!t) return [];
    const lower = t.toLowerCase();
    const digits = t.replace(/\D/g, "");
    return allowedAcademicYearOptions.filter((o) => {
      if (o.display.toLowerCase().includes(lower)) return true;
      if (digits.length > 0) {
        const y1 = o.key.split("-")[0] ?? "";
        if (y1.startsWith(digits)) return true;
        if (o.key.replace(/-/g, "").includes(digits)) return true;
      }
      return false;
    });
  }, [academicYearDraft, allowedAcademicYearOptions]);
  const academicYearListId =
    academicYearDraft.trim().length > 0 && filteredAcademicYearHints.length > 0
      ? "bcet-academic-year-hints"
      : undefined;
  const [session, setSession] = useState<AtrSession | "">("");
  const [atrNo, setAtrNo] = useState<1 | 2 | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [students, setStudents] = useState<ParsedStudent[]>([]);
  const [description, setDescription] = useState("");
  const [excelName, setExcelName] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AtrAttachment[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const [attachmentPreview, setAttachmentPreview] = useState<{
    isOpen: boolean;
    name: string;
    mime: string;
    url: string;
  } | null>(null);

  const closeAttachmentPreview = () => {
    if (attachmentPreview?.url) URL.revokeObjectURL(attachmentPreview.url);
    setAttachmentPreview(null);
  };

  const openAttachmentPreview = (attachment: { name: string; type?: string; dataUrl?: string }) => {
    if (!attachment.dataUrl) {
      toast.error("This file cannot be previewed. Re-upload the file.");
      return;
    }
    if (attachment.dataUrl?.startsWith("http")) {
      setAttachmentPreview({
        isOpen: true,
        name: attachment.name,
        mime: attachment.type || "application/octet-stream",
        url: attachment.dataUrl,
      });
      return;
    }

    try {
      const [meta, base64] = (attachment.dataUrl || "").split(",", 2);
      const mimeFromUrl = meta?.match(/data:([^;]+);base64/i)?.[1];
      const mime = attachment.type || mimeFromUrl || "application/octet-stream";
      const binary = atob(base64 ?? "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      setAttachmentPreview({ isOpen: true, name: attachment.name, mime, url: blobUrl });
    } catch (e) {
      console.error(e);
      toast.error("Could not preview this file.");
    }
  };

  const addActionRow = () => {
    setActions([
      ...actions,
      {
        id: crypto.randomUUID(),
        issue: "",
        studentCount: 0,
        taggedStudents: [],
        actionTaken: "",
        timeline: "",
        outcome: "",
      },
    ]);
  };

  const removeActionRow = (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  };

  const duplicateActionRow = (id: string) => {
    setActions((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      if (idx < 0) return prev;
      const src = prev[idx];
      const deepFiles = (src.evidenceFiles || []).map((f: any) => ({ ...f }));
      const copy = {
        ...src,
        id: crypto.randomUUID(),
        taggedStudents: [...(src.taggedStudents || [])],
        evidenceFiles: deepFiles,
      };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };

  type FrameworkFilter = "all" | "pending" | "completed";
  const [frameworkFilter, setFrameworkFilter] = useState<FrameworkFilter>("all");
  const [frameworkSearch, setFrameworkSearch] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [evidenceDragRowId, setEvidenceDragRowId] = useState<string | null>(null);
  /** When true for an id, the issue card body is collapsed (header + progress stay visible). */
  const [collapsedIssueIds, setCollapsedIssueIds] = useState<Record<string, boolean>>({});

  /** After mentor presses Enter in a field (see handler), inline “missing” alert may show until the row is complete. */
  const [issueRequirementsRevealed, setIssueRequirementsRevealed] = useState<Record<string, boolean>>({});

  /** Inline message when Verification is clicked before all issues pass (visible even if toast is overlooked). */
  const [verificationGateMessage, setVerificationGateMessage] = useState<string | null>(null);

  const toggleIssueCollapsed = (id: string) => {
    setCollapsedIssueIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    const ids = new Set(actions.map((a) => a.id));
    setCollapsedIssueIds((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setIssueRequirementsRevealed((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        const row = actions.find((a) => a.id === k);
        if (!ids.has(k) || (row && isIssueFullyComplete(row))) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [actions]);

  /** Enter = check required fields on this row (Shift+Enter still adds newline in textareas). */
  const revealIssueRequirementsOnEnter = (
    e: KeyboardEvent<Element>,
    row: (typeof actions)[number],
    issueNum: number,
  ) => {
    if (e.key !== "Enter") return;
    const native = e.nativeEvent;
    if ("isComposing" in native && native.isComposing) return;
    const el = e.target as HTMLElement | null;
    if (!el) return;
    const isTa = el.tagName === "TEXTAREA";
    const isInput = el.tagName === "INPUT";
    if (isTa && e.shiftKey) return;

    let textInput = false;
    if (isInput) {
      const t = (el as HTMLInputElement).type;
      if (t === "text" || t === "search") textInput = true;
      else return;
    }
    if (!isTa && !textInput) return;

    e.preventDefault();

    setIssueRequirementsRevealed((p) => ({ ...p, [row.id]: true }));

    if (isIssueFullyComplete(row)) return;

    const labels = missingIssueFieldLabels(row);
    toast.warning(`Issue #${issueNum} — still incomplete`, {
      description: labels.map((label) => `• ${label}`).join("\n"),
      duration: 10_000,
    });
  };

  const frameworkRows = useMemo(() => {
    let list = [...actions];
    const q = frameworkSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.issue, r.actionTaken, r.outcome, r.timeline].some((x) =>
          String(x ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }
    if (frameworkFilter === "pending") list = list.filter((r) => !isIssueFullyComplete(r));
    if (frameworkFilter === "completed") list = list.filter((r) => isIssueFullyComplete(r));
    return list;
  }, [actions, frameworkSearch, frameworkFilter]);

  const updateActionRow = (id: string, field: string, value: any) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  // Load students for this mentor
  useEffect(() => {
    if (user?.id) {
      import("@/lib/auth-server").then(({ getStudentsFn }) => {
        getStudentsFn({ data: { mentorId: user.id } }).then((remoteStudents) => {
          if (remoteStudents && Array.isArray(remoteStudents)) {
            setStudents(ensureStudentIds(remoteStudents as ParsedStudent[]));
          }
        });
      });
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeStep !== "actions") {
      setPendingDeleteId(null);
      setVerificationGateMessage(null);
    }
  }, [activeStep]);

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
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
        const parsed = parseStudentRowsFromSheet(data);
        if (parsed.length === 0) {
          setParseError(
            "No valid rows (each needs Roll No). Use headers: Student Name, Roll No, Reg No, Father's Name, Branch, Year, Semester, contacts, Address.",
          );
          return;
        }
        setStudents(ensureStudentIds(parsed));
      } catch (err) {
        setParseError("Failed to parse Excel. Please check columns.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const addEvidenceFilesToRow = async (rowId: string, files: File[]) => {
    if (!user?.id) return;

    for (const file of files) {
      const toastId = toast.loading(`Uploading ${file.name}…`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("mentorId", user.id);

        const result = await uploadAtrFileFn({ data: formData });

        setActions((prev) =>
          prev.map((a) => {
            if (a.id === rowId) {
              const currentFiles = a.evidenceFiles || [];
              return {
                ...a,
                evidenceFiles: [
                  ...currentFiles,
                  {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    storagePath: result.storagePath,
                    dataUrl: result.publicUrl, // Use public URL as the preview
                  },
                ],
              };
            }
              return a;
          }),
        );
        toast.success(`Uploaded ${file.name}`, { id: toastId });
      } catch (err) {
        console.error(err);
        toast.error(`Failed to upload ${file.name}`, { id: toastId });
      }
    }
  };

  const handleRowFileUpload = (rowId: string, e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addEvidenceFilesToRow(rowId, files);
    e.target.value = "";
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

  const handleAttachments = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!user?.id) return;
    const files = Array.from(e.target.files || []);
    e.target.value = "";

    for (const file of files) {
      const toastId = toast.loading(`Uploading ${file.name}…`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("mentorId", user.id);

        const result = await uploadAtrFileFn({ data: formData });

        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            type: file.type,
            storagePath: result.storagePath,
            dataUrl: result.publicUrl,
          },
        ]);
        toast.success(`Uploaded ${file.name}`, { id: toastId });
      } catch (err) {
        console.error(err);
        toast.error(`Failed to upload ${file.name}`, { id: toastId });
      }
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const wordCount = useMemo(() => {
    return description.trim() ? description.trim().split(/\s+/).length : 0;
  }, [description]);

  const atrCountThisAcademicYear = useMemo(() => {
    if (!user?.id || !academicYear.trim()) return 0;
    const key = academicYear.trim();
    return mentorReports.filter(
      (r) => r.mentorId === user.id && (r.academicYear ?? "").trim() === key,
    ).length;
  }, [mentorReports, user?.id, academicYear]);

  const slotsRemaining = Math.max(0, MAX_ATR_PER_ACADEMIC_YEAR - atrCountThisAcademicYear);
  const yearQuotaReached = academicYear.trim().length > 0 && atrCountThisAcademicYear >= MAX_ATR_PER_ACADEMIC_YEAR;

  const onAcademicYearInputChange = (v: string) => {
    let next = maybeAutocompleteAcademicYear(v);
    const lone = next.trim().match(/^(\d{4})$/);
    if (lone) {
      const y = parseInt(lone[1], 10);
      const k = `${y}-${y + 1}`;
      if (allowedAcademicYearKeySet.has(k)) {
        next = `${y} - ${y + 1}`;
      }
    }
    setAcademicYearDraft(next);
    const key = parseAcademicYearToKey(next);
    if (key && allowedAcademicYearKeySet.has(key)) setAcademicYear(key);
    else setAcademicYear("");
  };

  const onAcademicYearBlur = () => {
    if (!academicYearDraft.trim()) {
      setAcademicYear("");
      return;
    }
    let draft = academicYearDraft;
    const loneBlur = draft.trim().match(/^(\d{4})$/);
    if (loneBlur) {
      const y = parseInt(loneBlur[1], 10);
      const k = `${y}-${y + 1}`;
      if (allowedAcademicYearKeySet.has(k)) {
        draft = `${y} - ${y + 1}`;
        setAcademicYearDraft(draft);
      }
    }
    const key = parseAcademicYearToKey(draft);
    if (key && allowedAcademicYearKeySet.has(key)) {
      setAcademicYear(key);
      return;
    }
    toast.error(
      "Use April–March pairs only (e.g. type 2024 or 2024 -). The latest allowed pair ends in the current calendar year (e.g. in 2026 you may select up to 2025 - 2026).",
      { duration: 12_000 },
    );
    setAcademicYearDraft("");
    setAcademicYear("");
  };

  const usedSessionSlots = useMemo(() => {
    const slots = new Set<string>();
    if (!user?.id || !academicYear.trim()) return slots;
    mentorReports.forEach((r) => {
      if (r.mentorId !== user.id) return;
      if ((r.academicYear ?? "").trim() !== academicYear.trim()) return;
      if (!r.session || !r.atrNo) return;
      slots.add(`${r.session}-${r.atrNo}`);
    });
    return slots;
  }, [mentorReports, user?.id, academicYear]);

  const selectedSessionRange = useMemo(() => {
    if (!academicYear.trim() || !session) return null;
    return academicYearKeyToSessionIsoRange(academicYear.trim(), session);
  }, [academicYear, session]);

  useEffect(() => {
    if (!academicYear.trim()) {
      setSession("");
      setAtrNo(null);
      return;
    }
    const currentValid =
      Boolean(session) &&
      Boolean(atrNo) &&
      !usedSessionSlots.has(`${session}-${atrNo}`);
    if (currentValid) return;
    const next = nextAvailableSlot(usedSessionSlots);
    if (!next) {
      setSession("");
      setAtrNo(null);
      return;
    }
    setSession(next.session);
    setAtrNo(next.atrNo);
  }, [academicYear, usedSessionSlots, session, atrNo]);

  const issuesStepComplete = useMemo(
    () => actions.length > 0 && actions.every((a) => isIssueFullyComplete(a)),
    [actions],
  );

  useEffect(() => {
    if (issuesStepComplete) setVerificationGateMessage(null);
  }, [issuesStepComplete]);

  const canSubmit = useMemo(() => {
    return (
      academicYear.trim().length > 0 &&
      !yearQuotaReached &&
      Boolean(session) &&
      Boolean(atrNo) &&
      wordCount <= 250 &&
      issuesStepComplete
    );
  }, [academicYear, yearQuotaReached, session, atrNo, wordCount, issuesStepComplete]);

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    if (!session || !atrNo) {
      toast.error("Choose session and ATR number before continuing.");
      return;
    }
    const range = academicYearKeyToSessionIsoRange(academicYear.trim(), session);
    if (!range) {
      toast.error("Invalid academic year/session combination.");
      return;
    }
    if (!issuesStepComplete) {
      const lines = incompleteIssuesBulletLines(actions);
      toast.error("Complete all required issue fields before submitting.", {
        description: lines.join("\n"),
        duration: 14_000,
      });
      return;
    }
    setSubmitting(true);
    const loadingId = toast.loading("Submitting…");
    try {
      const report = await createReport({
        academicYear: academicYear.trim(),
        session,
        atrNo,
        startDate: range.min,
        endDate: range.max,
        mentorId: user.id,
        mentorName: user.name,
        department: user.department,
        students,
        actions,
        attachments,
        description: description.trim(),
      });
      
      try {
        await generateAtrPdf(report);
      } catch (err) {
        console.error("PDF gen failed", err);
      }

      toast.success("Submitted", { id: loadingId });
      navigate({ to: "/atrs/$atrId", params: { atrId: report.id } });
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error ? err.message : "Failed to submit ATR";
      toast.error(msg, { id: loadingId });
    } finally {
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
      {attachmentPreview?.isOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-10">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={closeAttachmentPreview} />
          <div className="relative w-full max-w-5xl bg-surface border border-border/60 shadow-2xl rounded-[2rem] overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border/60 bg-secondary/10">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Preview</p>
                <p className="text-sm font-medium truncate">{attachmentPreview.name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={attachmentPreview.url}
                  download={attachmentPreview.name}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-secondary hover:bg-secondary/80 transition-colors"
                >
                  <FileDown className="size-4" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={closeAttachmentPreview}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-growth text-growth-foreground hover:opacity-90 transition"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="h-[75vh] bg-background">
              {attachmentPreview.mime.startsWith("image/") ? (
                <div className="h-full w-full flex items-center justify-center p-4">
                  <img
                    src={attachmentPreview.url}
                    alt={attachmentPreview.name}
                    className="max-h-full max-w-full object-contain rounded-xl border border-border/60 bg-surface"
                  />
                </div>
              ) : attachmentPreview.mime === "application/pdf" ? (
                <iframe title={attachmentPreview.name} src={attachmentPreview.url} className="w-full h-full" />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
                  <Paperclip className="size-10" />
                  <p className="text-sm">No inline preview for this type.</p>
                  <a
                    href={attachmentPreview.url}
                    download={attachmentPreview.name}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold bg-growth text-growth-foreground"
                  >
                    <FileDown className="size-4" />
                    Download
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
                    <label
                      htmlFor="atr-academic-year"
                      className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2"
                    >
                      Academic year
                    </label>
                    <input
                      id="atr-academic-year"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="e.g. 2024 - (then 2025 is filled automatically)"
                      list={academicYearListId}
                      value={academicYearDraft}
                      onChange={(e) => onAcademicYearInputChange(e.target.value)}
                      onBlur={onAcademicYearBlur}
                      className="w-full px-5 py-4 bg-secondary/20 border border-border/50 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-growth/20 focus:bg-background transition-all font-mono tabular-nums [&::-webkit-list-button]:hidden [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                    <datalist id="bcet-academic-year-hints">
                      {filteredAcademicYearHints.map((o) => (
                        <option key={o.key} value={o.display} />
                      ))}
                    </datalist>
                  </div>

                  {academicYear ? (
                    <div
                      className={cn(
                        "rounded-2xl border px-5 py-4 text-sm",
                        yearQuotaReached
                          ? "border-destructive/50 bg-destructive/10 text-destructive"
                          : "border-growth/25 bg-growth/5 text-foreground",
                      )}
                    >
                      <p className="font-bold">
                        {atrCountThisAcademicYear} of {MAX_ATR_PER_ACADEMIC_YEAR} ATRs created for Academic Year{" "}
                        {formatAcademicYearHuman(academicYear)}
                      </p>
                      <p className="mt-1 text-xs opacity-90">
                        {yearQuotaReached
                          ? "You cannot start another ATR for this year. Pick a different academic year or wait until an existing report is removed by administration."
                          : `${slotsRemaining} more ATR${slotsRemaining === 1 ? "" : "s"} can still be generated this year.`}
                      </p>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        Session (auto detected)
                      </label>
                      <div className="w-full px-5 py-4 bg-secondary/20 border border-border/50 rounded-2xl text-sm text-foreground">
                        {session ? (session === "session_1" ? "Session 1" : "Session 2") : "—"}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        ATR No (auto detected)
                      </label>
                      <div className="w-full px-5 py-4 bg-secondary/20 border border-border/50 rounded-2xl text-sm text-foreground">
                        {atrNo ? `ATR ${atrNo}` : "—"}
                      </div>
                    </div>
                  </div>
                  {selectedSessionRange ? (
                    <p className="text-xs text-muted-foreground">
                      Selected window:{" "}
                      <span className="font-mono tabular-nums text-foreground">
                        {selectedSessionRange.min} — {selectedSessionRange.max}
                      </span>
                      . This range is auto-applied from session selection.
                    </p>
                  ) : null}
                </div>
              </section>

              <div className="flex justify-end">
                <button
                  onClick={() => setActiveStep("actions")}
                  disabled={
                    !academicYear.trim() ||
                    yearQuotaReached ||
                    !session ||
                    !atrNo ||
                    usedSessionSlots.has(`${session}-${atrNo}`)
                  }
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
              <section className="rounded-[2rem] border border-growth/20 bg-background/35 dark:bg-secondary/25 backdrop-blur-xl shadow-[0_24px_80px_-28px_rgba(45,79,60,0.35)] overflow-hidden">
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-growth/10 bg-secondary/25 backdrop-blur-md">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex gap-4 min-w-0">
                      <div className="size-12 shrink-0 rounded-2xl bg-growth/15 border border-growth/25 flex items-center justify-center shadow-inner">
                        <ClipboardList className="size-6 text-growth" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-growth md:text-xs">
                          Action Taken Framework
                        </h2>
                        <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
                          Add structured mentoring outcomes — capture issues, interventions, timelines, evidence, and
                          measurable impact in one cohesive flow.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end xl:justify-end">
                      <div className="relative order-last sm:order-first sm:max-w-[200px] w-full">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="search"
                          value={frameworkSearch}
                          onChange={(e) => setFrameworkSearch(e.target.value)}
                          placeholder="Search issue or outcome..."
                          aria-label="Search issues"
                          className="w-full pl-11 pr-3 py-2.5 rounded-2xl text-xs bg-background/60 dark:bg-black/25 border border-growth/15 focus:outline-none focus:ring-2 focus:ring-growth/35 focus:border-growth/40 placeholder:text-muted-foreground/55 transition-[box-shadow,background]"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {(
                          [
                            ["all", "All"] as const,
                            ["pending", "Pending"] as const,
                            ["completed", "Completed"] as const,
                          ]
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setFrameworkFilter(key)}
                            className={cn(
                              "px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all duration-300",
                              frameworkFilter === key
                                ? "bg-growth text-growth-foreground border-growth shadow-lg shadow-growth/25 ring-2 ring-growth/20"
                                : "bg-secondary/40 border-border/50 text-muted-foreground hover:border-growth/30 hover:bg-growth/5",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <span className="relative inline-flex shrink-0">
                        <span
                          className="absolute -inset-1 rounded-[1rem] bg-growth/25 blur-lg motion-safe:animate-pulse opacity-75 pointer-events-none"
                          aria-hidden
                        />
                        <button
                          type="button"
                          onClick={addActionRow}
                          className="relative inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-[0.12em] bg-growth text-growth-foreground shadow-xl shadow-growth/30 hover:brightness-[1.05] active:scale-[0.98] transition-all"
                        >
                          <Plus className="size-4" strokeWidth={2.5} />
                          Add New Issue
                        </button>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6 md:p-8 space-y-5">
                  {actions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 md:py-24 px-6 text-center animate-in fade-in zoom-in-95 duration-500">
                      <div className="relative mb-8">
                        <div className="absolute inset-0 rounded-[2rem] bg-growth/20 blur-2xl scale-150 pointer-events-none" />
                        <div className="relative size-28 md:size-36 rounded-[2rem] border border-growth/20 bg-secondary/40 backdrop-blur-md flex items-center justify-center shadow-inner">
                          <ClipboardList className="size-14 md:size-16 text-growth/60" strokeWidth={1} />
                        </div>
                      </div>
                      <p className="text-base font-semibold text-foreground">No issues added yet</p>
                      <p className="mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed">
                        Start documenting session outcomes — each issue becomes its own actionable card along the mentoring
                        journey.
                      </p>
                      <button
                        type="button"
                        onClick={addActionRow}
                        className="mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold bg-growth text-growth-foreground shadow-lg shadow-growth/25 hover:scale-[1.02] transition-transform animate-in slide-in-from-bottom-4 duration-500 delay-150"
                      >
                        <Plus className="size-5" strokeWidth={2.5} />
                        Create First Issue
                      </button>
                    </div>
                  ) : frameworkRows.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-growth/25 bg-secondary/20 py-14 px-8 text-center">
                      <p className="text-sm font-semibold text-foreground">No rows match your filters.</p>
                      <p className="mt-1 text-xs text-muted-foreground mb-6">Adjust search or chips to show issues again.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setFrameworkFilter("all");
                          setFrameworkSearch("");
                        }}
                        className="text-xs font-bold uppercase tracking-widest text-growth underline underline-offset-4"
                      >
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    frameworkRows.map((row, filteredIdx) => {
                      const globalIdx = actions.findIndex((a) => a.id === row.id);
                      const num = globalIdx >= 0 ? globalIdx + 1 : filteredIdx + 1;
                      const pct = rowCompletionPctForIssue(row);
                      const maxStudents = students.length;

                      const collapsed = !!collapsedIssueIds[row.id];
                      const issuePreview =
                        typeof row.issue === "string" && row.issue.trim()
                          ? row.issue.trim().slice(0, 72) + (row.issue.trim().length > 72 ? "…" : "")
                          : null;

                      return (
                        <article
                          key={row.id}
                          style={{
                            animationDelay: `${Math.min(filteredIdx, 10) * 55}ms`,
                          }}
                          className={cn(
                            "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500 rounded-[1.5rem]",
                            "border border-growth/15 bg-secondary/35 dark:bg-black/25 backdrop-blur-lg",
                            "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-[0_20px_50px_-20px_rgba(45,79,60,0.45)]",
                            "transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-growth/35 hover:ring-1 hover:ring-growth/15",
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6 border-b border-growth/10">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => toggleIssueCollapsed(row.id)}
                                aria-expanded={!collapsed}
                                aria-label={collapsed ? "Expand issue" : "Collapse issue"}
                                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-growth/20 bg-secondary/40 text-muted-foreground hover:bg-growth/15 hover:text-growth transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/40"
                              >
                                <ChevronDown
                                  className={cn("size-5 transition-transform duration-300", collapsed && "-rotate-90")}
                                  aria-hidden
                                />
                              </button>
                              <div className="hidden sm:flex size-10 shrink-0 rounded-full bg-growth/10 border border-growth/20 items-center justify-center">
                                <GripVertical className="size-5 text-muted-foreground opacity-70" aria-hidden />
                              </div>
                              <div
                                className="size-10 shrink-0 rounded-full bg-gradient-to-br from-growth to-growth/70 text-growth-foreground shadow-md shadow-growth/30 flex items-center justify-center font-bold text-sm tabular-nums ring-4 ring-growth/15"
                                aria-hidden
                              >
                                {num}
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleIssueCollapsed(row.id)}
                                aria-expanded={!collapsed}
                                className="min-w-0 text-left flex-1 rounded-xl px-2 py-0.5 -mx-2 -my-0.5 hover:bg-growth/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/40 focus-visible:bg-growth/5"
                              >
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                  Issue #{num}
                                </p>
                                {collapsed && issuePreview ? (
                                  <p className="text-[11px] text-foreground/90 line-clamp-2 mt-1 leading-snug max-w-xl">
                                    {issuePreview}
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground truncate max-w-[200px] sm:max-w-md mt-1">
                                    {isIssueFullyComplete(row) ? (
                                      <span className="text-success font-semibold text-xs">
                                        Marked complete · ready to validate
                                      </span>
                                    ) : (
                                      "Incomplete — refine fields to reach 100%"
                                    )}
                                  </p>
                                )}
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                              <div className="flex rounded-2xl border border-border/50 bg-secondary/40 p-0.5 shrink-0">
                                <button
                                  type="button"
                                  title="Save note"
                                  aria-label="Save draft note for this issue"
                                  onClick={() =>
                                    toast.success("Progress saved locally. Continue editing — submission happens on Verification.")
                                  }
                                  className="p-2.5 rounded-[0.875rem] text-muted-foreground hover:text-growth hover:bg-background/80 transition-colors"
                                >
                                  <Save className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  title="Duplicate issue"
                                  aria-label="Duplicate this issue row"
                                  onClick={() => duplicateActionRow(row.id)}
                                  className="p-2.5 rounded-[0.875rem] text-muted-foreground hover:text-growth hover:bg-background/80 transition-colors"
                                >
                                  <Copy className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete issue"
                                  aria-label="Delete this issue row"
                                  onClick={() => setPendingDeleteId(row.id)}
                                  className="p-2.5 rounded-[0.875rem] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Progress */}
                          <div className={cn("px-5 md:px-6 pt-2", collapsed ? "pb-5 md:pb-5" : "pb-3 md:pb-4")}>
                            <div className="flex items-center justify-between gap-3 mb-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Row completeness
                              </span>
                              <span className="text-[11px] font-bold tabular-nums text-growth">{pct}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-background/70 dark:bg-black/35 overflow-hidden border border-growth/10">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-growth/80 via-growth to-emerald-300/90 transition-[width] duration-700 ease-out shadow-[0_0_14px_rgba(45,79,60,0.45)]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          {!collapsed &&
                          issueRequirementsRevealed[row.id] &&
                          !isIssueFullyComplete(row) ? (
                            <div
                              role="alert"
                              aria-live="polite"
                              className="mx-5 md:mx-6 mb-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-warning-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 duration-300"
                            >
                              <p className="font-bold flex items-center gap-2 uppercase tracking-[0.12em] text-[10px] mb-2">
                                <AlertCircle className="size-4 shrink-0 opacity-90" aria-hidden />
                                Still needed (you pressed Enter to check this issue)
                              </p>
                              <ul className="list-disc pl-5 space-y-1 text-[11px] leading-snug">
                                {missingIssueFieldLabels(row).map((label, li) => (
                                  <li key={`${label}-${li}`}>{label}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {!collapsed ? (
                          <div className="px-5 md:px-6 pb-6 md:pb-7 space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 duration-300">
                            <p className="text-[10px] text-muted-foreground/85 leading-relaxed pb-4 border-b border-border/35">
                              <span className="font-semibold text-foreground/80">Checking fields:</span> press{" "}
                              <kbd className="rounded border border-border/60 bg-secondary/80 px-1.5 py-px font-mono text-[10px]">
                                Enter
                              </kbd>{" "}
                              here to see missing items (banner + alert). Use{" "}
                              <kbd className="rounded border border-border/60 bg-secondary/80 px-1.5 py-px font-mono text-[10px]">
                                Shift
                              </kbd>
                              +
                              <kbd className="rounded border border-border/60 bg-secondary/80 px-1.5 py-px font-mono text-[10px] ml-px">
                                Enter
                              </kbd>{" "}
                              in large boxes for a new line.
                            </p>
                            <div className="relative group">
                              <label
                                htmlFor={`issue-${row.id}`}
                                className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
                              >
                                <AlertCircle className="size-3.5 shrink-0 text-growth/80" aria-hidden />
                                Issue identified
                              </label>
                              <textarea
                                id={`issue-${row.id}`}
                                rows={3}
                                value={row.issue}
                                placeholder="Clearly describe the learner or cohort issue..."
                                className={cn(
                                  "w-full min-h-[5.25rem] rounded-2xl px-4 py-3 text-sm placeholder:text-muted-foreground/55 resize-none",
                                  "bg-background/80 dark:bg-black/35 border border-growth/10 shadow-inner transition-[box-shadow,border-color,background]",
                                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/35 focus-visible:border-growth/40 focus-visible:bg-background",
                                )}
                                onChange={(e) => updateActionRow(row.id, "issue", e.target.value)}
                                onKeyDown={(e) => revealIssueRequirementsOnEnter(e, row, num)}
                                onInput={(e) => autosizeTextarea(e.target as HTMLTextAreaElement)}
                              />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_1fr] xl:grid-cols-[260px_minmax(0,1fr)] gap-6">
                              <div className="space-y-4">
                                <div>
                                  <label
                                    htmlFor={`mentees-${row.id}`}
                                    className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
                                  >
                                    <UsersIcon className="size-3.5 text-growth/80" aria-hidden />
                                    Students
                                  </label>
                                  <MenteeTagField
                                    roster={students}
                                    value={row.taggedStudents ?? []}
                                    disabled={maxStudents === 0}
                                    inputId={`mentees-${row.id}`}
                                    onChange={(tags) => {
                                      const capped =
                                        maxStudents > 0 ? tags.slice(0, maxStudents) : tags;
                                      setActions((prev) =>
                                        prev.map((a) =>
                                          a.id === row.id
                                            ? {
                                                ...a,
                                                taggedStudents: capped,
                                                studentCount: capped.length,
                                              }
                                            : a,
                                        ),
                                      );
                                    }}
                                    onEnterCheck={(e) => revealIssueRequirementsOnEnter(e, row, num)}
                                  />
                                  <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
                                    Type <kbd className="px-1 rounded border border-border/60 bg-secondary/80 font-mono">@</kbd>{" "}
                                    to choose from your My mentee list.{" "}
                                    {maxStudents > 0 ? (
                                      <>
                                        Roster: {maxStudents} · tagged:{" "}
                                        {(row.taggedStudents ?? []).length}
                                      </>
                                    ) : (
                                      <>Add mentees under My mentee or import the attendance sheet on this page.</>
                                    )}
                                  </p>
                                </div>

                                <div>
                                  <label
                                    htmlFor={`timeline-${row.id}`}
                                    className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
                                  >
                                    <CalendarDays className="size-3.5 text-growth/80" aria-hidden />
                                    Timeline & milestones
                                  </label>
                                  <input
                                    id={`timeline-${row.id}`}
                                    type="text"
                                    value={row.timeline}
                                    onChange={(e) => updateActionRow(row.id, "timeline", e.target.value)}
                                    placeholder="e.g. Follow-up cadence · Week 6 lab window…"
                                    className={cn(
                                      "w-full rounded-2xl px-4 py-3 text-sm bg-background/80 dark:bg-black/35 border border-growth/10 shadow-inner placeholder:text-muted-foreground/55",
                                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/35 focus-visible:border-growth/40",
                                    )}
                                    onKeyDown={(e) => revealIssueRequirementsOnEnter(e, row, num)}
                                  />
                                  <div className="flex flex-wrap items-center gap-2 mt-3">
                                    {TIMELINE_MILESTONES.map((m) => (
                                      <button
                                        key={m}
                                        type="button"
                                        className={cn(
                                          "px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border transition-all",
                                          row.timeline === m
                                            ? "bg-growth/15 border-growth/40 text-growth"
                                            : "bg-secondary/35 border-transparent text-muted-foreground hover:border-growth/25 hover:bg-growth/5",
                                        )}
                                        onClick={() => updateActionRow(row.id, "timeline", m)}
                                      >
                                        {m}
                                      </button>
                                    ))}
                                    <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-secondary/30 border border-growth/10">
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                                        Date anchor
                                      </span>
                                      <input
                                        type="date"
                                        aria-label="Milestone calendar date"
                                        value={
                                          typeof row.timeline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.timeline)
                                            ? row.timeline
                                            : ""
                                        }
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (!v) return;
                                          updateActionRow(row.id, "timeline", v);
                                        }}
                                        className={cn(
                                          "bg-transparent border-none text-[11px] font-medium rounded-lg py-0.5 px-1",
                                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/30 cursor-pointer max-w-[8.75rem]",
                                        )}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-5">
                                <div className="relative">
                                  <label
                                    htmlFor={`action-${row.id}`}
                                    className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
                                  >
                                    <ListChecks className="size-3.5 text-growth/80" aria-hidden />
                                    Action taken
                                  </label>
                                  <textarea
                                    id={`action-${row.id}`}
                                    rows={3}
                                    value={row.actionTaken}
                                    placeholder="Intervention steps, conversations, escalation path…"
                                    className={cn(
                                      "w-full min-h-[5.75rem] rounded-2xl px-4 py-3 text-sm placeholder:text-muted-foreground/55 resize-none",
                                      "bg-background/80 dark:bg-black/35 border border-growth/10 shadow-inner transition-[box-shadow,border-color,background]",
                                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/35 focus-visible:border-growth/40",
                                    )}
                                    onChange={(e) => updateActionRow(row.id, "actionTaken", e.target.value)}
                                    onKeyDown={(e) => revealIssueRequirementsOnEnter(e, row, num)}
                                    onInput={(e) => autosizeTextarea(e.target as HTMLTextAreaElement)}
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`outcome-${row.id}`}
                                    className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
                                  >
                                    <Sparkles className="size-3.5 text-growth/80" aria-hidden />
                                    Outcome / impact
                                  </label>
                                  <textarea
                                    id={`outcome-${row.id}`}
                                    rows={2}
                                    value={row.outcome}
                                        placeholder="Quantify or qualify results — retention, morale, competency lift…"
                                    className={cn(
                                      "w-full min-h-[4.75rem] rounded-2xl px-4 py-3 text-sm placeholder:text-muted-foreground/55 resize-none",
                                      "bg-background/80 dark:bg-black/35 border border-growth/10 shadow-inner transition-[box-shadow]",
                                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/35 focus-visible:border-growth/40 focus-visible:bg-background",
                                    )}
                                    onChange={(e) => updateActionRow(row.id, "outcome", e.target.value)}
                                    onKeyDown={(e) => revealIssueRequirementsOnEnter(e, row, num)}
                                    onInput={(e) => autosizeTextarea(e.target as HTMLTextAreaElement)}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Evidence */}
                            <div className="pt-3">
                              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground flex items-center gap-2">
                                <Paperclip className="size-3.5 text-growth/80" aria-hidden />
                                Supporting evidence
                              </p>
                              <div
                                role="presentation"
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  setEvidenceDragRowId(row.id);
                                }}
                                onDragLeave={(e) => {
                                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                                    setEvidenceDragRowId((id) => (id === row.id ? null : id));
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setEvidenceDragRowId(null);
                                  const dropped = Array.from(e.dataTransfer.files || []);
                                  if (dropped.length) addEvidenceFilesToRow(row.id, dropped);
                                }}
                                className={cn(
                                  "rounded-[1.25rem] border-2 border-dashed transition-colors duration-300 p-4 md:p-5",
                                  evidenceDragRowId === row.id
                                    ? "border-growth bg-growth/15 scale-[1.01]"
                                    : "border-growth/25 bg-secondary/20 hover:bg-growth/5 hover:border-growth/40",
                                )}
                              >
                                <label className="flex flex-col items-center justify-center cursor-pointer gap-3 py-2">
                                  <div className="size-14 rounded-2xl border border-growth/20 bg-growth/10 flex items-center justify-center shadow-inner">
                                    <Upload className="size-6 text-growth" />
                                  </div>
                                  <div className="text-center">
                                    <span className="text-xs font-semibold block">Drag & drop or browse</span>
                                    <span className="text-[10px] text-muted-foreground mt-1 font-medium uppercase tracking-wide">
                                      PDF · Word · Images
                                    </span>
                                  </div>
                                  <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,image/*"
                                    onChange={(e) => handleRowFileUpload(row.id, e)}
                                    className="hidden"
                                  />
                                </label>

                                {(row.evidenceFiles || []).length > 0 ? (
                                  <ul className="mt-4 flex flex-wrap gap-2 border-t border-growth/10 pt-4">
                                    {(row.evidenceFiles || []).map((file: { name: string; type?: string; dataUrl?: string }, fIdx: number) => (
                                      <li
                                        key={`${file.name}-${fIdx}`}
                                        className="group/file flex items-center gap-2 pl-3 pr-1 py-2 rounded-xl border border-growth/15 bg-growth/5 min-w-0 max-w-[200px]"
                                      >
                                        <FileCheck className="size-3.5 shrink-0 text-growth" />
                                        <button
                                          type="button"
                                          title="Preview attachment"
                                          onClick={() =>
                                            openAttachmentPreview({
                                              name: file.name,
                                              type: file.type,
                                              dataUrl: file.dataUrl,
                                            })
                                          }
                                          className="truncate text-[10px] font-bold text-left underline-offset-2 hover:underline hover:text-growth min-w-0 text-growth/90 transition-colors flex-1"
                                        >
                                          {file.name}
                                        </button>
                                        <button
                                          type="button"
                                          aria-label="Remove attachment"
                                          onClick={() => removeRowFile(row.id, fIdx)}
                                          className="shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive opacity-70 group-hover/file:opacity-100 transition-colors"
                                        >
                                          <X className="size-3.5" />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          ) : null}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Delete confirmation (framework only) */}
              {pendingDeleteId ? (
                <div className="fixed inset-0 z-[115] flex items-center justify-center p-6 animate-in fade-in duration-300">
                  <button
                    type="button"
                    className="absolute inset-0 bg-background/85 backdrop-blur-md"
                    aria-label="Dismiss"
                    onClick={() => setPendingDeleteId(null)}
                  />
                  <div className="relative w-full max-w-md rounded-[1.75rem] border border-growth/20 bg-surface backdrop-blur-xl shadow-2xl p-8 space-y-5 animate-in zoom-in-95 duration-300">
                    <div className="flex items-start gap-4">
                      <div className="size-12 shrink-0 rounded-2xl bg-destructive/10 flex items-center justify-center">
                        <Trash2 className="size-5 text-destructive" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold tracking-tight">Remove this issue?</h3>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                          Attached evidence and typed content for this card will be removed. This stays on-device until you
                          submit the final ATR.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end pt-2">
                      <button
                        type="button"
                        className="px-6 py-3 rounded-xl text-sm font-semibold border border-border/60 hover:bg-secondary/80 transition-colors"
                        onClick={() => setPendingDeleteId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="px-6 py-3 rounded-xl text-sm font-bold bg-destructive text-destructive-foreground hover:brightness-105 transition-colors"
                        onClick={() => {
                          removeActionRow(pendingDeleteId);
                          setPendingDeleteId(null);
                          toast.success("Issue removed");
                        }}
                      >
                        Delete issue
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-4">
                {verificationGateMessage ? (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="rounded-2xl border border-warning/45 bg-warning/10 px-5 py-4 text-warning-foreground text-sm shadow-sm"
                  >
                    <p className="font-bold text-warning-foreground mb-2 flex items-center gap-2">
                      <AlertCircle className="size-4 shrink-0" aria-hidden />
                      Complete every issue row before Verification
                    </p>
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap opacity-95">
                      {verificationGateMessage}
                    </p>
                  </div>
                ) : null}

                <div className="flex justify-between items-center flex-wrap gap-4">
                <button
                  onClick={() => setActiveStep("basics")}
                  className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors px-6 py-4"
                >
                  <ChevronLeft className="size-5" />
                  Back to Basics
                </button>
                <button
                  type="button"
                  aria-disabled={actions.length === 0 || !issuesStepComplete}
                  onClick={() => {
                    if (actions.length === 0) {
                      const msg = "Add at least one issue in the framework above, then try again.";
                      setVerificationGateMessage(msg);
                      toast.error("Cannot continue yet", {
                        description: msg,
                        duration: 9000,
                      });
                      return;
                    }
                    const lines = incompleteIssuesBulletLines(actions);
                    if (lines.length > 0) {
                      const body = `${lines.join("\n")}`;
                      setVerificationGateMessage(body);
                      toast.error("Finish these fields before Verification", {
                        description: lines.join("\n"),
                        duration: 14_000,
                      });
                      return;
                    }
                    setVerificationGateMessage(null);
                    setActiveStep("verification");
                  }}
                  title={
                    actions.length === 0
                      ? "Add at least one issue."
                      : !issuesStepComplete
                        ? "Every issue needs: Issue, Actions, Timeline, Outcome, students ≥ 1, and evidence."
                        : "Continue to Verification"
                  }
                  className={cn(
                    "inline-flex items-center gap-2 bg-foreground text-background px-8 py-4 rounded-2xl font-bold hover:opacity-90 transition group cursor-pointer",
                    (!issuesStepComplete || actions.length === 0) &&
                      "opacity-40 grayscale-[0.35] hover:opacity-55",
                  )}
                >
                  Verification Data
                  <ChevronRight className="size-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
              </div>
            </div>
          )}

          {activeStep === "verification" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <section className="bg-surface rounded-[2rem] border border-border/60 shadow-card p-8">
                <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
                  <div className="flex items-center gap-3 text-growth">
                    <div className="size-8 rounded-xl bg-growth/10 flex items-center justify-center">
                      <ListChecks className="size-4" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-[0.15em]">Report description</h2>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-widest",
                      wordCount > 250 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {wordCount} / 250 words
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Summarize overall session progress and objectives (optional but recommended for coordinators).
                </p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summarize the overall progress and objectives of this session..."
                  rows={5}
                  className={cn(
                    "w-full px-5 py-4 bg-secondary/20 border rounded-2xl text-base focus:outline-none focus:ring-2 focus:bg-background transition-all resize-none min-h-[120px]",
                    wordCount > 250
                      ? "border-destructive focus:ring-destructive/20"
                      : "border-border/50 focus:ring-growth/20",
                  )}
                />
                {wordCount > 250 ? (
                  <p className="mt-2 text-xs text-destructive flex items-center gap-1.5 font-medium">
                    <AlertCircle className="size-3.5" />
                    Please keep the description within 250 words.
                  </p>
                ) : null}
              </section>

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
                      <input type="file" multiple accept="application/pdf,image/*" onChange={handleAttachments} className="hidden" />
                      <Plus className="size-6 text-muted-foreground group-hover:text-growth mb-2" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Add Files</span>
                    </label>
                    {attachments.map((a, i) => (
                      <div
                        key={i}
                        role="button"
                        tabIndex={0}
                        onClick={() => openAttachmentPreview(a)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openAttachmentPreview(a);
                          }
                        }}
                        className="aspect-square rounded-3xl border border-border overflow-hidden relative group shadow-sm cursor-pointer hover:border-growth/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-growth/40"
                      >
                        {a.dataUrl && a.type?.startsWith("image/") ? (
                          <img src={a.dataUrl} alt="" className="w-full h-full object-cover pointer-events-none" />
                        ) : (
                          <div className="w-full h-full bg-secondary/40 flex flex-col items-center justify-center text-muted-foreground gap-2 p-3 pointer-events-none">
                            <div className="size-11 rounded-2xl bg-growth/10 border border-growth/25 flex items-center justify-center text-growth">
                              <FileCheck className="size-5" />
                            </div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-center">
                              {a.type === "application/pdf" ? "PDF" : "File"}
                            </p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAttachment(i);
                          }}
                          className="absolute top-2 right-2 z-10 size-7 rounded-full bg-destructive/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="size-3.5" />
                        </button>
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-surface/90 backdrop-blur-sm border-t border-border pointer-events-none">
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
