import { GitHubClient, GitHubContext } from './types';

const mockExecAsync = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

// Import after mocks are set up
const { _$gha_runDockerContainer, _$gha_stopDockerContainer } = await import('./docker');

function mockGitHubContext(): GitHubContext {
  return {
    repo: { owner: 'KBVE', repo: 'kbve' },
    issue: { number: 42 },
    ref: 'refs/heads/main',
    payload: {},
    job: 'test-job',
  };
}

function mockGitHubClient(): GitHubClient {
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
  };
}

describe('_$gha_runDockerContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw on invalid port', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await expect(
      _$gha_runDockerContainer(github, context, 0, 'mycontainer', 'nginx:latest'),
    ).rejects.toThrow('Invalid port number');
  });

  it('should throw on restricted port', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await expect(
      _$gha_runDockerContainer(github, context, 443, 'mycontainer', 'nginx:latest'),
    ).rejects.toThrow('Port 443 is restricted');
  });

  it('should throw on empty container name', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await expect(
      _$gha_runDockerContainer(github, context, 8080, '', 'nginx:latest'),
    ).rejects.toThrow('Invalid container name');
  });

  it('should throw on empty image name', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await expect(
      _$gha_runDockerContainer(github, context, 8080, 'mycontainer', ''),
    ).rejects.toThrow('Invalid container image name');
  });

  it('should succeed with valid inputs when exec succeeds', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'container-id-123' });
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_runDockerContainer(github, context, 8080, 'mycontainer', 'nginx:latest');

    expect(github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('started successfully'),
      }),
    );
  });

  it('should report error and throw when exec fails', async () => {
    mockExecAsync.mockRejectedValue(new Error('Docker not found'));
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await expect(
      _$gha_runDockerContainer(github, context, 8080, 'mycontainer', 'nginx:latest'),
    ).rejects.toThrow('Docker not found');

    expect(github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Error running Docker container'),
      }),
    );
  });
});

describe('_$gha_stopDockerContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw on invalid container name', async () => {
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await expect(
      _$gha_stopDockerContainer(github, context, ''),
    ).rejects.toThrow('Invalid container name');
  });

  it('should succeed when both stop and remove succeed', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'ok' });
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await _$gha_stopDockerContainer(github, context, 'mycontainer');

    // Should have been called for both stop and remove success comments
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(2);
  });

  it('should throw when stop command fails', async () => {
    mockExecAsync.mockRejectedValue(new Error('Container not running'));
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await expect(
      _$gha_stopDockerContainer(github, context, 'mycontainer'),
    ).rejects.toThrow('Container not running');
  });

  it('should throw when stop succeeds but remove fails', async () => {
    mockExecAsync
      .mockResolvedValueOnce({ stdout: 'stopped' })
      .mockRejectedValueOnce(new Error('Remove failed'));
    const github = mockGitHubClient();
    const context = mockGitHubContext();

    await expect(
      _$gha_stopDockerContainer(github, context, 'mycontainer'),
    ).rejects.toThrow('Remove failed');
  });
});
