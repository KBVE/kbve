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

-- Fixed cadences. Per-spider cooldown stays hardcoded so the tuning surface
-- is small; the runtime-global settings cover everything an admin would
-- reasonably want to flip mid-game.
local SPRINT_TICK_INTERVAL = 180
local SPRINT_COOLDOWN_TICKS = 600
local NERVOUS_TICK_INTERVAL = 900

local function setting(name, default)
	local s = settings.global[name]
	if not s then return default end
	return s.value
end
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
		if health_ratio < setting("kbve-spider-flee-health-threshold", 0.3) then
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

		if e.name == SPIDER_ALLY then
			if storage.allies then storage.allies[e.unit_number] = nil end
			local owner_idx = storage.ally_owners and storage.ally_owners[e.unit_number]
			if storage.ally_owners then storage.ally_owners[e.unit_number] = nil end
			if owner_idx then
				local owner = game.players[owner_idx]
				if owner and owner.valid then
					owner.print(
						{ "", "[item=kbve-spider-egg] Your ally spider died at ",
							string.format("(%d, %d).", math.floor(e.position.x), math.floor(e.position.y)) },
						{ sound = defines.print_sound.use_player_settings }
					)
				end
			end
		end
	end
end)

-- Rebuild the ally registry from the world. Called on first init and on
-- mod-config changes so save games predating the registry pick it up. After
-- this, ally lookup is O(1) per unit_number via game.get_entity_by_unit_number.
local function rebuild_ally_registry()
	local reg = {}
	for _, surface in pairs(game.surfaces) do
		local allies = surface.find_entities_filtered{ name = SPIDER_ALLY }
		for i = 1, #allies do
			local a = allies[i]
			if a.valid and a.unit_number then
				reg[a.unit_number] = a.surface_index
			end
		end
	end
	storage.allies = reg
end

script.on_init(function()
	storage.sprint_cooldown = {}
	storage.fleeing = {}
	storage.pending_eggs = {}
	storage.ally_owners = {}
	storage.allies = {}
end)

script.on_configuration_changed(function()
	storage.sprint_cooldown = storage.sprint_cooldown or {}
	storage.fleeing = storage.fleeing or {}
	storage.pending_eggs = storage.pending_eggs or {}
	storage.ally_owners = storage.ally_owners or {}
	if not storage.allies then
		rebuild_ally_registry()
	end
end)

local function track_egg(entity, tick, placer_index)
	storage.pending_eggs = storage.pending_eggs or {}
	local hatch_ticks = math.floor(60 * setting("kbve-spider-hatch-seconds", 30))
	local render_id = nil
	local ok, ro = pcall(function()
		return rendering.draw_text{
			text = string.format("Hatching… %ds", math.ceil(hatch_ticks / 60)),
			surface = entity.surface,
			target = { entity = entity, offset = { 0, -0.9 } },
			color = { r = 1, g = 0.9, b = 0.4 },
			scale = 1.2,
			alignment = "center",
			scale_with_zoom = false,
		}
	end)
	if ok and ro then render_id = ro end
	storage.pending_eggs[entity.unit_number] = {
		tick_due = tick + hatch_ticks,
		surface_index = entity.surface_index,
		position = { x = entity.position.x, y = entity.position.y },
		force = entity.force.name,
		placer_index = placer_index,
		render_id = render_id,
	}
end

local egg_filter = { { filter = "name", name = EGG_ENTITY } }

script.on_event(defines.events.on_built_entity, function(event)
	track_egg(event.entity, event.tick, event.player_index)
end, egg_filter)

script.on_event(defines.events.on_robot_built_entity, function(event)
	local robot = event.robot
	local owner_idx = nil
	if robot and robot.valid and robot.last_user then
		owner_idx = robot.last_user.index
	end
	track_egg(event.entity, event.tick, owner_idx)
end, egg_filter)

local function clear_render(info)
	if info and info.render_id then
		pcall(function()
			if info.render_id.valid then info.render_id.destroy() end
		end)
	end
end

local function drop_pending(entity)
	if entity.valid and entity.unit_number and storage.pending_eggs then
		local info = storage.pending_eggs[entity.unit_number]
		clear_render(info)
		storage.pending_eggs[entity.unit_number] = nil
	end
end

script.on_event(defines.events.on_player_mined_entity, function(event)
	drop_pending(event.entity)
end, egg_filter)

script.on_event(defines.events.on_robot_mined_entity, function(event)
	drop_pending(event.entity)
end, egg_filter)

local function hatch_sweep(tick)
	if not storage.pending_eggs then return end
	storage.ally_owners = storage.ally_owners or {}
	for unit_number, info in pairs(storage.pending_eggs) do
		if tick >= info.tick_due then
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
				clear_render(info)
				local ally = surface.create_entity{
					name = SPIDER_ALLY,
					position = info.position,
					force = info.force,
				}
				if ally and ally.valid then
					storage.allies = storage.allies or {}
					storage.allies[ally.unit_number] = ally.surface_index
					if info.placer_index then
						storage.ally_owners[ally.unit_number] = info.placer_index
						local player = game.players[info.placer_index]
						if player and player.valid then
							ally.last_user = player
						end
					end
					surface.create_entity{
						name = "explosion",
						position = info.position,
					}
				end
			end
			storage.pending_eggs[unit_number] = nil
		else
			local remaining = math.max(0, math.ceil((info.tick_due - tick) / 60))
			if info.render_id and info.render_id.valid then
				info.render_id.text = string.format("Hatching… %ds", remaining)
			end
		end
	end
end

