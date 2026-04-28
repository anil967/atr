import { createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUser, getHomeRouteForRole } from "@/lib/auth-store";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const user = getCurrentUser();
      if (user) {
        throw redirect({ to: getHomeRouteForRole(user.role) });
      }
    }
    throw redirect({ to: "/login" });
  },
});
