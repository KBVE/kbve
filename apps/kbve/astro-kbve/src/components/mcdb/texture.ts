export const MC_ASSET_VERSION = '1.21.5';
const ITEM_BASE = '/mc/textures/item';
const BLOCK_BASE = '/mc/textures/block';

type Pair = { primary: string; fallback: string };

const BLOCK_CATEGORIES = new Set([
	'block',
	'decoration',
	'redstone',
	'transport',
]);

const WOOD_TYPES = new Set([
	'acacia',
	'birch',
	'oak',
	'spruce',
	'dark_oak',
	'jungle',
	'mangrove',
	'cherry',
	'pale_oak',
	'bamboo',
	'crimson',
	'warped',
]);

const SPECIALS: Record<string, string> = {
	barrel: 'barrel_top',
	beehive: 'beehive_front',
	bee_nest: 'bee_nest_front',
	cauldron: 'cauldron_side',
	water_cauldron: 'cauldron_side',
	lava_cauldron: 'cauldron_side',
	powder_snow_cauldron: 'cauldron_side',
	composter: 'composter_side',
	lectern: 'lectern_top',
	loom: 'loom_top',
	lodestone: 'lodestone_top',
	jukebox: 'jukebox_top',
	magma_block: 'magma',
	mangrove_roots: 'mangrove_roots_top',
	muddy_mangrove_roots: 'muddy_mangrove_roots_top',
	water: 'water_still',
	lava: 'lava_still',
	large_fern: 'large_fern_bottom',
	tall_grass: 'tall_grass_bottom',
	lilac: 'lilac_bottom',
	rose_bush: 'rose_bush_bottom',
	peony: 'peony_bottom',
	sunflower: 'sunflower_bottom',
	pitcher_plant: 'pitcher_plant',
	end_portal_frame: 'end_portal_frame_top',
	end_portal: 'end_stone',
	bell: 'bell_bottom',
	chest: 'oak_planks',
	trapped_chest: 'oak_planks',
	ender_chest: 'obsidian',
	conduit: 'beacon',
	piston_head: 'piston_top',
	piston: 'piston_top',
	sticky_piston: 'piston_top_sticky',
	moving_piston: 'piston_top',
	grindstone: 'grindstone_side',
	smithing_table: 'smithing_table_top',
	cartography_table: 'cartography_table_top',
	fletching_table: 'fletching_table_top',
	stonecutter: 'stonecutter_top',
	smoker: 'smoker_top',
	blast_furnace: 'blast_furnace_top',
	furnace: 'furnace_top',
	respawn_anchor: 'respawn_anchor_top_off',
	brewing_stand: 'brewing_stand_base',
	enchanting_table: 'enchanting_table_top',
	decorated_pot: 'flower_pot',
	ancient_debris: 'ancient_debris_top',
	basalt: 'basalt_top',
	bone_block: 'bone_block_top',
	cactus: 'cactus_top',
	calibrated_sculk_sensor: 'calibrated_sculk_sensor_top',
	chiseled_bookshelf: 'chiseled_bookshelf_empty',
	command_block: 'command_block_front',
	chain_command_block: 'chain_command_block_front',
	repeating_command_block: 'repeating_command_block_front',
	crafter: 'crafter_top',
	crafting_table: 'crafting_table_front',
	daylight_detector: 'daylight_detector_top',
	dirt_path: 'dirt_path_top',
	dispenser: 'dispenser_front',
	dropper: 'dropper_front',
	dried_kelp_block: 'dried_kelp_top',
	chipped_anvil: 'anvil_top',
	damaged_anvil: 'anvil_top',
	anvil: 'anvil_top',
	azalea: 'azalea_top',
	flowering_azalea: 'flowering_azalea_top',
	big_dripleaf: 'big_dripleaf_top',
	small_dripleaf: 'small_dripleaf_top',
	cocoa: 'cocoa_stage2',
	beetroots: 'beetroots_stage3',
	carrots: 'carrots_stage3',
	potatoes: 'potatoes_stage3',
	wheat: 'wheat_stage7',
	nether_wart: 'nether_wart_stage2',
	melon_stem: 'melon_stem',
	pumpkin_stem: 'pumpkin_stem',
	attached_melon_stem: 'melon_stem',
	attached_pumpkin_stem: 'pumpkin_stem',
	torchflower_crop: 'torchflower_crop_stage1',
	pitcher_crop: 'pitcher_crop_top',
	sweet_berry_bush: 'sweet_berry_bush_stage3',
	cave_vines: 'cave_vines_plant',
	cave_vines_plant: 'cave_vines_plant',
	twisting_vines: 'twisting_vines_plant',
	twisting_vines_plant: 'twisting_vines_plant',
	weeping_vines: 'weeping_vines_plant',
	weeping_vines_plant: 'weeping_vines_plant',
	kelp: 'kelp_plant',
	kelp_plant: 'kelp_plant',
	tall_seagrass: 'tall_seagrass_bottom',
	bamboo_sapling: 'bamboo_stage0',
	bubble_column: 'water_still',
	end_gateway: 'end_stone',
	crimson_hyphae: 'crimson_stem',
	stripped_crimson_hyphae: 'stripped_crimson_stem',
	warped_hyphae: 'warped_stem',
	stripped_warped_hyphae: 'stripped_warped_stem',
	air: 'barrier',
	cave_air: 'barrier',
	void_air: 'barrier',
	structure_void: 'barrier',
	light: 'light_15',
	candle_cake: 'cake_top',
	frosted_ice: 'frosted_ice_0',
	glass_pane: 'glass',
	moss_carpet: 'moss_block',
	pale_moss_carpet: 'pale_moss_block',
	grass_block: 'grass_block_top',
	hay_block: 'hay_block_top',
	melon: 'melon_top',
	mycelium: 'mycelium_top',
	observer: 'observer_front',
	pumpkin: 'pumpkin_top',
	carved_pumpkin: 'pumpkin_top',
	podzol: 'podzol_top',
	quartz_block: 'quartz_block_top',
	snow_block: 'snow',
	ochre_froglight: 'ochre_froglight_top',
	pearlescent_froglight: 'pearlescent_froglight_top',
	verdant_froglight: 'verdant_froglight_top',
	polished_basalt: 'polished_basalt_top',
	scaffolding: 'scaffolding_top',
	sculk_catalyst: 'sculk_catalyst_top',
	sculk_sensor: 'sculk_sensor_top',
	sculk_shrieker: 'sculk_shrieker_top',
	target: 'target_top',
	tnt: 'tnt_top',
	trial_spawner: 'trial_spawner_top_inactive',
	vault: 'vault_front_off',
	jigsaw: 'jigsaw_top',
	reinforced_deepslate: 'reinforced_deepslate_top',
	redstone_wire: 'redstone_dust_dot',
	redstone_wall_torch: 'redstone_torch',
	wall_torch: 'torch',
	soul_wall_torch: 'soul_torch',
	soul_fire: 'soul_fire_0',
	fire: 'fire_0',
	suspicious_gravel: 'gravel',
	suspicious_sand: 'sand',
	test_block: 'barrier',
	honey_block: 'honey_block_top',
	skeleton_skull: 'bone_block_top',
	wither_skeleton_skull: 'soul_sand',
	dragon_head: 'dragon_egg',
	zombie_head: 'rotten_flesh',
	creeper_head: 'moss_block',
	piglin_head: 'gold_block',
	player_head: 'carved_pumpkin',
};

