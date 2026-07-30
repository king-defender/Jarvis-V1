import type { WorkflowDefinition } from '../../../orchestration/workflow/workflow.types.js';

/**
 * End-to-end Career validation workflow:
 * search jobs → optimize resume → draft cover letter → track application
 */
export function getCareerJobApplicationWorkflow(): WorkflowDefinition {
  return {
    name: 'career.job-application',
    steps: [
      {
        id: 'search',
        name: 'search-jobs',
        command: 'career.search-jobs',
        payloadMapping: {
          keywords: '$.context.keywords',
          location: '$.context.location',
          minSalary: '$.context.minSalary',
        },
        retryAttempts: 1,
      },
      {
        id: 'optimize',
        name: 'optimize-resume',
        command: 'career.optimize-resume',
        payloadMapping: {
          resumeId: '$.context.resumeId',
          jobId: '$.search-jobs.listings.0.id',
        },
        retryAttempts: 1,
      },
      {
        id: 'cover',
        name: 'draft-cover-letter',
        command: 'career.draft-cover-letter',
        payloadMapping: {
          jobId: '$.search-jobs.listings.0.id',
          resumeId: '$.optimize-resume.optimizedResumeId',
          tone: 'professional',
        },
        retryAttempts: 1,
      },
      {
        id: 'track',
        name: 'track-application',
        command: 'career.track-application',
        payloadMapping: {
          jobId: '$.search-jobs.listings.0.id',
          resumeId: '$.optimize-resume.optimizedResumeId',
          coverLetterId: '$.draft-cover-letter.coverLetterId',
          status: 'READY',
        },
        retryAttempts: 0,
      },
    ],
  };
}
