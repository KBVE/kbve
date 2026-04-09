/**
 * Migrate OSRS override files to v2 data-driven format
 *
 * For each override file with markdown body content:
 * 1. Parse existing frontmatter + body
 * 2. Extract markdown sections into frontmatter fields
 * 3. Tag with mdx_version: 2, mdx_updated: today
 * 4. Write back with empty body
 *
 * Run: node scripts/migrate-overrides-v2.mjs [--dry-run] [--limit N]
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const OVERRIDE_DIR = './data/osrs-overrides';
const TODAY = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

/**
 * Parse an override MDX file into frontmatter object + body string
 */
function parseOverride(content) {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { frontmatter: {}, body: content.trim() };

	try {
		const frontmatter = parseYaml(match[1]) || {};
		const body = match[2].trim();
		return { frontmatter, body };
	} catch {
		return { frontmatter: {}, body: content.trim() };
	}
}

/**
 * Split markdown body into sections by ## headings
 * Returns array of { heading, content }
 */
function splitSections(body) {
	if (!body) return [];

	const sections = [];
	const lines = body.split('\n');
	let currentHeading = null;
	let currentLines = [];

	for (const line of lines) {
		const headingMatch = line.match(/^## (.+)$/);
		if (headingMatch) {
			if (currentHeading !== null) {
				sections.push({
					heading: currentHeading,
					content: currentLines.join('\n').trim(),
				});
			}
			currentHeading = headingMatch[1].trim();
			currentLines = [];
		} else {
			currentLines.push(line);
		}
	}

	if (currentHeading !== null) {
		sections.push({
			heading: currentHeading,
			content: currentLines.join('\n').trim(),
		});
	}

	return sections;
}

/**
 * Extract market strategy from a markdown section
 * Parses ordered lists as steps, code blocks as formulas, bullet lists as notes
 */
function parseMarketStrategy(sections) {
	const strategySections = sections.filter((s) =>
		/market|flip|strategy|processing/i.test(s.heading),
	);
	if (strategySections.length === 0) return null;

	const strategy = {};
	const allContent = strategySections.map((s) => s.content).join('\n\n');

	// Extract title from bold text or heading
	const titleMatch = allContent.match(/\*\*([^*]+(?:Processing|Strategy|Notes|Chain)[^*]*)\*\*/i);
	if (titleMatch) {
		strategy.title = titleMatch[1].trim().replace(/:$/, '');
	}

	// Extract ordered steps
	const steps = [];
	const stepRegex = /^\d+\.\s+(.+)$/gm;
	let stepMatch;
	let order = 1;
	while ((stepMatch = stepRegex.exec(allContent)) !== null) {
		const action = stepMatch[1]
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip links
			.trim();
		steps.push({ order: order++, action });
	}
	if (steps.length > 0) strategy.steps = steps;

	// Extract formulas (backtick code)
	const formulas = [];
	const formulaRegex = /`([^`]+)`/g;
	let formulaMatch;
	while ((formulaMatch = formulaRegex.exec(allContent)) !== null) {
		const f = formulaMatch[1].trim();
		if (f.includes('=') || f.includes('-') || f.includes('+')) {
			formulas.push(f);
		}
	}
	if (formulas.length > 0) strategy.profit_formulas = formulas;

	// Extract notes (bullet points not already captured)
	const notes = [];
	const bulletRegex = /^[-*]\s+(.+)$/gm;
	let bulletMatch;
	while ((bulletMatch = bulletRegex.exec(allContent)) !== null) {
		const note = bulletMatch[1]
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/`[^`]+`/g, '')
			.trim();
		if (note && !formulas.some((f) => note.includes(f))) {
			notes.push(note);
		}
	}
	if (notes.length > 0) strategy.notes = notes;

	return Object.keys(strategy).length > 0 ? strategy : null;
}

/**
 * Extract trading tips from sections
 */
function parseTradingTips(sections) {
	const tipSections = sections.filter((s) =>
		/trading tip|tip/i.test(s.heading),
	);
	if (tipSections.length === 0) return null;

	const tips = [];
	for (const section of tipSections) {
		const bulletRegex = /^[-*]\s+(.+)$/gm;
		let match;
		while ((match = bulletRegex.exec(section.content)) !== null) {
			tips.push(
				match[1]
					.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
					.trim(),
			);
		}
	}

	return tips.length > 0 ? tips : null;
}

/**
 * Build about text from remaining non-structured sections
 */
