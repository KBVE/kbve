--[[
  KBVE Spider — runtime hooks.

  - on_entity_damaged: spawn a directional Hit_<side> corpse + slowdown sticker
    so the spider visibly staggers when hit. Hit side is computed from the
    attacker's position relative to the spider's facing.
  - on_entity_died: randomly swap between Death1 and Death2 corpses for variety.
    The prototype's `corpse` field handles default spawn; we replace it 50% of
    the time with Death2 by spawning manually and skipping the default.
]]

local SPIDER = "kbve-spider"
local SPIDER_ALLY = "kbve-spider-ally"
local EGG_ENTITY = "kbve-spider-egg-entity"
local HATCH_TICKS = 60 * 30

local SPIDER_NAMES = { [SPIDER] = true, [SPIDER_ALLY] = true }

local HIT_CORPSES = {
	front = "kbve-spider-corpse-hit-front",
	back  = "kbve-spider-corpse-hit-back",
	left  = "kbve-spider-corpse-hit-left",
	right = "kbve-spider-corpse-hit-right",
}

local DEATH_CORPSES = {
	"kbve-spider-corpse-death1",
	"kbve-spider-corpse-death2",
}

local STAGGER_STICKER = "kbve-spider-stagger"
local SPRINT_STICKER = "kbve-spider-sprint"

-- How often to roll sprint checks across all active spiders. 180 ticks = 3s.
local SPRINT_TICK_INTERVAL = 180
-- Per-spider cooldown after a sprint fires.
local SPRINT_COOLDOWN_TICKS = 600
-- Chance per check (when pursuing + off cooldown) that sprint fires.
local SPRINT_CHANCE = 0.45

-- Flee threshold: when a spider drops below this health ratio after a hit,
-- switch its command to "flee from attacker" and slap a sprint sticker on
-- it for that adrenaline burst.
local FLEE_HEALTH_RATIO = 0.3

-- Nervous twitch: every NERVOUS_TICK_INTERVAL ticks, pick a few spiders at
-- random and overlay the Nervous animation as a one-shot corpse. Visual
-- only, no mechanical change.
local NERVOUS_TICK_INTERVAL = 900
local NERVOUS_PICK_COUNT = 3
local NERVOUS_CORPSE = "kbve-spider-corpse-nervous"

-- Map an attacker→spider vector + spider orientation into a hit side.
-- orientation: Factorio 0..1, 0 = north, 0.25 = east, 0.5 = south, 0.75 = west.
local function hit_side(spider_pos, attacker_pos, orientation)
	local dx = attacker_pos.x - spider_pos.x
	local dy = attacker_pos.y - spider_pos.y
	if dx == 0 and dy == 0 then return "front" end

	-- World-space angle of attacker from spider, in Factorio orientation units
	-- (0 = up/north, increasing clockwise).
	local world_orient = (math.atan2(dx, -dy) / (2 * math.pi)) % 1

	-- Spider's relative angle to the attacker: positive = right side, etc.
	local rel = (world_orient - orientation) % 1

	-- Quadrant split: front ±45°, right 45..135°, back 135..225°, left 225..315°.
	if rel < 0.125 or rel >= 0.875 then
		return "front"
	elseif rel < 0.375 then
		return "right"
	elseif rel < 0.625 then
		return "back"
	else
		return "left"
	end
end

script.on_event(defines.events.on_entity_damaged, function(event)
	local e = event.entity
	if not (e and e.valid) or not SPIDER_NAMES[e.name] then return end

	local cause = event.cause
	local attacker_pos = (cause and cause.valid) and cause.position or e.position
	local side = hit_side(e.position, attacker_pos, e.orientation or 0)
	local corpse_name = HIT_CORPSES[side]

	local surface = e.surface
	surface.create_entity{
		name = corpse_name,
		position = e.position,
		direction = e.direction,
	}
	surface.create_entity{
		name = STAGGER_STICKER,
		position = e.position,
		target = e,
		force = "neutral",
	}

	-- Flee on low health: switch command, fire sprint, mark as fleeing so we
	-- don't re-issue the command on every subsequent hit.
	storage.fleeing = storage.fleeing or {}
	local key = e.unit_number
	if cause and cause.valid and key and not storage.fleeing[key] then
		local health_ratio = e.get_health_ratio() or 1
		if health_ratio < FLEE_HEALTH_RATIO then
			storage.fleeing[key] = true
			e.set_command{
				type = defines.command.flee,
				from = cause,
				distraction = defines.distraction.none,
			}
			surface.create_entity{
				name = SPRINT_STICKER,
				position = e.position,
				target = e,
				force = "neutral",
			}
		end
	end
end)

