local FleetState = require('modules.fleet_state')

local FleetMissions = {}

local TICK_INTERVAL = 60
local FUEL_LOW_BURN = 200000
local CARGO_FULL_RATIO = 0.9

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
				if unit_fuel_low(u) then
					local refuel = FleetState.zones_by_role('refuel')[1]
					if refuel then
						local pos = nearest_zone_position(u.vehicle.force, u.vehicle.surface.index, refuel, u.vehicle.position)
						if pos then
							FleetState.set_unit_mission(unit_id, 'refueling', refuel)
							aai_set(unit_id, { target_speed = 0.1 })
							aai_set(unit_id, { target_position = pos })
						end
					end
				elseif u.target_position == nil or u.mode == 'passive' then
					local n = zone_count(u.vehicle.force, u.vehicle.surface.index, st.zone)
					if n > 0 then
						for i = 1, math.min(n, 8) do
							local idx = ((game.tick + unit_id + i) % n) + 1
							local tile = zone_tile_at(u.vehicle.force, u.vehicle.surface.index, st.zone, idx)
							if tile and ore_under(u.vehicle.surface, { x = tile.x + 0.5, y = tile.y + 0.5 }) then
								aai_set(unit_id, { target_speed = 0.1 })
								aai_set(unit_id, { target_position = { x = tile.x + 0.5, y = tile.y + 0.5 } })
								break
							end
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

local function tick_depositing()
	local fleet = FleetState.get()
	local registered = aai_units()
	for unit_id, st in pairs(fleet.unit_state) do
		if st.mission == 'depositing' and registered[unit_id] then
			local u = registered[unit_id]
			if u.vehicle and u.vehicle.valid then
				if not unit_cargo_full(u) then
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

function FleetMissions.on_tick(event)
	if (event.tick % TICK_INTERVAL) ~= 0 then return end
	if not has_aai_vehicles() then return end
	tick_mining()
	tick_refueling()
	tick_depositing()
end

return FleetMissions
