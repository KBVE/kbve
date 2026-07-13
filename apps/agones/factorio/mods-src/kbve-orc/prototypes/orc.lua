--[[
  KBVE Orc — pre-rendered 16-direction neutral creature.

  Sheets baked by tools/bake_sheets.py:
    graphics/entity/orc/<Anim>_<Body|Shadow>.png
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
	Idle_Armed    = 16,
	Walk_Armed    = 20,
	Run_Armed     = 24,
	Attack_01     = 24,
	Attack_02     = 30,
	Attack_03     = 24,
	Death_Armed   = 24,
	Death_Unarmed = 16,
	Hit_Armed     = 20,
	Hit_Block     = 20,
	Hit_Unarmed   = 20,
	Roar          = 30,
}

local function rotated(anim, opts)
	opts = opts or {}
	local frame_count = FRAMES[anim]
	return {
		layers = {
			{
				filename        = "__kbve-orc__/graphics/entity/orc/" .. anim .. "_Body.png",
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
				filename        = "__kbve-orc__/graphics/entity/orc/" .. anim .. "_Shadow.png",
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

local ORC_MAX_HEALTH = settings.startup["kbve-orc-max-health"]
		and settings.startup["kbve-orc-max-health"].value
	or 300

local ORC_MELEE_DAMAGE = settings.startup["kbve-orc-melee-damage"]
		and settings.startup["kbve-orc-melee-damage"].value
	or 14

local orc = {
	type = "unit",
	name = "kbve-orc",
	icon = "__kbve-orc__/graphics/icon.png",
	icon_size = 64,
	icon_mipmaps = 4,
	-- "placeable-enemy" lets map gen + editor place this like a biter, but
	-- runtime assigns the entity to the `kbve-orcs` force (see control.lua),
	-- so the orc faction is independent of the biter "enemy" force.
	flags = { "placeable-enemy", "placeable-off-grid", "not-repairable", "breaths-air" },

	max_health = ORC_MAX_HEALTH,
	healing_per_tick = 0.02,
	order = "b-b-z-kbve-orc",
	subgroup = "enemies",

	collision_box = { { -0.4, -0.4 }, { 0.4, 0.4 } },
	selection_box = { { -0.8, -0.8 }, { 0.8, 0.8 } },
	sticker_box   = { { -0.35, -0.35 }, { 0.35, 0.35 } },

	resistances = {
		{ type = "physical",  decrease = 1, percent = 15 },
		{ type = "explosion", decrease = 0, percent = -15 },
		{ type = "fire",      decrease = 0, percent = -25 },
	},

	movement_speed = 0.16,
	distance_per_frame = 0.12,
	-- Orc faction does not respond to pollution. Aggression is rep-driven, set
	-- in control.lua via force cease-fire toggles, not biter-style pollution.
	absorptions_to_join_attack = { pollution = 0 },
	distraction_cooldown = 240,
	min_pursue_time = 8 * 60,
	max_pursue_distance = 40,
	vision_distance = 28,

	dying_explosion = "blood-explosion-big",

	ai_settings = {
		do_separation = true,
	},

	attack_parameters = {
		type = "projectile",
		ammo_category = "melee",
		cooldown = 55,
		range = 1.8,
		animation = rotated("Attack_01", { animation_speed = 0.55 }),
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
							damage = { amount = ORC_MELEE_DAMAGE, type = "physical" },
						},
					},
				},
			},
		},
	},

	run_animation = rotated("Walk_Armed", { animation_speed = 0.8 }),

	corpse = "kbve-orc-corpse-death-armed",
}

-- Corpse factory. Same shape as kbve-spider: one corpse per anim so control.lua
-- can spawn arbitrary one-shot reactions (hit / roar / death variants) without
-- needing additional prototypes later.
local function corpse_proto(anim, opts)
	opts = opts or {}
	local id = anim:lower():gsub("_", "-")
	return {
		type = "corpse",
		name = "kbve-orc-corpse-" .. id,
		icon = "__kbve-orc__/graphics/icon.png",
		icon_size = 64,
		icon_mipmaps = 4,
		flags = { "placeable-neutral", "placeable-off-grid", "not-repairable" },
		collision_box = { { 0, 0 }, { 0, 0 } },
		selection_box = { { -0.5, -0.5 }, { 0.5, 0.5 } },
		selectable_in_game = false,
		subgroup = "corpses",
		order = "c[corpse]-z[kbve-orc-" .. id .. "]",
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
	name = "kbve-orc-stagger",
	flags = { "not-on-map" },
	duration_in_ticks = 35,
	target_movement_modifier = 0.3,
	single_particle = true,
}

data:extend({
	orc,
	corpse_proto("Death_Armed",   { animation_speed = 0.4 }),
	corpse_proto("Death_Unarmed", { animation_speed = 0.4 }),
	corpse_proto("Hit_Armed",     { time_before_removed = 60, animation_speed = 1.1 }),
	corpse_proto("Hit_Block",     { time_before_removed = 60, animation_speed = 1.1 }),
	corpse_proto("Hit_Unarmed",   { time_before_removed = 60, animation_speed = 1.1 }),
	corpse_proto("Roar",          { time_before_removed = 120, animation_speed = 0.5 }),
	corpse_proto("Idle_Armed",    { time_before_removed = 60, animation_speed = 0.4 }),
	corpse_proto("Run_Armed",     { time_before_removed = 60, animation_speed = 0.7 }),
	corpse_proto("Attack_02",     { time_before_removed = 60, animation_speed = 0.5 }),
	corpse_proto("Attack_03",     { time_before_removed = 60, animation_speed = 0.5 }),
	stagger_sticker,
})
