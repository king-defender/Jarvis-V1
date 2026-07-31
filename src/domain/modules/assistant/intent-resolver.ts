/**
 * Deterministic natural-language → command intent resolver.
 * Taught intents from MemoryService are checked first (runtime learning).
 */
export interface AssistantIntent {
  kind: 'command' | 'workflow' | 'help' | 'unknown';
  command?: string;
  workflow?: string;
  payload: Record<string, unknown>;
  spokenReply: string;
  confidence: number;
  learned?: boolean;
}

export type TaughtIntentMatch = {
  kind: 'command' | 'workflow';
  target: string;
  payload: Record<string, unknown>;
  spokenReply: string;
};

const HELP_TEXT =
  'I learn from you. Say "when I say X run system.ping", "remember my role is engineer", ' +
  '"that was good/bad", or "update your code to …". Also: ping, demo, search jobs, AI status.';

export function interpretUtterance(
  utterance: string,
  taught?: TaughtIntentMatch | null,
): AssistantIntent {
  const text = utterance.trim().toLowerCase().replace(/[?!,]/g, '');
  if (!text) {
    return {
      kind: 'help',
      payload: {},
      spokenReply: HELP_TEXT,
      confidence: 1,
    };
  }

  if (taught) {
    if (taught.kind === 'command') {
      return {
        kind: 'command',
        command: taught.target,
        payload: taught.payload,
        spokenReply: taught.spokenReply,
        confidence: 0.99,
        learned: true,
      };
    }
    return {
      kind: 'workflow',
      workflow: taught.target,
      payload: taught.payload,
      spokenReply: taught.spokenReply,
      confidence: 0.99,
      learned: true,
    };
  }

  if (/\b(help|what can you do|commands)\b/.test(text)) {
    return { kind: 'help', payload: {}, spokenReply: HELP_TEXT, confidence: 1 };
  }

  // Teach: "when I say morning check run system.ping"
  const teach = text.match(
    /\bwhen i (?:say|say the phrase)\s+(.+?)\s+(?:run|start|execute)\s+([a-z0-9._-]+)\b/,
  );
  if (teach?.[1] && teach[2]) {
    const target = teach[2];
    const resolvedKind =
      target === 'system.demo' ||
      target === 'career.job-application' ||
      target === 'system.parallel-demo'
        ? 'workflow'
        : 'command';
    return {
      kind: 'command',
      command: 'assistant.teach',
      payload: {
        phrase: teach[1].trim(),
        kind: resolvedKind,
        target,
        payload: {},
      },
      spokenReply: `I will remember: when you say "${teach[1].trim()}", run ${target}.`,
      confidence: 0.95,
    };
  }

  // Remember: "remember my title is staff engineer"
  const remember = text.match(/\bremember\s+(?:that\s+)?(.+)$/);
  if (remember?.[1] && !teach) {
    const body = remember[1].trim();
    const kv = body.match(/^(.+?)\s+is\s+(.+)$/);
    return {
      kind: 'command',
      command: 'assistant.remember',
      payload: kv
        ? { key: kv[1]!.trim(), value: kv[2]!.trim() }
        : { key: 'note', value: body },
      spokenReply: 'I will remember that.',
      confidence: 0.9,
    };
  }

  if (/\b(that was (good|great|helpful)|good job|thanks)\b/.test(text)) {
    return {
      kind: 'command',
      command: 'assistant.feedback',
      payload: { rating: 'up', note: utterance.trim() },
      spokenReply: 'Thanks — I logged positive feedback.',
      confidence: 0.9,
    };
  }

  if (/\b(that was (bad|wrong|unhelpful)|not what i wanted)\b/.test(text)) {
    return {
      kind: 'command',
      command: 'assistant.feedback',
      payload: { rating: 'down', note: utterance.trim() },
      spokenReply: 'Logged. Teach me with: when I say … run …',
      confidence: 0.9,
    };
  }

  // Self code edit: "update your code to …" / "fix your code …" / "patch yourself …"
  const codeEdit = text.match(
    /\b(?:update|fix|change|patch)\s+(?:your\s+)?(?:code|yourself|source)\s+(?:to\s+|so\s+|and\s+)?(.+)$/,
  );
  if (codeEdit?.[1]) {
    return {
      kind: 'command',
      command: 'platform.self-edit',
      payload: { instruction: codeEdit[1].trim(), apply: true },
      spokenReply: 'I will propose and apply a sandboxed code change from that instruction.',
      confidence: 0.92,
    };
  }

  if (/\b(what do you remember|recall|show memory|list teachings)\b/.test(text)) {
    return {
      kind: 'command',
      command: 'assistant.recall',
      payload: {},
      spokenReply: 'Looking up what I have learned about you.',
      confidence: 0.9,
    };
  }

  if (/\b(ping|are you there|hello|hi)\b/.test(text)) {
    return {
      kind: 'command',
      command: 'system.ping',
      payload: { message: utterance.trim() },
      spokenReply: 'Pinging the system now.',
      confidence: 0.95,
    };
  }

  if (/\b(run|start)\b.*\b(demo|system demo)\b/.test(text) || text === 'run demo') {
    return {
      kind: 'workflow',
      workflow: 'system.demo',
      payload: { message: 'hello', followUp: 'from voice' },
      spokenReply: 'Starting the system demo workflow.',
      confidence: 0.9,
    };
  }

  if (/\b(job application|apply for jobs|career workflow)\b/.test(text)) {
    const keywords = extractJobKeywords(text);
    return {
      kind: 'workflow',
      workflow: 'career.job-application',
      payload: {
        keywords: keywords.length > 0 ? keywords : ['TypeScript'],
        location: 'Remote',
        resumeId: 'primary-resume-1',
        minSalary: 90000,
      },
      spokenReply: `Starting a job application workflow for ${keywords.join(' ') || 'TypeScript'}.`,
      confidence: 0.88,
    };
  }

  if (/\b(search|find)\b.*\bjobs?\b/.test(text) || /\bjobs?\b.*\b(search|find)\b/.test(text)) {
    const keywords = extractJobKeywords(text);
    return {
      kind: 'command',
      command: 'career.search-jobs',
      payload: {
        keywords: keywords.length > 0 ? keywords : ['software'],
        location: 'Remote',
      },
      spokenReply: `Searching for ${keywords.join(' ') || 'software'} jobs.`,
      confidence: 0.9,
    };
  }

  if (/\b(health|status|how are you)\b/.test(text)) {
    return {
      kind: 'command',
      command: 'system.ping',
      payload: { message: 'health-check' },
      spokenReply: 'Checking system health.',
      confidence: 0.85,
    };
  }

  if (/\b(approvals?|pending)\b/.test(text)) {
    return {
      kind: 'help',
      payload: {},
      spokenReply: 'Open the Approvals page in the dashboard to review pending commands.',
      confidence: 0.8,
    };
  }

  if (/\b(ai status|ollama|model status)\b/.test(text)) {
    return {
      kind: 'command',
      command: 'platform.ai-status',
      payload: {},
      spokenReply: 'Checking AI and Ollama status.',
      confidence: 0.9,
    };
  }

  return {
    kind: 'unknown',
    payload: {},
    spokenReply: `I heard "${utterance.trim()}". ${HELP_TEXT}`,
    confidence: 0.2,
  };
}

function extractJobKeywords(text: string): string[] {
  const known: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    python: 'Python',
    java: 'Java',
    golang: 'Golang',
    rust: 'Rust',
    react: 'React',
    node: 'Node',
    mongodb: 'MongoDB',
    redis: 'Redis',
    devops: 'DevOps',
    backend: 'Backend',
    frontend: 'Frontend',
    fullstack: 'Fullstack',
    ai: 'AI',
    ml: 'ML',
  };
  return Object.entries(known)
    .filter(([k]) => text.includes(k))
    .map(([, display]) => display);
}
