import { extractKeywordsTask, matchResumeTask } from '../tasks/index.js';
import type { ModelRouterService } from '../../infrastructure/ai/model-router.service.js';

export async function interviewSkill(input: {
  resumeText: string;
  jobDescription: string;
  questionsCount: number;
  modelRouter: ModelRouterService;
}) {
  const match = matchResumeTask(input.resumeText, input.jobDescription);
  const keywords = await extractKeywordsTask(input.jobDescription, 8);
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

  await input.modelRouter.complete({
    prompt: `Generate interview set for score ${match.score}`,
    systemPrompt: 'Interview coach',
  });

  return { questions, matchScore: match.score, gaps: match.missing };
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
