import { getDb } from "../src/lib/db";

async function clear() {
  const db = await getDb();
  const res = await db.collection("atrs").deleteMany({});
  console.log(`Deleted ${res.deletedCount} ATR reports.`);
  process.exit(0);
}

clear().catch(err => {
  console.error(err);
  process.exit(1);
});
