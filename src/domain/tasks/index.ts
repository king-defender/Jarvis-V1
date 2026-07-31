import fs from 'node:fs/promises';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import simpleGit from 'simple-git';

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
  return raw.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function parsePdfFileTask(
  filePath: string,
): Promise<{ text: string; pages: number; engine: string }> {
  const fs = await import('node:fs/promises');
  const { PDFParse } = await import('pdf-parse');
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const parsed = await parser.getText();
    return {
      text: parsePdfTextTask(parsed.text || ''),
      pages: parsed.total ?? 0,
      engine: 'pdf-parse',
    };
  } finally {
    await parser.destroy();
  }
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

/** OCR via Tesseract.js. Accepts image path or returns plaintext if no image file. */
export async function ocrTask(imagePathOrText: string): Promise<{ text: string; engine: string }> {
  try {
    await fs.access(imagePathOrText);
  } catch {
    // Not a file path — treat as already-extracted text
    return { text: imagePathOrText, engine: 'passthrough' };
  }

  const worker = await createWorker('eng');
  try {
    const {
      data: { text },
    } = await worker.recognize(imagePathOrText);
    return { text: text.trim(), engine: 'tesseract.js' };
  } finally {
    await worker.terminate();
  }
}

export async function gitCloneTask(input: {
  repoUrl: string;
  targetPath: string;
  branchName?: string;
}): Promise<{ success: boolean; commitHash: string; path: string }> {
  await fs.mkdir(path.dirname(input.targetPath), { recursive: true });
  const git = simpleGit();
  const cloneOptions = input.branchName
    ? ['--depth', '1', '--branch', input.branchName]
    : ['--depth', '1'];
  await git.clone(input.repoUrl, input.targetPath, cloneOptions);
  const repo = simpleGit(input.targetPath);
  const log = await repo.log({ maxCount: 1 });
  const commitHash = log.latest?.hash ?? '';
  return { success: true, commitHash, path: input.targetPath };
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
  screenshot: (url: string, outputPath: string, selector?: string) => Promise<{ imagePath: string }>,
  url: string,
  outputPath: string,
  selector?: string,
): Promise<string> {
  const result = await screenshot(url, outputPath, selector);
  return result.imagePath;
}
