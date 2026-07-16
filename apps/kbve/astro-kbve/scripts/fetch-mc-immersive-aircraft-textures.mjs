import { mkdir, writeFile, stat } from 'fs/promises';
import { join } from 'path';

const REF = '1.20.1';
const BASE = `https://raw.githubusercontent.com/Luke100000/ImmersiveAircraft/${REF}/common/src/main/resources/assets/immersive_aircraft/textures/item`;
const OUT = './public/mc/textures/item';

const ITEMS = [
	'airship', 'cargo_airship', 'warship', 'biplane', 'gyrodyne', 'quadrocopter', 'bamboo_hopper',
	'hull', 'engine', 'sail', 'propeller', 'boiler',
	'enhanced_propeller', 'eco_engine', 'nether_engine', 'steel_boiler', 'industrial_gears',
	'sturdy_pipes', 'gyroscope', 'gyroscope_dials', 'gyroscope_hud', 'hull_reinforcement',
	'improved_landing_gear',
	'rotary_cannon', 'bomb_bay', 'heavy_crossbow', 'telescope',
];

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function main() {
	await mkdir(OUT, { recursive: true });
	let fetched = 0;
	let skipped = 0;
	let missing = 0;
	for (const id of ITEMS) {
		const dest = join(OUT, `${id}.png`);
		if (await exists(dest)) {
			skipped++;
			continue;
		}
		const res = await fetch(`${BASE}/${id}.png`);
		if (!res.ok) {
			console.warn(`⚠ no texture for ${id} (HTTP ${res.status})`);
			missing++;
			continue;
		}
		const buf = Buffer.from(await res.arrayBuffer());
		await writeFile(dest, buf);
		console.log(`  ↓ ${id}.png (${buf.length} B)`);
		fetched++;
	}
	console.log(`\n✨ Done! fetched=${fetched} skipped=${skipped} missing=${missing}`);
	if (missing > 0) process.exit(1);
}

main().catch((err) => {
	console.error('❌', err.message);
	process.exit(1);
});
