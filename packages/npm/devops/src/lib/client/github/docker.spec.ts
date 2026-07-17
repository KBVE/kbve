import { GitHubClient, GitHubContext } from './types';

const mockExecAsync = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
	execFile: vi.fn(),
}));

vi.mock('util', () => ({
	promisify: () => mockExecAsync,
}));

// Import after mocks are set up
const { docker } =
	await import('./docker');

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

describe('docker.runContainer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should throw on invalid port', async () => {
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await expect(
			docker.runContainer(
				github,
				context,
				0,
				'mycontainer',
				'nginx:latest',
			),
		).rejects.toThrow('Invalid port number');
	});

	it('should throw on restricted port', async () => {
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await expect(
			docker.runContainer(
				github,
				context,
				443,
				'mycontainer',
				'nginx:latest',
			),
		).rejects.toThrow('Port 443 is restricted');
	});

	it('should throw on empty container name', async () => {
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await expect(
			docker.runContainer(github, context, 8080, '', 'nginx:latest'),
		).rejects.toThrow('Invalid container name');
	});

	it('should throw on empty image name', async () => {
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await expect(
			docker.runContainer(github, context, 8080, 'mycontainer', ''),
		).rejects.toThrow('Invalid container image name');
	});

	it('should succeed with valid inputs when exec succeeds', async () => {
		mockExecAsync.mockResolvedValue({ stdout: 'container-id-123' });
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await docker.runContainer(
			github,
			context,
			8080,
			'mycontainer',
			'nginx:latest',
		);

		expect(github.rest.issues.createComment).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining('started successfully'),
			}),
		);
		expect(mockExecAsync).toHaveBeenCalledWith('docker', [
			'run',
			'-d',
			'-p',
			'8080:8080',
			'--name',
			'mycontainer',
			'nginx:latest',
		]);
	});

	it('should report error and throw when exec fails', async () => {
		mockExecAsync.mockRejectedValue(new Error('Docker not found'));
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await expect(
			docker.runContainer(
				github,
				context,
				8080,
				'mycontainer',
				'nginx:latest',
			),
		).rejects.toThrow('Docker not found');

		expect(github.rest.issues.createComment).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining('Error running Docker container'),
			}),
		);
	});
});

describe('docker.stopContainer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should throw on invalid container name', async () => {
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await expect(
			docker.stopContainer(github, context, ''),
		).rejects.toThrow('Invalid container name');
	});

	it('should succeed when both stop and remove succeed', async () => {
		mockExecAsync.mockResolvedValue({ stdout: 'ok' });
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await docker.stopContainer(github, context, 'mycontainer');

		expect(github.rest.issues.createComment).toHaveBeenCalledTimes(2);
		expect(mockExecAsync).toHaveBeenCalledWith('docker', [
			'stop',
			'mycontainer',
		]);
		expect(mockExecAsync).toHaveBeenCalledWith('docker', [
			'rm',
			'mycontainer',
		]);
	});

	it('should throw when stop command fails', async () => {
		mockExecAsync.mockRejectedValue(new Error('Container not running'));
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await expect(
			docker.stopContainer(github, context, 'mycontainer'),
		).rejects.toThrow('Container not running');
	});

	it('should throw when stop succeeds but remove fails', async () => {
		mockExecAsync
			.mockResolvedValueOnce({ stdout: 'stopped' })
			.mockRejectedValueOnce(new Error('Remove failed'));
		const github = mockGitHubClient();
		const context = mockGitHubContext();

		await expect(
			docker.stopContainer(github, context, 'mycontainer'),
		).rejects.toThrow('Remove failed');
	});
});

describe('gha.docker group (v0.0.22)', () => {
	it('exposes all 2 members as functions', () => {
		for (const n of ['runContainer', 'stopContainer'])
			expect(typeof (docker as Record<string, unknown>)[n]).toBe(
				'function',
			);
	});
});
