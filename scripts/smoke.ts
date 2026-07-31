/**
 * End-to-end smoke against a running API.
 * Proves auth, command, assistant, AI status — no cloud keys required.
 */
const base = (process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8080}`).replace(
  /\/$/,
  '',
);

type Json = Record<string, unknown>;

async function req(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch(`${base}${path}`, init);
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  const steps: string[] = [];
  const pass = (msg: string) => steps.push(`PASS  ${msg}`);

  const health = await req('GET', '/api/health');
  assert(health.status === 200 || health.status === 503, `health HTTP ${health.status}`);
  assert(health.json.checks && typeof health.json.checks === 'object', 'health missing checks');
  const checks = health.json.checks as Json;
  assert(checks.database === 'up', `database is ${String(checks.database)} — start Mongo`);
  pass(`health database=up cache=${String(checks.cache)} ollama=${String(checks.ollama)}`);

  const tokenRes = await req('POST', '/api/auth/dev-token', {
    body: { userId: 'smoke-user', role: 'owner' },
  });
  assert(tokenRes.status === 200, `dev-token HTTP ${tokenRes.status}: ${JSON.stringify(tokenRes.json)}`);
  const token = String(tokenRes.json.token || '');
  assert(token.length > 20, 'dev-token missing token');
  pass('dev-token issued');

  const ping = await req('POST', '/api/command', {
    token,
    body: { command: 'system.ping', payload: { message: 'smoke' } },
  });
  assert(ping.status === 200, `ping HTTP ${ping.status}`);
  pass('system.ping');

  const interpret = await req('POST', '/api/assistant/interpret', {
    token,
    body: { utterance: 'ping', autoExecute: true },
  });
  assert(interpret.status === 200, `assistant HTTP ${interpret.status}`);
  pass('assistant.interpret');

  const ai = await req('GET', '/api/ai/status', { token });
  assert(ai.status === 200, `ai/status HTTP ${ai.status}`);
  pass(`ai/status mode=${String(ai.json.mode)}`);

  const demo = await req('POST', '/api/workflows', {
    token,
    body: { name: 'system.demo', payload: { message: 'smoke', followUp: 'ok' } },
  });
  assert(demo.status === 201 || demo.status === 202, `workflow HTTP ${demo.status}`);
  const status = String((demo.json as { status?: string }).status || '');
  assert(
    status === 'COMPLETED' || status === 'PENDING' || status === 'INTELLIGENCE_DEGRADED',
    `unexpected workflow status ${status}`,
  );
  pass(`workflow system.demo → ${status}`);

  console.log(`\nJarvis-V1 smoke (${base})\n`);
  for (const s of steps) console.log(s);
  console.log('\nResult: SMOKE PASSED — core system is live.\n');
}

main().catch((error: unknown) => {
  console.error('\nSMOKE FAILED\n');
  console.error(error instanceof Error ? error.message : error);
  console.error('\nIs the API running? Start with: .\\start.ps1   then: npm run smoke\n');
  process.exit(1);
});
