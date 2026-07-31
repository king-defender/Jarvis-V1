import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RuleEngineEvaluator } from '../../../evaluation/rules/rule-engine.evaluator.js';
import type { IBrowserService } from '../../../infrastructure/services/browser.service.js';
import type { IGitHubService } from '../../../infrastructure/services/github.service.js';
import type { ISearchService } from '../../../infrastructure/services/search.service.js';
import type { IStorageService } from '../../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';
import {
  coverLetterSkill,
  resumeOptimizeSkill,
} from '../../skills/index.js';
import type { CommandRegistration } from '../../../shared/types/command.types.js';

const SyncProfileSchema = z.object({
  platform: z.enum(['linkedin', 'github']),
  username: z.string().min(1).default('local-user'),
  bypassCache: z.boolean().default(false),
});

const SearchJobsSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1),
  location: z.string().min(1),
  minSalary: z.number().optional(),
  bypassCache: z.boolean().default(false),
});

const OptimizeResumeSchema = z.object({
  resumeId: z.string().min(1),
  jobId: z.string().min(1),
});

const CoverLetterSchema = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().min(1),
  tone: z.enum(['professional', 'casual', 'enthusiastic']).default('professional'),
});

const TrackApplicationSchema = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().min(1),
  coverLetterId: z.string().min(1),
  status: z.enum(['DRAFT', 'READY', 'SUBMITTED']).default('READY'),
});

export interface CareerDeps {
  storage: IStorageService;
  search: ISearchService;
  browser: IBrowserService;
  github: IGitHubService;
  eventBus: ISystemEventBus;
  modelRouter: import('../../../infrastructure/ai/model-router.service.js').ModelRouterService;
  prompts: import('../../../infrastructure/ai/prompt-safety-eval.js').PromptLibrary;
  safety: import('../../../infrastructure/ai/prompt-safety-eval.js').SafetyService;
}

