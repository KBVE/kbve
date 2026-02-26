// Zero-dependency CI shim for commit categorization and PR formatting.
//
// SOURCE OF TRUTH: packages/npm/devops/src/lib/client/github/pulls.ts
// This file mirrors the pure functions in @kbve/devops:
//   - _$gha_categorizeApiCommits  → categorizeCommits
//   - _$gha_generatePRTitle       → generateTitle
//   - _$gha_formatDevBody         → formatDevToStagingBody
//   - _$gha_formatProductionBody  → formatStagingToMainBody
//
// This shim exists because the PR creation jobs don't install npm
// dependencies. When modifying categorization logic, update BOTH files.
// Categories match COMMIT_CATEGORY_LABELS in packages/npm/devops/src/types.ts

const CATEGORIES = {
	feat: 'Features',
	fix: 'Bug Fixes',
	docs: 'Documentation',
	ci: 'CI/CD',
	perf: 'Performance',
	build: 'Build',
	refactor: 'Refactoring',
	revert: 'Reverts',
	style: 'Style',
	test: 'Tests',
	sync: 'Sync',
	chore: 'Chores',
	merge: 'Merge Commits',
	other: 'Other Changes',
};

/**
 * Categorize an array of commits by conventional commit type.
 * Accepts commits from the GitHub API (repos.compareCommits).
 *
 * @param {Array<{message: string, sha: string}>} commits
 * @returns {{ categories: Record<string, string[]>, prRefs: Set<string> }}
 */
export function categorizeCommits(commits) {
	const categories = Object.fromEntries(
		Object.keys(CATEGORIES).map((k) => [k, []])
	);
	const prRefs = new Set();

	for (const { message, sha } of commits) {
		const firstLine = message.split('\n')[0];
		const short = sha.substring(0, 7);

		const prMatch = message.match(/#(\d+)/);
		if (prMatch) prRefs.add(prMatch[1]);

		const commitLine = `- ${firstLine} (\`${short}\`)`;
		const typeMatch = firstLine.match(/^(\w+)(\(.+\))?:/i);
		const type = typeMatch ? typeMatch[1].toLowerCase() : null;

		if (firstLine.match(/^Merge pull request/i)) {
			categories.merge.push(commitLine);
		} else if (type && Object.hasOwn(categories, type)) {
			categories[type].push(commitLine);
		} else {
			categories.other.push(commitLine);
		}
	}

	return { categories, prRefs };
}

/**
 * Generate a descriptive PR title summarizing what changed.
 * e.g. "Release: 3 features, 1 fix, 2 CI → Staging"
 *
 * @param {Record<string, string[]>} categories
 * @param {string} target - Target branch display name (e.g. "Staging", "Main")
 * @returns {string}
 */
export function generateTitle(categories, target) {
	const TITLE_LABELS = {
		feat: 'feature',
		fix: 'fix',
		docs: 'doc',
		ci: 'CI',
		perf: 'perf',
		build: 'build',
		refactor: 'refactor',
		test: 'test',
		chore: 'chore',
	};

	const parts = [];
	for (const [key, singular] of Object.entries(TITLE_LABELS)) {
		const count = categories[key]?.length || 0;
		if (count > 0) {
			const plural = count > 1 && !['CI'].includes(singular);
			parts.push(`${count} ${singular}${plural ? (singular.endsWith('x') ? 'es' : 's') : ''}`);
		}
	}

	if (parts.length === 0) {
		const total = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
		const s = total === 1 ? '' : 's';
		return `Release: ${total} commit${s} → ${target}`;
	}

	return `Release: ${parts.join(', ')} → ${target}`;
}

/**
 * Format a PR body for dev→staging promotions.
 *
 * @param {Record<string, string[]>} categories
 * @param {number} totalCommits
 * @returns {string}
 */
export function formatDevToStagingBody(categories, totalCommits) {
	const s = totalCommits === 1 ? '' : 's';
	let body = `## Release: Dev → Staging\n\n`;
	body += `**${totalCommits} atomic commit${s}** ready for staging\n\n`;

	for (const [key, label] of Object.entries(CATEGORIES)) {
		if (categories[key]?.length > 0) {
			body += `### ${label}\n${categories[key].join('\n')}\n\n`;
		}
	}

	body += `---\n*This PR is automatically maintained by CI*`;
	return body;
}

/**
 * Format a PR body for staging→main production releases.
 *
 * @param {Record<string, string[]>} categories
 * @param {number} totalCommits
 * @param {number} mergedPRCount
 * @returns {string}
 */
export function formatStagingToMainBody(categories, totalCommits, mergedPRCount) {
	const s = totalCommits === 1 ? '' : 's';
	let body = `## Production Release from Staging\n\n`;
	body += `### Summary\n`;
	body += `- **Total Commits:** ${totalCommits}\n`;
	body += `- **Merged PRs:** ${mergedPRCount}\n`;
	body += `- **Target Branch:** main\n`;
	body += `- **Merge Strategy:** Merge Commit\n\n`;

	body += `### Pre-merge Checklist\n`;
	body += `- [ ] All tests passing\n`;
	body += `- [ ] No merge conflicts\n`;
	body += `- [ ] Changes reviewed and approved\n`;
	body += `- [ ] Version bumped (if applicable)\n`;
	body += `- [ ] Documentation updated\n\n`;

	body += `### Changes by Category\n\n`;

	for (const [key, label] of Object.entries(CATEGORIES)) {
		if (categories[key]?.length > 0) {
			body += `#### ${label}\n${categories[key].join('\n')}\n\n`;
		}
	}

	body += `### Important Notes\n`;
	body += `- This PR should be **MERGE COMMITTED** to maintain history\n`;
	body += `- Ensure all checks pass before merging\n`;
	body += `- After merge, staging will be automatically synced with main\n\n`;

	body += `---\n`;
	body += `*This PR is automatically maintained by CI • Last updated: ${new Date().toISOString()}*`;
	return body;
}

/**
 * Format a clean merge commit body (no markdown, no checklists).
 * Used as the `commitBody` when enabling auto-merge via the GitHub GraphQL API,
 * so that `git log` shows a useful plain-text changelog instead of PR UI elements.
 *
 * @param {Record<string, string[]>} categories
 * @param {number} totalCommits
 * @param {string} target - Target branch display name (e.g. "staging", "main")
 * @returns {string}
 */
export function formatMergeCommitBody(categories, totalCommits, target) {
	const s = totalCommits === 1 ? '' : 's';
	let body = `${totalCommits} commit${s} promoted to ${target}\n\n`;

	for (const [key, label] of Object.entries(CATEGORIES)) {
		if (categories[key]?.length > 0) {
			body += `${label}:\n${categories[key].join('\n')}\n\n`;
		}
	}

	return body.trim();
}
