import { describe, it, expect } from 'vitest';
import {
	_$gha_failureIssueTitle,
	_$gha_classifyCIFailure,
	_$gha_parseFailureLog,
	_$gha_buildFailureIssueBody,
	_$gha_buildFailureComment,
	_$gha_buildResolveComment,
	_$gha_incrementFailureHistory,
	CI_FAILURE_PATTERNS,
	ci,
} from './ci-failure';

describe('ci namespace', () => {
	it('exposes the canonical API', () => {
		expect(ci.issueTitle('CI Main', 'build')).toBe(
			'[CI] CI Main / build — Failed',
		);
		expect(ci.parseFailureLog('').nxTargets).toBe('');
		expect(ci.classifyFailure('nothing')).toBeNull();
		expect(ci.failurePatterns).toBe(CI_FAILURE_PATTERNS);
	});

	it('deprecated _$gha_* aliases point to the same functions', () => {
		expect(_$gha_failureIssueTitle).toBe(ci.issueTitle);
		expect(_$gha_classifyCIFailure).toBe(ci.classifyFailure);
		expect(_$gha_parseFailureLog).toBe(ci.parseFailureLog);
		expect(_$gha_buildFailureIssueBody).toBe(ci.buildIssueBody);
		expect(_$gha_buildFailureComment).toBe(ci.buildComment);
		expect(_$gha_buildResolveComment).toBe(ci.buildResolveComment);
		expect(_$gha_incrementFailureHistory).toBe(ci.incrementHistory);
	});
});

describe('_$gha_failureIssueTitle', () => {
	it('formats the canonical tracker title', () => {
		expect(_$gha_failureIssueTitle('CI Main', 'build')).toBe(
			'[CI] CI Main / build — Failed',
		);
	});
});

describe('_$gha_classifyCIFailure', () => {
	it('classifies Forgejo LFS auth failures', () => {
		const log =
			'batch response: Authentication required: ... info/lfs/objects/batch';
		const reason = _$gha_classifyCIFailure(log);
		expect(reason).toContain('Forgejo LFS');
		expect(reason).toContain('FORGEJO_TOKEN');
	});

	it('classifies out-of-memory kills', () => {
		expect(
			_$gha_classifyCIFailure(
				'Killed signal 9 - JavaScript heap out of memory',
			),
		).toContain('memory');
	});

	it('returns null when no pattern matches', () => {
		expect(_$gha_classifyCIFailure('some unrelated output')).toBeNull();
	});

	it('matches the first pattern in registry order', () => {
		expect(CI_FAILURE_PATTERNS.length).toBeGreaterThan(0);
	});
});

describe('_$gha_parseFailureLog', () => {
	it('strips ANSI escapes and GH timestamp prefixes', () => {
		const raw = '2026-06-29T10:00:00.123Z [31mError: boom[0m';
		const { snippet } = _$gha_parseFailureLog(raw);
		expect(snippet).toContain('Error: boom');
		expect(snippet).not.toContain('');
		expect(snippet).not.toContain('2026-06-29');
	});

	it('drops cargo/npm progress noise and group markers', () => {
		const raw = [
			'##[group]Run build',
			'   Compiling foo v0.1.0',
			'Downloading bar',
			'real failure here',
			'##[endgroup]',
		].join('\n');
		const { snippet } = _$gha_parseFailureLog(raw);
		expect(snippet).toContain('real failure here');
		expect(snippet).not.toContain('Compiling foo');
		expect(snippet).not.toContain('##[group]');
	});

	it('windows around the last error marker', () => {
		const lines: string[] = [];
		for (let i = 0; i < 100; i++) lines.push(`line ${i}`);
		lines.push('error: the real one');
		lines.push('trailing 1');
		lines.push('trailing 2');
		const { snippet } = _$gha_parseFailureLog(lines.join('\n'));
		expect(snippet).toContain('error: the real one');
		expect(snippet).toContain('trailing 1');
		expect(snippet).not.toContain('line 10');
		expect(snippet).toContain('line 80');
	});

	it('falls back to the tail when no error marker present', () => {
		const lines: string[] = [];
		for (let i = 0; i < 50; i++) lines.push(`plain ${i}`);
		const { snippet } = _$gha_parseFailureLog(lines.join('\n'));
		expect(snippet).toContain('plain 49');
		expect(snippet).not.toContain('plain 10');
	});

	it('extracts failing Nx targets', () => {
		const raw = [
			'Failed tasks:',
			'  - devops:lint',
			'  - api:build',
			'',
			'other text',
		].join('\n');
		const { nxTargets } = _$gha_parseFailureLog(raw);
		expect(nxTargets).toBe('devops:lint api:build');
	});

	it('returns empty nxTargets when none present', () => {
		expect(_$gha_parseFailureLog('nothing here').nxTargets).toBe('');
	});
});

