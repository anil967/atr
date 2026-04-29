import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { signupFn } from "@/lib/auth-server";
import type { Role } from "@/lib/atr-types";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "mentor", label: "Mentor" },
  { value: "coordinator", label: "Coordinator" },
  { value: "hod", label: "HOD" },
];
const BRANCH_OPTIONS = ["CSE", "ME", "EE", "EEE", "MBA", "MCA"] as const;

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — BCET ATR System" },
      {
        name: "description",
        content: "Create a BCET ATR account to access the report workflow portal.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState<(typeof BRANCH_OPTIONS)[number]>("CSE");
  const [role, setRole] = useState<Role>("mentor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (currentUser) {
      navigate({ to: getHomeRouteForRole(currentUser.role) });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password || !department.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await signupFn({
        data: {
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          department: department.trim(),
        },
      });
      setSuccess(result.message);
      setName("");
      setEmail("");
      setPassword("");
      setRole("mentor");
      setDepartment("CSE");
      setTimeout(() => navigate({ to: "/login" }), 1200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Sign up failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-dvh overflow-hidden bg-background">
      <div className="h-full w-full grid lg:grid-cols-[1.04fr_1fr] bg-surface">
        <div className="hidden lg:flex bg-growth text-growth-foreground p-14 flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-[0.22em] text-growth-foreground/70">
              BCET Action Taken Reports
            </p>
            <h1 className="mt-8 text-4xl font-light leading-tight tracking-tight">
              Create your institutional account and join the ATR workflow.
            </h1>
            <p className="mt-6 text-growth-foreground/75 text-base leading-relaxed max-w-md">
              Your account gives role-based access for drafting, reviewing, and
              approving reports across the portal.
            </p>
          </div>
          <div className="relative z-10 grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-2xl font-light">Role-Based</p>
              <p className="text-growth-foreground/70 mt-1">Secure access</p>
            </div>
            <div>
              <p className="text-2xl font-light">One Portal</p>
              <p className="text-growth-foreground/70 mt-1">All ATR stages</p>
            </div>
          </div>
          <div className="absolute -bottom-28 -left-10 size-80 rounded-full bg-growth-foreground/10 blur-3xl pointer-events-none" />
        </div>

        <div className="p-6 sm:p-10 lg:p-14 flex flex-col justify-center max-w-xl w-full mx-auto">
          <div className="inline-flex items-center gap-2 bg-growth/8 text-growth rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider mb-4">
            <ShieldCheck className="size-3.5" />
            Secure Registration
          </div>
          <h2 className="text-3xl font-medium tracking-tight">Create your account</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Only Mentor and Coordinator accounts can self-register. Chief Proctor
            approval is required before first login.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-3.5" noValidate>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              disabled={loading}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@bcet.edu"
              disabled={loading}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              disabled={loading}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm"
            />
            <div className="grid sm:grid-cols-2 gap-3.5">
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as Role)
                }
                disabled={loading}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm"
              >
                {ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                value={department}
                onChange={(e) =>
                  setDepartment(e.target.value as (typeof BRANCH_OPTIONS)[number])
                }
                disabled={loading}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm"
              >
                {BRANCH_OPTIONS.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-xl px-4 py-3">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-growth bg-growth/10 border border-growth/30 rounded-xl px-4 py-3">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !name.trim() ||
                !email.trim() ||
                !password ||
                !department.trim()
              }
              className="inline-flex items-center justify-center gap-2 w-full bg-growth text-growth-foreground font-medium py-3 rounded-xl hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link to="/login" className="text-growth font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
