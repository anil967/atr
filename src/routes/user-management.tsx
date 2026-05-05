import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2, UserPlus, Plus, Search, Filter, Check, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import {
  createUserByAdminFn,
  deleteUserFn,
  getAllUsersForAdminFn,
  type AdminManagedUser,
} from "@/lib/auth-server";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/user-management")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const user = getCurrentUser();
      if (!user) throw redirect({ to: "/login" });
      if (user.role !== "admin") throw redirect({ to: getHomeRouteForRole(user.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "User Management — BCET ATR" },
      { name: "description", content: "Admin controls to add and remove users." },
    ],
  }),
  component: UserManagementPage,
});

function UserManagementPage() {
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "mentor",
    department: "",
  });

  const loadUsers = async () => {
    const me = getCurrentUser();
    if (!me || me.role !== "admin") return;
    setUsersLoading(true);
    try {
      const rows = await getAllUsersForAdminFn({ data: { actorRole: me.role } });
      setUsers(rows ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    let result = users;
    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) =>
      `${a.role}-${a.department}-${a.name}`.localeCompare(`${b.role}-${b.department}-${b.name}`),
    );
  }, [users, roleFilter, searchQuery]);

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const me = getCurrentUser();
    if (!me || me.role !== "admin") return;
    setCreateLoading(true);
    try {
      await createUserByAdminFn({
        data: {
          actorRole: me.role,
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          department: form.department,
        },
      });
      toast.success("User created successfully.");
      setForm((p) => ({ ...p, name: "", email: "", password: "" }));
      setIsAddModalOpen(false);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRemoveUser = async (u: AdminManagedUser) => {
    if (!confirm(`Remove ${u.name} (${u.email})? This cannot be undone.`)) return;
    setActionUserId(u.id);
    try {
      await deleteUserFn({ data: { userId: u.id } });
      toast.success("User removed.");
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove user");
    } finally {
      setActionUserId(null);
    }
  };

  return (
    <AppShell>
      <div className="p-6 lg:p-12 space-y-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-growth font-bold mb-2">
              Admin
            </p>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight">User Management</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl leading-relaxed">
              Add users directly and remove accounts from the system.
            </p>
          </div>

          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <button className="inline-flex items-center gap-2.5 bg-growth text-growth-foreground px-6 py-3.5 rounded-2xl text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-growth/20">
                <Plus className="size-4" strokeWidth={3} />
                Add User
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md p-0 overflow-hidden rounded-[2rem] border-none shadow-2xl">
              <div className="bg-gradient-to-br from-growth to-growth/80 p-8 text-growth-foreground">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-2xl font-light tracking-tight">Create <span className="font-bold italic font-display">Account</span></DialogTitle>
                  <p className="text-growth-foreground/80 text-sm">Provision a new institutional identity.</p>
                </DialogHeader>
              </div>
              <div className="p-8 bg-surface">
                <form className="space-y-4" onSubmit={handleCreateUser}>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Full Name</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. John Doe"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-growth/20 outline-none transition-all"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="email@bcet.edu.in"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-growth/20 outline-none transition-all"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Temporary Password</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-growth/20 outline-none transition-all"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">System Role</label>
                      <select
                        value={form.role}
                        onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-growth/20 outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="mentor">Mentor</option>
                        <option value="coordinator">Coordinator</option>
                        <option value="hod">HOD</option>
                        <option value="chief_mentor">Chief Mentor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Department</label>
                      <input
                        value={form.department}
                        onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                        placeholder="e.g. CSE"
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-growth/20 outline-none transition-all"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="w-full mt-4 rounded-2xl bg-growth text-growth-foreground px-6 py-4 text-sm font-bold shadow-xl shadow-growth/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    {createLoading ? "Creating Identity..." : "Provision User Account"}
                  </button>
                </form>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        <section className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "all", label: "All Users" },
                { id: "mentor", label: "Mentors" },
                { id: "coordinator", label: "Coordinators" },
                { id: "hod", label: "HODs" },
                { id: "chief_mentor", label: "Chief Mentors" },
                { id: "admin", label: "Admins" },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRoleFilter(r.id)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                    roleFilter === r.id
                      ? "bg-growth text-growth-foreground border-growth shadow-md shadow-growth/15"
                      : "bg-surface text-muted-foreground border-border/60 hover:border-growth/40 hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:max-w-xs group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-growth transition-colors" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email or dept..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border/60 bg-surface text-sm focus:ring-2 focus:ring-growth/20 outline-none transition-all"
              />
            </div>
          </div>

          <section className="bg-surface rounded-[2rem] border border-border/60 shadow-card overflow-hidden">
            <div className="px-8 py-5 border-b border-border/60 bg-secondary/25 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Filter className="size-3.5" />
                System Directory
              </h2>
              <span className="text-[11px] font-bold bg-growth/10 text-growth px-2.5 py-1 rounded-lg">
                {filteredUsers.length} Entries Found
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-secondary/15">
                  <tr>
                    <th className="px-8 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</th>
                    <th className="px-8 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email Address</th>
                    <th className="px-8 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">System Role</th>
                    <th className="px-8 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Department</th>
                    <th className="px-8 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-8 py-4 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="size-10 border-4 border-growth/20 border-t-growth rounded-full animate-spin" />
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Scanning Directory...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center">
                        <div className="flex flex-col items-center gap-3 opacity-40">
                          <Search className="size-10" />
                          <p className="text-xs font-bold uppercase tracking-widest">No Matches Found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-secondary/10 transition-colors group">
                        <td className="px-8 py-4">
                          <span className="font-semibold text-foreground group-hover:text-growth transition-colors">{u.name}</span>
                        </td>
                        <td className="px-8 py-4">
                          <span className="text-muted-foreground font-mono text-xs">{u.email}</span>
                        </td>
                        <td className="px-8 py-4 capitalize">
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                            u.role === 'admin' ? "bg-red-500/10 text-red-600" :
                            u.role === 'chief_mentor' ? "bg-blue-500/10 text-blue-600" :
                            u.role === 'hod' ? "bg-purple-500/10 text-purple-600" :
                            u.role === 'coordinator' ? "bg-amber-500/10 text-amber-600" :
                            "bg-growth/10 text-growth"
                          )}>
                            {u.role.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-8 py-4">
                          <span className="text-xs font-bold text-muted-foreground uppercase">{u.department}</span>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "size-1.5 rounded-full",
                              u.disabled ? "bg-muted-foreground" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                            )} />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              {u.disabled ? "Inactive" : "Approved"}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <button
                            onClick={() => handleRemoveUser(u)}
                            disabled={actionUserId === u.id}
                            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 transition-all disabled:opacity-60"
                          >
                            <Trash2 className="size-3.5" />
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </AppShell>
  );
}