script.on_event(defines.events.on_entity_died, function(event)
	local e = event.entity
	if not (e and e.valid) then return end

	if e.name == EGG_ENTITY then
		if storage.pending_eggs and e.unit_number then
			storage.pending_eggs[e.unit_number] = nil
		end
		return
	end

	if not SPIDER_NAMES[e.name] then return end

	-- The prototype already spawned a Death1 corpse via the `corpse` field.
	-- 50% of the time, layer a Death2 on top for visual variety.
	if math.random() < 0.5 then
		e.surface.create_entity{
			name = DEATH_CORPSES[2],
			position = e.position,
			direction = e.direction,
		}
	end

	if e.unit_number then
		if storage.sprint_cooldown then storage.sprint_cooldown[e.unit_number] = nil end
		if storage.fleeing then storage.fleeing[e.unit_number] = nil end
	end
end)

script.on_init(function()
	storage.sprint_cooldown = {}
	storage.fleeing = {}
	storage.pending_eggs = {}
end)

script.on_configuration_changed(function()
	storage.sprint_cooldown = storage.sprint_cooldown or {}
	storage.fleeing = storage.fleeing or {}
	storage.pending_eggs = storage.pending_eggs or {}
end)

local function track_egg(entity, tick)
	storage.pending_eggs = storage.pending_eggs or {}
	storage.pending_eggs[entity.unit_number] = {
		tick_due = tick + HATCH_TICKS,
		surface_index = entity.surface_index,
		position = { x = entity.position.x, y = entity.position.y },
		force = entity.force.name,
	}
end

local egg_filter = { { filter = "name", name = EGG_ENTITY } }

script.on_event(defines.events.on_built_entity, function(event)
	track_egg(event.entity, event.tick)
end, egg_filter)

script.on_event(defines.events.on_robot_built_entity, function(event)
	track_egg(event.entity, event.tick)
end, egg_filter)

local function drop_pending(entity)
	if entity.valid and entity.unit_number and storage.pending_eggs then
		storage.pending_eggs[entity.unit_number] = nil
	end
end

script.on_event(defines.events.on_player_mined_entity, function(event)
	drop_pending(event.entity)
end, egg_filter)

script.on_event(defines.events.on_robot_mined_entity, function(event)
	drop_pending(event.entity)
end, egg_filter)

script.on_nth_tick(60, function(event)
	if not storage.pending_eggs then return end
	for unit_number, info in pairs(storage.pending_eggs) do
		if event.tick >= info.tick_due then
			local surface = game.surfaces[info.surface_index]
			if surface then
				local eggs = surface.find_entities_filtered{
					name = EGG_ENTITY,
					position = info.position,
					radius = 0.5,
				}
				for _, egg in pairs(eggs) do
					if egg.valid then egg.destroy() end
				end
				surface.create_entity{
					name = SPIDER_ALLY,
					position = info.position,
					force = info.force,
				}
			end
			storage.pending_eggs[unit_number] = nil
		end
	end
end)

-- Sprint loop: every SPRINT_TICK_INTERVAL ticks, find spiders that are
-- chasing (in an attack group with a real command), roll RNG, apply the
-- sprint sticker. Per-unit cooldown prevents constant sprinting.
script.on_nth_tick(NERVOUS_TICK_INTERVAL, function(event)
	for _, surface in pairs(game.surfaces) do
		local spiders = surface.find_entities_filtered{ name = { SPIDER, SPIDER_ALLY } }
		local n = #spiders
		if n == 0 then goto continue end

		local picks = math.min(NERVOUS_PICK_COUNT, n)
		for _ = 1, picks do
			local s = spiders[math.random(1, n)]
			if s.valid then
				local in_group = false
				local ok, ug = pcall(function() return s.unit_group end)
				if ok and ug then in_group = true end
				if not in_group then
					surface.create_entity{
						name = NERVOUS_CORPSE,
						position = s.position,
						direction = s.direction,
					}
				end
			end
		end
		::continue::
	end
end)

script.on_nth_tick(SPRINT_TICK_INTERVAL, function(event)
	local cooldowns = storage.sprint_cooldown
	if not cooldowns then
		cooldowns = {}
		storage.sprint_cooldown = cooldowns
	end
	local tick = event.tick

	for _, surface in pairs(game.surfaces) do
		local spiders = surface.find_entities_filtered{ name = { SPIDER, SPIDER_ALLY } }
		for i = 1, #spiders do
			local s = spiders[i]
			if s.valid then
				local key = s.unit_number
				local ready_at = cooldowns[key] or 0
				if tick >= ready_at then
					local in_group = false
					local ok, ug = pcall(function() return s.unit_group end)
					if ok and ug then in_group = true end
					if in_group and math.random() < SPRINT_CHANCE then
						surface.create_entity{
							name = SPRINT_STICKER,
							position = s.position,
							target = s,
							force = "neutral",
						}
						cooldowns[key] = tick + SPRINT_COOLDOWN_TICKS
					end
				end
			end
		end
	end
end)