describe('_$gha_buildFailureIssueBody', () => {
	it('includes title, metadata, log and history table', () => {
		const body = _$gha_buildFailureIssueBody({
			title: '[CI] CI Main / build — Failed',
			workflowName: 'CI Main',
			jobName: 'build',
			failedStep: 'nx build',
			runId: '123',
			runUrl: 'https://example/run/123',
			ref: 'refs/heads/dev',
			eventName: 'push',
			timestamp: '2026-06-29T10:00:00Z',
			logSnippet: 'error: boom',
		});
		expect(body).toContain('[CI] CI Main / build — Failed');
		expect(body).toContain('**Failed step:** nx build');
		expect(body).toContain('**Consecutive failures:** 1');
		expect(body).toContain('error: boom');
		expect(body).toContain('[#123](https://example/run/123)');
		expect(body).toContain('| 1 |');
	});

	it('embeds version marker and reason when provided', () => {
		const body = _$gha_buildFailureIssueBody({
			title: 't',
			workflowName: 'w',
			jobName: 'j',
			failedStep: 's',
			runId: '1',
			runUrl: 'u',
			ref: 'r',
			eventName: 'push',
			timestamp: 'ts',
			logSnippet: 'l',
			version: '1.2.3',
			reason: 'token expired',
			nxTargets: 'devops:lint',
		});
		expect(body).toContain('<!-- ci-tracker:version=1.2.3 -->');
		expect(body).toContain('**Version:** 1.2.3');
		expect(body).toContain('**Likely cause:** token expired');
		expect(body).toContain('**Failed Nx targets:** `devops:lint`');
	});

	it('omits optional lines when absent', () => {
		const body = _$gha_buildFailureIssueBody({
			title: 't',
			workflowName: 'w',
			jobName: 'j',
			failedStep: 's',
			runId: '1',
			runUrl: 'u',
			ref: 'r',
			eventName: 'push',
			timestamp: 'ts',
			logSnippet: 'l',
		});
		expect(body).not.toContain('**Version:**');
		expect(body).not.toContain('**Likely cause:**');
		expect(body).not.toContain('**Failed Nx targets:**');
	});
});

describe('_$gha_buildFailureComment', () => {
	it('renders a failure comment with run and log', () => {
		const c = _$gha_buildFailureComment({
			failedStep: 'nx test',
			runId: '9',
			runUrl: 'u9',
			ref: 'refs/heads/dev',
			eventName: 'push',
			timestamp: 'ts',
			logSnippet: 'boom',
		});
		expect(c).toContain('## Failure — ts');
		expect(c).toContain('**Failed step:** nx test');
		expect(c).toContain('boom');
	});
});

describe('_$gha_buildResolveComment', () => {
	it('notes plain resolution', () => {
		const c = _$gha_buildResolveComment({
			runId: '5',
			runUrl: 'u5',
			ref: 'r',
			eventName: 'push',
			timestamp: 'ts',
		});
		expect(c).toContain('## Resolved — ts');
		expect(c).toContain('Auto-closing');
	});

	it('notes shipped version when provided', () => {
		const c = _$gha_buildResolveComment({
			runId: '5',
			runUrl: 'u5',
			ref: 'r',
			eventName: 'push',
			timestamp: 'ts',
			version: '2.0.0',
		});
		expect(c).toContain('shipped v2.0.0');
	});
});

