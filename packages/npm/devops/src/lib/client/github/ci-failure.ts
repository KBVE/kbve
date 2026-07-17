export interface CIFailurePattern {
	test: RegExp;
	reason: string;
}

export const CI_FAILURE_PATTERNS: CIFailurePattern[] = [
	{
		test: /Forgejo LFS auth failed|Authentication required|Authorization error|info\/lfs\/objects\/batch/i,
		reason: '🔑 Forgejo LFS authentication failed — FORGEJO_TOKEN is likely invalid or expired. Rotate the token via kube (forgejo namespace: forgejo-deploy-keys / forgejo-admin) and re-sync the FORGEJO_TOKEN GitHub secret.',
	},
	{
		test: /JavaScript heap out of memory|Killed signal 9|out of memory|oom-kill/i,
		reason: '🧠 Job ran out of memory — the runner was OOM-killed. Reduce parallelism, raise the runner size, or cap Node/Nx memory.',
	},
	{
		test: /The job running on runner .* has exceeded the maximum execution time|timed out after|cancel.*timeout/i,
		reason: '⏱️ Job exceeded its timeout — a step hung or ran long. Inspect the slowest step and raise timeout-minutes or fix the hang.',
	},
	{
		test: /ETIMEDOUT|ENOTFOUND|getaddrinfo|ECONNRESET|connection reset|network is unreachable/i,
		reason: '🌐 Network/DNS failure reaching a remote host — a registry or Git endpoint was unreachable. Usually transient; re-run, and check runner egress if it persists.',
	},
	{
		test: /ERR_PNPM_[A-Z_]*LOCKFILE|frozen-lockfile|lockfile.*(mismatch|outdated)|npm ci.*can only install/i,
		reason: '🔒 Lockfile out of sync — the frozen lockfile does not match package manifests. Run the package manager install locally, commit the updated lockfile.',
	},
	{
		test: /ENOSPC|no space left on device|disk quota exceeded/i,
		reason: '💾 Runner ran out of disk — no space left on device. Prune caches/artifacts or use a larger runner.',
	},
	{
		test: /smudge filter lfs failed|error downloading object.*\(404\)|batch response:.*404/i,
		reason: '📦 Git LFS smudge 404 — an LFS object could not be fetched. Set GIT_LFS_SKIP_SMUDGE=1 for the checkout or verify the object exists on the LFS server.',
	},
	{
		test: /fatal: could not read Username|Permission denied \(publickey\)|remote: (Invalid username or password|Unauthorized)/i,
		reason: '🔐 Git authentication failed — credentials for the remote were rejected. Rotate/verify the deploy token or SSH key.',
	},
];

const NOISE_PREFIXES =
	/^\s*(Checking|Compiling|Downloaded|Downloading|Finished|Fresh|Updating|Locking|Building|Installing|Adding|Removing) /;
const GROUP_MARKER = /^##\[(group|endgroup)\]/;
const ANSI = new RegExp(
	String.fromCharCode(27) + '\\[[0-9;?]*[ -/]*[@-~]',
	'g',
);
const GH_TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z\s?/;
const ERROR_MARKER =
	/error|failed tasks|process completed with exit code|panic|✖|assertion/i;

const DEFAULT_CONTEXT_BEFORE = 30;
const DEFAULT_CONTEXT_AFTER = 4;
const DEFAULT_MAX_SNIPPET_CHARS = 12000;
const NX_TARGET_SCAN_LINES = 20;
const GITHUB_MAX_BODY = 65536;

export interface ParseFailureLogOptions {
	maxSnippetChars?: number;
	contextBefore?: number;
	contextAfter?: number;
}

export interface ParsedFailureLog {
	snippet: string;
	nxTargets: string;
}

export interface FailureIssueMeta {
	title: string;
	workflowName: string;
	jobName: string;
	failedStep: string;
	runId: string;
	runUrl: string;
	ref: string;
	eventName: string;
	timestamp: string;
	logSnippet: string;
	version?: string;
	reason?: string;
	nxTargets?: string;
}

export interface FailureEventMeta {
	failedStep: string;
	runId: string;
	runUrl: string;
	ref: string;
	eventName: string;
	timestamp: string;
	logSnippet: string;
	version?: string;
	reason?: string;
	nxTargets?: string;
}

