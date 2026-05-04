/**
 * Seeds demo users into Supabase table `users` (same shape as signup + login in auth-server.ts).
 *
 * Run from project root:
 *   npx tsx scripts/seed-supabase-users.ts
 *
 * DB connection uses {@link ../src/lib/supabase.ts getSupabase} (service role — same project as the app).
 */
import * as bcrypt from "bcrypt-ts";
import { getSupabase } from "../src/lib/supabase.ts";

const USERS = [
  {
    name: "System Admin",
    email: "admin@bcet.edu",
    password: "Admin@BCET2025",
    role: "admin" as const,
    department: "Administration",
  },
  {
    name: "Dr. Aradhana Singh",
    email: "mentor@bcet.edu",
    password: "Mentor@BCET2025",
    role: "mentor" as const,
    department: "Computer Science",
  },
  {
    name: "Prof. Sanjay Roy",
    email: "coordinator@bcet.edu",
    password: "Coord@BCET2025",
    role: "coordinator" as const,
    department: "Computer Science",
  },
  {
    name: "Dr. Priya Nair",
    email: "hod@bcet.edu",
    password: "HOD@BCET2025",
    role: "hod" as const,
    department: "Computer Science",
  },
  {
    name: "Dr. Rajesh Verma",
    email: "chief@bcet.edu",
    password: "Chief@BCET2025",
    role: "chief_mentor" as const,
    department: "Academics",
  },
];

async function main() {
  const sb = getSupabase();

  console.log("Seeding users into Supabase…\n");

  for (const u of USERS) {
    const email = u.email.toLowerCase().trim();
    const password_hash = await bcrypt.hash(u.password, 10);
    const approved_at = new Date().toISOString();

    const payload = {
      name: u.name,
      email,
      password_hash,
      role: u.role,
      department: u.department,
      disabled: false,
      approval_status: "approved" as const,
      approved_at,
    };

    const { data: existing, error: selErr } = await sb.from("users").select("id").eq("email", email).maybeSingle();
    if (selErr) {
      console.error("Lookup failed:", selErr.message);
      process.exit(1);
    }

    if (existing?.id) {
      const { error } = await sb.from("users").update(payload).eq("id", existing.id);
      if (error) {
        console.error(`Update ${email}:`, error.message);
        process.exit(1);
      }
      console.log(`Updated  ${email} (${u.role})`);
    } else {
      const { error } = await sb.from("users").insert(payload);
      if (error) {
        console.error(`Insert ${email}:`, error.message);
        process.exit(1);
      }
      console.log(`Created  ${email} (${u.role})`);
    }
    console.log(`         Password: ${u.password}\n`);
  }

  console.log("Done. Sign in at /login with any email above.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
