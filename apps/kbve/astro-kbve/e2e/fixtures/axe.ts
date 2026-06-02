import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const ALLOWED_RULES: string[] = [];

const ALLOWED_INCLUDE_PATTERNS: ReadonlyArray<RegExp> = [/starlight-/i];

export interface RunAxeOptions {
	include?: string;
	exclude?: string[];
	disableRules?: string[];
	allowSelectorPatterns?: ReadonlyArray<RegExp>;
}

export async function runAxe(
	page: Page,
	options: RunAxeOptions = {},
): Promise<void> {
	let builder = new AxeBuilder({ page }).withTags([
		'wcag2a',
		'wcag2aa',
		'wcag21a',
		'wcag21aa',
		'best-practice',
	]);

	if (options.include) builder = builder.include(options.include);
	for (const sel of options.exclude ?? []) builder = builder.exclude(sel);

	const disableRules = [...ALLOWED_RULES, ...(options.disableRules ?? [])];
	if (disableRules.length > 0) builder = builder.disableRules(disableRules);

	const allowPatterns = [
		...ALLOWED_INCLUDE_PATTERNS,
		...(options.allowSelectorPatterns ?? []),
	];

	const result = await builder.analyze();
	const blocking = result.violations.filter((v) => {
		if (v.impact !== 'serious' && v.impact !== 'critical') return false;
		const allEnvelopedByAllowList = v.nodes.every((node) =>
			node.target.some((sel) =>
				allowPatterns.some((re) => re.test(String(sel))),
			),
		);
		return !allEnvelopedByAllowList;
	});

	if (blocking.length > 0) {
		const summary = blocking
			.map((v) => {
				const targets = v.nodes
					.map((n) => n.target.join(' >> '))
					.slice(0, 5)
					.join('\n      ');
				return `  ${v.impact?.toUpperCase()} ${v.id} — ${v.help}\n    ${v.helpUrl}\n    nodes:\n      ${targets}`;
			})
			.join('\n');
		throw new Error(
			`axe: ${blocking.length} serious/critical accessibility violation(s):\n${summary}`,
		);
	}

	expect(blocking).toHaveLength(0);
}
