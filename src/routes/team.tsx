import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import { useStudents, type Student } from "@/lib/student-store";
import {
  createEmptyStudent,
  ensureStudentIds,
  parseStudentRowsFromSheet,
} from "@/lib/student-excel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Plus, X, Users, Pencil, Trash2, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useRef, useState } from "react";

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
      { title: "My mentee — BCET ATR" },
      { name: "description", content: "Mentor mentee roster at BCET." },
    ],
  }),
  component: TeamPage,
});

type DeleteConfirm = { kind: "clear" } | { kind: "one"; student: Student } | null;

function TeamPage() {
  const user = getCurrentUser();
  const { students, setStudents, isLoading } = useStudents(user?.id || "anonymous");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [isNewStudent, setIsNewStudent] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>(null);

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
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

        const parsed = parseStudentRowsFromSheet(data);
        const withIds = ensureStudentIds(parsed);

        if (withIds.length === 0) {
          toast.error("No valid rows found. Each row needs a Roll No and a header row in the spreadsheet.");
          return;
        }

        setStudents(withIds);
        toast.success(`Imported ${withIds.length} student(s).`);
      } catch (err) {
        console.error(err);
        toast.error("Failed to parse Excel file.");
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openAdd = () => {
    setIsNewStudent(true);
    setEditing(createEmptyStudent());
  };

  const openEdit = (s: Student) => {
    setIsNewStudent(false);
    setEditing({ ...s, id: s.id });
  };

  const saveEditing = () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.rollNo.trim()) {
      toast.error("Student name and Roll No are required.");
      return;
    }
    const br = editing.branch?.trim();
    const row: Student = {
      ...editing,
      id:
        editing.id ??
        (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined),
      department: br || editing.department?.trim() || undefined,
      branch: br || undefined,
    };
    if (isNewStudent) {
      setStudents([...students, row]);
      toast.success("Student added.");
    } else {
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.id === editing.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = row;
        return next;
      });
      toast.success("Student updated.");
    }
    setEditing(null);
    setIsNewStudent(false);
  };

  const runDeleteConfirm = () => {
    if (deleteConfirm?.kind === "clear") {
      setStudents([]);
      toast.success("Cleared all students.");
    } else if (deleteConfirm?.kind === "one") {
      const id = deleteConfirm.student.id;
      setStudents((prev) => prev.filter((x) => x.id !== id));
      toast.success("Removed from group.");
    }
    setDeleteConfirm(null);
  };

  const updateDraft = (field: keyof Student, value: string) => {
    setEditing((d) => (d ? { ...d, [field]: value } : null));
  };

  return (
    <AppShell>
      <div className="p-6 lg:p-12 max-w-[100rem] mx-auto space-y-8">
        <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
              My mentee
            </p>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight">My students</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Manage the group of students assigned to you for this academic year. Import from Excel, or add and edit
              individuals.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <div className="flex rounded-xl border border-border bg-secondary/25 p-1 gap-1 shadow-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-lg gap-2 h-10 px-4 hover:bg-background"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="size-4 shrink-0" />
                Import
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-lg gap-2 h-10 px-4 hover:bg-background"
                onClick={openAdd}
              >
                <Plus className="size-4 shrink-0" />
                Add student
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl h-10 gap-2 border-destructive/35 text-destructive hover:bg-destructive/10 sm:ml-1"
              onClick={() => setDeleteConfirm({ kind: "clear" })}
              disabled={students.length === 0}
            >
              <X className="size-4" />
              Clear all
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
            <Loader2 className="size-6 animate-spin" />
            Loading roster…
          </div>
        ) : students.length === 0 ? (
          <div className="col-span-full py-24 text-center border-2 border-dashed border-border rounded-[2rem] bg-secondary/20">
            <div className="size-16 rounded-2xl bg-background border border-border flex items-center justify-center mx-auto mb-4 text-muted-foreground">
              <Users className="size-8" />
            </div>
            <h3 className="text-lg font-medium">No students yet</h3>
            <p className="text-muted-foreground mt-1 text-sm max-w-lg mx-auto">
              Upload a spreadsheet (first row = column headers) or use <span className="font-semibold">Add student</span>.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                className="rounded-xl gap-2 bg-growth text-growth-foreground shadow-lg shadow-growth/20"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-4" />
                Upload spreadsheet
              </Button>
              <Button type="button" variant="secondary" className="rounded-xl gap-2" onClick={openAdd}>
                <Plus className="size-4" />
                Add student
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-surface shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[900px]">
                <thead className="bg-secondary/50 border-b border-border">
                  <tr>
                    {[
                      "#",
                      "Name",
                      "Roll No",
                      "Reg No",
                      "Father's name",
                      "Branch",
                      "Year",
                      "Sem",
                      "Contact",
                      "Parent contact",
                      "Address",
                      "",
                    ].map((h) => (
                      <th
                        key={h || "act"}
                        className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s, idx) => (
                    <tr key={s.id ?? `${s.rollNo}-${idx}`} className="hover:bg-secondary/20">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-2.5 font-medium max-w-[140px] truncate" title={s.name}>
                        {s.name}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{s.rollNo}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[100px] truncate" title={s.regNo}>
                        {s.regNo ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[120px] truncate" title={s.fatherName}>
                        {s.fatherName ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[80px] truncate" title={s.branch ?? s.department}>
                        {s.branch ?? s.department ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{s.year ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{s.semester ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap">{s.contactNumber ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap">
                        {s.parentContactNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[160px] truncate" title={s.address}>
                        {s.address ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-growth"
                            title="Edit"
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-destructive"
                            title="Remove"
                            onClick={() => setDeleteConfirm({ kind: "one", student: s })}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Dialog
          open={!!editing}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
              setIsNewStudent(false);
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle>{isNewStudent ? "Add student" : "Edit student"}</DialogTitle>
            </DialogHeader>
            {editing ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="st-name">Student name</Label>
                  <Input
                    id="st-name"
                    value={editing.name}
                    onChange={(e) => updateDraft("name", e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-roll">Roll No</Label>
                  <Input
                    id="st-roll"
                    value={editing.rollNo}
                    onChange={(e) => updateDraft("rollNo", e.target.value)}
                    className="rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-reg">Reg No</Label>
                  <Input
                    id="st-reg"
                    value={editing.regNo ?? ""}
                    onChange={(e) => updateDraft("regNo", e.target.value)}
                    className="rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="st-father">Father&apos;s name</Label>
                  <Input
                    id="st-father"
                    value={editing.fatherName ?? ""}
                    onChange={(e) => updateDraft("fatherName", e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-branch">Branch</Label>
                  <Input
                    id="st-branch"
                    value={editing.branch ?? ""}
                    onChange={(e) => updateDraft("branch", e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-year">Year</Label>
                  <Input
                    id="st-year"
                    value={editing.year ?? ""}
                    onChange={(e) => updateDraft("year", e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-sem">Semester</Label>
                  <Input
                    id="st-sem"
                    value={editing.semester ?? ""}
                    onChange={(e) => updateDraft("semester", e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-contact">Contact number</Label>
                  <Input
                    id="st-contact"
                    value={editing.contactNumber ?? ""}
                    onChange={(e) => updateDraft("contactNumber", e.target.value)}
                    className="rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-pcontact">Parent contact number</Label>
                  <Input
                    id="st-pcontact"
                    value={editing.parentContactNumber ?? ""}
                    onChange={(e) => updateDraft("parentContactNumber", e.target.value)}
                    className="rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="st-addr">Address</Label>
                  <Input
                    id="st-addr"
                    value={editing.address ?? ""}
                    onChange={(e) => updateDraft("address", e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  setEditing(null);
                  setIsNewStudent(false);
                }}
              >
                Cancel
              </Button>
              <Button type="button" className="rounded-xl bg-growth text-growth-foreground" onClick={saveEditing}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={deleteConfirm !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteConfirm(null);
          }}
        >
          <AlertDialogContent className="rounded-2xl sm:rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteConfirm?.kind === "clear" ? "Clear entire roster?" : "Remove this student?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteConfirm?.kind === "clear"
                  ? "Every student will be removed from your group. You can import or add students again later."
                  : deleteConfirm?.kind === "one"
                    ? `${deleteConfirm.student.name} (${deleteConfirm.student.rollNo}) will be removed from your group.`
                    : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel className="rounded-xl mt-0">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={runDeleteConfirm}
              >
                {deleteConfirm?.kind === "clear" ? "Clear all" : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}