-- Follow loop: re-issued every second so the ally tracks the owner smoothly
-- even when the owner is moving. We re-issue UNCONDITIONALLY (modulo the
-- "already on top of owner" early-out) because once the unit reaches
-- `radius` of a go_to_location target it idles, and Factorio's player-force
-- unit AI does not pick a new destination on its own. The teleport-far cap
-- prevents the loop from spamming commands for allies the owner abandoned
-- on a different chunk; once back within range the loop picks up again.
local FOLLOW_TICK_INTERVAL = 60
local FOLLOW_RADIUS_SQ = 128 * 128   -- keep tracking up to ~128 tiles away
local FOLLOW_REST_DIST_SQ = 2 * 2    -- already on top of owner → don't churn
local FOLLOW_DESTINATION_RADIUS = 2  -- ally settles within 2 tiles of owner

-- Iterates `storage.allies` (maintained at hatch + death + on_init/
-- on_configuration_changed rebuild) instead of calling
-- `surface.find_entities_filtered{name = SPIDER_ALLY}` per surface every
-- second. Entity lookups are O(1) via `game.get_entity_by_unit_number`.
-- The per-tick player→surface bucket is built lazily — only when an ally
-- has no recorded owner — so the common case (everyone has a live
-- placer) skips the connected-players scan entirely.
local function follow_loop()
	local allies = storage.allies
	if not allies or next(allies) == nil then return end

	local owners = storage.ally_owners or {}
	local players_by_surface = nil

	for unit_number, _ in pairs(allies) do
		local ally = game.get_entity_by_unit_number(unit_number)
		if not (ally and ally.valid) then
			allies[unit_number] = nil
		else
			local owner = nil
			local owner_idx = owners[unit_number]
			if owner_idx then
				local p = game.players[owner_idx]
				if p and p.valid and p.connected and p.surface_index == ally.surface_index then
					owner = p
				end
			end
			if not owner then
				if players_by_surface == nil then
					players_by_surface = {}
					for _, p in pairs(game.connected_players) do
						if p.valid then
							local si = p.surface_index
							local bucket = players_by_surface[si]
							if not bucket then
								bucket = {}
								players_by_surface[si] = bucket
							end
							bucket[#bucket + 1] = p
						end
					end
				end
				local bucket = players_by_surface[ally.surface_index]
				if bucket then
					local nearest, nearest_d = nil, math.huge
					local apos = ally.position
					local ax, ay = apos.x, apos.y
					local force = ally.force
					for i = 1, #bucket do
						local p = bucket[i]
						if p.force == force then
							local ppos = p.position
							local dx = ppos.x - ax
							local dy = ppos.y - ay
							local d = dx * dx + dy * dy
							if d < nearest_d then
								nearest_d = d
								nearest = p
							end
						end
					end
					owner = nearest
				end
			end
			if owner then
				local opos = owner.position
				local apos = ally.position
				local dx = opos.x - apos.x
				local dy = opos.y - apos.y
				local d2 = dx * dx + dy * dy
				if d2 > FOLLOW_REST_DIST_SQ and d2 < FOLLOW_RADIUS_SQ then
					pcall(function()
						ally.set_command{
							type = defines.command.go_to_location,
							destination = { x = opos.x, y = opos.y },
							-- by_damage = ally engages only when hit, not at every
							-- ambient enemy. Keeps the follow tether intact while
							-- the owner is just walking past biter spawners.
							distraction = defines.distraction.by_damage,
							radius = FOLLOW_DESTINATION_RADIUS,
							pathfind_flags = { allow_destroy_friendly_entities = false },
						}
					end)
				end
			end
		end
	end
end

-- One 1 Hz handler. Factorio's script.on_nth_tick(n, fn) only allows a
-- single callback per period — registering twice silently replaces the
-- first registration, which previously stranded the hatch sweep when the
-- follow loop was bumped to 60-tick cadence. Bundling both call sites
-- inside one function keeps the behavior + saves the overhead of a second
-- per-tick dispatch.
script.on_nth_tick(FOLLOW_TICK_INTERVAL, function(event)
	hatch_sweep(event.tick)
	follow_loop()
end)

-- Build a set of surface indices that have at least one connected player.
-- Sprint + nervous AI runs only on these surfaces — there's no value in
-- ticking biters or nervous twitches on an empty planet, and the lookup
-- saves the full `surface.find_entities_filtered` scan on idle worlds.
local function active_surface_indices()
	local set = nil
	for _, p in pairs(game.connected_players) do
		if p.valid then
			set = set or {}
			set[p.surface_index] = true
		end
	end
	return set
end

script.on_nth_tick(NERVOUS_TICK_INTERVAL, function(event)
	local active = active_surface_indices()
	if not active then return end
	for _, surface in pairs(game.surfaces) do
		if active[surface.index] then
			local spiders = surface.find_entities_filtered{ name = { SPIDER, SPIDER_ALLY } }
			local n = #spiders
			if n > 0 then
				local picks = math.min(setting("kbve-spider-nervous-pick-count", 3), n)
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
			end
		end
	end
end)

script.on_nth_tick(SPRINT_TICK_INTERVAL, function(event)
	local active = active_surface_indices()
	if not active then return end

	local cooldowns = storage.sprint_cooldown
	if not cooldowns then
		cooldowns = {}
		storage.sprint_cooldown = cooldowns
	end
	local tick = event.tick

	for _, surface in pairs(game.surfaces) do
		if active[surface.index] then
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
						if in_group and math.random() < setting("kbve-spider-sprint-chance", 0.45) then
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
	end
end)
