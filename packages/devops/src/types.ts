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
  other: string[];
}

export interface CleanedCommit {
  branch: string;
  categorizedCommits: CommitCategory;
}
