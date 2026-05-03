import { createFileRoute, Link, redirect, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock,
  FileCheck,
  ListChecks,
  Paperclip,
  FileDown,
  Sparkles,
  Upload,
  Users,
  GripVertical,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalTimeline } from "@/components/approval-timeline";
import { BCET_ATR_CHANGED_EVENT, finalizeIqacWithSignedScan, getReport, reviewReport } from "@/lib/atr-store";
import { getCurrentUser } from "@/lib/auth-store";
import {
  generateAtrPdf,
  generateIqacMergedValidationPdf,
  iqacMergedChainSnapshotsReady,
  type ChiefMentorPdfAudit,
  type CoordinatorPdfAudit,
  type HodPdfAudit,
} from "@/lib/pdf-utils";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import {
  atrDisplayLabel,
  totalStudentsSummary,
  type ActionItem,
  type AtrAttachment,
  type AtrReport,
} from "@/lib/atr-types";
import { getAtrByIdFn } from "@/lib/auth-server";
import { cn } from "@/lib/utils";

function actionRowReviewPct(action: ActionItem) {
  let n = 0;
  if (String(action.issue ?? "").trim()) n++;
  const sc = Number(action.studentCount ?? 0);
  if (!Number.isNaN(sc) && sc > 0) n++;
  if (String(action.actionTaken ?? "").trim()) n++;
  if (String(action.timeline ?? "").trim()) n++;
  if (String(action.outcome ?? "").trim()) n++;
  if ((action.evidenceFiles?.length ?? 0) > 0) n++;
  return Math.round((n / 6) * 100);
}

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
  const { atrId } = Route.useParams();
  const user = getCurrentUser();
  const [storeRev, setStoreRev] = useState(0);
  useEffect(() => {
    const sync = () => setStoreRev((n) => n + 1);
    window.addEventListener(BCET_ATR_CHANGED_EVENT, sync);
    return () => window.removeEventListener(BCET_ATR_CHANGED_EVENT, sync);
  }, []);
  const localReport = useMemo(() => getReport(atrId), [atrId, storeRev]);
  const [remoteReport, setRemoteReport] = useState<AtrReport | null>(null);

  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);

  /** Coordinator Level-1 checks — required before approve + PDF issuance. */
  const [coordAllParams, setCoordAllParams] = useState(false);
  const [coordMentorProactive, setCoordMentorProactive] = useState(false);
  const [coordContinuousMonitoring, setCoordContinuousMonitoring] = useState(false);

  /** HOD departmental confirmation — required before approve + PDF. */
  const [hodDeptMentoringCheck, setHodDeptMentoringCheck] = useState(false);

  /** Chief Mentor IQAC endorsement — required before approve + PDF. */
  const [chiefEndorsesProgression, setChiefEndorsesProgression] = useState(false);

  /** Read-only collapse (same UX idea as Create ATR). Key = action row id or index fallback. */
  const [collapsedActionKeys, setCollapsedActionKeys] = useState<Record<string, boolean>>({});

  const [attachmentPreview, setAttachmentPreview] = useState<{
    isOpen: boolean;
    name: string;
    mime: string;
    url: string;
  } | null>(null);
  const attachmentBlobUrlRef = useRef<string | null>(null);
  const iqacScanInputRef = useRef<HTMLInputElement>(null);

  /** Chosen scanned file (IQAC finalize step — not persisted until Submit). */
  const [iqacScanDraft, setIqacScanDraft] = useState<AtrAttachment | null>(null);

  const closeAttachmentPreview = () => {
    if (attachmentBlobUrlRef.current) {
      URL.revokeObjectURL(attachmentBlobUrlRef.current);
      attachmentBlobUrlRef.current = null;
    }
    setAttachmentPreview(null);
  };

  const handleOpenAttachment = (attachment: AtrAttachment) => {
    closeAttachmentPreview();
    if (!attachment.dataUrl) {
      toast.error(
        "Preview not available — wait for sync or the file may only have metadata saved locally.",
      );
      return;
    }
    try {
      const [meta, base64] = attachment.dataUrl.split(",", 2);
      const mimeFromUrl = meta?.match(/data:([^;]+);base64/i)?.[1];
      const mime = attachment.type || mimeFromUrl || "application/octet-stream";
      const binary = atob(base64 ?? "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      attachmentBlobUrlRef.current = blobUrl;
      setAttachmentPreview({ isOpen: true, name: attachment.name, mime, url: blobUrl });
    } catch {
      toast.error("Could not open this attachment.");
    }
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getAtrByIdFn({ data: { user, atrId } })
      .then((full) => {
        if (!cancelled && full) setRemoteReport(full as AtrReport);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [atrId, user]);

  useEffect(() => () => {
    const u = attachmentBlobUrlRef.current;
    if (u) URL.revokeObjectURL(u);
    attachmentBlobUrlRef.current = null;
  }, []);

  const report = remoteReport ?? localReport ?? undefined;

  if (!report) throw notFound();

  const isReviewer = 
    (user?.role === "coordinator" && (report.status === "submitted" || report.status === "coordinator_review")) ||
    (user?.role === "hod" && report.status === "hod_review") ||
    (user?.role === "chief_mentor" && report.status === "chief_mentor_review");

  const isCoordinatorReviewer =
    user?.role === "coordinator" &&
    isReviewer &&
    (report.status === "submitted" || report.status === "coordinator_review");

  const isHodReviewer = user?.role === "hod" && report.status === "hod_review";

  const isChiefMentorReviewer =
    user?.role === "chief_mentor" && report.status === "chief_mentor_review";

  const isIqacWorkflowAdmin =
    user?.role === "admin" &&
    (report.status === "iqac_review" || report.status === "iqac_pending_scan");
  const isIqacAwaitingMergedApprove = user?.role === "admin" && report.status === "iqac_review";
  const isIqacAwaitingSignedUpload =
    user?.role === "admin" && report.status === "iqac_pending_scan";

  const coordinatorChecksComplete =
    coordAllParams && coordMentorProactive && coordContinuousMonitoring;

  const hodChecksComplete = hodDeptMentoringCheck;

  const chiefMentorChecksComplete = chiefEndorsesProgression;

  const coordinatorValidationPayload =
    user && isCoordinatorReviewer && coordinatorChecksComplete
      ? {
          coordinatorName: user.name,
          coordinatorDepartment: user.department,
          coordinatorEmail: user.email,
          checklist: {
            allParametersAddressed: coordAllParams,
            mentorProactive: coordMentorProactive,
            continuousMonitoringSuggested: coordContinuousMonitoring,
          },
          reviewRemarks: remark.trim() || undefined,
        }
      : undefined;

  const hodValidationPayload =
    user && isHodReviewer && hodChecksComplete
      ? {
          hodName: user.name,
          hodDepartment: user.department,
          hodEmail: user.email,
          checklist: {
            mentoringEffectiveAndCareerPrograms: hodDeptMentoringCheck,
          },
          reviewRemarks: remark.trim() || undefined,
        }
      : undefined;

  const chiefMentorValidationPayload =
    user && isChiefMentorReviewer && chiefMentorChecksComplete
      ? {
          chiefMentorName: user.name,
          chiefMentorDepartment: user.department,
          chiefMentorEmail: user.email,
          checklist: {
            endorsesInstitutionalProgression: chiefEndorsesProgression,
          },
          reviewRemarks: remark.trim() || undefined,
        }
      : undefined;

  const handleDownloadPdf = async () => {
    try {
      if (user?.role === "coordinator") {
        const audit = report.coordinatorValidation ?? coordinatorValidationPayload;
        if (!audit) {
          toast.error("Coordinator validation PDF not available.", {
            description:
              "If this ATR is still with you, check all three statements above first. Otherwise it may have been approved before validation snapshots were stored.",
          });
          return;
        }
        await generateAtrPdf(report, audit);
        return;
      }
      if (user?.role === "hod") {
        const hodAudit = report.hodValidation ?? hodValidationPayload;
        if (!hodAudit) {
          toast.error("HOD review PDF not available.", {
            description:
              "Check the departmental confirmation below while this ATR is in HOD review, or reopen after approval if the snapshot synced.",
          });
          return;
        }
        await generateAtrPdf(report, null, hodAudit);
        return;
      }
      if (user?.role === "chief_mentor") {
        const cmAudit = report.chiefMentorValidation ?? chiefMentorValidationPayload;
        if (!cmAudit) {
          toast.error("Chief Mentor review PDF not available.", {
            description:
              "Confirm the IQAC endorsement below while this ATR is with Chief Mentor, or reopen after approval if the snapshot synced.",
          });
          return;
        }
        await generateAtrPdf(report, null, null, cmAudit);
        return;
      }
      if (
        user?.role === "admin" &&
        (report.status === "iqac_review" || report.status === "iqac_pending_scan")
      ) {
        if (!iqacMergedChainSnapshotsReady(report)) {
          toast.error("Merged IQAC package is not ready.", {
            description:
              "This ATR needs coordinator, HOD, and Chief Mentor validation snapshots before the institutional merge can run.",
          });
          return;
        }
        await generateIqacMergedValidationPdf(report);
        return;
      }
      await generateAtrPdf(report);
    } catch (e) {
      console.error(e);
      toast.error("Could not generate PDF.");
    }
  };

  const handleAction = async (action: "approve" | "reject") => {
    if (!user) return;
    if (
      user.role === "admin" &&
      (report.status === "iqac_review" || report.status === "iqac_pending_scan")
    ) {
      toast.info("Use the IQAC panel.", {
        description:
          report.status === "iqac_review"
            ? "Approve and download the merged Mentor–Chief Mentor package from the IQAC section above."
            : "Upload the scanned countersigned file and submit final approval there.",
      });
      return;
    }
    if (action === "approve" && isCoordinatorReviewer && !coordinatorChecksComplete) {
      toast.error("Confirmation required before approval.", {
        description:
          "Check all three validation statements confirming the mentor submission before you approve and forward.",
        duration: 10_000,
      });
      return;
    }
    if (action === "approve" && isHodReviewer && !hodChecksComplete) {
      toast.error("Confirmation required before approval.", {
        description:
          "Confirm the HOD departmental statement on mentoring effectiveness and structured career-development programs.",
        duration: 10_000,
      });
      return;
    }
    if (action === "approve" && isChiefMentorReviewer && !chiefMentorChecksComplete) {
      toast.error("Confirmation required before approval.", {
        description: "Acknowledge the IQAC endorsement statement below before you approve and forward.",
        duration: 10_000,
      });
      return;
    }

    setLoading(true);
    try {
      await reviewReport(
        report.id,
        action,
        remark,
        action === "approve" ? coordinatorValidationPayload : undefined,
        action === "approve" ? hodValidationPayload : undefined,
        action === "approve" ? chiefMentorValidationPayload : undefined,
      );

      if (user) {
        void getAtrByIdFn({ data: { user, atrId: report.id } })
          .then((full) => {
            if (full) setRemoteReport(full as AtrReport);
          })
          .catch(() => {});
      }

      if (action === "approve" && isCoordinatorReviewer && coordinatorChecksComplete) {
        const snapshot = getReport(report.id) ?? remoteReport ?? report;
        const auditForPdf: CoordinatorPdfAudit =
          snapshot.coordinatorValidation ?? coordinatorValidationPayload!;
        try {
          await generateAtrPdf(snapshot, auditForPdf);
          toast.success("Approved & forwarded.", {
            description: `Coordinator validation PDF saved (${snapshot.id}_Coordinator_Validation.pdf).`,
            duration: 8000,
          });
        } catch (pdfErr) {
          console.error(pdfErr);
          toast.warning("Approved, but coordinator PDF export failed.", {
            description: "Try Download PDF from this page, or regenerate from records.",
          });
        }
        setCoordAllParams(false);
        setCoordMentorProactive(false);
        setCoordContinuousMonitoring(false);
      } else if (action === "approve" && isHodReviewer && hodChecksComplete) {
        const snapshot = getReport(report.id) ?? remoteReport ?? report;
        const hodForPdf: HodPdfAudit =
          snapshot.hodValidation ?? hodValidationPayload!;
        try {
          await generateAtrPdf(snapshot, null, hodForPdf);
          toast.success("Approved & forwarded.", {
            description: `Forwarded to Chief Mentor. HOD review PDF (${snapshot.id}_HOD_Dept_Review.pdf).`,
            duration: 9000,
          });
        } catch (pdfErr) {
          console.error(pdfErr);
          toast.warning("Approved, but HOD PDF export failed.", {
            description: "Try Download PDF from this page after refresh.",
          });
        }
        setHodDeptMentoringCheck(false);
      } else if (action === "approve" && isChiefMentorReviewer && chiefMentorChecksComplete) {
        const snapshot = getReport(report.id) ?? remoteReport ?? report;
        const chiefForPdf: ChiefMentorPdfAudit =
          snapshot.chiefMentorValidation ?? chiefMentorValidationPayload!;
        try {
          await generateAtrPdf(snapshot, null, null, chiefForPdf);
          toast.success("Approved & forwarded.", {
            description: `Forwarded to IQAC. Chief Mentor review PDF (${snapshot.id}_ChiefMentor_Validation.pdf).`,
            duration: 9000,
          });
        } catch (pdfErr) {
          console.error(pdfErr);
          toast.warning("Approved, but Chief Mentor PDF export failed.", {
            description: "Try Download PDF from this page after refresh.",
          });
        }
        setChiefEndorsesProgression(false);
      } else {
        toast.success(action === "approve" ? "Report approved and forwarded." : "Report rejected.");
      }
      setRemark("");
    } catch (err) {
      toast.error("Action failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const refreshReportFromServer = () => {
    if (!user) return;
    void getAtrByIdFn({ data: { user, atrId: report.id } })
      .then((full) => {
        if (full) setRemoteReport(full as AtrReport);
      })
      .catch(() => {});
  };

  const handleIqacScanFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setIqacScanDraft(null);
      return;
    }
    const mime = file.type || "application/octet-stream";
    if (!mime.includes("pdf") && !mime.startsWith("image/")) {
      toast.error("Upload a scanned PDF or image file.", { duration: 8000 });
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string | undefined;
      setIqacScanDraft({
        name: file.name,
        size: file.size,
        type: mime,
        dataUrl,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleIqacApproveMergedAndDownload = async () => {
    if (!user) return;
    if (!iqacMergedChainSnapshotsReady(report)) {
      toast.error("Cannot issue the IQAC merged package.", {
        description:
          "Coordinator, HOD, and Chief Mentor validation snapshots must all be stored on this ATR.",
        duration: 10_000,
      });
      return;
    }
    setLoading(true);
    try {
      await reviewReport(report.id, "approve", remark);
      refreshReportFromServer();
      const snapshotAfter =
        getReport(report.id) ??
        ({ ...report, status: "iqac_pending_scan" as const } as AtrReport);
      try {
        await generateIqacMergedValidationPdf(snapshotAfter);
      } catch (pdfErr) {
        console.error(pdfErr);
        toast.warning("Status updated; merged PDF export failed.", {
          description: "Use Download PDF to try again.",
        });
      }
      toast.success("Merged package downloaded — complete offline, then upload the scan.", {
        description:
          "Print, sign, and stamp as required, scan the document, then use the upload and Submit final approval step.",
        duration: 14_000,
      });
      setRemark("");
    } catch {
      toast.error("IQAC approve failed.", { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  const handleIqacRejectFromWorkflow = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await reviewReport(report.id, "reject", remark);
      refreshReportFromServer();
      toast.success("Report rejected.");
      setRemark("");
      setIqacScanDraft(null);
      if (iqacScanInputRef.current) iqacScanInputRef.current.value = "";
    } catch {
      toast.error("Could not reject this ATR.");
    } finally {
      setLoading(false);
    }
  };

  const handleIqacSubmitFinalize = async () => {
    if (!user) return;
    if (!iqacScanDraft?.dataUrl?.trim()) {
      toast.error("Choose the scanned countersigned document first.", { duration: 8000 });
      return;
    }
    setLoading(true);
    try {
      await finalizeIqacWithSignedScan(report.id, iqacScanDraft, remark.trim() || undefined);
      refreshReportFromServer();
      toast.success("ATR cycle complete.", {
        description: "Approved with IQAC countersigned scan on file.",
        duration: 9000,
      });
      setRemark("");
      setIqacScanDraft(null);
      if (iqacScanInputRef.current) iqacScanInputRef.current.value = "";
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Submit failed.";
      toast.error(msg, { duration: 10_000 });
    } finally {
      setLoading(false);
    }
  };

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
                <iframe title={attachmentPreview.name} src={attachmentPreview.url} className="w-full h-full border-0" />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
                  <Paperclip className="size-10" />
                  <p className="text-sm">No inline preview for this type.</p>
                  <a
                    href={attachmentPreview.url}
                    download={attachmentPreview.name}
                    className="text-sm font-bold text-growth underline underline-offset-2"
                  >
                    Download file
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className="p-6 lg:p-12 max-w-[1400px] mx-auto space-y-8">
        <Link
          to="/atrs"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-growth transition-colors"
        >
          <ArrowLeft className="size-4" /> Back to my ATRs
        </Link>

        {isIqacWorkflowAdmin ? (
          <section className="bg-surface border-2 border-growth/20 rounded-[2rem] p-8 shadow-xl shadow-growth/5 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-growth font-bold text-[10px] uppercase tracking-widest mb-1">
                  <Clock className="size-3" /> IQAC institutional close-out
                </div>
                <h2 className="text-2xl font-light tracking-tight">
                  {isIqacAwaitingMergedApprove ? (
                    <>
                      Issue <span className="italic font-display text-growth">merged</span> validation package
                    </>
                  ) : (
                    <>
                      Upload <span className="italic font-display text-growth">countersigned</span> scan
                    </>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground max-w-prose">
                  {isIqacAwaitingMergedApprove ? (
                    <>
                      Approve to move this ATR to the filing step and automatically download the merged PDF (mentor
                      submission through Chief Mentor). After printing, signing, and stamping, scan the document and
                      complete the cycle with Submit final approval.
                    </>
                  ) : (
                    <>
                      Upload one PDF or image scan of the institutional package after physical sign-off and stamp. Submit
                      final approval archives the scan and closes the ATR permanently.
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {isIqacAwaitingMergedApprove ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleIqacRejectFromWorkflow()}
                      disabled={loading}
                      className="px-6 py-3 rounded-2xl text-sm font-bold bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <XCircle className="size-4" /> Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleIqacApproveMergedAndDownload()}
                      disabled={loading || !iqacMergedChainSnapshotsReady(report)}
                      title={
                        !iqacMergedChainSnapshotsReady(report)
                          ? "All prior validation snapshots must be stored before the merge can run."
                          : undefined
                      }
                      className="px-8 py-3 rounded-2xl text-sm font-bold bg-growth text-growth-foreground hover:scale-105 active:scale-95 transition-all shadow-lg shadow-growth/20 flex items-center gap-2 disabled:opacity-40"
                    >
                      {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                      Approve &amp; download merged report
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleIqacRejectFromWorkflow()}
                      disabled={loading}
                      className="px-6 py-3 rounded-2xl text-sm font-bold bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <XCircle className="size-4" /> Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleIqacSubmitFinalize()}
                      disabled={loading || !iqacScanDraft?.dataUrl}
                      className="px-8 py-3 rounded-2xl text-sm font-bold bg-growth text-growth-foreground hover:scale-105 active:scale-95 transition-all shadow-lg shadow-growth/20 flex items-center gap-2 disabled:opacity-40"
                    >
                      {loading ? <Loader2 className="size-4 animate-spin" /> : <FileCheck className="size-4" />}
                      Submit final approval
                    </button>
                  </>
                )}
              </div>
            </div>

            {!isIqacAwaitingMergedApprove ? (
              <div className="mt-6 rounded-2xl border border-growth/20 bg-secondary/15 p-5 space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-growth">Scanned countersigned package</p>
                <label
                  htmlFor="iqac-scan-upload"
                  className="flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer"
                >
                  <span className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-secondary hover:bg-secondary/80 transition-colors border border-border shrink-0 pointer-events-none">
                    <Upload className="size-4" /> Choose scan (PDF / image)
                  </span>
                  <input
                    ref={iqacScanInputRef}
                    id="iqac-scan-upload"
                    type="file"
                    accept="application/pdf,image/*"
                    className="sr-only"
                    onChange={handleIqacScanFileChange}
                  />
                  <span className="text-sm text-muted-foreground">
                    {iqacScanDraft ? (
                      <>
                        <span className="font-medium text-foreground">{iqacScanDraft.name}</span> —{" "}
                        {(iqacScanDraft.size / 1024).toFixed(1)} KB
                      </>
                    ) : (
                      "No file selected yet."
                    )}
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  The same merged package is available from{" "}
                  <span className="font-medium text-foreground">Download PDF</span> if you need another copy before
                  submitting.
                </p>
              </div>
            ) : null}

            <div className="mt-6 relative">
              <MessageSquare className="absolute left-4 top-4 size-4 text-muted-foreground" />
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="IQAC remarks (optional) — included in the timeline and final filing."
                className="w-full pl-11 pr-4 py-4 bg-secondary/20 border border-border/50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-growth/20 transition-all min-h-[100px] resize-none"
              />
            </div>
          </section>
        ) : null}

        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {report.id}
              </span>
              <StatusBadge status={report.status} />
            </div>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight">{atrDisplayLabel(report)}</h1>
            <p className="text-muted-foreground mt-2">
              Submitted by {report.mentorName} · {report.department}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
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
                <p className="text-sm font-medium mt-1">{totalStudentsSummary(report)}</p>
              </div>
              <div>
                <Paperclip className="size-4 text-growth mb-2" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Attachments
                </p>
                <p className="text-sm font-medium mt-1">{report.attachments.length}</p>
              </div>
            </section>

            {/* Action Taken Framework — mirrors Create ATR layout (read-only) */}
            <section className="rounded-[2rem] border border-growth/20 bg-background/35 dark:bg-secondary/25 backdrop-blur-xl shadow-[0_24px_80px_-28px_rgba(45,79,60,0.35)] overflow-hidden">
              <div className="p-6 md:p-8 border-b border-growth/10 bg-secondary/25 backdrop-blur-md">
                <div className="flex gap-4 items-start">
                  <div className="size-12 shrink-0 rounded-2xl bg-growth/15 border border-growth/25 flex items-center justify-center shadow-inner">
                    <ClipboardList className="size-6 text-growth" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-growth md:text-xs">
                      Action Taken Framework
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                      Structured mentoring outcomes as submitted — same layout as the Create ATR step for easier review.
                      Collapse sections to skim; expand for full narrative and evidence.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8 space-y-5">
                {report.actions?.length ? (
                  report.actions.map((row, idx) => {
                    const rowKey = row.id ?? `row-${idx}`;
                    const collapsed = !!collapsedActionKeys[rowKey];
                    const pct = actionRowReviewPct(row);
                    const preview =
                      String(row.issue ?? "").trim().slice(0, 96) +
                      (String(row.issue ?? "").trim().length > 96 ? "…" : "");

                    return (
                      <article
                        key={rowKey}
                        className={cn(
                          "rounded-[1.5rem] border border-growth/15 bg-secondary/35 dark:bg-black/25 backdrop-blur-lg",
                          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-[border-color] duration-300",
                          "hover:border-growth/30",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6 border-b border-growth/10">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedActionKeys((p) => ({
                                  ...p,
                                  [rowKey]: !p[rowKey],
                                }))
                              }
                              aria-expanded={!collapsed}
                              aria-label={collapsed ? "Expand issue details" : "Collapse issue details"}
                              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-growth/20 bg-secondary/40 text-muted-foreground hover:bg-growth/15 hover:text-growth transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/40"
                            >
                              <ChevronDown
                                className={cn("size-5 transition-transform duration-300", collapsed && "-rotate-90")}
                                aria-hidden
                              />
                            </button>
                            <div className="hidden sm:flex size-10 shrink-0 rounded-full bg-growth/10 border border-growth/20 items-center justify-center">
                              <GripVertical className="size-5 text-muted-foreground opacity-50" aria-hidden />
                            </div>
                            <div
                              className="size-10 shrink-0 rounded-full bg-gradient-to-br from-growth to-growth/70 text-growth-foreground shadow-md shadow-growth/30 flex items-center justify-center font-bold text-sm tabular-nums ring-4 ring-growth/15"
                              aria-hidden
                            >
                              {idx + 1}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedActionKeys((p) => ({
                                  ...p,
                                  [rowKey]: !p[rowKey],
                                }))
                              }
                              className="min-w-0 text-left rounded-xl px-2 py-0.5 -mx-2 hover:bg-growth/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/40"
                            >
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Issue #{idx + 1}
                              </p>
                              {collapsed && preview ? (
                                <p className="text-[11px] text-foreground/90 line-clamp-2 mt-1 leading-snug max-w-xl">
                                  {preview}
                                </p>
                              ) : (
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  Expand to read actions, timeline, outcome, and evidence.
                                </p>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="px-5 md:px-6 pt-2 pb-4">
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

                        {!collapsed ? (
                          <div className="px-5 md:px-6 pb-6 md:pb-7 space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 duration-300">
                            <div className="rounded-2xl border border-growth/10 bg-background/75 dark:bg-black/35 px-4 py-3 text-sm whitespace-pre-wrap">
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2">
                                Issue identified
                              </p>
                              <p className="leading-relaxed text-foreground/95">
                                {row.issue?.trim() ? row.issue : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,240px)_1fr] gap-6">
                              <div className="space-y-4">
                                <div className="rounded-2xl border border-growth/10 bg-background/75 dark:bg-black/35 px-4 py-3">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2 flex items-center gap-2">
                                    <Users className="size-3.5 text-growth/80" aria-hidden />
                                    No. of students
                                  </p>
                                  <p className="text-lg font-bold tabular-nums text-foreground">{row.studentCount}</p>
                                </div>
                                <div className="rounded-2xl border border-growth/10 bg-background/75 dark:bg-black/35 px-4 py-3">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2 flex items-center gap-2">
                                    <CalendarDays className="size-3.5 text-growth/80" aria-hidden />
                                    Timeline / milestone
                                  </p>
                                  <p className="text-sm whitespace-pre-wrap">
                                    {row.timeline?.trim() ? row.timeline : (
                                      <span className="text-muted-foreground italic">—</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-5">
                                <div className="rounded-2xl border border-growth/10 bg-background/75 dark:bg-black/35 px-4 py-3">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2 flex items-center gap-2">
                                    <ListChecks className="size-3.5 text-growth/80" aria-hidden />
                                    Action taken
                                  </p>
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                    {row.actionTaken?.trim() ? row.actionTaken : (
                                      <span className="text-muted-foreground italic">—</span>
                                    )}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-growth/10 bg-background/75 dark:bg-black/35 px-4 py-3">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2 flex items-center gap-2">
                                    <Sparkles className="size-3.5 text-growth/80" aria-hidden />
                                    Outcome / impact
                                  </p>
                                  <p className="text-sm text-growth font-medium whitespace-pre-wrap leading-relaxed">
                                    {row.outcome?.trim() ? row.outcome : (
                                      <span className="text-muted-foreground italic font-normal">—</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {(row.evidenceFiles?.length ?? 0) > 0 ? (
                              <div className="pt-1">
                                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground flex items-center gap-2">
                                  <Paperclip className="size-3.5 text-growth/80" aria-hidden />
                                  Supporting evidence
                                </p>
                                <ul className="flex flex-wrap gap-2">
                                  {(row.evidenceFiles ?? []).map((file, fIdx) => (
                                    <li key={`${file.name}-${fIdx}`}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenAttachment({
                                            name: file.name,
                                            size: file.size,
                                            type: file.type,
                                            dataUrl: file.dataUrl,
                                          })
                                        }
                                        className="inline-flex items-center gap-2 pl-3 pr-3 py-2 rounded-xl border border-growth/15 bg-growth/5 hover:bg-growth/10 hover:border-growth/30 transition-colors text-left max-w-[220px]"
                                      >
                                        <FileCheck className="size-3.5 shrink-0 text-growth" aria-hidden />
                                        <span className="truncate text-[10px] font-bold">{file.name}</span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-14 text-center rounded-2xl border border-dashed border-growth/25 bg-secondary/20">
                    <ClipboardList className="size-10 text-growth/45 mb-3" aria-hidden />
                    <p className="text-sm font-semibold text-foreground">No issues on this report</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      The mentor did not attach structured action rows for this submission.
                    </p>
                  </div>
                )}
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
                    <button
                      key={`${a.name}-${i}`}
                      type="button"
                      onClick={() => handleOpenAttachment(a)}
                      className="text-left rounded-xl border border-border overflow-hidden bg-secondary/30 hover:border-growth/50 hover:bg-secondary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/40"
                    >
                      {a.dataUrl ? (
                        <img src={a.dataUrl} alt="" className="w-full h-32 object-cover pointer-events-none" />
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
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {/* IQAC institutional countersigned archive (approved ATRs) */}
            {report.iqacSignedScan ? (
              <section className="bg-surface rounded-3xl border border-border/60 shadow-card p-7">
                <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                  IQAC countersigned scan (archived)
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Institutional package after signature and stamp — stored when IQAC completes the approval cycle.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAttachment(report.iqacSignedScan!)}
                  className="text-left rounded-xl border border-border overflow-hidden bg-secondary/30 hover:border-growth/50 hover:bg-secondary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/40 inline-block min-w-[200px]"
                >
                  {report.iqacSignedScan.dataUrl && report.iqacSignedScan.type?.startsWith("image/") ? (
                    <img
                      src={report.iqacSignedScan.dataUrl}
                      alt=""
                      className="w-full max-w-xs h-40 object-cover pointer-events-none"
                    />
                  ) : (
                    <div className="w-full max-w-xs h-32 flex flex-col items-center justify-center gap-2 text-muted-foreground p-4">
                      <FileCheck className="size-10 text-growth/80" />
                      <span className="text-xs font-medium truncate max-w-[180px]">
                        {report.iqacSignedScan.name}
                      </span>
                    </div>
                  )}
                  <div className="p-2.5 bg-surface">
                    <p className="text-[11px] font-medium truncate">{report.iqacSignedScan.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(report.iqacSignedScan.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </button>
              </section>
            ) : null}
          </div>

          <aside className="space-y-6">
            <ApprovalTimeline timeline={report.timeline} currentStatus={report.status} />
          </aside>
        </div>

        {isReviewer && (
          <section className="bg-surface border-2 border-growth/20 rounded-[2rem] p-8 shadow-xl shadow-growth/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                  type="button"
                  onClick={() => handleAction("approve")}
                  disabled={
                    loading ||
                    (isCoordinatorReviewer && !coordinatorChecksComplete) ||
                    (isHodReviewer && !hodChecksComplete) ||
                    (isChiefMentorReviewer && !chiefMentorChecksComplete)
                  }
                  title={
                    isCoordinatorReviewer && !coordinatorChecksComplete
                      ? "Confirm all three checklist items below before approving."
                      : isHodReviewer && !hodChecksComplete
                        ? "Confirm the HOD departmental checklist below before approving."
                        : isChiefMentorReviewer && !chiefMentorChecksComplete
                          ? "Confirm the Chief Mentor IQAC endorsement below before approving."
                          : undefined
                  }
                  className="px-8 py-3 rounded-2xl text-sm font-bold bg-growth text-growth-foreground hover:scale-105 active:scale-95 transition-all shadow-lg shadow-growth/20 flex items-center gap-2 disabled:opacity-40"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                  Approve & Forward
                </button>
              </div>
            </div>

            {isCoordinatorReviewer ? (
              <fieldset className="mt-6 rounded-2xl border border-growth/20 bg-secondary/15 p-5 space-y-4">
                <legend className="text-[11px] font-bold uppercase tracking-widest text-growth px-2">
                  Coordinator confirmation
                </legend>
                <p className="text-xs text-muted-foreground -mt-1 mb-3">
                  You must acknowledge each item below. Approved reports download a bundled PDF mirroring mentor ATR layout
                  with your checklist and departmental details appended.
                </p>
                <label className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-secondary/40 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={coordAllParams}
                    onChange={(e) => setCoordAllParams(e.target.checked)}
                    className="mt-1 size-4 shrink-0 rounded border-border text-growth accent-growth focus-visible:ring-2 focus-visible:ring-growth/40"
                  />
                  <span className="text-sm leading-snug text-foreground">All parameters are properly addressed.</span>
                </label>
                <label className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-secondary/40 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={coordMentorProactive}
                    onChange={(e) => setCoordMentorProactive(e.target.checked)}
                    className="mt-1 size-4 shrink-0 rounded border-border text-growth accent-growth focus-visible:ring-2 focus-visible:ring-growth/40"
                  />
                  <span className="text-sm leading-snug text-foreground">Mentor has taken proactive steps.</span>
                </label>
                <label className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-secondary/40 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={coordContinuousMonitoring}
                    onChange={(e) => setCoordContinuousMonitoring(e.target.checked)}
                    className="mt-1 size-4 shrink-0 rounded border-border text-growth accent-growth focus-visible:ring-2 focus-visible:ring-growth/40"
                  />
                  <span className="text-sm leading-snug text-foreground">
                    Suggested continuous monitoring for communication and career guidance.
                  </span>
                </label>
              </fieldset>
            ) : null}

            {isHodReviewer ? (
              <fieldset className="mt-6 rounded-2xl border border-growth/20 bg-secondary/15 p-5 space-y-4">
                <legend className="text-[11px] font-bold uppercase tracking-widest text-growth px-2">
                  HOD confirmation
                </legend>
                <p className="text-xs text-muted-foreground -mt-1 mb-3">
                  You must acknowledge the statement below. Approving forwards this ATR to the Chief Mentor and saves an
                  HOD departmental review PDF for your records.
                </p>
                <label className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-secondary/40 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={hodDeptMentoringCheck}
                    onChange={(e) => setHodDeptMentoringCheck(e.target.checked)}
                    className="mt-1 size-4 shrink-0 rounded border-border text-growth accent-growth focus-visible:ring-2 focus-visible:ring-growth/40"
                  />
                  <span className="text-sm leading-snug text-foreground">
                    The mentoring process is effective. More structured career development programs should be integrated
                    at department level.
                  </span>
                </label>
              </fieldset>
            ) : null}

            {isChiefMentorReviewer ? (
              <fieldset className="mt-6 rounded-2xl border border-growth/20 bg-secondary/15 p-5 space-y-4">
                <legend className="text-[11px] font-bold uppercase tracking-widest text-growth px-2">
                  Chief Mentor confirmation
                </legend>
                <p className="text-xs text-muted-foreground -mt-1 mb-3">
                  You must acknowledge the statement below. Approving forwards this ATR to IQAC and saves a Chief Mentor
                  review PDF for institutional records.
                </p>
                <label className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-secondary/40 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={chiefEndorsesProgression}
                    onChange={(e) => setChiefEndorsesProgression(e.target.checked)}
                    className="mt-1 size-4 shrink-0 rounded border-border text-growth accent-growth focus-visible:ring-2 focus-visible:ring-growth/40"
                  />
                  <span className="text-sm leading-snug text-foreground">
                    This ATR aligns with institutional mentoring policy; I endorse progression to IQAC audit.
                  </span>
                </label>
              </fieldset>
            ) : null}

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
      </div>
    </AppShell>
  );
}
