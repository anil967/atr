import { useMemo, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParsedStudent, TaggedMentee } from "@/lib/atr-types";

export function MenteeTagField({
  roster,
  value,
  onChange,
  disabled,
  inputId,
  onEnterCheck,
}: {
  roster: ParsedStudent[];
  value: TaggedMentee[];
  onChange: (next: TaggedMentee[]) => void;
  disabled?: boolean;
  inputId: string;
  /** When menu is closed, Enter runs this (e.g. reveal missing fields). */
  onEnterCheck?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [draft, setDraft] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);

  const lastAt = draft.lastIndexOf("@");
  const mentionActive = lastAt >= 0;
  const query = mentionActive ? draft.slice(lastAt + 1).toLowerCase() : "";

  const suggestions = useMemo(() => {
    if (!mentionActive || roster.length === 0) return [];
    const taken = new Set(value.map((t) => t.rollNo));
    return roster
      .filter((s) => String(s.rollNo ?? "").trim() && !taken.has(String(s.rollNo)))
      .filter((s) => {
        if (!query) return true;
        const nm = (s.name ?? "").toLowerCase();
        const rn = String(s.rollNo).toLowerCase();
        return nm.includes(query) || rn.includes(query);
      })
      .slice(0, 12);
  }, [roster, value, query, mentionActive]);

  const openMenu = mentionActive && suggestions.length > 0;

  const pick = (s: ParsedStudent) => {
    const rollNo = String(s.rollNo);
    const next = [...value, { rollNo, name: s.name || "Unknown" }];
    onChange(next);
    setDraft((d) => d.slice(0, lastAt));
    setHighlightIdx(0);
  };

  const remove = (rollNo: string) => {
    onChange(value.filter((t) => t.rollNo !== rollNo));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (openMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && suggestions[highlightIdx]) {
        e.preventDefault();
        pick(suggestions[highlightIdx]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDraft((d) => d.slice(0, lastAt));
        return;
      }
    } else if (e.key === "Enter" && onEnterCheck) {
      onEnterCheck(e);
    }
  };

  return (
    <div className="relative space-y-3">
      <div className="flex flex-wrap gap-2 min-h-[2rem]">
        {value.map((t) => (
          <span
            key={t.rollNo}
            className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium bg-growth/15 border border-growth/30 text-foreground"
          >
            <span className="truncate max-w-[12rem]" title={`${t.name} · ${t.rollNo}`}>
              {t.name}
            </span>
            <button
              type="button"
              disabled={disabled}
              className="rounded-full p-0.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive disabled:opacity-40"
              aria-label={`Remove ${t.name}`}
              onClick={() => remove(t.rollNo)}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setHighlightIdx(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={
            roster.length
              ? "Type @ for name suggestions, then pick a mentee. Repeat to add more."
              : "Add mentees under My mentee (or import on this page), then type @ here…"
          }
          autoComplete="off"
          className={cn(
            "w-full rounded-2xl px-4 py-3 text-sm bg-background/80 dark:bg-black/35 border border-growth/10 shadow-inner placeholder:text-muted-foreground/55",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-growth/35 focus-visible:border-growth/40",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        />
        {openMenu ? (
          <ul
            className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-border bg-popover shadow-lg py-1 text-sm"
            role="listbox"
          >
            {suggestions.map((s, i) => (
              <li key={s.rollNo}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlightIdx}
                  className={cn(
                    "w-full text-left px-3 py-2 flex flex-col gap-0.5",
                    i === highlightIdx ? "bg-growth/15 text-foreground" : "hover:bg-secondary/80",
                  )}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => pick(s)}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{s.rollNo}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : mentionActive && roster.length > 0 && query.length > 0 && suggestions.length === 0 ? (
          <p className="absolute z-40 mt-1 w-full rounded-xl border border-border/60 bg-secondary/90 px-3 py-2 text-xs text-muted-foreground">
            No mentee matches &quot;{query}&quot;. Try another spelling or add them under My mentee.
          </p>
        ) : null}
      </div>
    </div>
  );
}