describe('_$gha_incrementFailureHistory', () => {
	const base = _$gha_buildFailureIssueBody({
		title: '[CI] CI Main / build — Failed',
		workflowName: 'CI Main',
		jobName: 'build',
		failedStep: 'nx build',
		runId: '100',
		runUrl: 'https://example/run/100',
		ref: 'refs/heads/dev',
		eventName: 'push',
		timestamp: '2026-06-29T10:00:00Z',
		logSnippet: 'error: boom',
	});

	it('bumps the consecutive failure count', () => {
		const next = _$gha_incrementFailureHistory(base, {
			runId: '101',
			runUrl: 'https://example/run/101',
			ref: 'refs/heads/dev',
			eventName: 'push',
			timestamp: '2026-06-29T11:00:00Z',
		});
		expect(next).toContain('**Consecutive failures:** 2');
	});

	it('appends a new history table row', () => {
		const next = _$gha_incrementFailureHistory(base, {
			runId: '101',
			runUrl: 'https://example/run/101',
			ref: 'refs/heads/dev',
			eventName: 'push',
			timestamp: '2026-06-29T11:00:00Z',
		});
		expect(next).toContain('| 2 | 2026-06-29T11:00:00Z |');
		expect(next).toContain('[#101](https://example/run/101)');
		expect(next).toContain('| 1 |');
	});

	it('is idempotent on count formatting across multiple increments', () => {
		let body = base;
		for (let i = 0; i < 3; i++) {
			body = _$gha_incrementFailureHistory(body, {
				runId: `${200 + i}`,
				runUrl: `u${i}`,
				ref: 'r',
				eventName: 'push',
				timestamp: `t${i}`,
			});
		}
		expect(body).toContain('**Consecutive failures:** 4');
		expect(
			(body.match(/\*\*Consecutive failures:\*\*/g) || []).length,
		).toBe(1);
	});
});

describe('parseFailureLog snippet cap (v0.0.21)', () => {
	it('clamps an oversized snippet and inserts a snip marker', () => {
		const huge = Array.from(
			{ length: 5000 },
			(_, i) => `error line ${i}`,
		).join('\n');
		const { snippet } = ci.parseFailureLog(huge, {
			maxSnippetChars: 500,
			contextBefore: 100,
			contextAfter: 20,
		});
		expect(snippet.length).toBeLessThanOrEqual(600);
		expect(snippet).toContain('[snipped');
	});

	it('leaves a small snippet untouched (no marker)', () => {
		const { snippet } = ci.parseFailureLog('error: boom\ndetail line');
		expect(snippet).not.toContain('[snipped');
	});
});

describe('incrementHistory row cap (v0.0.21)', () => {
	function seedBody(rows: number): string {
		const meta = {
			title: 't',
			workflowName: 'wf',
			jobName: 'job',
			failedStep: 'step',
			runId: '1',
			runUrl: 'u',
			ref: 'r',
			eventName: 'push',
			timestamp: 'T',
			logSnippet: 'x',
		};
		let body = ci.buildIssueBody(meta);
		for (let i = 2; i <= rows; i++) {
			body = ci.incrementHistory(body, {
				runId: String(i),
				runUrl: 'u',
				ref: 'r',
				eventName: 'push',
				timestamp: `T${i}`,
			});
		}
		return body;
	}

	it('keeps at most maxRows data rows but still increments the counter', () => {
		const body = seedBody(25);
		const capped = ci.incrementHistory(
			body,
			{
				runId: '26',
				runUrl: 'u',
				ref: 'r',
				eventName: 'push',
				timestamp: 'T26',
			},
			{ maxRows: 5 },
		);
		const dataRows = capped
			.split('\n')
			.filter((l) => /^\|\s*\d+\s*\|/.test(l));
		expect(dataRows.length).toBe(5);
		expect(capped).toContain('**Consecutive failures:** 26');
		expect(capped).toContain('| 26 |');
		expect(capped).not.toContain('| 1 |');
	});
});

describe('classifyAll + new patterns (v0.0.21)', () => {
	it('returns all matching reasons for a multi-cause log', () => {
		const log =
			'getaddrinfo ENOTFOUND registry.npmjs.org\nENOSPC no space left on device';
		const reasons = ci.classifyAll(log);
		expect(reasons.length).toBeGreaterThanOrEqual(2);
	});

	it('classifies an LFS smudge 404', () => {
		expect(ci.classifyFailure('smudge filter lfs failed')).not.toBeNull();
	});

	it('classifies a frozen-lockfile mismatch', () => {
		expect(
			ci.classifyFailure('ERR_PNPM_OUTDATED_LOCKFILE frozen-lockfile'),
		).not.toBeNull();
	});

	it('returns empty array when nothing matches', () => {
		expect(ci.classifyAll('everything is fine')).toEqual([]);
	});
});
