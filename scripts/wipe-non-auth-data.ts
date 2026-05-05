/**
 * Wipes all application data (ATRs, student rosters, mentor mappings)
 * but KEEPS the `users` table (credentials).
 *
 * Run from project root:
 *   npx tsx scripts/wipe-non-auth-data.ts
 */
import { getSupabase } from "../src/lib/supabase.ts";

async function main() {
  const sb = getSupabase();

  console.log("Wiping application data (keeping users)…\n");

  // 1. Wipe ATRs
  console.log("Cleaning 'atrs' table…");
  const { error: err1 } = await sb.from("atrs").delete().neq("id", "");
  if (err1) console.error("Error cleaning atrs:", err1.message);
  else console.log("✔ 'atrs' table cleared.");

  // 2. Wipe Mentor Students
  console.log("Cleaning 'mentor_students' table…");
  const { error: err2 } = await sb.from("mentor_students").delete().not("mentor_id", "is", null);
  if (err2) console.error("Error cleaning mentor_students:", err2.message);
  else console.log("✔ 'mentor_students' table cleared.");

  // 3. Wipe Mentor Mappings
  console.log("Cleaning 'mentor_mappings' table…");
  const { error: err3 } = await sb.from("mentor_mappings").delete().not("mentor_id", "is", null);
  if (err3) console.error("Error cleaning mentor_mappings:", err3.message);
  else console.log("✔ 'mentor_mappings' table cleared.");

  console.log("\nDone. All data removed except user credentials.");
}

main().catch((e) => {
  console.error("Wipe failed:", e);
  process.exit(1);
});
