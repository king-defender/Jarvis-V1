export async function extractKeywordsTask(text: string, limit = 12): Promise<string[]> {
  const counts = new Map<string, number>();
  for (const token of text.toLowerCase().match(/\b[a-z][a-z0-9+#.()-]{2,}\b/g) ?? []) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

export function matchResumeTask(resumeText: string, jobText: string): {
  score: number;
  missing: string[];
} {
  const tokenize = (value: string) =>
    new Set(value.toLowerCase().match(/\b[a-z][a-z0-9+#.]{2,}\b/g) ?? []);
  const resume = tokenize(resumeText);
  const job = tokenize(jobText);
  let hits = 0;
  const missing: string[] = [];
  for (const token of job) {
    if (resume.has(token)) hits += 1;
    else missing.push(token);
  }
  const score = job.size === 0 ? 0 : Math.round((hits / job.size) * 100);
  return { score, missing: missing.slice(0, 20) };
}

export function parseHtmlTask(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text };
}

export function extractDomTask(html: string, selectorHint?: string): string[] {
  const pattern = selectorHint
    ? new RegExp(`${selectorHint}[^>]*>([^<]+)<`, 'gi')
    : /<h1[^>]*>([^<]+)<\/h1>|<h2[^>]*>([^<]+)<\/h2>|<li[^>]*>([^<]+)<\/li>/gi;
  const matches: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const value = match[1] || match[2] || match[3];
    if (value?.trim()) matches.push(value.trim());
  }
  return matches.slice(0, 50);
}

export function parsePdfTextTask(raw: string): string {
  // Offline stub: treat input as already-extracted text/PDF plaintext dump
  return raw.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function callLlmTask(
  complete: (input: { prompt: string; systemPrompt?: string }) => Promise<{ text: string }>,
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  const result = await complete(
    systemPrompt === undefined ? { prompt } : { prompt, systemPrompt },
  );
  return result.text;
}

export function ocrTask(imagePathOrText: string): string {
  // Offline stub for OCR.task.md — pass-through for text dumps
  return `OCR_STUB:${imagePathOrText.slice(0, 200)}`;
}

export async function gitCloneTask(
  fsWrite: (path: string, content: string) => Promise<void>,
  repoUrl: string,
  targetPath: string,
): Promise<{ path: string; stub: boolean }> {
  await fsWrite(
    `${targetPath}/CLONE_STUB.md`,
    `# Clone stub\n\nRepo: ${repoUrl}\nReplace with real git clone in production.\n`,
  );
  return { path: targetPath, stub: true };
}

export async function sendEmailTask(
  sendMail: (to: string, subject: string, html: string) => Promise<string>,
  to: string,
  subject: string,
  html: string,
): Promise<string> {
  return sendMail(to, subject, html);
}

export async function screenshotTask(
  writeFile: (path: string, content: string) => Promise<void>,
  url: string,
  outputPath: string,
  pageText: string,
): Promise<string> {
  await writeFile(outputPath, `<html><body><h1>${url}</h1><pre>${pageText}</pre></body></html>`);
  return outputPath;
}
