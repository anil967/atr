import { getSupabase } from "../src/lib/supabase.ts";

async function main() {
  const sb = getSupabase();

  // 1. Get IDs
  const { data: users } = await sb.from("users").select("id, name, role, department");
  
  const anil = users?.find(u => u.name === "Anil" && u.role === "coordinator");
  const aradhana = users?.find(u => u.name === "Dr. Aradhana Singh" && u.role === "mentor");
  const sanjay = users?.find(u => u.name === "Prof. Sanjay Roy" && u.role === "coordinator");

  if (!anil || !aradhana) {
    console.error("Could not find Anil or Aradhana");
    return;
  }

  console.log(`Mapping Coordinator ${anil.name} (${anil.id}) to Mentor ${aradhana.name} (${aradhana.id})`);

  // 2. Insert mapping
  const { error: mapErr } = await sb.from("mentor_mappings").upsert({
    mentor_id: aradhana.id,
    coordinator_id: anil.id,
    updated_at: new Date().toISOString()
  });

  if (mapErr) {
    console.error("Mapping failed:", mapErr.message);
  } else {
    console.log("✔ Mapping created.");
  }

  // 3. Update existing ATRs that were created while mapping was missing
  console.log("Updating existing ATRs to assign them to Anil…");
  const { data: atrs } = await sb.from("atrs").select("id, payload");
  
  if (atrs) {
    for (const atr of atrs) {
      const payload = atr.payload as any;
      if (payload.mentorId === aradhana.id && payload.coordinatorName === "Pending Assignment") {
        payload.coordinatorId = anil.id;
        payload.coordinatorName = anil.name;
        
        const { error: updErr } = await sb.from("atrs").update({ payload }).eq("id", atr.id);
        if (updErr) console.error(`Failed to update ATR ${atr.id}:`, updErr.message);
        else console.log(`✔ ATR ${atr.id} updated.`);
      }
    }
  }

  console.log("\nDone. Dashboard should now be updated.");
}

main();
