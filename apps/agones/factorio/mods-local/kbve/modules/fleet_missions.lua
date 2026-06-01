local FleetState = require('modules.fleet_state')
local Coins = require('modules.coins')

local FleetMissions = {}

local TICK_INTERVAL = 60
local FUEL_LOW_BURN = 200000
local CARGO_FULL_RATIO = 0.9
local COMBAT_RETREAT_HP_RATIO = 0.30
local MINER_RETREAT_HP_RATIO = 0.50
local PATROL_ARRIVAL_RADIUS = 6
local SPAWN_REGROUP_POSITION = { x = 0, y = 0 }
local WARN_THROTTLE_TICKS = 60 * 60

local function has_aai_vehicles()
	return remote and remote.interfaces and remote.interfaces['aai-programmable-vehicles'] ~= nil
end

local function has_aai_zones()
	return remote and remote.interfaces and remote.interfaces['aai-zones'] ~= nil
end

local function aai_set(unit_id, args)
	args.unit_id = unit_id
	pcall(remote.call, 'aai-programmable-vehicles', 'set_unit_command', args)
end

local function aai_units()
	if not has_aai_vehicles() then return {} end
	local ok, r = pcall(remote.call, 'aai-programmable-vehicles', 'get_units')
	if not ok or type(r) ~= 'table' then return {} end
	return r
end

local function zone_count(force, surface_index, zone_name)
	if not has_aai_zones() then return 0 end
	local ok, r = pcall(remote.call, 'aai-zones', 'get_zone_count_of_type', {
		force = force,
		surface_index = surface_index,
		type = zone_name,
	})
	if not ok then return 0 end
	return r or 0
end

local function zone_tile_at(force, surface_index, zone_name, index)
	if not has_aai_zones() then return nil end
	local ok, r = pcall(remote.call, 'aai-zones', 'get_zone_by_index', {
		force = force,
		surface_index = surface_index,
		type = zone_name,
		index = index,
	})
	if not ok or type(r) ~= 'table' or not (r.x and r.y) then return nil end
	return r
end

local function pick_zone_tile_index(unit_index, n_units, zone_n)
	if zone_n <= 0 then return nil end
	return math.floor(((unit_index - 1) * zone_n) / math.max(1, n_units)) + 1
end

local function nearest_zone_position(player_force, surface_index, zone_name, from)
	local n = zone_count(player_force, surface_index, zone_name)
	if n <= 0 then return nil end
	local best, best_d = nil, math.huge
	local step = math.max(1, math.floor(n / 16))
	for i = 1, n, step do
		local t = zone_tile_at(player_force, surface_index, zone_name, i)
		if t then
			local dx = (t.x + 0.5) - from.x
			local dy = (t.y + 0.5) - from.y
			local d = dx * dx + dy * dy
			if d < best_d then
				best_d, best = d, { x = t.x + 0.5, y = t.y + 0.5 }
			end
		end
	end
	return best
end

local function nearest_highway_position(force, surface_index, from)
	local highway_zones = FleetState.zones_by_role('highway')
	if #highway_zones == 0 then return nil end
	local best, best_d = nil, math.huge
	for _, zone_name in ipairs(highway_zones) do
		local pos = nearest_zone_position(force, surface_index, zone_name, from)
		if pos then
			local dx = pos.x - from.x
			local dy = pos.y - from.y
			local d = dx * dx + dy * dy
			if d < best_d then best_d, best = d, pos end
		end
	end
	return best
end

local function plan_route(force, surface_index, from, destination)
	if not destination then return nil end
	local entry = nearest_highway_position(force, surface_index, from)
	if not entry then return { destination } end
	local exit_point = nearest_highway_position(force, surface_index, destination)
	local waypoints = { entry }
	if exit_point and (exit_point.x ~= entry.x or exit_point.y ~= entry.y) then
		table.insert(waypoints, exit_point)
	end
	table.insert(waypoints, destination)
	return waypoints