function buildAboutText(sections) {
	const skipHeadings =
		/^(market|flip|strategy|processing|trading tip|tip|item detail|fletching|crafting|smithing|herblore|cooking|equipment|combat stat|obtaining|related item|prayer|drop|recipe)/i;

	const aboutSections = sections.filter(
		(s) => !skipHeadings.test(s.heading),
	);

	if (aboutSections.length === 0) return null;

	const text = aboutSections
		.map((s) => {
			// Strip markdown links, keep text
			return s.content
				.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
				.replace(/\*\*([^*]+)\*\*/g, '$1')
				.trim();
		})
		.filter((t) => t.length > 0)
		.join('\n\n');

	return text || null;
}

/**
 * Migrate a single override file to v2
 */
async function migrateFile(filename) {
	const filepath = join(OVERRIDE_DIR, filename);
	const content = await readFile(filepath, 'utf-8');
	const { frontmatter, body } = parseOverride(content);

	// Skip already migrated
	if (frontmatter.mdx_version >= 2) {
		return { status: 'skipped', reason: 'already v2' };
	}

	// Skip files with no body content (frontmatter-only)
	if (!body) {
		// Still tag as v2 since there's nothing to migrate
		frontmatter.mdx_version = 2;
		frontmatter.mdx_updated = TODAY;

		const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
		const output = `---\n${yaml.trim()}\n---\n`;

		if (!dryRun) await writeFile(filepath, output, 'utf-8');
		return { status: 'tagged', reason: 'no body, tagged v2' };
	}

	// Parse markdown sections
	const sections = splitSections(body);
	if (sections.length === 0) {
		frontmatter.mdx_version = 2;
		frontmatter.mdx_updated = TODAY;

		const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
		const output = `---\n${yaml.trim()}\n---\n`;

		if (!dryRun) await writeFile(filepath, output, 'utf-8');
		return { status: 'tagged', reason: 'no sections, tagged v2' };
	}

	// Extract structured data from body
	const marketStrategy = parseMarketStrategy(sections);
	const tradingTips = parseTradingTips(sections);
	const aboutText = buildAboutText(sections);

	// Merge into frontmatter (don't overwrite existing)
	if (aboutText && !frontmatter.about) {
		frontmatter.about = aboutText;
	}
	if (marketStrategy && !frontmatter.market_strategy) {
		frontmatter.market_strategy = marketStrategy;
	}
	if (tradingTips && !frontmatter.trading_tips) {
		frontmatter.trading_tips = tradingTips;
	}

	// Tag as v2
	frontmatter.mdx_version = 2;
	frontmatter.mdx_updated = TODAY;

	// Write back with empty body
	const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
	const output = `---\n${yaml.trim()}\n---\n`;

	if (!dryRun) await writeFile(filepath, output, 'utf-8');

	const extracted = [];
	if (aboutText) extracted.push('about');
	if (marketStrategy) extracted.push('market_strategy');
	if (tradingTips) extracted.push('trading_tips');

	return {
		status: 'migrated',
		extracted,
		sections: sections.length,
	};
}

async function main() {
	console.log(`🔄 Migrating OSRS overrides to v2${dryRun ? ' (DRY RUN)' : ''}`);
	if (limit < Infinity) console.log(`  Limit: ${limit} files`);

	const files = (await readdir(OVERRIDE_DIR))
		.filter((f) => f.endsWith('.mdx') && f.startsWith('_'))
		.sort();

	let migrated = 0;
	let tagged = 0;
	let skipped = 0;
	let processed = 0;

	for (const file of files) {
		if (processed >= limit) break;
		processed++;

		const result = await migrateFile(file);

		if (result.status === 'migrated') {
			migrated++;
			if (processed <= 10 || processed % 100 === 0) {
				console.log(`  ✅ ${file} → extracted: [${result.extracted.join(', ')}] (${result.sections} sections)`);
			}
		} else if (result.status === 'tagged') {
			tagged++;
		} else {
			skipped++;
		}

		if (processed % 500 === 0) {
			console.log(`  ... ${processed}/${Math.min(files.length, limit)} processed`);
		}
	}

	console.log(`\n✨ Done!`);
	console.log(`  Migrated: ${migrated}`);
	console.log(`  Tagged (no body): ${tagged}`);
	console.log(`  Skipped (already v2): ${skipped}`);
	console.log(`  Total processed: ${processed}`);
}

main().catch((err) => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});
