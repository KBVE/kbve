export interface CommitCategory {
  ci: string[];
  fix: string[];
  docs: string[];
  feat: string[];
  merge: string[];
  perf: string[];
  build: string[];
  refactor: string[];
  revert: string[];
  style: string[];
  test: string[];
  sync: string[];
  chore: string[];
  other: string[];
}

export interface CleanedCommit {
  branch: string;
  categorizedCommits: CommitCategory;
}

/** Input format for commits from the GitHub API. */
export interface ApiCommit {
  message: string;
  sha: string;
}

/** Result of categorizing commits from the GitHub API. */
export interface CategorizedResult {
  categories: CommitCategory;
  prRefs: Set<string>;
}

/** Display labels for each commit category. */
export const COMMIT_CATEGORY_LABELS: Record<keyof CommitCategory, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  docs: 'Documentation',
  ci: 'CI/CD',
  perf: 'Performance',
  build: 'Build',
  refactor: 'Refactoring',
  revert: 'Reverts',
  style: 'Style',
  test: 'Tests',
  sync: 'Sync',
  chore: 'Chores',
  merge: 'Merge Commits',
  other: 'Other Changes',
};
