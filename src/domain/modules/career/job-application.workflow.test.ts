import { describe, expect, it } from 'vitest';
import { getCareerJobApplicationWorkflow } from './job-application.workflow.js';

describe('career.job-application workflow', () => {
  it('defines the full apply pipeline', () => {
    const workflow = getCareerJobApplicationWorkflow();
    expect(workflow.name).toBe('career.job-application');
    expect(workflow.steps.map((s) => s.command)).toEqual([
      'career.search-jobs',
      'career.optimize-resume',
      'career.draft-cover-letter',
      'career.track-application',
    ]);
  });
});
