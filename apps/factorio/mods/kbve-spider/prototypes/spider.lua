--[[
  KBVE Spider — pre-rendered 16-direction unit.

  Sheets baked by tools/bake_sheets.py:
    graphics/entity/spider/<Anim>_<Body|Shadow>.png
    width  = frame_count * 256
    height = 16 * 256          (one row per direction, 0°..337.5° clockwise)

  Scale 0.5 → ~128px ingame. If heading lags movement, re-bake with
  `--direction-shift N` (each step = 22.5°).
]]

local util = require("util")

local FRAME = 256
local DIRECTIONS = 16
local SCALE = 0.5

local FRAMES = {
	Idle      = 20,
	Walk      = 20,
	Run       = 16,
	Attack1   = 24,
	Attack2   = 16,
	Attack3   = 30,
	Death1    = 30,
	Death2    = 30,
	Hit_Front = 16,
	Hit_Back  = 16,
	Hit_Left  = 20,
	Hit_Right = 20,
	Nervous   = 16,
}

local function rotated(anim, opts)
	opts = opts or {}
	local frame_count = FRAMES[anim]
	return {
		layers = {
			{
				filename        = "__kbve-spider__/graphics/entity/spider/" .. anim .. "_Body.png",
				width           = FRAME,
				height          = FRAME,
				frame_count     = frame_count,
				line_length     = frame_count,
				direction_count = DIRECTIONS,
				scale           = SCALE,
				animation_speed = opts.animation_speed or 0.4,
				run_mode        = opts.run_mode or "forward",
			},
			{
				filename        = "__kbve-spider__/graphics/entity/spider/" .. anim .. "_Shadow.png",
				width           = FRAME,
				height          = FRAME,
				frame_count     = frame_count,
				line_length     = frame_count,
				direction_count = DIRECTIONS,
				scale           = SCALE,
				animation_speed = opts.animation_speed or 0.4,
				run_mode        = opts.run_mode or "forward",
				draw_as_shadow  = true,
			},
		},
	}
end

local spider = {
	type = "unit",
	name = "kbve-spider",
	icon = "__kbve-spider__/graphics/icon.png",
	icon_size = 64,
	flags = { "placeable-enemy", "placeable-off-grid", "not-repairable", "breaths-air" },

	max_health = 80,
	healing_per_tick = 0.01,
	order = "b-b-z-kbve-spider",
	subgroup = "enemies",

	collision_box = { { -0.35, -0.35 }, { 0.35, 0.35 } },
	selection_box = { { -0.7, -0.7 }, { 0.7, 0.7 } },
	sticker_box   = { { -0.3, -0.3 }, { 0.3, 0.3 } },

	resistances = {
		{ type = "physical",  decrease = 0, percent = 10 },
		{ type = "explosion", decrease = 0, percent = -25 },
		{ type = "fire",      decrease = 0, percent = -50 },
	},

	movement_speed = 0.18,
	distance_per_frame = 0.13,
	absorptions_to_join_attack = { pollution = 4 },
	distraction_cooldown = 300,
	min_pursue_time = 10 * 60,
	max_pursue_distance = 50,
	vision_distance = 30,

	dying_explosion = "blood-explosion-small",

	ai_settings = {
		do_separation = true,
	},

	attack_parameters = {
		type = "projectile",
		ammo_category = "melee",
		cooldown = 60,
		range = 1.5,
		animation = rotated("Attack1", { animation_speed = 0.5 }),
		ammo_type = {
			category = "melee",
			target_type = "entity",
			action = {
				type = "direct",
				action_delivery = {
					type = "instant",
					target_effects = {
						{
							type = "damage",
							damage = { amount = 12, type = "physical" },
						},
					},
				},
			},
		},
	},

	run_animation = rotated("Walk", { animation_speed = 0.8 }),

	corpse = "kbve-spider-corpse-death1",
}

