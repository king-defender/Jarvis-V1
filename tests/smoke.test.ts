import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('Sprint 0 smoke', () => {
  it('loads default configuration', () => {
    const config = loadConfig({
      APP_ENV: 'development',
      PORT: '8080',
      JWT_SECRET: 'test-secret-value',
      MONGO_URL: 'mongodb://127.0.0.1:27017',
      MONGO_DB_NAME: 'command_os_test',
      REDIS_URL: 'redis://localhost:6379',
    } as NodeJS.ProcessEnv);

    expect(config.app.port).toBe(8080);
    expect(config.database.mongoUrl).toBe('mongodb://127.0.0.1:27017');
    expect(config.database.dbName).toBe('command_os_test');
    expect(config.auth.jwtSecret).toBe('test-secret-value');
  });
});
