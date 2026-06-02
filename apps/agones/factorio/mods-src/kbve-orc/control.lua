--[[
  KBVE Orc — runtime hooks.

  Orc faction is a dedicated `kbve-orcs` Lua force created on init. Each player
  force carries a reputation score in `storage.orc_rep[force_index]` clamped to
  [-100, +100]. Tier thresholds (Hostile / Wary / Neutral / Friendly / Revered)
  drive `force:set_cease_fire("kbve-orcs", bool)` so orc AI behavior follows the
  rep ladder without any pollution / biter-style triggers.

  Mechanics:
    - on_entity_died: kill an orc → killer's force loses 5 rep, tier resyncs.
    - on_entity_damaged: hit reaction sticker + corpse, like spider.
    - 1 Hz gift sweep: scan for whitelisted item-on-ground entities within
      `kbve-orc-gift-scan-radius` of any orc; consume the stack and credit the
      `last_user` (or any nearby player) force with the item's gift value.
    - Daily decay: every 60 min real time (216000 ticks at 60Hz) decay each
      force's rep one notch toward 0.
]]

local ORC = "kbve-orc"
local ORC_FORCE = "kbve-orcs"
local TRIBUTE_ITEM = "kbve-orc-tribute"
local STAGGER_STICKER = "kbve-orc-stagger"
local ROAR_CORPSE = "kbve-orc-corpse-roar"

local HIT_CORPSES = {
	armed   = "kbve-orc-corpse-hit-armed",
	block   = "kbve-orc-corpse-hit-block",
	unarmed = "kbve-orc-corpse-hit-unarmed",
}

local DEATH_CORPSES = {
	"kbve-orc-corpse-death-armed",
	"kbve-orc-corpse-death-unarmed",
}

local GIFT_VALUES = {
	["raw-fish"]       = 3,
	["coal"]           = 1,
	["iron-plate"]     = 2,
	["copper-plate"]   = 2,
	["steel-plate"]    = 5,
	[TRIBUTE_ITEM]     = 15,
}

local REP_MIN = -100
local REP_MAX = 100

local TIER_HOSTILE  = 1
local TIER_WARY     = 2
local TIER_NEUTRAL  = 3
local TIER_FRIENDLY = 4
local TIER_REVERED  = 5

local GIFT_SWEEP_INTERVAL = 60          -- 1 Hz
local DAILY_DECAY_INTERVAL = 60 * 60 * 60 -- 60 min real-time

local cached_kill_penalty = 5
local cached_daily_decay = 5
local cached_tier_hostile_max = -50
local cached_tier_wary_max = -10
local cached_tier_neutral_max = 9
local cached_tier_friendly_max = 49
local cached_gift_radius = 4

local function rehydrate_runtime_settings()
	local s = settings.global
	if s["kbve-orc-rep-kill-penalty"]   then cached_kill_penalty   = s["kbve-orc-rep-kill-penalty"].value end
	if s["kbve-orc-rep-daily-decay"]    then cached_daily_decay    = s["kbve-orc-rep-daily-decay"].value end
	if s["kbve-orc-tier-hostile-max"]   then cached_tier_hostile_max  = s["kbve-orc-tier-hostile-max"].value end
	if s["kbve-orc-tier-wary-max"]      then cached_tier_wary_max     = s["kbve-orc-tier-wary-max"].value end
	if s["kbve-orc-tier-neutral-max"]   then cached_tier_neutral_max  = s["kbve-orc-tier-neutral-max"].value end
	if s["kbve-orc-tier-friendly-max"]  then cached_tier_friendly_max = s["kbve-orc-tier-friendly-max"].value end
	if s["kbve-orc-gift-scan-radius"]   then cached_gift_radius    = s["kbve-orc-gift-scan-radius"].value end
end

local function tier_for(rep)
	if rep <= cached_tier_hostile_max then return TIER_HOSTILE end
	if rep <= cached_tier_wary_max then return TIER_WARY end
	if rep <= cached_tier_neutral_max then return TIER_NEUTRAL end
	if rep <= cached_tier_friendly_max then return TIER_FRIENDLY end
	return TIER_REVERED
end

