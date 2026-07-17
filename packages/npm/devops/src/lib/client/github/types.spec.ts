import { describe, it, expect } from 'vitest';
import { context } from './types';
import type { GitHubContext } from './types';

function mockContext(): GitHubContext {
	return {
		repo: { owner: 'KBVE', repo: 'kbve' },
		issue: { number: 42 },
		job: 'build',
	} as GitHubContext;
}

describe('gha.context group', () => {
	it('extractIssue returns owner, repo and issue_number', () => {
		expect(context.extractIssue(mockContext())).toEqual({
			owner: 'KBVE',
			repo: 'kbve',
			issue_number: 42,
		});
	});

	it('extractRepo returns owner and repo', () => {
		expect(context.extractRepo(mockContext())).toEqual({
			owner: 'KBVE',
			repo: 'kbve',
		});
	});
});
