/**
 * Deterministic natural-language → command intent resolver.
 * No AI keys required. Used by voice/text assistant entry points.
 */
export interface AssistantIntent {
  kind: 'command' | 'workflow' | 'help' | 'unknown';
  command?: string;
  workflow?: string;
  payload: Record<string, unknown>;
  spokenReply: string;
  confidence: number;
}

const HELP_TEXT =
  'I can search jobs, ping the system, run demos, draft cover letters, check health, or list commands. Try: "search remote typescript jobs" or "run system demo".';

export function interpretUtterance(utterance: string): AssistantIntent {
  const text = utterance.trim().toLowerCase().replace(/[?.!,]/g, '');
  if (!text) {
    return {
      kind: 'help',
      payload: {},
      spokenReply: HELP_TEXT,
      confidence: 1,
    };
  }

  if (/\b(help|what can you do|commands)\b/.test(text)) {
    return { kind: 'help', payload: {}, spokenReply: HELP_TEXT, confidence: 1 };
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
        location: /\bremote\b/.test(text) ? 'Remote' : 'Remote',
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
        location: /\bremote\b/.test(text) ? 'Remote' : 'Remote',
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
