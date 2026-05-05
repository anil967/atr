import { getSupabase } from "../src/lib/supabase.ts";

async function main() {
  const sb = getSupabase();
  const { data: users, error } = await sb.from("users").select("id, name, email, role, department");
  if (error) {
    console.error(error);
    return;
  }
  console.log(JSON.stringify(users, null, 2));
}

main();
