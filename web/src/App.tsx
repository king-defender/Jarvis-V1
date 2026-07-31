import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

type Page = 'commands' | 'workflows' | 'rules' | 'decisions' | 'approvals' | 'platform' | 'voice';

type Summary = {
  commands: string[];
  workflows: string[];
  approvals: Array<{ id: string; command: string }>;
  plugins?: Array<{ id: string }>;
  connectors?: string[];
  metrics?: unknown;
};

const DEFAULT_DECISION = `{
  "data": { "amount": 120 },
  "execute": false,
  "policy": {
    "id": "finance-gate",
    "name": "finance-gate",
    "ruleGroup": {
      "id": "g1",
      "name": "g1",
      "logicalOperator": "AND",
      "conditions": [{ "field": "amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 100 }]
    },
    "onMatch": { "type": "TRIGGER_APPROVAL", "command": "finance.generate-report" },
    "onMiss": { "type": "SKIP" }
  }
}`;

const PAGES: Array<{ id: Page; label: string }> = [
  { id: 'commands', label: 'Commands' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'rules', label: 'Rules' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'voice', label: 'Voice' },
  { id: 'platform', label: 'Platform' },
];

export function App() {
  const [page, setPage] = useState<Page>('commands');
  const [token, setToken] = useState('');
  const [health, setHealth] = useState('offline');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rules, setRules] = useState<Array<{ name: string; logical_operator?: string }>>([]);
  const [command, setCommand] = useState('system.ping');
  const [payload, setPayload] = useState('{"message":"hello"}');
  const [cmdOut, setCmdOut] = useState('');
  const [decisionJson, setDecisionJson] = useState(DEFAULT_DECISION);
  const [decisionOut, setDecisionOut] = useState('');
  const [ruleName, setRuleName] = useState('salary-gate');
  const [ruleJson, setRuleJson] = useState(
    '[{"field":"job.salary.min","operator":"GREATER_THAN_OR_EQUAL","value":100000}]',
  );
  const [workflow, setWorkflow] = useState('system.demo');
  const [error, setError] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const [voiceOut, setVoiceOut] = useState('');
  const [listening, setListening] = useState(false);

  const refresh = useCallback(async (authToken: string) => {
    const healthRes = (await fetch('/api/health').then((r) => r.json())) as {
      checks: { database: string; cache: string };
    };
    setHealth(`db:${healthRes.checks.database} cache:${healthRes.checks.cache}`);
    const next = await api<Summary>('/dashboard/summary', { token: authToken });
    setSummary(next);
    if (next.commands?.length) setCommand((c) => (next.commands.includes(c) ? c : next.commands[0]!));
    if (next.workflows?.length) {
      setWorkflow((w) => (next.workflows.includes(w) ? w : next.workflows[0]!));
    }
    const rulesRes = await api<{ rules: Array<{ name: string; logical_operator?: string }> }>(
      '/rules',
      { token: authToken },
    );
    setRules(rulesRes.rules ?? []);
  }, []);

  const connect = async () => {
    setError('');
    try {
      const data = await api<{ token: string }>('/auth/dev-token', {
        method: 'POST',
        body: { userId: 'dashboard-user', role: 'owner' },
      });
      setToken(data.token);
      await refresh(data.token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runCommand = async () => {
    setError('');
    try {
      const result = await api('/command', {
        method: 'POST',
        token,
        body: { command, payload: JSON.parse(payload || '{}') },
      });
      setCmdOut(JSON.stringify(result, null, 2));
      await refresh(token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runWorkflow = async () => {
    setError('');
    try {
      const bodyPayload =
        workflow === 'career.job-application'
          ? {
              keywords: ['TypeScript'],
              location: 'Remote',
              resumeId: 'primary-resume-1',
              minSalary: 100000,
            }
          : workflow === 'system.demo'
            ? { message: 'hi', followUp: 'there' }
            : {};
      const result = await api<{ status: string }>('/workflows', {
        method: 'POST',
        token,
        body: { name: workflow, payload: bodyPayload },
      });
      setCmdOut(`${workflow}: ${result.status}`);
      await refresh(token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveRule = async () => {
    setError('');
    try {
      await api('/rules', {
        method: 'POST',
        token,
        body: {
          name: ruleName || 'untitled-rule',
          logicalOperator: 'AND',
          conditions: JSON.parse(ruleJson || '[]'),
        },
      });
      await refresh(token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runDecision = async () => {
    setError('');
    try {
      const body = JSON.parse(decisionJson);
      const result = await api('/decision/evaluate', {
        method: 'POST',
        token,
        body,
      });
      setDecisionOut(JSON.stringify(result, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const approve = async (id: string) => {
    await api(`/approvals/${id}/resolve`, {
      method: 'POST',
      token,
      body: { decision: 'APPROVED' },
    });
    await refresh(token);
  };

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  const runVoice = async (utterance: string, autoExecute = true) => {
    setError('');
    try {
      const result = await api<{
        intent: { spokenReply: string; kind: string; command?: string; workflow?: string };
        executed?: boolean;
        result?: unknown;
        status?: string;
      }>('/assistant/interpret', {
        method: 'POST',
        token,
        body: { utterance, autoExecute },
      });
      setVoiceOut(JSON.stringify(result, null, 2));
      speak(result.intent.spokenReply);
      await refresh(token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const startListening = () => {
    type Recog = {
      lang: string;
      interimResults: boolean;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
    };
    const W = window as unknown as {
      SpeechRecognition?: new () => Recog;
      webkitSpeechRecognition?: new () => Recog;
    };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser. Type a command instead.');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    setListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setVoiceText(transcript);
      void runVoice(transcript, true);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  return (
    <>
      <header>
        <h1>Jarvis-V1</h1>
        <p className="sub">React CommandOS control plane</p>
        <div className="row">
          <button type="button" onClick={() => void connect()}>
            Connect
          </button>
          <span className={`status ${token ? 'ok' : 'warn'}`}>{health}</span>
        </div>
        <nav className="row" style={{ marginTop: '0.75rem' }}>
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={page === p.id ? undefined : 'ghost'}
              onClick={() => setPage(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>
        {error ? <div className="error">{error}</div> : null}
      </header>
      <main>
        {page === 'commands' && (
          <section>
            <h2>Commands</h2>
            <select value={command} onChange={(e) => setCommand(e.target.value)}>
              {(summary?.commands ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <textarea value={payload} onChange={(e) => setPayload(e.target.value)} />
            <div className="row">
              <button type="button" onClick={() => void runCommand()} disabled={!token}>
                Execute
              </button>
            </div>
            <pre>{cmdOut}</pre>
          </section>
        )}

        {page === 'workflows' && (
          <section>
            <h2>Workflows</h2>
            <ul>
              {(summary?.workflows ?? []).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="row">
              <select value={workflow} onChange={(e) => setWorkflow(e.target.value)}>
                {(summary?.workflows ?? []).map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void runWorkflow()} disabled={!token}>
                Run
              </button>
            </div>
            <pre>{cmdOut}</pre>
          </section>
        )}

        {page === 'rules' && (
          <section>
            <h2>Rule Editor</h2>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="Rule name"
            />
            <textarea value={ruleJson} onChange={(e) => setRuleJson(e.target.value)} />
            <div className="row">
              <button type="button" onClick={() => void saveRule()} disabled={!token}>
                Save rule
              </button>
            </div>
            <ul>
              {rules.map((r) => (
                <li key={r.name}>
                  {r.name} ({r.logical_operator ?? 'AND'})
                </li>
              ))}
            </ul>
          </section>
        )}

        {page === 'decisions' && (
          <section>
            <h2>Decision Tester</h2>
            <textarea value={decisionJson} onChange={(e) => setDecisionJson(e.target.value)} />
            <div className="row">
              <button type="button" onClick={() => void runDecision()} disabled={!token}>
                Evaluate
              </button>
            </div>
            <pre>{decisionOut}</pre>
          </section>
        )}

        {page === 'approvals' && (
          <section>
            <h2>Approvals</h2>
            <ul>
              {(summary?.approvals ?? []).length === 0 ? (
                <li>None pending</li>
              ) : (
                (summary?.approvals ?? []).map((a) => (
                  <li key={a.id}>
                    {a.command}{' '}
                    <button type="button" className="ghost" onClick={() => void approve(a.id)}>
                      Approve
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        {page === 'voice' && (
          <section>
            <h2>Voice assistant</h2>
            <p className="sub">Speak or type. Offline intent resolver — no AI keys required.</p>
            <textarea
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              placeholder='Try: "ping", "run demo workflow", "search jobs for engineer"'
            />
            <div className="row">
              <button type="button" onClick={() => void runVoice(voiceText, true)} disabled={!token || !voiceText.trim()}>
                Interpret &amp; run
              </button>
              <button type="button" className="ghost" onClick={() => void runVoice(voiceText, false)} disabled={!token || !voiceText.trim()}>
                Interpret only
              </button>
              <button type="button" className="ghost" onClick={startListening} disabled={!token || listening}>
                {listening ? 'Listening…' : 'Listen'}
              </button>
            </div>
            <pre>{voiceOut}</pre>
          </section>
        )}

        {page === 'platform' && (
          <section>
            <h2>Platform</h2>
            <ul>
              <li>
                plugins: {(summary?.plugins ?? []).map((p) => p.id).join(', ') || 'none'}
              </li>
              <li>connectors: {(summary?.connectors ?? []).join(', ') || 'none'}</li>
            </ul>
            <pre>{JSON.stringify(summary?.metrics ?? {}, null, 2)}</pre>
          </section>
        )}
      </main>
    </>
  );
}
