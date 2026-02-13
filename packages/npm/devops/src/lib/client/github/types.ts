import type { CommitCategory, CleanedCommit } from '../../../types';

// --- Minimal GitHub REST API Client Interface ---
// Typed to match actual usage (Octokit from actions/github-script@v7)
// without pulling in @octokit/rest as a dependency.

export interface GitHubIssuesApi {
  createComment(params: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }): Promise<unknown>;
  addLabels(params: {
    owner: string;
    repo: string;
    issue_number: number;
    labels: string[];
  }): Promise<unknown>;
  removeLabel(params: {
    owner: string;
    repo: string;
    issue_number: number;
    name: string;
  }): Promise<unknown>;
  listLabelsOnIssue(params: {
    owner: string;
    repo: string;
    issue_number: number;
  }): Promise<{ data: { name: string }[] }>;
  addAssignees(params: {
    owner: string;
    repo: string;
    issue_number: number;
    assignees: string[];
  }): Promise<unknown>;
  removeAssignees(params: {
    owner: string;
    repo: string;
    issue_number: number;
    assignees: string[];
  }): Promise<unknown>;
  update(params: {
    owner: string;
    repo: string;
    issue_number: number;
    state?: string;
  }): Promise<unknown>;
  lock(params: {
    owner: string;
    repo: string;
    issue_number: number;
    lock_reason?: string;
  }): Promise<unknown>;
  unlock(params: {
    owner: string;
    repo: string;
    issue_number: number;
  }): Promise<unknown>;
}

export interface GitHubPullsApi {
  list(params: {
    owner: string;
    repo: string;
    head: string;
    base?: string;
    state?: string;
  }): Promise<{ data: { number: number; head: { ref: string } }[] }>;
  create(params: {
    title: string;
    owner: string;
    repo: string;
    head: string;
    base: string;
    body: string;
  }): Promise<unknown>;
  update(params: {
    owner: string;
    repo: string;
    pull_number: number;
    body: string;
  }): Promise<unknown>;
}

export interface GitHubReactionsApi {
  createForIssueComment(params: {
    owner: string;
    repo: string;
    comment_id: number;
    content: string;
  }): Promise<unknown>;
}

export interface GitHubClient {
  rest: {
    issues: GitHubIssuesApi;
    pulls: GitHubPullsApi;
    reactions: GitHubReactionsApi;
  };
  ref?: string;
  event_name?: string;
}

export interface GitHubContext {
  repo: {
    owner: string;
    repo: string;
  };
  issue: {
    number: number;
  };
  ref: string;
  payload: {
    pull_request?: {
      head: {
        ref: string;
      };
    };
  };
  job: string;
}

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

export interface GitHubIssueInfo extends GitHubRepoInfo {
  issue_number: number;
}

export interface GithubActionReferenceMap {
  keyword: string;
  action: string;
}

export function _$gha_extractIssueContext(context: GitHubContext): GitHubIssueInfo {
  const { repo, owner } = context.repo;
  const issue_number = context.issue.number;
  return { owner, repo, issue_number };
}

export function _$gha_extractRepoContext(context: GitHubContext): GitHubRepoInfo {
  const { repo, owner } = context.repo;
  return { owner, repo };
}

export type { CommitCategory, CleanedCommit };
