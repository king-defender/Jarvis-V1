#!/usr/bin/env node
/**
 * MongoDB backup helper — dumps JSON collections into BASE_DATA_PATH/backups.
 * Usage: npm run backup
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { loadConfig } from '../src/config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(config.app.baseDataPath, 'backups', stamp);
  await fs.mkdir(outDir, { recursive: true });

  const client = new MongoClient(config.database.mongoUrl);
  await client.connect();
  const db = client.db(config.database.dbName);
  const collections = await db.listCollections().toArray();

  for (const col of collections) {
    const docs = await db.collection(col.name).find({}).toArray();
    await fs.writeFile(
      path.join(outDir, `${col.name}.json`),
      JSON.stringify(docs, null, 2),
      'utf8',
    );
  }

  await client.close();
  console.log(`Backup written to ${outDir} (${collections.length} collections)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