export interface ResolveMeta {
	runId: string;
	runUrl: string;
	ref: string;
	eventName: string;
	timestamp: string;
	version?: string;
}

export interface HistoryEntry {
	runId: string;
	runUrl: string;
	ref: string;
	eventName: string;
	timestamp: string;
}

export interface IncrementHistoryOptions {
	maxRows?: number;
}

const DEFAULT_MAX_HISTORY_ROWS = 20;

function issueTitle(workflowName: string, jobName: string): string {
	return `[CI] ${workflowName} / ${jobName} — Failed`;
}

function classifyFailure(log: string): string | null {
	for (const pattern of CI_FAILURE_PATTERNS) {
		if (pattern.test.test(log)) {
			return pattern.reason;
		}
	}
	return null;
}

function classifyAll(log: string): string[] {
	const reasons: string[] = [];
	for (const pattern of CI_FAILURE_PATTERNS) {
		if (pattern.test.test(log)) {
			reasons.push(pattern.reason);
		}
	}
	return reasons;
}

function clampSnippet(snippet: string, max: number): string {
	if (snippet.length <= max) {
		return snippet;
	}
	const head = Math.floor(max / 2);
	const tail = max - head;
	const removed = snippet.length - max;
	return (
		snippet.slice(0, head) +
		`\n… [snipped ${removed} chars] …\n` +
		snippet.slice(snippet.length - tail)
	);
}

function extractNxTargets(lines: string[]): string {
	const idx = lines.findIndex((l) => /Failed tasks:/i.test(l));
	if (idx < 0) {
		return '';
	}
	const targets: string[] = [];
	for (
		let i = idx + 1;
		i < Math.min(lines.length, idx + 1 + NX_TARGET_SCAN_LINES);
		i++
	) {
		const match = lines[i].match(/^\s*-\s+(\S+:\S+)/);
		if (match) {
			targets.push(match[1]);
		}
	}
	return targets.join(' ');
}

function parseFailureLog(
	rawLog: string,
	opts: ParseFailureLogOptions = {},
): ParsedFailureLog {
	const maxSnippetChars = opts.maxSnippetChars ?? DEFAULT_MAX_SNIPPET_CHARS;
	const contextBefore = opts.contextBefore ?? DEFAULT_CONTEXT_BEFORE;
	const contextAfter = opts.contextAfter ?? DEFAULT_CONTEXT_AFTER;

	if (!rawLog) {
		return { snippet: '', nxTargets: '' };
	}

	const clean = rawLog
		.split('\n')
		.map((line) => line.replace(ANSI, '').replace(GH_TIMESTAMP, ''))
		.filter(
			(line) => !NOISE_PREFIXES.test(line) && !GROUP_MARKER.test(line),
		);

	let lastErr = -1;
	for (let i = 0; i < clean.length; i++) {
		if (ERROR_MARKER.test(clean[i])) {
			lastErr = i;
		}
	}

	let snippet: string;
	if (lastErr >= 0) {
		const start = Math.max(0, lastErr - contextBefore);
		const end = Math.min(clean.length, lastErr + contextAfter);
		snippet = clean.slice(start, end).join('\n');
	} else {
		snippet = clean
			.slice(Math.max(0, clean.length - contextBefore))
			.join('\n');
	}

	snippet = clampSnippet(snippet, maxSnippetChars);

	return { snippet, nxTargets: extractNxTargets(clean) };
}

