import { loadConfig } from '../src/config.js';
import { DatabaseService } from '../src/infrastructure/database/connection.service.js';
import { LoggingService } from '../src/infrastructure/services/logging.service.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = new LoggingService(config);
  const database = new DatabaseService(config, log);

  try {
    await database.connect();
    await database.migrate();
  } finally {
    await database.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
