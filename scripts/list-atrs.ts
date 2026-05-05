import { getSupabase } from "../src/lib/supabase.ts";

async function main() {
  const sb = getSupabase();
  const { data: atrs, error } = await sb.from("atrs").select("id, payload");
  if (error) {
    console.error(error);
    return;
  }
  console.log(JSON.stringify(atrs, null, 2));
}

main();
