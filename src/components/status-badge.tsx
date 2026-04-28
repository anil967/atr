import type { AtrStatus } from "@/lib/atr-types";
import { STATUS_LABELS } from "@/lib/atr-types";
import { statusToneClasses } from "@/lib/atr-store";

export function StatusBadge({ status }: { status: AtrStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusToneClasses(
        status
      )}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
