import type { AtrStatus, AtrTimelineEntry } from "@/lib/atr-types";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/atr-types";
import { entryForDisplayedStage, isPipelineStatus, pipelineIndex } from "@/lib/atr-workflow";
import { format } from "date-fns";

const STAGES: { key: AtrStatus; label: string }[] = [
  { key: "submitted", label: "Submission" },
  { key: "coordinator_review", label: "Coordinator" },
  { key: "hod_review", label: "HOD" },
  { key: "chief_mentor_review", label: "Chief Mentor" },
  { key: "iqac_review", label: "IQAC Audit" },
  { key: "iqac_pending_scan", label: "Signed scan filing" },
  { key: "approved", label: "Approved" },
];

export function ApprovalTimeline({
  timeline,
  currentStatus,
}: {
  timeline?: AtrTimelineEntry[] | null;
  currentStatus: AtrStatus;
}) {
  const safeTimeline = Array.isArray(timeline) ? timeline : [];
  const curIdx =
    currentStatus === "rejected"
      ? -999
      : isPipelineStatus(currentStatus)
        ? pipelineIndex(currentStatus)
        : -999;

  return (
    <div className="bg-growth text-growth-foreground rounded-3xl p-8 shadow-architectural relative overflow-hidden">
      <h3 className="text-lg font-medium mb-1">Validation Sequence</h3>
      <p className="text-xs text-growth-foreground/60 mb-8">
        Mentor submission through coordinator, HOD, and chief mentor; IQAC merges the institutional package,
        obtains signatures and stamp, uploads the scanned file, then the record is approved.
      </p>

      {currentStatus === "rejected" ? (
        <p className="text-sm font-medium mb-8 text-destructive/95">
          This report was rejected and will not proceed in the institutional chain unless resubmitted.
        </p>
      ) : null}

      <div className="border-l border-growth-foreground/20 ml-2 space-y-7">
        {STAGES.map((stage, idx) => {
          const sIdx = pipelineIndex(stage.key);
          const reached =
            currentStatus === "approved"
              ? true
              : currentStatus === "rejected"
                ? false
                : curIdx >= 0 && sIdx <= curIdx;
          const active =
            currentStatus !== "rejected" &&
            currentStatus !== "draft" &&
            stage.key === currentStatus;
          const entry = entryForDisplayedStage(safeTimeline, stage.key);

          return (
            <div key={stage.key} className={`relative pl-8 ${reached ? "" : "opacity-40"}`}>
              <div
                className={`absolute left-[-5px] top-1.5 size-2.5 rounded-full ${
                  reached ? "bg-growth-foreground" : "bg-growth-foreground/30"
                } ${active ? "ring-4 ring-growth-foreground/15" : ""}`}
              />
              <p className="text-[10px] text-growth-foreground/50 uppercase tracking-[0.18em] font-bold">
                Step {String(idx + 1).padStart(2, "0")}
              </p>
              <h4 className="font-medium">{stage.label}</h4>
              {entry ? (
                <p className="text-xs text-growth-foreground/70 mt-1">
                  {entry.actor} · {ROLE_LABELS[entry.role]}
                  <span className="block text-growth-foreground/50">
                    {format(new Date(entry.at), "MMM d, yyyy · h:mm a")}
                  </span>
                  {entry.remark ? (
                    <span className="block mt-1 italic">&ldquo;{entry.remark}&rdquo;</span>
                  ) : null}
                </p>
              ) : active ? (
                <p className="text-xs text-growth-foreground/70 mt-1">
                  {stage.key === "iqac_pending_scan" ? (
                    <>
                      Signed and stamped the merged PDF offline? Upload the scanned file below on the report page, then use
                      <span className="font-semibold text-growth-foreground/85"> Submit final approval </span>
                      to close this ATR.
                    </>
                  ) : stage.key === "iqac_review" ? (
                    <>
                      IQAC verifies the institutional chain, then selects{" "}
                      <span className="font-semibold text-growth-foreground/85">Approve & download merged report</span> to
                      issue the printable package before countersignature.
                    </>
                  ) : (
                    "Awaiting institutional sign-off at this stage."
                  )}
                </p>
              ) : !reached ? (
                <p className="text-xs text-growth-foreground/50 mt-1">
                  Awaiting {STATUS_LABELS[stage.key]?.toLowerCase() ?? stage.key}.
                </p>
              ) : (
                <p className="text-xs text-growth-foreground/60 mt-1">Forwarded — pending next reviewer.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-0 right-0 w-full h-1/2 bg-linear-to-tr from-transparent to-growth-foreground/5 pointer-events-none" />
    </div>
  );
}
