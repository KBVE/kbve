import { describe, it, expect } from 'vitest';
import { gha } from './gha';
import { ci } from './ci-failure';

describe('gha aggregator (v0.0.22)', () => {
	it('groups every domain', () => {
		for (const g of [
			'ci',
			'issues',
			'actions',
			'pulls',
			'docker',
			'context',
		]) {
			expect(typeof (gha as Record<string, unknown>)[g]).toBe('object');
		}
		expect(typeof gha.withRetry).toBe('function');
	});
	it('gha.ci is the same object as the top-level ci', () => {
		expect(gha.ci).toBe(ci);
	});
	it('representative members are functions', () => {
		expect(typeof gha.issues.createComment).toBe('function');
		expect(typeof gha.pulls.createOrUpdatePR).toBe('function');
		expect(typeof gha.actions.findActionInTitle).toBe('function');
		expect(typeof gha.docker.runContainer).toBe('function');
		expect(typeof gha.context.extractIssue).toBe('function');
		expect(typeof gha.ci.parseFailureLog).toBe('function');
	});
});
