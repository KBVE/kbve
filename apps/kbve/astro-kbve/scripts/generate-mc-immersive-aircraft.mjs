import { mkdir, readdir, readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';

const NAMESPACE = 'immersive_aircraft';
const MOD_NAME = 'Immersive Aircraft';
const DATA_VERSION = '1.21.11';
const ID_BASE = 900000;
const OUTPUT_DIR = './src/content/docs/mc/items';

const args = process.argv.slice(2);
const auditMode = args.includes('--audit');

const FUEL_FAQ = {
	question: 'How do I fuel an aircraft?',
	answer:
		'Most Immersive Aircraft burn ordinary furnace fuel — coal, charcoal, or blaze rods — placed in the boiler slot. The Gyrodyne is muscle-powered and needs no fuel; give it a running push to take off.',
};
const CLAIM_FAQ = {
	question: 'Can I mount and dismount aircraft inside land claims?',
	answer:
		'Yes. On the KBVE server, Immersive Aircraft can be mounted and dismounted inside Open Parties and Claims land claims just like vanilla boats, so an aircraft parked on a claim can always be reclaimed.',
};

const ITEMS = [
	{ id: 'airship', name: 'Airship', category: 'transport', stack: 1, type: 'aircraft',
		desc: 'Slow but easy to maneuver — a lighter-than-air balloon craft that is forgiving for new pilots.',
		lore: 'A gentle balloon that drifts wherever the wind allows.', faq: [FUEL_FAQ, CLAIM_FAQ] },
	{ id: 'cargo_airship', name: 'Cargo Airship', category: 'transport', stack: 1, type: 'aircraft',
		desc: 'Slow and fuel hungry but carries an entire storage of goods across the map.',
		lore: 'A flying warehouse for the well-supplied trader.', faq: [FUEL_FAQ, CLAIM_FAQ] },
	{ id: 'warship', name: 'Warship', category: 'transport', stack: 1, type: 'aircraft',
		desc: 'A flying fortress — slow but heavily armed, built to mount weapons and take a beating.',
		lore: 'When you need the skies to fear you.', faq: [FUEL_FAQ, CLAIM_FAQ] },
	{ id: 'biplane', name: 'Biplane', category: 'transport', stack: 1, type: 'aircraft',
		desc: 'Fast and rather reliable. Make sure your runway is long enough before you open the throttle.',
		lore: 'Speed for those who plan their landings.', faq: [FUEL_FAQ, CLAIM_FAQ] },
	{ id: 'gyrodyne', name: 'Gyrodyne', category: 'transport', stack: 1, type: 'aircraft',
		desc: 'Muscle-powered copter. Give it a good push and off it flies — no fuel required.',
		lore: 'Pedal power for the frugal aviator.', faq: [FUEL_FAQ, CLAIM_FAQ] },
	{ id: 'quadrocopter', name: 'Quadrocopter', category: 'transport', stack: 1, type: 'aircraft',
		desc: 'Perfect for building — it hovers precisely, and that is about all it is good for.',
		lore: 'The scaffolding-free way to reach the roof.', faq: [FUEL_FAQ, CLAIM_FAQ] },
	{ id: 'bamboo_hopper', name: 'Bamboo Hopper', category: 'transport', stack: 1, type: 'aircraft',
		desc: 'A chonky aircraft with three seats and pontoons to land safely on water.',
		lore: 'Bring friends; land on lakes.', faq: [FUEL_FAQ, CLAIM_FAQ] },

	{ id: 'hull', name: 'Hull', category: 'material', stack: 64, type: 'part',
		desc: 'The wooden frame every Immersive Aircraft is assembled around.',
		lore: 'Every flight starts with a good hull.' },
	{ id: 'engine', name: 'Engine', category: 'material', stack: 64, type: 'part',
		desc: 'Burns fuel to drive an aircraft’s propeller and generate thrust.',
		lore: 'The beating heart of powered flight.' },
	{ id: 'sail', name: 'Sail', category: 'material', stack: 64, type: 'part',
		desc: 'A cloth sail that catches the wind on lighter-than-air craft such as the airship.',
		lore: 'Canvas and rope, the oldest way to move.' },
	{ id: 'propeller', name: 'Propeller', category: 'material', stack: 64, type: 'part',
		desc: 'A spinning blade that converts engine power into forward thrust.',
		lore: 'Round and round, and forward you go.' },
	{ id: 'boiler', name: 'Boiler', category: 'material', stack: 64, type: 'part',
		desc: 'Holds and burns the fuel that feeds an aircraft’s engine.',
		lore: 'Keep it stoked and keep flying.' },

	{ id: 'enhanced_propeller', name: 'Enhanced Propeller', category: 'material', stack: 64, type: 'upgrade',
		desc: 'An upgraded propeller that delivers extra thrust and higher top speed.',
		lore: 'For pilots who are always in a hurry.' },
	{ id: 'eco_engine', name: 'Eco Engine', category: 'material', stack: 64, type: 'upgrade',
		desc: 'A fuel-efficient engine that sips rather than guzzles, extending your range.',
		lore: 'Fly farther on far less.' },
	{ id: 'nether_engine', name: 'Nether Engine', category: 'material', stack: 64, type: 'upgrade',
		desc: 'A high-powered engine tuned to run reliably even in the harsh Nether.',
		lore: 'Built to breathe fire.' },
	{ id: 'steel_boiler', name: 'Steel Boiler', category: 'material', stack: 64, type: 'upgrade',
		desc: 'A reinforced boiler with a larger fuel capacity for longer voyages.',
		lore: 'More fuel, fewer stops.' },
	{ id: 'industrial_gears', name: 'Industrial Gears', category: 'material', stack: 64, type: 'upgrade',
		desc: 'Heavy gearing that boosts an engine’s power output.',
		lore: 'Torque you can feel.' },
	{ id: 'sturdy_pipes', name: 'Sturdy Pipes', category: 'material', stack: 64, type: 'upgrade',
		desc: 'Reinforced piping that smooths fuel flow and reduces drag.',
		lore: 'No leaks, no drama.' },
	{ id: 'gyroscope', name: 'Gyroscope', category: 'material', stack: 64, type: 'upgrade',
		desc: 'A stabilizer upgrade that keeps an aircraft steady and easier to control in flight.',
		lore: 'Steady hands, spinning wheel.' },
	{ id: 'gyroscope_dials', name: 'Advanced Gyroscope', category: 'material', stack: 64, type: 'upgrade',
		desc: 'A mechanical dashboard upgrade that adds extra stabilization and analog flight dials.',
		lore: 'Brass, glass, and confidence.' },
	{ id: 'gyroscope_hud', name: 'Electronic Gyroscope', category: 'material', stack: 64, type: 'upgrade',
		desc: 'An electronic dashboard that overlays live flight data as a heads-up display.',
		lore: 'The future, projected onto your visor.' },
	{ id: 'hull_reinforcement', name: 'Hull Reinforcement', category: 'material', stack: 64, type: 'upgrade',
		desc: 'Extra plating that increases an aircraft’s durability and crash resistance.',
		lore: 'Bumps happen; plan for them.' },
	{ id: 'improved_landing_gear', name: 'Improved Landing Gear', category: 'material', stack: 64, type: 'upgrade',
		desc: 'Sturdier landing gear that cushions rough touchdowns and awkward landings.',
		lore: 'Walk away from every landing.' },

	{ id: 'rotary_cannon', name: 'Rotary Cannon', category: 'weapon', stack: 1, type: 'weapon',
		desc: 'A fast-firing aircraft cannon that runs on gunpowder.',
		lore: 'Rain lead from above.' },
	{ id: 'bomb_bay', name: 'Bomb Bay', category: 'weapon', stack: 1, type: 'weapon',
		desc: 'Drops TNT that does not destroy blocks but deals heavy damage to targets below.',
		lore: 'Open the doors and let go.' },
	{ id: 'heavy_crossbow', name: 'Heavy Crossbow', category: 'weapon', stack: 1, type: 'weapon',
		desc: 'A heavy aircraft-mounted crossbow with a powerful punch. Requires arrows.',
		lore: 'One heavy bolt at a time.' },
	{ id: 'telescope', name: 'Telescope', category: 'tool', stack: 1, type: 'tool',
		desc: 'A bulkier version of the spyglass for spotting distant targets and terrain.',
		lore: 'See it long before you reach it.' },
];

function indentBlock(text, pad) {
	return text
		.trimEnd()
		.split('\n')
		.map((l) => `${pad}${l}`)
		.join('\n');
}

function faqYaml(faq) {
	if (!faq || faq.length === 0) return '';
	const entries = faq
		.map(
			(f) =>
				`        - question: ${f.question}\n          answer: |\n${indentBlock(f.answer, '              ')}`,
		)
		.join('\n');
	return `\n    faq:\n${entries}`;
}

function generateMdx(item) {
	const ref = `${NAMESPACE}:${item.id}`;
	const slug = item.id.replace(/_/g, '-');
	const faq = faqYaml(item.faq);
	return `---
title: ${item.name}
template: splash
description: |
    ${MOD_NAME} ${item.name} — modded item on the KBVE Minecraft server.
sidebar:
    label: ${item.name}
    hidden: true
tags:
    - minecraft
    - mc
    - mc-item
    - immersive-aircraft
    - modded
mc_item:
    id: ${ID_BASE + item._index}
    ref: ${ref}
    slug: ${slug}
    content_rev: 0
    display_name: ${item.name}
    category: ${item.category}
    rarity: common
    stack_size: ${item.stack}
    tags:
        - ${NAMESPACE}
        - ${item.type}
    about:
        description: |
${indentBlock(item.desc, '            ')}
        lore: |
${indentBlock(item.lore, '            ')}${faq}
    data_version: "${DATA_VERSION}"
---

import MCItemPanel from '@/components/mcdb/MCItemPanel.astro';

<MCItemPanel data={frontmatter.mc_item} />
`;
}

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function buildExistingRefIndex() {
	const refs = new Set();
	if (!(await exists(OUTPUT_DIR))) return refs;
	for (const name of await readdir(OUTPUT_DIR)) {
		if (!name.endsWith('.mdx')) continue;
		const txt = await readFile(join(OUTPUT_DIR, name), 'utf-8');
		const m = txt.match(/\n {4}ref:\s*(\S+)/);
		if (m) refs.add(m[1].trim());
	}
	return refs;
}

async function main() {
	const existing = await buildExistingRefIndex();
	console.log(`  ${existing.size} item MDX pages already exist`);
	await mkdir(OUTPUT_DIR, { recursive: true });

	let created = 0;
	let skipped = 0;
	ITEMS.forEach((it, i) => (it._index = i + 1));
	for (const item of ITEMS) {
		const ref = `${NAMESPACE}:${item.id}`;
		if (existing.has(ref)) {
			skipped++;
			continue;
		}
		const slug = item.id.replace(/_/g, '-');
		const dest = join(OUTPUT_DIR, `${slug}.mdx`);
		if (auditMode) {
			console.log(`  [new] ${slug}.mdx  (${item.category})`);
			created++;
			continue;
		}
		await writeFile(dest, generateMdx(item), 'utf-8');
		console.log(`  + ${slug}.mdx  (${item.category})`);
		created++;
	}

	console.log(`\n✨ Done!`);
	console.log(`  ${auditMode ? 'Would create' : 'Created'}: ${created}`);
	console.log(`  Skipped (already MDX): ${skipped}`);
}

main().catch((err) => {
	console.error('❌', err.message);
	process.exit(1);
});
