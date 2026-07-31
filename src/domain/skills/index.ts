import { extractKeywordsTask, matchResumeTask } from '../tasks/index.js';
import type { ModelRouterService } from '../../infrastructure/ai/model-router.service.js';
import type {
  PromptLibrary,
  SafetyService,
} from '../../infrastructure/ai/prompt-safety-eval.js';

export async function interviewSkill(input: {
  resumeText: string;
  jobDescription: string;
  questionsCount: number;
  modelRouter: ModelRouterService;
  prompts?: PromptLibrary;
  safety?: SafetyService;
}) {
  const match = matchResumeTask(input.resumeText, input.jobDescription);
  const keywords = await extractKeywordsTask(input.jobDescription, 8);

  if (input.prompts && input.safety) {
    const rendered = input.prompts.render('career.interview', {
      count: String(input.questionsCount),
      resume: input.resumeText.slice(0, 3000),
      job: input.jobDescription.slice(0, 3000),
      keywords: keywords.join(', '),
    });
    input.safety.assertSafePrompt(rendered.prompt);
    const ai = await input.modelRouter.complete({
      systemPrompt: rendered.system,
      prompt: rendered.prompt,
    });
    const sanitized = input.safety.sanitizeOutput(ai.text);
    const blocks = sanitized.split(/\n(?=\d+\.|Q:|Question)/i).filter((b) => b.trim());
    if (blocks.length >= Math.min(2, input.questionsCount)) {
      const questions = blocks.slice(0, input.questionsCount).map((block, i) => {
        const categories = ['behavioral', 'technical', 'situational'] as const;
        return {
          question: block.split('\n')[0]?.replace(/^\d+\.\s*|Q:\s*|Question:\s*/i, '').trim() ||
            block.slice(0, 160),
          category: categories[i % categories.length]!,
          idealAnswerStarMethod: {
            situation: 'See model draft',
            task: 'See model draft',
            action: block.slice(0, 400),
            result: `Match context ${match.score}%`,
          },
          modelDraft: block.trim(),
        };
      });
      return {
        questions,
        matchScore: match.score,
        gaps: match.missing,
        degraded: ai.degraded,
      };
    }
  }

  const categories = ['behavioral', 'technical', 'situational'] as const;
  const questions = Array.from({ length: input.questionsCount }, (_, i) => {
    const category = categories[i % categories.length]!;
    const focus = keywords[i % Math.max(keywords.length, 1)] ?? 'experience';
    return {
      question: `Tell me about a time you used ${focus} in a ${category} context.`,
      category,
      idealAnswerStarMethod: {
        situation: `Faced a challenge involving ${focus}.`,
        task: 'Deliver a reliable outcome under constraints.',
        action: 'Broke work into measurable steps and validated results.',
        result: `Improved outcomes; resume match score context ${match.score}%.`,
      },
    };
  });
  return { questions, matchScore: match.score, gaps: match.missing, degraded: true };
}

export async function resumeOptimizeSkill(input: {
  resumeText: string;
  jobText: string;
  jobTitle: string;
  modelRouter: ModelRouterService;
  prompts: PromptLibrary;
  safety: SafetyService;
}) {
  const match = matchResumeTask(input.resumeText, input.jobText);
  const rendered = input.prompts.render('career.resume-optimize', {
    resume: input.resumeText.slice(0, 4000),
    job: input.jobText.slice(0, 4000),
  });
  input.safety.assertSafePrompt(rendered.prompt);
  const ai = await input.modelRouter.complete({
    systemPrompt: rendered.system,
    prompt: rendered.prompt,
  });
  const text = input.safety.sanitizeOutput(ai.text);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 8)
    .slice(0, 3);
  const suggestedBulletPoints = (lines.length > 0 ? lines : [
    `Built TypeScript services aligned to ${input.jobTitle} requirements.`,
  ]).map((suggested, i) => ({
    section: 'Experience',
    original: i === 0 ? 'Built backend services.' : `Experience highlight ${i + 1}`,
    suggested,
    reason: 'LLM/ATS alignment',
  }));
  return {
    matchScore: match.score,
    suggestedBulletPoints,
    modelText: text,
    degraded: ai.degraded,
  };
}