end

local function unit_fuel_low(u)
	if not (u.vehicle and u.vehicle.valid and u.vehicle.burner) then return false end
	if u.vehicle.burner.remaining_burning_fuel > FUEL_LOW_BURN then return false end
	if u.vehicle.burner.inventory and not u.vehicle.burner.inventory.is_empty() then return false end
	return true
end

local function unit_cargo_full(u)
	if not (u.vehicle and u.vehicle.valid) then return false end
	local inv = u.vehicle.get_inventory(defines.inventory.car_trunk)
	if not inv then return false end
	local count = #inv
	if count == 0 then return false end
	local used = 0
	for i = 1, count do
		if inv[i].valid_for_read then used = used + 1 end
	end
	return (used / count) >= CARGO_FULL_RATIO
end

local function ore_under(surface, position)
	local r = surface.find_entities_filtered({
		position = position,
		radius = 1,
		type = 'resource',
		limit = 1,
	})
	return r[1]
end

local function send_via_route(unit_id, force, surface_index, from, destination)
	local route = plan_route(force, surface_index, from, destination)
	if not (route and #route > 0) then return false end
	local st = FleetState.get_unit_state(unit_id) or {}
	st.route = route
	st.route_index = 1
	FleetState.get().unit_state[unit_id] = st
	local next_pos = route[1]
	aai_set(unit_id, { target_speed = 0.1 })
	aai_set(unit_id, { target_position = next_pos })
	return true
end

local function advance_route(unit_id, u)
	local st = FleetState.get_unit_state(unit_id)
	if not (st and st.route and st.route_index) then return false end
	if not (u.vehicle and u.vehicle.valid and u.target_position) then return false end
	local current = st.route[st.route_index]
	if not current then return false end
	local dx = current.x - u.vehicle.position.x
	local dy = current.y - u.vehicle.position.y
	if (dx * dx + dy * dy) > (PATROL_ARRIVAL_RADIUS * PATROL_ARRIVAL_RADIUS) then return false end
	st.route_index = st.route_index + 1
	local next_pos = st.route[st.route_index]
	if not next_pos then
		st.route = nil
		st.route_index = nil
		return false
	end
	aai_set(unit_id, { target_speed = 0.1 })
	aai_set(unit_id, { target_position = next_pos })
	return true
end

local function any_connected_player()
	for _, p in pairs(game.connected_players) do return p end
	return nil
end

local function remove_zone_tile_visually(force, surface, x, y)
	if not has_aai_zones() then return end
	local player = any_connected_player()
	if not player then return end
	local ok = pcall(script.raise_event, defines.events.on_player_alt_selected_area, {
		player_index = player.index,
		item = 'zone-planner',
		area = { left_top = { x = x, y = y }, right_bottom = { x = x + 1, y = y + 1 } },
		surface = surface,
		entities = {},
		tiles = {},
	})
	return ok
end

local function depleted_mark_and_remove(force, surface, zone_name, x, y)
	if FleetState.is_tile_depleted(zone_name, x, y) then return end
	FleetState.mark_tile_depleted(zone_name, x, y)
	remove_zone_tile_visually(force, surface, x, y)
end

local function pick_live_mining_tile(force, surface, zone_name, seed)
	local n = zone_count(force, surface.index, zone_name)
	if n <= 0 then return nil end
	for i = 1, math.min(n, 12) do
		local idx = ((seed + i) % n) + 1
		local tile = zone_tile_at(force, surface.index, zone_name, idx)
		if tile and not FleetState.is_tile_depleted(zone_name, tile.x, tile.y) then
			local center = { x = tile.x + 0.5, y = tile.y + 0.5 }
			if ore_under(surface, center) then
				return center, tile
			else
				depleted_mark_and_remove(force, surface, zone_name, tile.x, tile.y)
			end
		end
	end
	return nil
end

local function warn_no_zone(role)
	if not FleetState.warn_once('missing_' .. role, WARN_THROTTLE_TICKS) then return end
	game.print({
		'',
		'[KBVE Fleet] No zone tagged "', role,
		'" — tag one from the Zones tab so units can return on their own.',
	})
end

local function unit_hp_ratio(u)
	if not (u.vehicle and u.vehicle.valid) then return 1 end
	local ok, max_hp = pcall(function() return u.vehicle.prototype.max_health end)
	if not ok or not max_hp or max_hp <= 0 then return 1 end
	return u.vehicle.health / max_hp
end

local function dist2(a, b)
	local dx = a.x - b.x
	local dy = a.y - b.y
	return dx * dx + dy * dy
end

local function units_on_mission(mission)
	local out = {}
	local fleet = FleetState.get()
	local registered = aai_units()
	for unit_id, st in pairs(fleet.unit_state) do
		if st.mission == mission and registered[unit_id] then
			table.insert(out, registered[unit_id])
		end
	end
	return out
end

local function dispatch_unit_to_zone(unit, force, surface_index, zone_name, unit_index, n_units)
	local n = zone_count(force, surface_index, zone_name)
	if n <= 0 then return false end
	local idx = pick_zone_tile_index(unit_index, n_units, n)
	local tile = zone_tile_at(force, surface_index, zone_name, idx)
	if not tile then return false end
	local pos = { x = tile.x + 0.5, y = tile.y + 0.5 }
	aai_set(unit.unit_id, { target_speed = 0.1 })
	aai_set(unit.unit_id, { target_position = pos })
	return true
end

function FleetMissions.assign_mining(player, unit_ids, zone_name)
	if not has_aai_zones() then return 0 end
	local registered = aai_units()
	local valid_units = {}
	for _, uid in ipairs(unit_ids) do
		if registered[uid] then table.insert(valid_units, registered[uid]) end
	end
	for i, u in ipairs(valid_units) do
		FleetState.set_unit_mission(u.unit_id, 'mining', zone_name)
		dispatch_unit_to_zone(u, player.force, player.surface.index, zone_name, i, #valid_units)
	end
	return #valid_units
end

function FleetMissions.assign_defense(player, unit_ids, zone_name)
	return FleetMissions.assign_mining(player, unit_ids, zone_name)
		and FleetMissions._rebrand(unit_ids, 'defense', zone_name)
end

function FleetMissions._rebrand(unit_ids, mission, zone_name)
	for _, uid in ipairs(unit_ids) do
		FleetState.set_unit_mission(uid, mission, zone_name)
	end
	return #unit_ids
end

function FleetMissions.assign_combat(player, unit_ids, target_position)
	local registered = aai_units()
	local n = 0
	for _, uid in ipairs(unit_ids) do
		if registered[uid] then
			FleetState.set_unit_mission(uid, 'combat', nil)
			aai_set(uid, { target_speed = 0.1 })
			aai_set(uid, { target_position = target_position })
			n = n + 1
		end
	end
	return n
end

local function tick_mining()
	local fleet = FleetState.get()
	local registered = aai_units()
	for unit_id, st in pairs(fleet.unit_state) do
		if st.mission == 'mining' and registered[unit_id] then
			local u = registered[unit_id]
			if u.vehicle and u.vehicle.valid then
				if unit_hp_ratio(u) < MINER_RETREAT_HP_RATIO then
					local refuel = FleetState.zones_by_role('refuel')[1]
					local pos
					if refuel then
						pos = nearest_zone_position(u.vehicle.force, u.vehicle.surface.index, refuel, u.vehicle.position)
					else
						warn_no_zone('refuel')
						pos = SPAWN_REGROUP_POSITION
					end
					FleetState.set_unit_mission(unit_id, 'retreating', refuel)
					send_via_route(unit_id, u.vehicle.force, u.vehicle.surface.index, u.vehicle.position, pos)
				elseif unit_cargo_full(u) then
					local deposit = FleetState.zones_by_role('deposit')[1]
					if deposit then
						local pos = nearest_zone_position(u.vehicle.force, u.vehicle.surface.index, deposit, u.vehicle.position)
						if pos then
							FleetState.set_unit_mission(unit_id, 'depositing', deposit)
							send_via_route(unit_id, u.vehicle.force, u.vehicle.surface.index, u.vehicle.position, pos)
						end
					else
						warn_no_zone('deposit')
					end
				elseif unit_fuel_low(u) then
					local refuel = FleetState.zones_by_role('refuel')[1]
					if refuel then
						local pos = nearest_zone_position(u.vehicle.force, u.vehicle.surface.index, refuel, u.vehicle.position)
						if pos then
							FleetState.set_unit_mission(unit_id, 'refueling', refuel)
							send_via_route(unit_id, u.vehicle.force, u.vehicle.surface.index, u.vehicle.position, pos)
						end
					else
						warn_no_zone('refuel')
					end
				else
					if u.target_position and not ore_under(u.vehicle.surface, u.target_position) then
						depleted_mark_and_remove(u.vehicle.force, u.vehicle.surface, st.zone, u.target_position.x, u.target_position.y)
					end
					if u.target_position == nil or u.mode == 'passive' then
						local pos = pick_live_mining_tile(u.vehicle.force, u.vehicle.surface, st.zone, game.tick + unit_id)
						if pos then
							aai_set(unit_id, { target_speed = 0.1 })
							aai_set(unit_id, { target_position = pos })
						end
					end
				end
			end
		end
	end
end

local function tick_refueling()
	local fleet = FleetState.get()
	local registered = aai_units()
	for unit_id, st in pairs(fleet.unit_state) do
		if st.mission == 'refueling' and registered[unit_id] then
			local u = registered[unit_id]
			if u.vehicle and u.vehicle.valid then
				advance_route(unit_id, u)
				local has_fuel = u.vehicle.burner
					and u.vehicle.burner.inventory
					and not u.vehicle.burner.inventory.is_empty()
				if has_fuel then
					local prev = st.previous_mission
					local prev_zone = st.previous_zone
					if prev and prev_zone then
						FleetState.set_unit_mission(unit_id, prev, prev_zone)
					else
						FleetState.set_unit_mission(unit_id, nil, nil)
					end
				end
			end
		end
	end
end

local function trunk_contents(vehicle)
	if not (vehicle and vehicle.valid) then return {} end
	local inv = vehicle.get_inventory(defines.inventory.car_trunk)
	if not inv then return {} end
	local out = {}
	local raw = inv.get_contents()
	for _, item in pairs(raw) do
		if item.name and item.count then out[item.name] = (out[item.name] or 0) + item.count end
	end
	return out
end

local function tick_depositing()
	local fleet = FleetState.get()
	local registered = aai_units()
	for unit_id, st in pairs(fleet.unit_state) do
		if st.mission == 'depositing' and registered[unit_id] then
			local u = registered[unit_id]
			if u.vehicle and u.vehicle.valid then
				advance_route(unit_id, u)
				local now = trunk_contents(u.vehicle)
				local prev_snapshot = st.deposit_snapshot
				if prev_snapshot then
					for name, before in pairs(prev_snapshot) do
						local after = now[name] or 0
						if after < before then
							Coins.grant_deposit_reward(name, before - after)
						end
					end
				end
				st.deposit_snapshot = now

				if not unit_cargo_full(u) then
					st.deposit_snapshot = nil
					local prev = st.previous_mission
					local prev_zone = st.previous_zone
					if prev and prev_zone then
						FleetState.set_unit_mission(unit_id, prev, prev_zone)
					else
						FleetState.set_unit_mission(unit_id, nil, nil)
					end
				end
			end
		end
	end
end

local function tick_defense()
	local fleet = FleetState.get()
	local registered = aai_units()
	for unit_id, st in pairs(fleet.unit_state) do
		if st.mission == 'defense' and registered[unit_id] then
			local u = registered[unit_id]
			if u.vehicle and u.vehicle.valid then
				if unit_hp_ratio(u) < COMBAT_RETREAT_HP_RATIO then
					local refuel = FleetState.zones_by_role('refuel')[1]
					local pos
					if refuel then
						pos = nearest_zone_position(u.vehicle.force, u.vehicle.surface.index, refuel, u.vehicle.position)
					else
						warn_no_zone('refuel')
						pos = SPAWN_REGROUP_POSITION
					end
					FleetState.set_unit_mission(unit_id, 'retreating', refuel)
					send_via_route(unit_id, u.vehicle.force, u.vehicle.surface.index, u.vehicle.position, pos)
				elseif unit_fuel_low(u) then
					local refuel = FleetState.zones_by_role('refuel')[1]
					if refuel then
						local pos = nearest_zone_position(u.vehicle.force, u.vehicle.surface.index, refuel, u.vehicle.position)
						if pos then
							FleetState.set_unit_mission(unit_id, 'refueling', refuel)
							send_via_route(unit_id, u.vehicle.force, u.vehicle.surface.index, u.vehicle.position, pos)
						end
					else
						warn_no_zone('refuel')
					end
				else
					local arrived = u.target_position == nil
						or u.mode == 'passive'
						or dist2(u.vehicle.position, u.target_position) <= (PATROL_ARRIVAL_RADIUS * PATROL_ARRIVAL_RADIUS)
					if arrived then
						local n = zone_count(u.vehicle.force, u.vehicle.surface.index, st.zone)
						if n > 0 then
							local idx = ((game.tick + unit_id) % n) + 1
							local tile = zone_tile_at(u.vehicle.force, u.vehicle.surface.index, st.zone, idx)
							if tile then
								aai_set(unit_id, { target_speed = 0.1 })
								aai_set(unit_id, { target_position = { x = tile.x + 0.5, y = tile.y + 0.5 } })
							end
						end
					end
				end
			end
		end
	end
end

local function tick_combat()
	local fleet = FleetState.get()
	local registered = aai_units()
	for unit_id, st in pairs(fleet.unit_state) do
		if st.mission == 'combat' and registered[unit_id] then
			local u = registered[unit_id]
			if u.vehicle and u.vehicle.valid and unit_hp_ratio(u) < COMBAT_RETREAT_HP_RATIO then
				local refuel = FleetState.zones_by_role('refuel')[1]
				local pos
				if refuel then
					pos = nearest_zone_position(u.vehicle.force, u.vehicle.surface.index, refuel, u.vehicle.position)
				else
					warn_no_zone('refuel')
					pos = SPAWN_REGROUP_POSITION
				end
				FleetState.set_unit_mission(unit_id, 'retreating', refuel)
				send_via_route(unit_id, u.vehicle.force, u.vehicle.surface.index, u.vehicle.position, pos)
			end
		end
	end
end

local function tick_retreating()
	local fleet = FleetState.get()
	local registered = aai_units()
	for unit_id, st in pairs(fleet.unit_state) do
		if st.mission == 'retreating' and registered[unit_id] then
			local u = registered[unit_id]
			if u.vehicle and u.vehicle.valid then
				advance_route(unit_id, u)
				if unit_hp_ratio(u) > 0.95 then
					st.route = nil
					st.route_index = nil
					FleetState.set_unit_mission(unit_id, nil, nil)
				end
			end
		end
	end
end

function FleetMissions.on_tick(event)
	if (event.tick % TICK_INTERVAL) ~= 0 then return end
	if not has_aai_vehicles() then return end
	tick_mining()
	tick_refueling()
	tick_depositing()
	tick_defense()
	tick_combat()
	tick_retreating()
end

return FleetMissions
