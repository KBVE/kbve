export interface CommitCategory {
  ci: string[];
  fix: string[];
  docs: string[];
  feat: string[];
  merge: string[];
  other: string[];
}

export interface CleanedCommit {
  branch: string;
  categorizedCommits: CommitCategory;
}
