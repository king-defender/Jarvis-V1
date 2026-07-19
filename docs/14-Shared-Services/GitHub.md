# GitHub Shared Service Specification

The GitHub Shared Service abstracts interactions with the GitHub REST API.

---

## 1. Description
Authenticates requests using personal access tokens, retrieves pull request diff text blocks, submits inline review comments, and gets repository structures.

---

## 2. API Contract
```typescript
export interface IGitHubService {
  getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<string>;
  submitReviewComment(owner: string, repo: string, prNumber: number, comment: string): Promise<void>;
}
```