export async function coverLetterSkill(input: {
  resumeText: string;
  jobText: string;
  company: string;
  title: string;
  tone: string;
  modelRouter: ModelRouterService;
  prompts: PromptLibrary;
  safety: SafetyService;
}) {
  const rendered = input.prompts.render('career.cover-letter', {
    tone: input.tone,
    title: input.title,
    company: input.company,
    resume: input.resumeText.slice(0, 2500),
    job: input.jobText.slice(0, 2500),
  });
  input.safety.assertSafePrompt(rendered.prompt);
  const ai = await input.modelRouter.complete({
    systemPrompt: rendered.system,
    prompt: rendered.prompt,
  });
  return {
    draftText: input.safety.sanitizeOutput(ai.text),
    degraded: ai.degraded,
  };
}

export async function companyResearchSkill(input: {
  companyName: string;
  modelRouter: ModelRouterService;
}) {
  const draft = await input.modelRouter.complete({
    prompt: `Research summary for ${input.companyName}`,
  });
  return {
    companyName: input.companyName,
    summary: draft.text.slice(0, 800),
    sources: [`https://www.google.com/search?q=${encodeURIComponent(input.companyName)}`],
  };
}

export async function documentationSkill(input: {
  title: string;
  outline: string[];
  modelRouter: ModelRouterService;
}) {
  const draft = await input.modelRouter.complete({
    prompt: `Write docs for ${input.title}: ${input.outline.join(', ')}`,
  });
  return {
    title: input.title,
    markdown: `# ${input.title}\n\n${input.outline.map((x) => `## ${x}\n`).join('\n')}\n${draft.text}`,
  };
}

export async function prdGenerationSkill(input: {
  productName: string;
  problem: string;
  modelRouter: ModelRouterService;
}) {
  const draft = await input.modelRouter.complete({
    prompt: `PRD for ${input.productName}: ${input.problem}`,
  });
  return {
    productName: input.productName,
    prd: `# PRD: ${input.productName}\n\n## Problem\n${input.problem}\n\n## Draft\n${draft.text}`,
  };
}

export async function deploymentSkill(input: {
  environment: string;
  checklist: string[];
}) {
  return {
    environment: input.environment,
    steps: input.checklist.map((item, i) => ({ order: i + 1, item, status: 'ready' })),
  };
}

export async function pricingAnalysisSkill(input: {
  plans: Array<{ name: string; price: number }>;
}) {
  const avg =
    input.plans.reduce((sum, p) => sum + p.price, 0) / Math.max(input.plans.length, 1);
  return {
    averagePrice: avg,
    recommendation: avg > 50 ? 'Consider freemium entry tier' : 'Room to raise Pro pricing',
  };
}

export async function competitorResearchSkill(input: {
  companyName: string;
  url: string;
  pageText: string;
  modelRouter: ModelRouterService;
  prompts: PromptLibrary;
  safety: SafetyService;
}) {
  const rendered = input.prompts.render('startup.competitor', {
    company: input.companyName,
    url: input.url,
    text: input.pageText.slice(0, 5000),
  });
  input.safety.assertSafePrompt(rendered.prompt);
  const ai = await input.modelRouter.complete({
    systemPrompt: rendered.system,
    prompt: rendered.prompt,
  });
  const text = input.safety.sanitizeOutput(ai.text);
  const features = text
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter((l) => l.length > 3)
    .slice(0, 10);
  return {
    analysis: text,
    keyFeatures: features,
    degraded: ai.degraded,
  };
}

export async function githubReviewSkill(input: {
  diff: string;
  modelRouter: ModelRouterService;
  prompts: PromptLibrary;
  safety: SafetyService;
}) {
  if (!input.diff.trim()) {
    return {
      status: 'approved' as const,
      reviewSummary: 'No diff available to review.',
      inlineComments: [] as Array<{ file: string; line: number; comment: string }>,
      degraded: true,
    };
  }
  const rendered = input.prompts.render('development.pr-review', {
    diff: input.diff.slice(0, 12000),
  });
  input.safety.assertSafePrompt(rendered.prompt);
  const ai = await input.modelRouter.complete({
    systemPrompt: rendered.system,
    prompt: rendered.prompt,
  });
  const text = input.safety.sanitizeOutput(ai.text);
  const inlineComments: Array<{ file: string; line: number; comment: string }> = [];
  if (/TODO|FIXME|bug|security|vulnerability/i.test(input.diff + text)) {
    inlineComments.push({
      file: 'diff',
      line: 1,
      comment: text.split('\n').find((l) => l.trim())?.slice(0, 240) ||
        'Reviewer flagged potential issues.',
    });
  }
  return {
    status: (inlineComments.length > 0 ? 'changes_requested' : 'approved') as
      | 'changes_requested'
      | 'approved',
    reviewSummary: text.slice(0, 500),
    inlineComments,
    degraded: ai.degraded,
  };
}
