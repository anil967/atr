import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";
import {
  createUserByAdminFn,
  deleteUserFn,
  getAllUsersForAdminFn,
  type AdminManagedUser,
} from "@/lib/auth-server";
import { toast } from "sonner";

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

  const managedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        `${a.role}-${a.department}-${a.name}`.localeCompare(`${b.role}-${b.department}-${b.name}`),
      ),
    [users],
  );

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
      <div className="p-6 lg:p-12 space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">
            Admin
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-2">
            Add users directly and remove accounts from the system.
          </p>
        </header>

        <section className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
          <section className="bg-surface rounded-3xl border border-border/60 shadow-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="size-4 text-growth" />
              <h2 className="text-lg font-medium">Add User</h2>
            </div>
            <form className="space-y-3" onSubmit={handleCreateUser}>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Full name"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm bg-background"
                required
              />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="Email"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm bg-background"
                required
              />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Temporary password"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm bg-background"
                required
              />
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm bg-background"
              >
                <option value="mentor">Mentor</option>
                <option value="coordinator">Coordinator</option>
                <option value="hod">HOD</option>
                <option value="chief_mentor">Chief Mentor</option>
                <option value="admin">Admin</option>
              </select>
              <input
                value={form.department}
                onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                placeholder="Department (e.g. CSE)"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm bg-background"
                required
              />
              <button
                type="submit"
                disabled={createLoading}
                className="w-full rounded-xl bg-growth text-growth-foreground px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {createLoading ? "Creating..." : "Add User"}
              </button>
            </form>
          </section>

          <section className="bg-surface rounded-3xl border border-border/60 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/60 bg-secondary/30">
              <h2 className="text-lg font-medium">Manage Users</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-secondary/20">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Email</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Role</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Department</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Loading users...
                      </td>
                    </tr>
                  ) : managedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    managedUsers.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-3">{u.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                        <td className="px-4 py-3 capitalize">{u.role.replace("_", " ")}</td>
                        <td className="px-4 py-3">{u.department}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {u.approvalStatus || (u.disabled ? "disabled" : "approved")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveUser(u)}
                            disabled={actionUserId === u.id}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
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
