import { _$gha_formatCommits, _$gha_createOrUpdatePR } from './pulls';
import { GitHubClient, GitHubContext, CleanedCommit, CommitCategory } from './types';

function mockGitHubContext(overrides?: Partial<GitHubContext>): GitHubContext {
  return {
    repo: { owner: 'KBVE', repo: 'kbve' },
    issue: { number: 42 },
    ref: 'refs/heads/feature-branch',
    payload: {},
    job: 'test-job',
    ...overrides,
  };
}

function mockGitHubClient(overrides?: Partial<GitHubClient>): GitHubClient {
  return {
    rest: {
      issues: {
        createComment: vi.fn().mockResolvedValue({}),
        addLabels: vi.fn().mockResolvedValue({}),
        removeLabel: vi.fn().mockResolvedValue({}),
        listLabelsOnIssue: vi.fn().mockResolvedValue({ data: [] }),
        addAssignees: vi.fn().mockResolvedValue({}),
        removeAssignees: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        lock: vi.fn().mockResolvedValue({}),
        unlock: vi.fn().mockResolvedValue({}),
      },
      pulls: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      reactions: {
        createForIssueComment: vi.fn().mockResolvedValue({}),
      },
    },
    ...overrides,
  };
}

function emptyCommitCategory(): CommitCategory {
  return {
    ci: [],
    fix: [],
    docs: [],
    feat: [],
    merge: [],
    perf: [],
    build: [],
    refactor: [],
    revert: [],
    style: [],
    test: [],
    sync: [],
    other: [],
  };
}

describe('_$gha_formatCommits', () => {
  it('should format commits with all categories empty', () => {
    const cleanedCommit: CleanedCommit = {
      branch: 'main',
      categorizedCommits: emptyCommitCategory(),
    };

    const result = _$gha_formatCommits(cleanedCommit);

    expect(result).toContain('PR Report for main');
    expect(result).toContain('KBVE Logo');
    expect(result).not.toContain('### CI Changes');
    expect(result).not.toContain('### Fixes');
  });

  it('should format commits with single category populated', () => {
    const commits = emptyCommitCategory();
    commits.feat = ['feat(core): add new feature'];

    const cleanedCommit: CleanedCommit = {
      branch: 'dev',
      categorizedCommits: commits,
    };

    const result = _$gha_formatCommits(cleanedCommit);

    expect(result).toContain('PR Report for dev');
    expect(result).toContain('### Features:');
    expect(result).toContain('feat(core): add new feature');
  });

  it('should format commits with multiple categories', () => {
    const commits = emptyCommitCategory();
    commits.feat = ['feat(core): add feature'];
    commits.fix = ['fix(ui): fix button', 'fix(api): fix endpoint'];
    commits.ci = ['ci(actions): update workflow'];

    const cleanedCommit: CleanedCommit = {
      branch: 'release',
      categorizedCommits: commits,
    };

    const result = _$gha_formatCommits(cleanedCommit);

    expect(result).toContain('### Features:');
    expect(result).toContain('### Fixes:');
    expect(result).toContain('### CI Changes:');
    expect(result).toContain('fix(ui): fix button');
    expect(result).toContain('fix(api): fix endpoint');
  });

  it('should include footer with docs link', () => {
    const cleanedCommit: CleanedCommit = {
      branch: 'main',
      categorizedCommits: emptyCommitCategory(),
    };

    const result = _$gha_formatCommits(cleanedCommit);

    expect(result).toContain('welcome-to-docs');
  });
});

describe('_$gha_createOrUpdatePR', () => {
  it('should create a new PR when none exists', async () => {
    const github = mockGitHubClient({
      ref: 'refs/heads/feature-branch',
    });
    (github.rest.pulls.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    const context = mockGitHubContext();

    await _$gha_createOrUpdatePR(github, context, 'main');

    expect(github.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        head: 'feature-branch',
        base: 'main',
        owner: 'KBVE',
        repo: 'kbve',
      }),
    );
  });

  it('should add comment when PR already exists', async () => {
    const github = mockGitHubClient({
      ref: 'refs/heads/feature-branch',
    });
    (github.rest.pulls.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ number: 99 }],
    });
    const context = mockGitHubContext();

    await _$gha_createOrUpdatePR(github, context, 'main');

    expect(github.rest.pulls.create).not.toHaveBeenCalled();
    expect(github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 99,
        body: expect.stringContaining('Updated by Job'),
      }),
    );
  });

  it('should use context.payload.pull_request.head.ref when github.ref is not available', async () => {
    const github = mockGitHubClient();
    // No github.ref
    (github.rest.pulls.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    const context = mockGitHubContext({
      payload: {
        pull_request: {
          head: { ref: 'pr-branch' },
        },
      },
    });

    await _$gha_createOrUpdatePR(github, context, 'main');

    expect(github.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        head: 'pr-branch',
      }),
    );
  });

  it('should fall back to context.ref when github.ref and payload are unavailable', async () => {
    const github = mockGitHubClient();
    (github.rest.pulls.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    const context = mockGitHubContext({
      ref: 'refs/heads/fallback-branch',
    });

    await _$gha_createOrUpdatePR(github, context, 'main');

    expect(github.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        head: 'fallback-branch',
      }),
    );
  });

  it('should throw when no branch can be determined', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext({
      ref: '',
    });

    // context.ref is empty string, github.ref is undefined, no payload
    await expect(
      _$gha_createOrUpdatePR(github, context, 'main'),
    ).rejects.toThrow();
  });
});
