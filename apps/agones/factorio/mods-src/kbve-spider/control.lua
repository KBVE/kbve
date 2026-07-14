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

-- Random pool used to title each newly hatched ally. Mixed homage / vibes —
-- 32 entries so a server can run plenty of allies before names repeat (and
-- repeats are fine; the name is cosmetic). The owner's username is appended
-- so two players in the same lobby can both have a "Webby" without confusion.
local ALLY_NAMES = {
	"Webby", "Charlotte", "Aragog", "Boris", "Fang", "Itsy", "Bitsy", "Spinny",
	"Webster", "Silk", "Jumper", "Pounce", "Skitter", "Crawler", "Lurker", "Spinneret",
	"Mosey", "Tippy", "Stitch", "Vector", "Stealth", "Glitch", "Marrow", "Husk",
	"Velvet", "Shade", "Echo", "Drift", "Quill", "Whisper", "Cinder", "Mote",
}
local ALLY_NAME_POOL_SIZE = #ALLY_NAMES

-- Forward declarations. Lua resolves bare names inside a function body at
-- COMPILE time: if a `local` of that name hasn't been declared YET in the
-- enclosing chunk, the reference is baked in as a global lookup and goes
-- nil at call time. on_entity_died (line ~188) needs to call clear_nametag
-- and backfill_nametags (line ~253) needs attach_nametag, both of which
-- would otherwise be defined much further down. Predeclaring the locals
-- here lets the later `function attach_nametag(...) … end` lines assign
-- to the EXISTING local slot instead of creating a fresh shadowing local.
local attach_nametag
local clear_nametag

-- Fixed cadences. Per-spider cooldown stays hardcoded so the tuning surface
-- is small; the runtime-global settings cover everything an admin would
-- reasonably want to flip mid-game.
local SPRINT_TICK_INTERVAL = 180
local SPRINT_COOLDOWN_TICKS = 600
local NERVOUS_TICK_INTERVAL = 900

-- Runtime mod settings cache. Per-tick lookups through `settings.global[X].value`
-- are cheap but not free; reading the same six knobs 60× per second adds up on
-- busy servers. We hydrate once at load and refresh via the runtime-changed
-- event so the cache stays in sync with admin tweaks without polling.
local cached_hatch_seconds = 30
local cached_sprint_chance = 0.45
local cached_flee_threshold = 0.3
local cached_nervous_pick = 3

local function rehydrate_runtime_settings()
	local s_hatch = settings.global["kbve-spider-hatch-seconds"]
	local s_sprint = settings.global["kbve-spider-sprint-chance"]
	local s_flee = settings.global["kbve-spider-flee-health-threshold"]
	local s_nervous = settings.global["kbve-spider-nervous-pick-count"]
	if s_hatch then cached_hatch_seconds = s_hatch.value end
	if s_sprint then cached_sprint_chance = s_sprint.value end
	if s_flee then cached_flee_threshold = s_flee.value end
	if s_nervous then cached_nervous_pick = s_nervous.value end
end

script.on_load(rehydrate_runtime_settings)
script.on_event(defines.events.on_runtime_mod_setting_changed, rehydrate_runtime_settings)
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

local spider_damaged_filter = {
	{ filter = "name", name = SPIDER },
	{ filter = "name", name = SPIDER_ALLY, mode = "or" },
}

script.on_event(defines.events.on_entity_damaged, function(event)
	local e = event.entity
	if not (e and e.valid) then return end

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
		if health_ratio < cached_flee_threshold then
			storage.fleeing[key] = true
			local commandable = e.commandable
			if commandable then
				commandable.set_command{
					type = defines.command.flee,
					from = cause,
					distraction = defines.distraction.none,
				}
			end
			surface.create_entity{
				name = SPRINT_STICKER,
				position = e.position,
				target = e,
				force = "neutral",
			}
		end
	end
end, spider_damaged_filter)

local spider_died_filter = {
	{ filter = "name", name = SPIDER },
	{ filter = "name", name = SPIDER_ALLY, mode = "or" },
	{ filter = "name", name = EGG_ENTITY, mode = "or" },
}

