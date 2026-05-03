import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import { useStudents } from "@/lib/student-store";
import { Upload, FileSpreadsheet, Plus, X, Users } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useRef } from "react";

export const Route = createFileRoute("/team")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = getCurrentUser();
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "mentor") {
      throw redirect({ to: getHomeRouteForRole(user.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "My Group — BCET ATR" },
      { name: "description", content: "Mentor group of assigned students at BCET." },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const user = getCurrentUser();
  const { students, setStudents } = useStudents(user?.id || "anonymous");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        // Expected columns: Name, RollNo, Semester
        const parsed = data.map((row) => ({
          name: row.Name || row.name || row["Student Name"] || "Unknown",
          rollNo: String(row.RollNo || row.rollNo || row["Roll No"] || ""),
          semester: String(row.Semester || row.semester || "I"),
        })).filter(s => s.rollNo);

        if (parsed.length === 0) {
          toast.error("No valid student data found in Excel. Please check columns (Name, RollNo, Semester).");
          return;
        }

        setStudents(parsed);
        toast.success(`Successfully imported ${parsed.length} students!`);
      } catch (err) {
        console.error(err);
        toast.error("Failed to parse Excel file.");
      }
    };
    reader.readAsBinaryString(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <AppShell>
      <div className="p-6 lg:p-12 max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
              Mentor Group
            </p>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight">My students</h1>
            <p className="text-muted-foreground mt-2">
              Manage the group of students assigned to you for this academic year.
            </p>
          </div>
          <div className="flex gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-growth rounded-xl text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              <FileSpreadsheet className="size-4" />
              Import Excel
            </button>
            <button
              onClick={() => setStudents([])}
              className="inline-flex items-center gap-2 px-4 py-2 border border-destructive/20 text-destructive rounded-xl text-sm font-medium hover:bg-destructive/5 transition-colors"
            >
              <X className="size-4" />
              Clear All
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.length === 0 ? (
            <div className="col-span-full py-24 text-center border-2 border-dashed border-border rounded-[2rem] bg-secondary/20">
              <div className="size-16 rounded-2xl bg-background border border-border flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                <Users className="size-8" />
              </div>
              <h3 className="text-lg font-medium">No students yet</h3>
              <p className="text-muted-foreground mt-1 text-sm max-w-xs mx-auto">
                Upload an Excel sheet with columns <span className="font-semibold">Name</span>, <span className="font-semibold">RollNo</span>, and <span className="font-semibold">Semester</span> to get started.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-growth text-growth-foreground rounded-xl text-sm font-medium shadow-lg shadow-growth/20 hover:scale-[1.02] transition-all active:scale-100"
              >
                <Upload className="size-4" />
                Upload Spreadsheet
              </button>
            </div>
          ) : (
            students.map((s, idx) => {
              const initials = s.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("");
              return (
                <div
                  key={`${s.rollNo}-${idx}`}
                  className="bg-surface rounded-2xl border border-border/60 shadow-card p-5 flex items-center gap-4 group hover:border-growth/40 transition-all hover:shadow-architectural"
                >
                  <div className="size-12 rounded-full bg-growth/10 text-growth flex items-center justify-center font-semibold shrink-0 group-hover:bg-growth group-hover:text-growth-foreground transition-colors">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate group-hover:text-growth transition-colors">{s.name}</p>
                    <p className="text-xs text-muted-foreground font-mono tabular-nums">{s.rollNo}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-1.5 py-0.5 rounded bg-secondary text-[9px] uppercase tracking-wider font-bold text-muted-foreground">
                        Sem {s.semester}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
