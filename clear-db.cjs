const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function clearAtrs() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in .env.local');
    return;
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('approval-hub');
    const result = await db.collection('atrs').deleteMany({});
    console.log(`Successfully deleted ${result.deletedCount} ATR reports.`);
  } catch (err) {
    console.error('Failed to clear ATRs:', err);
  } finally {
    await client.close();
  }
}

clearAtrs();