script.on_event(defines.events.on_entity_died, function(event)
	local e = event.entity
	if not (e and e.valid) then return end

	if e.name == EGG_ENTITY then
		if storage.pending_eggs and e.unit_number then
			storage.pending_eggs[e.unit_number] = nil
		end
		return
	end

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
			clear_nametag(e.unit_number)
			local ally_name = storage.ally_names and storage.ally_names[e.unit_number] or nil
			if storage.ally_names then storage.ally_names[e.unit_number] = nil end
			local owner_idx = storage.ally_owners and storage.ally_owners[e.unit_number]
			if storage.ally_owners then storage.ally_owners[e.unit_number] = nil end
			if owner_idx then
				local owner = game.players[owner_idx]
				if owner and owner.valid then
					local prefix = ally_name
						and string.format("[item=kbve-spider-egg] %s died at ", ally_name)
						or "[item=kbve-spider-egg] Your ally spider died at "
					owner.print(
						{ "", prefix,
							string.format("(%d, %d).", math.floor(e.position.x), math.floor(e.position.y)) },
						{ sound = defines.print_sound.use_player_settings }
					)
				end
			end
		end
	end
end, spider_died_filter)

-- Rebuild the ally registry from the world. Called on first init and on
-- mod-config changes so save games predating the registry pick it up. After
-- this, ally lookup is O(1) per unit_number via game.get_entity_by_unit_number.
local function rebuild_ally_registry(debug_print)
	local reg = {}
	local report = {}
	for _, surface in pairs(game.surfaces) do
		local allies = surface.find_entities_filtered{ name = SPIDER_ALLY }
		local count = 0
		for i = 1, #allies do
			local a = allies[i]
			if a.valid and a.unit_number then
				reg[a.unit_number] = a.surface_index
				count = count + 1
			end
		end
		report[#report + 1] = { name = surface.name, index = surface.index, count = count }
	end
	storage.allies = reg
	if debug_print then
		for _, r in ipairs(report) do
			debug_print(string.format(
				"  rebuild: surface=%s index=%d found %d kbve-spider-ally entities",
				r.name, r.index, r.count
			))
		end
		local n = 0
		for _ in pairs(reg) do n = n + 1 end
		debug_print(string.format("  rebuild: storage.allies now holds %d entries", n))
	end
end

script.on_init(function()
	storage.sprint_cooldown = {}
	storage.fleeing = {}
	storage.pending_eggs = {}
	storage.ally_owners = {}
	storage.allies = {}
	storage.ally_names = {}
	storage.ally_nametags = {}
	rehydrate_runtime_settings()
end)

local function backfill_nametags()
	storage.ally_names = storage.ally_names or {}
	storage.ally_nametags = storage.ally_nametags or {}
	for unit_number, _ in pairs(storage.allies or {}) do
		if not storage.ally_nametags[unit_number] then
			local ally = game.get_entity_by_unit_number(unit_number)
			if ally and ally.valid then
				local name = storage.ally_names[unit_number]
				if not name then
					name = ALLY_NAMES[math.random(1, ALLY_NAME_POOL_SIZE)]
					storage.ally_names[unit_number] = name
				end
				local owner_idx = storage.ally_owners and storage.ally_owners[unit_number]
				local owner = owner_idx and game.players[owner_idx] or nil
				attach_nametag(ally, name, owner)
			end
		end
	end
end

script.on_configuration_changed(function()
	storage.sprint_cooldown = storage.sprint_cooldown or {}
	storage.fleeing = storage.fleeing or {}
	storage.pending_eggs = storage.pending_eggs or {}
	storage.ally_owners = storage.ally_owners or {}
	storage.ally_names = storage.ally_names or {}
	storage.ally_nametags = storage.ally_nametags or {}
	rebuild_ally_registry()
	backfill_nametags()
	rehydrate_runtime_settings()
end)

-- on_configuration_changed only fires when the mod's version (or set of mods)
-- actually changes between save loads. During local development we overwrite
-- the same versioned zip repeatedly, so the registry stops getting rebuilt
-- and existing-world allies disappear from `storage.allies` — the follow loop
-- then short-circuits and the allies stand still. Rebuilding on
-- on_player_joined_game catches every reload regardless of version.
script.on_event(defines.events.on_player_joined_game, function()
	storage.allies = storage.allies or {}
	storage.ally_owners = storage.ally_owners or {}
	storage.ally_names = storage.ally_names or {}
	storage.ally_nametags = storage.ally_nametags or {}
	rebuild_ally_registry()
	backfill_nametags()
end)

commands.add_command(
	"spider-debug",
	"Prints kbve-spider runtime state for the calling player.",
	function(event)
		local player = game.players[event.player_index]
		if not player then return end
		local allies = storage.allies or {}
		local n = 0
		for _ in pairs(allies) do n = n + 1 end
		player.print(string.format("[kbve-spider] registry: %d ally entries", n))
		for unit_number, surface_index in pairs(allies) do
			local ally = game.get_entity_by_unit_number(unit_number)
			local name = storage.ally_names and storage.ally_names[unit_number] or "?"
			local owner_idx = storage.ally_owners and storage.ally_owners[unit_number] or "?"
			local valid = ally and ally.valid
			local cmdable = valid and ally.commandable or nil
			local has_cmd = cmdable and cmdable.has_command or false
			local pos_str = valid and string.format("(%d,%d)", math.floor(ally.position.x), math.floor(ally.position.y)) or "<gone>"
			player.print(string.format(
				"  unit=%d name=%s owner=%s surface=%d pos=%s valid=%s has_command=%s",
				unit_number, tostring(name), tostring(owner_idx), surface_index, pos_str, tostring(valid), tostring(has_cmd)
			))
		end

		local total_world = 0
		for _, surface in pairs(game.surfaces) do
			local found = surface.find_entities_filtered{ name = SPIDER_ALLY }
			for _, a in pairs(found) do
				if a.valid and a.unit_number then
					total_world = total_world + 1
					local in_reg = allies[a.unit_number] ~= nil
					local cmdable_a = a.commandable
					local has_cmd_a = cmdable_a and cmdable_a.has_command or false
					player.print(string.format(
						"  world: unit=%d surface=%s pos=(%d,%d) in_registry=%s force=%s has_command=%s",
						a.unit_number, surface.name,
						math.floor(a.position.x), math.floor(a.position.y),
						tostring(in_reg), a.force.name, tostring(has_cmd_a)
					))
				end
			end
		end
		player.print(string.format("[kbve-spider] world scan: %d kbve-spider-ally entities found", total_world))

		local pending = storage.pending_eggs or {}
		local pn = 0
		for _ in pairs(pending) do pn = pn + 1 end
		player.print(string.format("[kbve-spider] pending eggs: %d", pn))

		player.print("[kbve-spider] forcing rebuild_ally_registry()…")
		rebuild_ally_registry(function(line) player.print(line) end)
		local n2 = 0
		for _ in pairs(storage.allies or {}) do n2 = n2 + 1 end
		player.print(string.format("[kbve-spider] post-rebuild registry (re-read storage.allies): %d entries", n2))

		player.print(string.format("[kbve-spider] storage.allies type=%s, addr-ish=%s",
			type(storage.allies), tostring(storage.allies)))
	end
)

attach_nametag = function(ally, name, owner_player)
	if not (ally and ally.valid) then return end
	local label
	if owner_player and owner_player.valid then
		label = string.format("%s (%s)", name, owner_player.name)
	else
		label = name
	end
	local ok, ro = pcall(function()
		return rendering.draw_text{
			text = label,
			surface = ally.surface,
			target = { entity = ally, offset = { 0, -1.4 } },
			color = { r = 0.6, g = 0.85, b = 1, a = 1 },
			scale = 1.1,
			alignment = "center",
			use_rich_text = true,
			scale_with_zoom = false,
		}
	end)
	if ok and ro then
		storage.ally_nametags = storage.ally_nametags or {}
		storage.ally_nametags[ally.unit_number] = ro
	end
end

clear_nametag = function(unit_number)
	if not storage.ally_nametags then return end
	local ro = storage.ally_nametags[unit_number]
	if ro then
		if ro.valid then ro.destroy() end
		storage.ally_nametags[unit_number] = nil
	end
end

local function track_egg(entity, tick, placer_index)
	storage.pending_eggs = storage.pending_eggs or {}
	local hatch_ticks = math.floor(60 * cached_hatch_seconds)
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
	if info and info.render_id and info.render_id.valid then
		info.render_id.destroy()
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
					local owner_player = nil
					if info.placer_index then
						storage.ally_owners[ally.unit_number] = info.placer_index
						local player = game.players[info.placer_index]
						if player and player.valid then
							ally.last_user = player
							owner_player = player
						end
					end
					storage.ally_names = storage.ally_names or {}
					local name = ALLY_NAMES[math.random(1, ALLY_NAME_POOL_SIZE)]
					storage.ally_names[ally.unit_number] = name
					attach_nametag(ally, name, owner_player)
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
local FOLLOW_REST_DIST_SQ = 6 * 6    -- ally orbits within 6 tiles — pack-like, not heel-clinging
local FOLLOW_DESTINATION_RADIUS = 5  -- ally settles within 5 tiles of owner

-- Build a set of surface indices that have at least one connected player.
-- Sprint / follow / nervous AI runs only on these surfaces — there's no
-- value in ticking biters or follow commands on an empty planet, and the
-- lookup saves the full `surface.find_entities_filtered` scan on idle
-- worlds. Must be defined ABOVE follow_loop (which calls it) because Lua
-- resolves function references at call time against the enclosing chunk
-- scope; a forward `local` declaration would also work but moving the
-- whole definition up keeps the call site obvious.
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

-- Scans live allies per-surface every tick. The previous registry-driven
-- path used game.get_entity_by_unit_number(stored_unit_number) for O(1)
-- lookups, but until the "get-by-unit-number" prototype flag was added
-- that method returned nil for our entities, so the registry self-prune
-- wiped every entry and the follow loop's outer guard skipped the loop.
-- Even with the flag fix in place, the live-scan path is the more robust
-- driver (works regardless of registry state); the registry stays for
-- migration + nametag tracking but isn't load-bearing for follow.
local function follow_loop()
	local active = active_surface_indices()
	if not active then return end

	local owners = storage.ally_owners or {}
	local players_by_surface = nil

	for _, surface in pairs(game.surfaces) do
		if active[surface.index] then
			local allies = surface.find_entities_filtered{ name = SPIDER_ALLY }
			for i = 1, #allies do
				local ally = allies[i]
				if ally.valid then
					local owner = nil
					local owner_idx = owners[ally.unit_number]
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
							for j = 1, #bucket do
								local p = bucket[j]
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
						if d2 < FOLLOW_RADIUS_SQ then
							local commandable = ally.commandable
							if commandable then
								if d2 > FOLLOW_REST_DIST_SQ then
									local target_entity = owner.character
									if target_entity and target_entity.valid then
										commandable.set_command{
											type = defines.command.go_to_location,
											destination_entity = target_entity,
											distraction = defines.distraction.by_enemy,
											radius = FOLLOW_DESTINATION_RADIUS,
										}
									else
										commandable.set_command{
											type = defines.command.go_to_location,
											destination = { x = opos.x, y = opos.y },
											distraction = defines.distraction.by_enemy,
											radius = FOLLOW_DESTINATION_RADIUS,
										}
									end
								elseif not commandable.has_command then
									commandable.set_command{
										type = defines.command.wander,
										ticks_to_wait = 240,
										wander_in_group = false,
										distraction = defines.distraction.by_enemy,
									}
								end
							end
						end
					end
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
	if storage.pending_eggs and next(storage.pending_eggs) ~= nil then
		hatch_sweep(event.tick)
	end
	follow_loop()
end)