-- Corpse factory. Used for every one-shot animation: deaths (long linger,
-- selectable for blueprints not allowed), hit reactions (short linger, used
-- as transient stagger visual by control.lua), and the future-use anims
-- (Nervous / Idle / Run / Attack2 / Attack3) baked in for scripted swaps.
local function corpse_proto(anim, opts)
	opts = opts or {}
	local id = anim:lower():gsub("_", "-")
	return {
		type = "corpse",
		name = "kbve-spider-corpse-" .. id,
		icon = "__kbve-spider__/graphics/icon.png",
		icon_size = 64,
		flags = { "placeable-neutral", "placeable-off-grid", "not-repairable" },
		collision_box = { { 0, 0 }, { 0, 0 } },
		selection_box = { { -0.5, -0.5 }, { 0.5, 0.5 } },
		selectable_in_game = false,
		subgroup = "corpses",
		order = "c[corpse]-z[kbve-spider-" .. id .. "]",
		time_before_removed = opts.time_before_removed or (60 * 60 * 2),
		final_render_layer = opts.final_render_layer or "remnants",
		animation = rotated(anim, {
			animation_speed = opts.animation_speed or 0.4,
			run_mode = "forward",
		}),
	}
end

local stagger_sticker = {
	type = "sticker",
	name = "kbve-spider-stagger",
	flags = { "not-on-map" },
	duration_in_ticks = 30,
	target_movement_modifier = 0.2,
	single_particle = true,
}

local sprint_sticker = {
	type = "sticker",
	name = "kbve-spider-sprint",
	flags = { "not-on-map" },
	duration_in_ticks = 180,
	target_movement_modifier = 1.9,
	single_particle = true,
}

local ally_spider = util.table.deepcopy(spider)
ally_spider.name = "kbve-spider-ally"
ally_spider.order = "b-b-z-kbve-spider-ally"
ally_spider.max_health = 60
ally_spider.movement_speed = 0.22
ally_spider.attack_parameters.cooldown = 50

local spider_egg_item = {
	type = "item",
	name = "kbve-spider-egg",
	icon = "__kbve-spider__/graphics/item/spider-egg.png",
	icon_size = 64,
	subgroup = "tool",
	order = "z[kbve-spider-egg]",
	stack_size = 10,
	place_result = "kbve-spider-egg-entity",
}

local spider_egg_entity = {
	type = "simple-entity-with-owner",
	name = "kbve-spider-egg-entity",
	icon = "__kbve-spider__/graphics/item/spider-egg.png",
	icon_size = 64,
	flags = { "placeable-neutral", "placeable-off-grid", "not-blueprintable", "player-creation" },
	collision_box = { { -0.3, -0.3 }, { 0.3, 0.3 } },
	selection_box = { { -0.5, -0.5 }, { 0.5, 0.5 } },
	selectable_in_game = true,
	picture = {
		filename = "__kbve-spider__/graphics/item/spider-egg.png",
		width = 64,
		height = 64,
		scale = 0.35,
		shift = { 0, -0.05 },
	},
	minable = { mining_time = 0.3, result = "kbve-spider-egg" },
	max_health = 20,
	subgroup = "tool",
	order = "z[kbve-spider-egg-entity]",
}

data:extend({
	spider,
	ally_spider,
	spider_egg_item,
	spider_egg_entity,
	corpse_proto("Death1", { animation_speed = 0.4 }),
	corpse_proto("Death2", { animation_speed = 0.4 }),
	corpse_proto("Hit_Front", { time_before_removed = 60, animation_speed = 1.2 }),
	corpse_proto("Hit_Back",  { time_before_removed = 60, animation_speed = 1.2 }),
	corpse_proto("Hit_Left",  { time_before_removed = 60, animation_speed = 1.2 }),
	corpse_proto("Hit_Right", { time_before_removed = 60, animation_speed = 1.2 }),
	corpse_proto("Idle",    { time_before_removed = 60, animation_speed = 0.4 }),
	corpse_proto("Run",     { time_before_removed = 60, animation_speed = 0.6 }),
	corpse_proto("Attack2", { time_before_removed = 60, animation_speed = 0.5 }),
	corpse_proto("Attack3", { time_before_removed = 60, animation_speed = 0.4 }),
	corpse_proto("Nervous", { time_before_removed = 60, animation_speed = 0.5 }),
	stagger_sticker,
	sprint_sticker,
})
