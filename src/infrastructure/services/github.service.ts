import type { SystemConfig } from '../../config.js';
import type { ILoggingService } from './logging.service.js';

export interface IGitHubService {
  getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<string>;
  submitReviewComment(
    owner: string,
    repo: string,
    prNumber: number,
    comment: string,
  ): Promise<void>;
  getUserProfile(username: string): Promise<Record<string, unknown>>;
}

export class GitHubService implements IGitHubService {
  constructor(
    private readonly config: SystemConfig,
    private readonly log: ILoggingService,
  ) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': 'CommandOS-GitHub/0.1',
    };
    if (this.config.github.token) {
      headers.authorization = `Bearer ${this.config.github.token}`;
    }
    return headers;
  }

  async getPullRequestDiff(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<string> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          ...this.headers(),
          accept: 'application/vnd.github.v3.diff',
        },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub PR diff failed (${response.status}): ${body}`);
    }

    return response.text();
  }

  async submitReviewComment(
    owner: string,
    repo: string,
    prNumber: number,
    comment: string,
  ): Promise<void> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          ...this.headers(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ body: comment }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub comment failed (${response.status}): ${body}`);
    }
  }

  async getUserProfile(username: string): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`https://api.github.com/users/${username}`, {
        headers: this.headers(),
      });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (error: unknown) {
      this.log.warn('GitHub profile fetch failed; returning stub profile', {
        username,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        login: username,
        name: username,
        bio: 'Profile unavailable (offline stub)',
        public_repos: 0,
        html_url: `https://github.com/${username}`,
        stub: true,
      };
    }
  }
}
