import { describe, it, expect } from 'vitest';
import {
	context,
	_$gha_extractIssueContext,
	_$gha_extractRepoContext,
} from './types';

describe('gha.context group (v0.0.22)', () => {
	it('members match aliases', () => {
		expect(context.extractIssue).toBe(_$gha_extractIssueContext);
		expect(context.extractRepo).toBe(_$gha_extractRepoContext);
	});
});
