import type { AtrTimelineEntry } from "@/lib/atr-types";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/atr-types";
import { format } from "date-fns";

const STAGES: { key: AtrTimelineEntry["stage"]; label: string }[] = [
  { key: "submitted", label: "Submission" },
  { key: "coordinator_review", label: "Coordinator" },
  { key: "hod_review", label: "HOD" },
  { key: "chief_mentor_review", label: "Chief Mentor" },
  { key: "approved", label: "Approved" },
];

export function ApprovalTimeline({ timeline }: { timeline: AtrTimelineEntry[] }) {
  const reachedSet = new Set(timeline.map((t) => t.stage));
  const lastStage = timeline[timeline.length - 1]?.stage;

  return (
    <div className="bg-growth text-growth-foreground rounded-3xl p-8 shadow-architectural relative overflow-hidden">
      <h3 className="text-lg font-medium mb-1">Validation Sequence</h3>
      <p className="text-xs text-growth-foreground/60 mb-8">
        Multi-level approval from mentor to chief mentor.
      </p>

      <div className="border-l border-growth-foreground/20 ml-2 space-y-7">
        {STAGES.map((stage, idx) => {
          const reached = reachedSet.has(stage.key);
          const active = lastStage === stage.key && stage.key !== "approved";
          const entry = timeline.find((t) => t.stage === stage.key);
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
                    <span className="block mt-1 italic">"{entry.remark}"</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-xs text-growth-foreground/50 mt-1">
                  Awaiting {STATUS_LABELS[stage.key].toLowerCase()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-0 right-0 w-full h-1/2 bg-linear-to-tr from-transparent to-growth-foreground/5 pointer-events-none" />
    </div>
  );
}