function buildIssueBody(meta: FailureIssueMeta): string {
	const lines: string[] = [];
	lines.push(`## ${meta.title}`);
	if (meta.version) {
		lines.push(`<!-- ci-tracker:version=${meta.version} -->`);
	}
	lines.push('');
	lines.push(`**Workflow:** ${meta.workflowName}`);
	lines.push(`**Job:** ${meta.jobName}`);
	if (meta.version) {
		lines.push(`**Version:** ${meta.version}`);
	}
	lines.push(`**Failed step:** ${meta.failedStep}`);
	if (meta.nxTargets) {
		lines.push(`**Failed Nx targets:** \`${meta.nxTargets}\``);
	}
	if (meta.reason) {
		lines.push(`**Likely cause:** ${meta.reason}`);
	}
	lines.push(`**Status:** Failing since ${meta.timestamp}`);
	lines.push(`**Consecutive failures:** 1`);
	lines.push('');
	lines.push('### Latest Failure');
	lines.push('');
	lines.push(`- **Run:** [#${meta.runId}](${meta.runUrl})`);
	lines.push(`- **Trigger:** ${meta.eventName}`);
	lines.push(`- **Ref:** ${meta.ref}`);
	lines.push('');
	lines.push('### Error Summary');
	lines.push('');
	lines.push('```');
	lines.push(meta.logSnippet);
	lines.push('```');
	lines.push('');
	lines.push('### Failure History');
	lines.push('');
	lines.push('| # | Date | Run | Ref | Trigger |');
	lines.push('|---|------|-----|-----|---------|');
	lines.push(
		`| 1 | ${meta.timestamp} | [#${meta.runId}](${meta.runUrl}) | ${meta.ref} | ${meta.eventName} |`,
	);
	lines.push('');
	lines.push('---');
	lines.push('*Auto-generated by ci-failure-tracker*');
	const body = lines.join('\n');
	if (body.length <= GITHUB_MAX_BODY) {
		return body;
	}
	const marker =
		'\n\n> ⚠️ Body truncated to fit the GitHub 65536-char limit.\n';
	return body.slice(0, GITHUB_MAX_BODY - marker.length) + marker;
}

function buildComment(meta: FailureEventMeta): string {
	const lines: string[] = [];
	lines.push(`## Failure — ${meta.timestamp}`);
	lines.push('');
	lines.push(`- **Run:** [#${meta.runId}](${meta.runUrl})`);
	lines.push(`- **Failed step:** ${meta.failedStep}`);
	if (meta.nxTargets) {
		lines.push(`- **Failed Nx targets:** \`${meta.nxTargets}\``);
	}
	if (meta.reason) {
		lines.push(`- **Likely cause:** ${meta.reason}`);
	}
	if (meta.version) {
		lines.push(`- **Version:** ${meta.version}`);
	}
	lines.push(`- **Ref:** ${meta.ref}`);
	lines.push(`- **Trigger:** ${meta.eventName}`);
	lines.push('');
	lines.push('```');
	lines.push(meta.logSnippet);
	lines.push('```');
	return lines.join('\n');
}

function buildResolveComment(meta: ResolveMeta): string {
	const heading = meta.version
		? `## Resolved — shipped v${meta.version} — ${meta.timestamp}`
		: `## Resolved — ${meta.timestamp}`;
	const lines: string[] = [];
	lines.push(heading);
	lines.push('');
	lines.push(`- **Run:** [#${meta.runId}](${meta.runUrl})`);
	lines.push(`- **Ref:** ${meta.ref}`);
	lines.push(`- **Trigger:** ${meta.eventName}`);
	lines.push('');
	lines.push('Auto-closing this issue.');
	return lines.join('\n');
}

function incrementHistory(
	oldBody: string,
	entry: HistoryEntry,
	opts: IncrementHistoryOptions = {},
): string {
	const maxRows = opts.maxRows ?? DEFAULT_MAX_HISTORY_ROWS;
	const countRe = /(\*\*Consecutive failures:\*\* )(\d+)/;
	const match = oldBody.match(countRe);
	const count = match ? parseInt(match[2], 10) + 1 : 1;

	const body = match ? oldBody.replace(countRe, `$1${count}`) : oldBody;

	const row = `| ${count} | ${entry.timestamp} | [#${entry.runId}](${entry.runUrl}) | ${entry.ref} | ${entry.eventName} |`;

	const lines = body.split('\n');
	let lastRow = -1;
	for (let i = 0; i < lines.length; i++) {
		if (/^\|\s*\d+\s*\|/.test(lines[i])) {
			lastRow = i;
		}
	}
	if (lastRow >= 0) {
		lines.splice(lastRow + 1, 0, row);
	}

	const dataRowIdx: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (/^\|\s*\d+\s*\|/.test(lines[i])) {
			dataRowIdx.push(i);
		}
	}
	if (dataRowIdx.length > maxRows) {
		const drop = new Set(dataRowIdx.slice(0, dataRowIdx.length - maxRows));
		return lines.filter((_, i) => !drop.has(i)).join('\n');
	}

	return lines.join('\n');
}

export const ci = {
	failurePatterns: CI_FAILURE_PATTERNS,
	issueTitle,
	classifyFailure,
	classifyAll,
	parseFailureLog,
	buildIssueBody,
	buildComment,
	buildResolveComment,
	incrementHistory,
};
