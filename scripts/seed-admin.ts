/**
 * Legacy MongoDB seed — not used by the current app (auth + data are Supabase).
 * Prefer: `npm run seed` → scripts/seed-supabase-users.ts
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/seed-admin.ts
 *
 * Uses upsert with `$set` so credentials stay in sync on re-run.
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local before anything that reads process.env
config({ path: resolve(process.cwd(), ".env.local") });

import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const mongoOptions = {
  // Keep CLI seed behavior aligned with app DB connectivity.
  autoSelectFamily: false,
  serverSelectionTimeoutMS: 15000,
  tlsAllowInvalidCertificates: true,
};

// ── User definitions ──────────────────────────────────────────────────────────

const USERS = [
  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    name: "System Admin",
    email: "admin@bcet.edu",
    password: "Admin@BCET2025",
    role: "admin" as const,
    department: "Administration",
  },
  // ── Mentor ────────────────────────────────────────────────────────────────
  {
    name: "Dr. Aradhana Singh",
    email: "mentor@bcet.edu",
    password: "Mentor@BCET2025",
    role: "mentor" as const,
    department: "Computer Science",
  },
  // ── Coordinator ───────────────────────────────────────────────────────────
  {
    name: "Prof. Sanjay Roy",
    email: "coordinator@bcet.edu",
    password: "Coord@BCET2025",
    role: "coordinator" as const,
    department: "Computer Science",
  },
  // ── HOD ───────────────────────────────────────────────────────────────────
  {
    name: "Dr. Priya Nair",
    email: "hod@bcet.edu",
    password: "HOD@BCET2025",
    role: "hod" as const,
    department: "Computer Science",
  },
  // ── Chief Mentor ──────────────────────────────────────────────────────────
  {
    name: "Dr. Rajesh Verma",
    email: "chief@bcet.edu",
    password: "Chief@BCET2025",
    role: "chief_mentor" as const,
    department: "Academics",
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("YOUR_PASSWORD")) {
    console.error(
      "❌  MONGODB_URI is not set or still has the placeholder password.",
    );
    console.error("   Open .env.local and replace YOUR_PASSWORD with the real password.");
    process.exit(1);
  }

  console.log("🔗  Connecting to MongoDB Atlas…");
  const client = new MongoClient(uri, mongoOptions);
  await client.connect();
  console.log("✅  Connected!\n");

  const db = client.db("bcet_atr");
  const col = db.collection("users");

  // Ensure unique index on email
  await col.createIndex({ email: 1 }, { unique: true });

  console.log("👤  Seeding users…\n");

  for (const u of USERS) {
    const password_hash = await bcrypt.hash(u.password, 12);

    const result = await col.updateOne(
      { email: u.email },
      {
        $set: {
          name: u.name,
          email: u.email,
          password_hash,
          role: u.role,
          department: u.department,
          disabled: false,
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

    const action =
      result.upsertedCount > 0
        ? "✅  Created"
        : result.modifiedCount > 0
          ? "♻️   Updated existing user"
          : "✅  Verified existing user";

    console.log(`${action}`);
    console.log(`   Role:       ${u.role}`);
    console.log(`   Email:      ${u.email}`);
    console.log(`   Password:   ${u.password}`);
    console.log(`   Department: ${u.department}\n`);
  }

  console.log("─".repeat(60));
  console.log("🎉  Seed complete! You can now sign in at /login\n");
  console.log("Admin credentials:");
  console.log("   Email:    admin@bcet.edu");
  console.log("   Password: Admin@BCET2025\n");

  await client.close();
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
