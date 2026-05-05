import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldCheck, Sun, Moon } from "lucide-react";
import { loginFn } from "@/lib/auth-server";
import { getHomeRouteForRole, setCurrentUser } from "@/lib/auth-store";
import { useThemeStore } from "@/lib/theme-store";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — BCET ATR System" },
      {
        name: "description",
        content:
          "Sign in to the BCET Action Taken Report management portal with your institutional credentials.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError(null);

    try {
      const user = await loginFn({ data: { email: email.trim(), password } });
      
      if (!user || !user.role) {
        throw new Error("Invalid server response. Please check your database connection.");
      }

      setCurrentUser(user);
      // Notify any listeners (e.g. useCurrentUser hook in other components)
      window.dispatchEvent(new Event("bcet-auth-changed"));
      navigate({ to: getHomeRouteForRole(user.role) });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Sign in failed. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-dvh overflow-hidden bg-background">
      <div className="h-full w-full grid lg:grid-cols-[1.08fr_1fr] bg-surface">
        {/* ── Left brand panel ─────────────────────────────── */}
        <div className="bg-growth text-growth-foreground p-8 lg:p-14 flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-12">
              <img
                src="/bcet-logo.jpg"
                alt="BCET logo"
                className="size-11 rounded-md object-cover border border-growth-foreground/20 bg-surface"
              />
              <div>
                <p className="font-semibold leading-none">BCET</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-growth-foreground/60 mt-1.5">
                  Action Taken Reports
                </p>
              </div>
            </div>

            <h1 className="text-4xl font-light tracking-tight">
              Cultivating{" "}
              <span className="italic font-display">accountability</span>,
              <br />
              one report at a time.
            </h1>
            <p className="mt-6 text-growth-foreground/75 leading-relaxed text-pretty max-w-md">
              A structured workflow for mentors, coordinators and department
              heads to record, review and approve action taken reports across
              departments.
            </p>
          </div>

          {/* Stats row */}
          <div className="relative z-10 mt-12 grid grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-2xl font-light tabular-nums">163</p>
              <p className="text-growth-foreground/60 mt-1">Total ATRs</p>
            </div>
            <div>
              <p className="text-2xl font-light tabular-nums">12</p>
              <p className="text-growth-foreground/60 mt-1">Departments</p>
            </div>
            <div>
              <p className="text-2xl font-light tabular-nums">94%</p>
              <p className="text-growth-foreground/60 mt-1">Closure rate</p>
            </div>
          </div>

          {/* Decorative blobs */}
          <div className="absolute -bottom-32 -right-24 size-96 rounded-full bg-growth-foreground/5 blur-3xl pointer-events-none" />
          <div className="absolute -top-20 -left-10 size-72 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        </div>

        {/* ── Right form panel ─────────────────────────────── */}
        <div className="p-6 sm:p-10 lg:p-14 flex flex-col justify-center max-w-xl w-full mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="inline-flex items-center gap-2 bg-growth/8 text-growth rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider">
                <ShieldCheck className="size-3.5" />
                Secure Portal
              </div>
              <button
                type="button"
                onClick={useThemeStore.getState().toggleTheme}
                className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors border border-border"
                title="Toggle theme"
              >
                {useThemeStore((s) => s.theme) === "light" ? (
                  <Moon className="size-4" />
                ) : (
                  <Sun className="size-4" />
                )}
              </button>
            </div>
            <h2 className="text-2xl font-medium tracking-tight">
              Sign in to your account
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Use your institutional email and password to access the ATR
              portal.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@bcet.edu"
                disabled={loading}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-growth/30 focus:border-growth
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-colors placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                  className="w-full px-4 py-3 pr-12 bg-background border border-border rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-growth/30 focus:border-growth
                             disabled:opacity-60 disabled:cursor-not-allowed
                             transition-colors placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center
                             text-muted-foreground hover:text-foreground transition-colors rounded-md"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 px-4 py-3 bg-destructive/8 border border-destructive/20 rounded-xl"
              >
                <div className="size-4 mt-0.5 shrink-0 rounded-full bg-destructive/15 flex items-center justify-center">
                  <span className="text-destructive text-[10px] font-bold">
                    !
                  </span>
                </div>
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              id="login-submit-btn"
              className="inline-flex items-center justify-center gap-2 w-full
                         bg-growth text-growth-foreground font-medium py-3 rounded-xl
                         hover:opacity-95 transition-opacity
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>

          {/* Help text */}
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              Trouble signing in? Contact your system administrator.
              <br />
              <span className="opacity-60">
                BCET ATR System · Balasore College of Engineering and Technology
              </span>
            </p>
            <p className="text-sm text-center text-muted-foreground mt-4">
              Need an account?{" "}
              <Link to="/signup" className="text-growth font-medium hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