-- Idle wander pass for wild spiders. Skips allies (handled by the wander
-- branch inside follow_loop) and any spider already in an attack group.
-- Previously this loop ALSO spawned a Nervous corpse on a few random
-- spiders as a cosmetic twitch, but the corpse is the same 16-direction
-- model as the live spider — it overlapped exactly and read as a "ghost
-- spider that pops in for a second then vanishes". Removed; the Nervous
-- corpse prototype stays registered for any future scripted use.
script.on_nth_tick(NERVOUS_TICK_INTERVAL, function(event)
	local active = active_surface_indices()
	if not active then return end
	for _, surface in pairs(game.surfaces) do
		if active[surface.index] then
			local spiders = surface.find_entities_filtered{ name = SPIDER }
			for i = 1, #spiders do
				local s = spiders[i]
				if s.valid then
					local cmdable = s.commandable
					local in_group = cmdable and cmdable.parent_group ~= nil
					if not in_group and cmdable and not cmdable.has_command then
						cmdable.set_command{
							type = defines.command.wander,
							ticks_to_wait = 600,
							wander_in_group = false,
							distraction = defines.distraction.by_damage,
						}
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
						local cmdable = s.commandable
						local in_group = cmdable and cmdable.parent_group ~= nil
						if in_group and math.random() < cached_sprint_chance then
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
