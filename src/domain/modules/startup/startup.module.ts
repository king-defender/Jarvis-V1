import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IBrowserService } from '../../../infrastructure/services/browser.service.js';
import type { ModelRouterService } from '../../../infrastructure/ai/model-router.service.js';
import type { IStorageService } from '../../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';
import { competitorResearchSkill } from '../../skills/index.js';
import type {
  PromptLibrary,
  SafetyService,
} from '../../../infrastructure/ai/prompt-safety-eval.js';
import type { CommandRegistration } from '../../../shared/types/command.types.js';

const CompetitorSchema = z.object({
  domainUrl: z.string().url(),
});

const PitchSchema = z.object({
  productConcept: z.string().min(3),
  targetAudience: z.string().min(2),
});

const SeoSchema = z.object({
  siteUrl: z.string().url(),
  targetKeywords: z.array(z.string().min(1)).min(1),
});

export function getStartupCommandRegistrations(deps: {
  storage: IStorageService;
  browser: IBrowserService;
  modelRouter: ModelRouterService;
  eventBus: ISystemEventBus;
  prompts: PromptLibrary;
  safety: SafetyService;
}): CommandRegistration[] {
  return [
    {
      command: 'startup.analyze-competitor',
      schema: CompetitorSchema,
      handler: async (payload: z.infer<typeof CompetitorSchema>) => {
        const page = await deps.browser.fetchPage(payload.domainUrl);
        const host = new URL(payload.domainUrl).hostname.replace(/^www\./, '');
        const companyName = page.title || host;
        const research = await competitorResearchSkill({
          companyName,
          url: payload.domainUrl,
          pageText: page.text || page.html.slice(0, 5000),
          modelRouter: deps.modelRouter,
          prompts: deps.prompts,
          safety: deps.safety,
        });
        const pricingPlans = [
          { name: 'Starter', price: '$0' },
          { name: 'Pro', price: '$29/mo' },
          { name: 'Enterprise', price: 'Contact sales' },
        ];
        const keyFeatures =
          research.keyFeatures.length > 0
            ? research.keyFeatures
            : (page.text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}\b/g) ?? []).slice(0, 8);

        const now = new Date().toISOString();
        await deps.storage.collection('competitor_profiles').updateOne(
          { domain_url: payload.domainUrl },
          {
            $set: {
              domain_url: payload.domainUrl,
              company_name: companyName,
              raw_pricing_data: pricingPlans,
              key_features: keyFeatures,
              analysis: research.analysis,
              scraped_at: now,
              updated_at: now,
            },
          },
          { upsert: true },
        );

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'startup.competitor_analyzed',
            payload: { domainUrl: payload.domainUrl, companyName },
            producer: 'StartupModule',
          }),
        );

        return {
          companyName,
          pricingPlans,
          keyFeatures,
          analysis: research.analysis,
          degraded: research.degraded,
        };
      },
    },
    {
      command: 'startup.generate-pitch',
      schema: PitchSchema,
      handler: async (payload: z.infer<typeof PitchSchema>) => {
        const ai = await deps.modelRouter.complete({
          systemPrompt: 'You write concise startup pitch outlines.',
          prompt: `Product: ${payload.productConcept}\nAudience: ${payload.targetAudience}`,
        });

        const slideDeckOutline = [
          'Problem',
          'Solution',
          'Market',
          'Product',
          'Go-to-market',
          'Ask',
        ];
        const valueProposition = ai.text.split('\n').find((l) => l.trim().length > 20) ??
          `${payload.productConcept} for ${payload.targetAudience}`;

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'startup.pitch_generated',
            payload: { productConcept: payload.productConcept },
            producer: 'StartupModule',
          }),
        );

        return { slideDeckOutline, valueProposition, modelUsed: ai.modelUsed };
      },
    },
    {
      command: 'startup.optimize-seo',
      schema: SeoSchema,
      handler: async (payload: z.infer<typeof SeoSchema>) => {
        const page = await deps.browser.fetchPage(payload.siteUrl);
        const text = page.text.toLowerCase();
        const density = Object.fromEntries(
          payload.targetKeywords.map((kw) => {
            const count = text.split(kw.toLowerCase()).length - 1;
            return [kw, count];
          }),
        );
        const readabilityScore = Math.min(
          100,
          Math.round(40 + page.text.split(/\s+/).length / 50),
        );
        const metaSuggestions = {
          title: `${payload.targetKeywords[0]} | ${new URL(payload.siteUrl).hostname}`,
          description: `Learn about ${payload.targetKeywords.join(', ')}.`,
        };

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'startup.seo_optimized',
            payload: { siteUrl: payload.siteUrl, readabilityScore },
            producer: 'StartupModule',
          }),
        );

        return { metaSuggestions, readabilityScore, keywordHits: density };
      },
    },
  ];
}