export function resolveBaseRef(ref: string): string | null {
	if (!ref) return null;
	const r = ref.toLowerCase().replace(/^minecraft:/, '');

	let m = r.match(/^waxed_(.+)$/);
	if (m) return m[1];

	m = r.match(/^infested_(.+)$/);
	if (m) return m[1];

	if (r === 'heavy_weighted_pressure_plate') return 'iron_block';
	if (r === 'light_weighted_pressure_plate') return 'gold_block';
	if (r === 'respawn_anchor') return 'respawn_anchor_top';
	if (r === 'sculk_sensor') return 'sculk_sensor_top';
	if (r === 'reinforced_deepslate') return 'reinforced_deepslate_top';
	if (r === 'lodestone') return 'lodestone_top';
	if (r === 'crafting_table') return 'crafting_table_front';
	if (r === 'furnace') return 'furnace_front';
	if (r === 'enchanting_table') return 'enchanting_table_top';
	if (r === 'hopper') return 'hopper_top';
	if (r === 'dispenser') return 'dispenser_front';
	if (r === 'piston') return 'piston_side';
	if (r === 'observer') return 'observer_front';
	if (r === 'tnt') return 'tnt_side';
	if (r === 'chest') return 'oak_planks';
	if (r === 'ender_chest') return 'obsidian';
	if (r === 'petrified_oak_slab') return 'oak_planks';
	if (r === 'purpur_slab' || r === 'purpur_stairs') return 'purpur_block';
	if (
		r === 'smooth_quartz_slab' ||
		r === 'smooth_quartz_stairs' ||
		r === 'smooth_quartz'
	) {
		return 'quartz_block_bottom';
	}
	if (
		r === 'smooth_red_sandstone_slab' ||
		r === 'smooth_red_sandstone_stairs' ||
		r === 'smooth_red_sandstone'
	) {
		return 'red_sandstone_top';
	}
	if (
		r === 'smooth_sandstone_slab' ||
		r === 'smooth_sandstone_stairs' ||
		r === 'smooth_sandstone'
	) {
		return 'sandstone_top';
	}

	if (r === 'moss_carpet') return 'moss_block';
	if (r === 'pale_moss_carpet') return 'pale_moss_block';

	m = r.match(/^(.+?)_carpet$/);
	if (m) return `${m[1]}_wool`;

	m = r.match(/^(.+?)_bed$/);
	if (m) return `${m[1]}_wool`;

	m = r.match(/^(.+?)_stained_glass_pane$/);
	if (m) return `${m[1]}_stained_glass`;

	m = r.match(/^(.+?)_candle_cake$/);
	if (m) return `${m[1]}_candle`;

	if (/^bamboo_mosaic_(slab|stairs)$/.test(r)) return 'bamboo_mosaic';

	m = r.match(/^(.+?)_door$/);
	if (m && WOOD_TYPES.has(m[1])) return `${m[1]}_door_bottom`;

	m = r.match(/^(.+?)_trapdoor$/);
	if (m && WOOD_TYPES.has(m[1])) return `${m[1]}_trapdoor`;

	m = r.match(
		/^(.+?)_(fence_gate|fence|wall_hanging_sign|hanging_sign|wall_sign|sign)$/,
	);
	if (m && WOOD_TYPES.has(m[1])) return `${m[1]}_planks`;

	m = r.match(/^(.+?)_brick_(slab|stairs|wall|fence)$/);
	if (m) return `${m[1]}_bricks`;

	m = r.match(/^(.+?)_tile_(slab|stairs|wall)$/);
	if (m) return `${m[1]}_tiles`;

	m = r.match(/^dead_(.+?)_coral_wall_fan$/);
	if (m) return `dead_${m[1]}_coral_fan`;

	m = r.match(/^(.+?)_coral_wall_fan$/);
	if (m) return `${m[1]}_coral_fan`;

	m = r.match(/^(.+?)_(slab|stairs|wall|button|pressure_plate)$/);
	if (m) {
		if (WOOD_TYPES.has(m[1])) return `${m[1]}_planks`;
		return m[1];
	}

	if (r === 'stone_pressure_plate') return 'stone';
	if (r === 'polished_blackstone_pressure_plate')
		return 'polished_blackstone';

	m = r.match(/^(.*?)_wood$/);
	if (m && m[1]) {
		const base = m[1];
		if (base.endsWith('crimson') || base.endsWith('warped')) {
			return `${base}_stem`;
		}
		return `${base}_log`;
	}

	m = r.match(/^(.+?)_(wall_)?banner$/);
	if (m) return `${m[1]}_wool`;

	m = r.match(/^(.+?)_wall_(head|skull)$/);
	if (m) return `${m[1]}_${m[2]}`;

	if (Object.prototype.hasOwnProperty.call(SPECIALS, r)) return SPECIALS[r];

	if (r.startsWith('potted_')) return 'flower_pot';

	return null;
}

function resolveTerminal(ref: string): string {
	let cursor = ref;
	const seen = new Set<string>([cursor]);
	for (let hop = 0; hop < 4; hop++) {
		const next = resolveBaseRef(cursor);
		if (!next || next === cursor || seen.has(next)) break;
		seen.add(next);
		cursor = next;
	}
	return cursor;
}

export function mcTextureUrls(ref: string, category?: string | null): Pair {
	const clean = ref.replace(/^[a-z_]+:/, '').toLowerCase();
	const effective = resolveTerminal(clean);
	const isBlockish = category ? BLOCK_CATEGORIES.has(category) : false;
	if (isBlockish) {
		return {
			primary: `${BLOCK_BASE}/${effective}.png`,
			fallback: `${ITEM_BASE}/${effective}.png`,
		};
	}
	return {
		primary: `${ITEM_BASE}/${effective}.png`,
		fallback: `${BLOCK_BASE}/${effective}.png`,
	};
}