local function sync_force_stance(player_force)
	if not (player_force and player_force.valid) then return end
	local orc_force = game.forces[ORC_FORCE]
	if not (orc_force and orc_force.valid) then return end
	if player_force.name == ORC_FORCE then return end

	local rep = (storage.orc_rep or {})[player_force.index] or 0
	local tier = tier_for(rep)
	local peaceful = tier >= TIER_NEUTRAL

	-- Cease-fire is the primary lever: hostile / wary tiers leave orcs free to
	-- attack on sight (or once provoked, in the wary case); neutral+ keeps the
	-- orc AI passive toward this player force.
	pcall(function()
		player_force.set_cease_fire(ORC_FORCE, peaceful)
		orc_force.set_cease_fire(player_force.name, peaceful)
	end)
end

local function sync_all_forces()
	for _, f in pairs(game.forces) do
		if f.valid and f.name ~= ORC_FORCE then
			sync_force_stance(f)
		end
	end
end

local function adjust_rep(player_force, delta)
	if not (player_force and player_force.valid) then return end
	if player_force.name == ORC_FORCE then return end
	storage.orc_rep = storage.orc_rep or {}
	local prev = storage.orc_rep[player_force.index] or 0
	local next_val = prev + delta
	if next_val < REP_MIN then next_val = REP_MIN end
	if next_val > REP_MAX then next_val = REP_MAX end
	storage.orc_rep[player_force.index] = next_val
	if tier_for(prev) ~= tier_for(next_val) then
		sync_force_stance(player_force)
		-- Surface tier changes to the player force as a chat ping. Cheap signal
		-- so players notice the consequence of their last kill / gift without
		-- needing a GUI yet.
		local tier_label = ({
			[TIER_HOSTILE]  = "Hated",
			[TIER_WARY]     = "Wary",
			[TIER_NEUTRAL]  = "Neutral",
			[TIER_FRIENDLY] = "Friendly",
			[TIER_REVERED]  = "Revered",
		})[tier_for(next_val)]
		player_force.print(
			{ "", "[item=" .. TRIBUTE_ITEM .. "] Orc reputation: ",
				tostring(next_val), " (", tier_label, ")" },
			{ sound = defines.print_sound.use_player_settings }
		)
	end
end

local function ensure_orc_force()
	if not game.forces[ORC_FORCE] then
		game.create_force(ORC_FORCE)
	end
end

script.on_init(function()
	storage.orc_rep = {}
	ensure_orc_force()
	rehydrate_runtime_settings()
	sync_all_forces()
end)

script.on_load(rehydrate_runtime_settings)
script.on_event(defines.events.on_runtime_mod_setting_changed, function()
	rehydrate_runtime_settings()
	sync_all_forces()
end)

script.on_configuration_changed(function()
	storage.orc_rep = storage.orc_rep or {}
	ensure_orc_force()
	rehydrate_runtime_settings()
	sync_all_forces()
end)

script.on_event(defines.events.on_force_created, function(event)
	if event.force.name == ORC_FORCE then return end
	sync_force_stance(event.force)
end)

-- ----- Hit reaction -----

local orc_damaged_filter = { { filter = "name", name = ORC } }

local function pick_hit_corpse(orc_entity)
	-- Future: pick from {armed, block, unarmed} based on orc state. For now,
	-- "armed" by default since the entity has no block/unarmed state machine.
	return HIT_CORPSES.armed
end

script.on_event(defines.events.on_entity_damaged, function(event)
	local e = event.entity
	if not (e and e.valid) then return end
	local surface = e.surface
	surface.create_entity{
		name = pick_hit_corpse(e),
		position = e.position,
		direction = e.direction,
	}
	surface.create_entity{
		name = STAGGER_STICKER,
		position = e.position,
		target = e,
		force = "neutral",
	}
end, orc_damaged_filter)

-- ----- Death → rep penalty -----

local orc_died_filter = { { filter = "name", name = ORC } }

