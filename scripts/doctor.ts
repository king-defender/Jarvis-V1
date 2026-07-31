/**
 * Preflight doctor — run anytime without the API.
 * Checks Node, .env, Mongo, optional Ollama. No Docker / Redis / cloud keys required.
 */
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

function checkPort(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function parseHostPort(url: string, fallbackPort: number): { host: string; port: number } {
  try {
    const u = new URL(url);
    return { host: u.hostname || '127.0.0.1', port: Number(u.port) || fallbackPort };
  } catch {
    return { host: '127.0.0.1', port: fallbackPort };
  }
}

async function main(): Promise<void> {
  const lines: string[] = [];
  const fail = (msg: string) => lines.push(`FAIL  ${msg}`);
  const ok = (msg: string) => lines.push(`OK    ${msg}`);
  const info = (msg: string) => lines.push(`INFO  ${msg}`);

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor >= 20) ok(`Node ${process.versions.node}`);
  else fail(`Node ${process.versions.node} — need >= 20`);

  const envPath = path.resolve('.env');
  if (fs.existsSync(envPath)) ok('.env present');
  else info('.env missing — copy from .env.example');

  const config = loadConfig();
  ok(`AI_MODE=${config.ai.mode} model=${config.ai.localModel}`);
  ok(`BROWSER_ENGINE=${config.browser.engine}`);
  ok(`Mongo target ${config.database.mongoUrl} / ${config.database.dbName}`);

  if (config.ai.anthropicApiKey || config.ai.geminiApiKey || config.ai.providerKey) {
    info('Cloud AI keys are set — personal use does not need them (safe to ignore)');
  } else {
    ok('No cloud AI keys (personal / Ollama path)');
  }

  const mongo = parseHostPort(config.database.mongoUrl, 27017);
  if (await checkPort(mongo.host, mongo.port)) ok(`Mongo listening on ${mongo.host}:${mongo.port}`);
  else fail(`Mongo not reachable at ${mongo.host}:${mongo.port} — start local MongoDB (Compass)`);

  const ollamaUrl = config.ai.ollamaBaseUrl || 'http://127.0.0.1:11434';
  const ollama = parseHostPort(ollamaUrl, 11434);
  if (config.ai.mode === 'offline') {
    info('AI offline mode — Ollama not required');
  } else if (await checkPort(ollama.host, ollama.port)) {
    ok(`Ollama listening on ${ollama.host}:${ollama.port}`);
  } else {
    info(`Ollama not running at ${ollama.host}:${ollama.port} — app still works; drafts use offline composer`);
  }

  const redis = parseHostPort(config.cache.redisUrl, 6379);
  if (await checkPort(redis.host, redis.port)) ok(`Redis up (optional) ${redis.host}:${redis.port}`);
  else info('Redis down — OK for personal use (no async queue)');

  if (await checkPort('127.0.0.1', config.app.port)) {
    ok(`API already listening on :${config.app.port}`);
  } else {
    info(`API not running — start with: npm run start:local   or   .\\start.ps1`);
  }

  console.log('\nJarvis-V1 doctor\n');
  for (const line of lines) console.log(line);

  const hardFails = lines.filter((l) => l.startsWith('FAIL')).length;
  console.log(
    hardFails === 0
      ? '\nResult: READY for personal use (Docker/Redis/SMTP/Slack/GitHub/cloud keys not required).\n'
      : `\nResult: ${hardFails} blocking issue(s). Fix FAIL lines, then re-run: npm run doctor\n`,
  );
  process.exit(hardFails === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
