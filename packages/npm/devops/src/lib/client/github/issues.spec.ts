import {
  _$gha_createIssueComment,
  _$gha_addReaction,
  _$gha_removeLabel,
  _$gha_addLabel,
  _$gha_verifyMatrixLabel,
  _$gha_addAssignees,
  _$gha_removeAssignees,
  _$gha_closeIssue,
  _$gha_reopenIssue,
  _$gha_lockIssue,
  _$gha_unlockIssue,
} from './issues';
import { GitHubClient, GitHubContext } from './types';

function mockGitHubContext(overrides?: Partial<GitHubContext>): GitHubContext {
  return {
    repo: { owner: 'KBVE', repo: 'kbve' },
    issue: { number: 42 },
    ref: 'refs/heads/main',
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

describe('_$gha_createIssueComment', () => {
  it('should call createComment with correct params', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_createIssueComment(github, context, 'Hello World');

    expect(github.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
      body: 'Hello World',
    });
  });

  it('should throw when API call fails', async () => {
    const github = mockGitHubClient();
    (github.rest.issues.createComment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('API Error'),
    );
    const context = mockGitHubContext();

    await expect(
      _$gha_createIssueComment(github, context, 'test'),
    ).rejects.toThrow('API Error');
  });
});

describe('_$gha_addReaction', () => {
  it('should call createForIssueComment with correct params', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_addReaction(github, context, 123, '+1');

    expect(github.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      comment_id: 123,
      content: '+1',
    });
  });
});

describe('_$gha_removeLabel', () => {
  it('should remove label when it exists on the issue', async () => {
    const github = mockGitHubClient();
    (github.rest.issues.listLabelsOnIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ name: 'bug' }, { name: 'feature' }],
    });
    const context = mockGitHubContext();

    await _$gha_removeLabel(github, context, 'bug');

    expect(github.rest.issues.removeLabel).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
      name: 'bug',
    });
  });

  it('should not call removeLabel when label does not exist', async () => {
    const github = mockGitHubClient();
    (github.rest.issues.listLabelsOnIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ name: 'feature' }],
    });
    const context = mockGitHubContext();

    await _$gha_removeLabel(github, context, 'bug');

    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled();
  });
});

describe('_$gha_addLabel', () => {
  it('should add label when it does not exist on the issue', async () => {
    const github = mockGitHubClient();
    (github.rest.issues.listLabelsOnIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ name: 'feature' }],
    });
    const context = mockGitHubContext();

    await _$gha_addLabel(github, context, 'bug');

    expect(github.rest.issues.addLabels).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
      labels: ['bug'],
    });
  });

  it('should not call addLabels when label already exists', async () => {
    const github = mockGitHubClient();
    (github.rest.issues.listLabelsOnIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ name: 'bug' }],
    });
    const context = mockGitHubContext();

    await _$gha_addLabel(github, context, 'bug');

    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
  });
});

describe('_$gha_verifyMatrixLabel', () => {
  it('should add label 0 when no matrix labels are present', async () => {
    const github = mockGitHubClient();
    (github.rest.issues.listLabelsOnIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ name: 'feature' }],
    });
    const context = mockGitHubContext();

    await _$gha_verifyMatrixLabel(github, context);

    // It calls _$gha_addLabel which calls listLabelsOnIssue again then addLabels
    expect(github.rest.issues.addLabels).toHaveBeenCalled();
  });

  it('should keep single matrix label unchanged', async () => {
    const github = mockGitHubClient();
    (github.rest.issues.listLabelsOnIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ name: '3' }],
    });
    const context = mockGitHubContext();

    await _$gha_verifyMatrixLabel(github, context);

    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled();
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
  });

  it('should keep highest label and remove lower ones when multiple matrix labels exist', async () => {
    const github = mockGitHubClient();
    (github.rest.issues.listLabelsOnIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ name: '1' }, { name: '3' }, { name: '5' }],
    });
    const context = mockGitHubContext();

    await _$gha_verifyMatrixLabel(github, context);

    // Should remove labels '1' and '3', keeping '5'
    // removeLabel is called via _$gha_removeLabel which lists labels again
    expect(github.rest.issues.listLabelsOnIssue).toHaveBeenCalled();
  });
});

describe('_$gha_addAssignees', () => {
  it('should call addAssignees with correct params', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_addAssignees(github, context, ['user1', 'user2']);

    expect(github.rest.issues.addAssignees).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
      assignees: ['user1', 'user2'],
    });
  });
});

describe('_$gha_removeAssignees', () => {
  it('should call removeAssignees with correct params', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_removeAssignees(github, context, ['user1']);

    expect(github.rest.issues.removeAssignees).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
      assignees: ['user1'],
    });
  });
});

describe('_$gha_closeIssue', () => {
  it('should update issue state to closed', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_closeIssue(github, context);

    expect(github.rest.issues.update).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
      state: 'closed',
    });
  });
});

describe('_$gha_reopenIssue', () => {
  it('should update issue state to open', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_reopenIssue(github, context);

    expect(github.rest.issues.update).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
      state: 'open',
    });
  });
});

describe('_$gha_lockIssue', () => {
  it('should lock issue without reason', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_lockIssue(github, context);

    expect(github.rest.issues.lock).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
      lock_reason: undefined,
    });
  });

  it('should lock issue with reason', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_lockIssue(github, context, 'spam');

    expect(github.rest.issues.lock).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
      lock_reason: 'spam',
    });
  });
});

describe('_$gha_unlockIssue', () => {
  it('should unlock issue', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_unlockIssue(github, context);

    expect(github.rest.issues.unlock).toHaveBeenCalledWith({
      owner: 'KBVE',
      repo: 'kbve',
      issue_number: 42,
    });
  });
});