script.on_event(defines.events.on_entity_died, function(event)
	local e = event.entity
	if not (e and e.valid) then return end

	-- Visual: 50% chance to layer a second death corpse for variety.
	if math.random() < 0.5 then
		e.surface.create_entity{
			name = DEATH_CORPSES[2],
			position = e.position,
			direction = e.direction,
		}
	end

	-- Rep penalty applies only to player forces. Biters killing each other,
	-- environmental damage, etc. don't move the needle.
	local cause = event.cause
	local killer_force = cause and cause.valid and cause.force or nil
	if killer_force and killer_force.valid and killer_force.name ~= ORC_FORCE then
		-- Some causes (player gun) have force == player force; biter cross-kill
		-- has force == "enemy". Only credit the kill to actual player forces.
		if game.forces[killer_force.name] and not (killer_force.name == "enemy" or killer_force.name == "neutral") then
			adjust_rep(killer_force, -cached_kill_penalty)
		end
	end
end, orc_died_filter)

-- ----- Gift sweep -----

local function consume_gift(orc_entity, item_entity)
	if not (orc_entity and orc_entity.valid and item_entity and item_entity.valid) then return end
	local stack = item_entity.stack
	if not (stack and stack.valid and stack.valid_for_read) then return end

	local item_name = stack.name
	local value_per = GIFT_VALUES[item_name]
	if not value_per then return end

	local count = stack.count
	local total_rep = value_per * count

	-- Credit goes to the item's last_user (the dropper). Fall back to the
	-- nearest connected player on the same surface if last_user is unset.
	local crediting_player = item_entity.last_user
	if not (crediting_player and crediting_player.valid) then
		local nearest, nearest_d = nil, math.huge
		for _, p in pairs(game.connected_players) do
			if p.valid and p.surface_index == orc_entity.surface_index then
				local pp = p.position
				local op = orc_entity.position
				local dx, dy = pp.x - op.x, pp.y - op.y
				local d = dx * dx + dy * dy
				if d < nearest_d then nearest_d = d; nearest = p end
			end
		end
		crediting_player = nearest
	end

	if crediting_player and crediting_player.valid then
		adjust_rep(crediting_player.force, total_rep)
	end

	-- Play the Roar anim corpse at the orc's spot as a "thank you" cue, then
	-- destroy the dropped item entity.
	orc_entity.surface.create_entity{
		name = ROAR_CORPSE,
		position = orc_entity.position,
		direction = orc_entity.direction,
	}
	item_entity.destroy()
end

local function gift_sweep()
	local orc_force = game.forces[ORC_FORCE]
	if not (orc_force and orc_force.valid) then return end

	-- Iterate connected-player surfaces only — no point sweeping empty planets.
	local active_surfaces = {}
	for _, p in pairs(game.connected_players) do
		if p.valid then active_surfaces[p.surface_index] = true end
	end
	if next(active_surfaces) == nil then return end

	for si, _ in pairs(active_surfaces) do
		local surface = game.surfaces[si]
		if surface then
			local orcs = surface.find_entities_filtered{ name = ORC }
			for i = 1, #orcs do
				local orc = orcs[i]
				if orc.valid then
					local items = surface.find_entities_filtered{
						type = "item-entity",
						position = orc.position,
						radius = cached_gift_radius,
					}
					for j = 1, #items do
						consume_gift(orc, items[j])
					end
				end
			end
		end
	end
end

-- ----- Daily decay -----

local function daily_decay()
	if not storage.orc_rep then return end
	local d = cached_daily_decay
	if d <= 0 then return end
	for force_idx, rep in pairs(storage.orc_rep) do
		if rep > 0 then
			local nv = rep - d
			if nv < 0 then nv = 0 end
			storage.orc_rep[force_idx] = nv
		elseif rep < 0 then
			local nv = rep + d
			if nv > 0 then nv = 0 end
			storage.orc_rep[force_idx] = nv
		end
	end
	-- Decay can push reps across tier thresholds; resync once.
	sync_all_forces()
end

-- One bundled 1 Hz handler. on_nth_tick(N, fn) only keeps the latest callback
-- per period, so anything that wants 1 Hz cadence must live here.
script.on_nth_tick(GIFT_SWEEP_INTERVAL, function(event)
	gift_sweep()
	if (event.tick % DAILY_DECAY_INTERVAL) == 0 then
		daily_decay()
	end
end)
