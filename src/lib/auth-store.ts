/**
 * Client-side auth store.
 * Reads user identity by decoding the JWT stored in the browser cookie.
 * Signature verification happens server-side only; client just needs the payload.
 */
import { useEffect, useState } from "react";
import type { Role } from "./atr-types";
import { logoutFn } from "./auth-server";

// Re-export AuthUser so the rest of the codebase keeps its `MockUser` imports
// via type alias below.
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
}

/** Backward-compatibility alias used throughout the existing codebase */
export type MockUser = AuthUser;

const STORAGE_KEY = "bcet-atr-user";

function readUserFromStorage(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (
      !parsed.id ||
      !parsed.name ||
      !parsed.email ||
      !parsed.role ||
      !parsed.department
    ) {
      return null;
    }
    return parsed as AuthUser;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Synchronously read the current user from the session cookie. */
export function getCurrentUser(): AuthUser | null {
  return readUserFromStorage();
}

export function setCurrentUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function clearCurrentUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Call server-side logout (clears cookie) then notify local listeners. */
export async function logout() {
  clearCurrentUser();
  await logoutFn().catch(() => undefined);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("bcet-auth-changed"));
  }
}

/** React hook — reactively returns the current user. */
export function useCurrentUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser());

  useEffect(() => {
    const refresh = () => setUser(getCurrentUser());
    
    // Listen for manual store changes
    window.addEventListener("bcet-auth-changed", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("bcet-auth-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return user;
}

// ── Legacy stubs (kept so existing imports don't break) ──────────────────────

/** @deprecated No longer used — real users come from Supabase. */
export function getDemoUsers(): AuthUser[] {
  return [];
}

export function getHomeRouteForRole(role: Role): string {
  switch (role) {
    case "mentor":
      return "/dashboard";
    case "coordinator":
      return "/coordinator";
    case "hod":
      return "/hod";
    case "chief_mentor":
      return "/chief-mentor";
    case "admin":
      return "/admin";
    default:
      return "/dashboard";
  }
}