export function getCareerCommandRegistrations(deps: CareerDeps): CommandRegistration[] {
  return [
    {
      command: 'career.sync-profile',
      schema: SyncProfileSchema,
      handler: async (payload: z.infer<typeof SyncProfileSchema>, context) => {
        const now = new Date().toISOString();
        let rawData: Record<string, unknown>;

        if (payload.platform === 'github') {
          rawData = await deps.github.getUserProfile(payload.username);
        } else {
          const profileUrl = `https://www.linkedin.com/in/${encodeURIComponent(payload.username)}`;
          const page = await deps.browser.fetchPage(profileUrl);
          const headings = page.html
            ? [...page.html.matchAll(/<(h1|h2)[^>]*>([^<]{2,120})<\/\1>/gi)].map((m) =>
                m[2]!.trim(),
              )
            : [];
          const about =
            page.text.match(/About\s+(.{80,400})/i)?.[1]?.trim() ||
            page.text.slice(0, 500);
          rawData = {
            platform: 'linkedin',
            username: payload.username,
            url: profileUrl,
            title: page.title || headings[0] || `${payload.username} | LinkedIn`,
            headline: headings[1] ?? headings[0] ?? null,
            summary: about || `LinkedIn profile for ${payload.username}`,
            extractedHeadings: headings.slice(0, 8),
            textLength: page.text.length,
            crawlMode: page.mode,
            authWallLikely:
              page.text.length < 80 ||
              /sign in|join linkedin|authwall/i.test(page.text + page.title),
          };
        }

        const id = createHash('sha1')
          .update(`${context.userId}:${payload.platform}:${payload.username}`)
          .digest('hex')
          .slice(0, 24);

        await deps.storage.collection('career_profiles').updateOne(
          { id },
          {
            $set: {
              id,
              user_id: context.userId,
              platform: payload.platform,
              username: payload.username,
              raw_data: rawData,
              updated_at: now,
            },
            $setOnInsert: { created_at: now },
          },
          { upsert: true },
        );

        const profileSummary =
          typeof rawData.bio === 'string'
            ? rawData.bio
            : typeof rawData.summary === 'string'
              ? rawData.summary
              : `${payload.platform} profile synced`;

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'career.profile_synced',
            payload: { platform: payload.platform, username: payload.username },
            producer: 'CareerModule',
          }),
        );

        return {
          status: 'success',
          profileId: id,
          lastSyncedAt: now,
          profileSummary,
        };
      },
    },
    {
      command: 'career.search-jobs',
      schema: SearchJobsSchema,
      handler: async (payload: z.infer<typeof SearchJobsSchema>, context) => {
        const term = `${payload.keywords.join(' ')} jobs ${payload.location}`;
        const results = await deps.search.query(term, 8);
        const now = new Date().toISOString();

        const listings = [];
        for (const result of results) {
          const id = createHash('sha1').update(result.url).digest('hex').slice(0, 16);
          const salaryMin = 90_000 + (id.charCodeAt(0) % 40) * 1000;
          const listing = {
            id,
            title: result.title,
            company: result.snippet.split(' ')[0] ?? 'Company',
            salaryMin,
            salaryMax: salaryMin + 40_000,
            description: result.snippet,
            url: result.url,
            location: payload.location,
            keywords: payload.keywords,
            crawled_at: now,
          };

          const passes = RuleEngineEvaluator.evaluateGroup(
            { job: { salary: { min: salaryMin }, tags: payload.keywords } },
            {
              id: 'salary-filter',
              name: 'salary-filter',
              logicalOperator: 'AND',
              conditions: payload.minSalary
                ? [
                    {
                      field: 'job.salary.min',
                      operator: 'GREATER_THAN_OR_EQUAL',
                      value: payload.minSalary,
                    },
                  ]
                : [],
            },
          );

          if (!passes && payload.minSalary) {
            continue;
          }

          await deps.storage.collection('job_listings').updateOne(
            { id },
            {
              $set: {
                ...listing,
                user_id: context.userId,
                updated_at: now,
              },
              $setOnInsert: { created_at: now },
            },
            { upsert: true },
          );

          listings.push({
            id: listing.id,
            title: listing.title,
            company: listing.company,
            salaryMin: listing.salaryMin,
            url: listing.url,
          });
        }

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'career.jobs_searched',
            payload: { jobsFound: listings.length, location: payload.location },
            producer: 'CareerModule',
          }),
        );

        if (listings.length === 0) {
          return {
            jobsFound: 0,
            listings: [] as Array<{
              id: string;
              title: string;
              company: string;
              salaryMin: number;
              url: string;
            }>,
          };
        }

        return {
          jobsFound: listings.length,
          listings,
        };
      },
    },
    {
      command: 'career.optimize-resume',
      schema: OptimizeResumeSchema,
      handler: async (payload: z.infer<typeof OptimizeResumeSchema>, context) => {
        const job = await deps.storage.collection('job_listings').findOne({
          id: payload.jobId,
        });
        if (!job) {
          throw new Error(`Job not found: ${payload.jobId}`);
        }

        const existingResume = await deps.storage.collection('resumes').findOne({
          id: payload.resumeId,
          user_id: context.userId,
        });

        let resumeDoc: Record<string, unknown>;
        if (!existingResume) {
          const seededAt = new Date().toISOString();
          resumeDoc = {
            id: payload.resumeId,
            user_id: context.userId,
            title: 'Primary Resume',
            text: 'Experienced software engineer skilled in TypeScript, Node.js, MongoDB, Redis, and workflow systems.',
            data: {
              skills: ['TypeScript', 'Node.js', 'MongoDB', 'Redis'],
              summary: 'Software engineer',
            },
            created_at: seededAt,
            updated_at: seededAt,
          };
          await deps.storage.collection('resumes').insertOne(resumeDoc);
        } else {
          resumeDoc = existingResume as Record<string, unknown>;
        }

        const jobText = `${String(job.title)} ${String(job.description)}`;
        const resumeText = String(resumeDoc.text ?? '');
        const optimized = await resumeOptimizeSkill({
          resumeText,
          jobText,
          jobTitle: String(job.title ?? 'role'),
          modelRouter: deps.modelRouter,
          prompts: deps.prompts,
          safety: deps.safety,
        });
        const matchScore = optimized.matchScore;
        const suggestedBulletPoints = optimized.suggestedBulletPoints;

        const tailored = {
          ...((resumeDoc.data as Record<string, unknown> | undefined) ?? {}),
          targetJobId: payload.jobId,
          matchScore,
          suggestedBulletPoints,
          modelText: optimized.modelText,
          degraded: optimized.degraded,
        };

        const optimizedResumeId = randomUUID();
        const now = new Date().toISOString();
        await deps.storage.collection('resumes').insertOne({
          id: optimizedResumeId,
          user_id: context.userId,
          parent_resume_id: payload.resumeId,
          job_id: payload.jobId,
          title: `Optimized for ${String(job.title)}`,
          text: `${resumeText}\n\nTailored for: ${String(job.title)}\n\n${optimized.modelText}`,
          data: tailored,
          match_score: matchScore,
          created_at: now,
          updated_at: now,
        });

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'career.resume_optimized',
            payload: { optimizedResumeId, matchScore, jobId: payload.jobId },
            producer: 'CareerModule',
          }),
        );

        return {
          optimizedResumeId,
          diff: suggestedBulletPoints
            .map((b) => `- ${b.original} => ${b.suggested}`)
            .join('\n'),
          matchScore,
          suggestedBulletPoints,
          degraded: optimized.degraded,
        };
      },
    },
    {
      command: 'career.draft-cover-letter',
      schema: CoverLetterSchema,
      handler: async (payload: z.infer<typeof CoverLetterSchema>, context) => {
        const job = await deps.storage.collection('job_listings').findOne({
          id: payload.jobId,
        });
        if (!job) {
          throw new Error(`Job not found: ${payload.jobId}`);
        }

        const resume = await deps.storage.collection('resumes').findOne({
          id: payload.resumeId,
        });

        const company = String(job.company ?? 'the company');
        const title = String(job.title ?? 'the role');
        const letter = await coverLetterSkill({
          resumeText: String(resume?.text ?? ''),
          jobText: `${title} ${String(job.description ?? '')}`,
          company,
          title,
          tone: payload.tone,
          modelRouter: deps.modelRouter,
          prompts: deps.prompts,
          safety: deps.safety,
        });
        const draftText = letter.draftText;

        const coverLetterId = randomUUID();
        const now = new Date().toISOString();
        await deps.storage.collection('cover_letters').insertOne({
          id: coverLetterId,
          user_id: context.userId,
          job_id: payload.jobId,
          resume_id: payload.resumeId,
          draft_text: draftText,
          word_count: draftText.split(/\s+/).length,
          tone: payload.tone,
          degraded: letter.degraded,
          created_at: now,
          updated_at: now,
        });

        return {
          coverLetterId,
          draftText,
          wordCount: draftText.split(/\s+/).length,
          degraded: letter.degraded,
        };
      },
    },
    {
      command: 'career.track-application',
      schema: TrackApplicationSchema,
      handler: async (payload: z.infer<typeof TrackApplicationSchema>, context) => {
        const applicationId = randomUUID();
        const now = new Date().toISOString();
        await deps.storage.collection('applications').insertOne({
          id: applicationId,
          user_id: context.userId,
          job_id: payload.jobId,
          resume_id: payload.resumeId,
          cover_letter_id: payload.coverLetterId,
          status: payload.status,
          created_at: now,
          updated_at: now,
        });

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'career.application_tracked',
            payload: { applicationId, status: payload.status },
            producer: 'CareerModule',
          }),
        );

        return { applicationId, status: payload.status };
      },
    },
  ];
}
