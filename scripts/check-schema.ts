import { getSupabase } from "../src/lib/supabase.ts";

async function main() {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_table_columns', { table_name: 'atrs' });
  
  // If RPC doesn't exist, try a simple select * limit 0
  if (error) {
    const { data: rows, error: err2 } = await sb.from("atrs").select("*").limit(1);
    if (err2) {
      console.error(err2);
    } else {
      console.log("Columns:", Object.keys(rows[0] || {}));
    }
  } else {
    console.log(data);
  }
}

main();
