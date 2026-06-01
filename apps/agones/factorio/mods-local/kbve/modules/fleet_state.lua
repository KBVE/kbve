local FleetState = {}

local ROLES = {
	mining = true,
	defense = true,
	highway = true,
	refuel = true,
	deposit = true,
}

function FleetState.init()
	storage.kbve = storage.kbve or {}
	storage.kbve.fleet = storage.kbve.fleet or {}
	local f = storage.kbve.fleet
	f.zone_roles = f.zone_roles or {}
	f.groups = f.groups or {}
	f.next_group_id = f.next_group_id or 1
	f.unit_state = f.unit_state or {}
end

function FleetState.get()
	FleetState.init()
	return storage.kbve.fleet
end

function FleetState.is_valid_role(role)
	return role == nil or role == '' or ROLES[role] == true
end

function FleetState.roles()
	return { 'mining', 'defense', 'highway', 'refuel', 'deposit' }
end

function FleetState.set_zone_role(zone_name, role)
	if not zone_name or zone_name == '' then return end
	if not FleetState.is_valid_role(role) then return end
	local f = FleetState.get()
	if role == nil or role == '' then
		f.zone_roles[zone_name] = nil
	else
		f.zone_roles[zone_name] = role
	end
end

function FleetState.get_zone_role(zone_name)
	return FleetState.get().zone_roles[zone_name]
end

function FleetState.zones_by_role(role)
	local out = {}
	for zone_name, r in pairs(FleetState.get().zone_roles) do
		if r == role then table.insert(out, zone_name) end
	end
	return out
end

function FleetState.create_group(name)
	local f = FleetState.get()
	local id = f.next_group_id
	f.next_group_id = id + 1
	f.groups[id] = {
		id = id,
		name = (name and name ~= '') and name or ('Squad ' .. id),
		unit_ids = {},
	}
	return id
end

function FleetState.rename_group(group_id, name)
	local g = FleetState.get().groups[group_id]
	if g and name and name ~= '' then g.name = name end
end

function FleetState.delete_group(group_id)
	local f = FleetState.get()
	f.groups[group_id] = nil
	for unit_id, st in pairs(f.unit_state) do
		if st.group_id == group_id then st.group_id = nil end
	end
end

function FleetState.assign_units_to_group(group_id, unit_ids)
	local f = FleetState.get()
	local g = f.groups[group_id]
	if not g then return end
	local seen = {}
	for _, uid in ipairs(g.unit_ids) do seen[uid] = true end
	for _, uid in ipairs(unit_ids) do
		if not seen[uid] then
			table.insert(g.unit_ids, uid)
			seen[uid] = true
		end
		f.unit_state[uid] = f.unit_state[uid] or {}
		f.unit_state[uid].group_id = group_id
	end
end

function FleetState.remove_unit_from_group(group_id, unit_id)
	local g = FleetState.get().groups[group_id]
	if not g then return end
	for i, uid in ipairs(g.unit_ids) do
		if uid == unit_id then
			table.remove(g.unit_ids, i)
			break
		end
	end
	local f = FleetState.get()
	if f.unit_state[unit_id] and f.unit_state[unit_id].group_id == group_id then
		f.unit_state[unit_id].group_id = nil
	end
end

function FleetState.groups_list()
	local out = {}
	for id, g in pairs(FleetState.get().groups) do
		table.insert(out, g)
	end
	table.sort(out, function(a, b) return a.id < b.id end)
	return out
end

function FleetState.set_unit_mission(unit_id, mission, zone_name)
	local f = FleetState.get()
	f.unit_state[unit_id] = f.unit_state[unit_id] or {}
	local st = f.unit_state[unit_id]
	if st.mission ~= mission then
		st.previous_mission = st.mission
		st.previous_zone = st.zone
	end
	st.mission = mission
	st.zone = zone_name
	st.last_tick = game.tick
end

function FleetState.get_unit_state(unit_id)
	return FleetState.get().unit_state[unit_id]
end

function FleetState.prune()
	local f = FleetState.get()
	local valid_ids = {}
	if remote and remote.interfaces and remote.interfaces['aai-programmable-vehicles'] then
		local ok, units = pcall(remote.call, 'aai-programmable-vehicles', 'get_units')
		if ok and type(units) == 'table' then
			for id, _ in pairs(units) do valid_ids[id] = true end
		end
	end
	for uid, _ in pairs(f.unit_state) do
		if not valid_ids[uid] then f.unit_state[uid] = nil end
	end
	for _, g in pairs(f.groups) do
		local kept = {}
		for _, uid in ipairs(g.unit_ids) do
			if valid_ids[uid] then table.insert(kept, uid) end
		end
		g.unit_ids = kept
	end
end

return FleetState
