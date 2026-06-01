local FleetState = require('modules.fleet_state')
local FleetMissions = require('modules.fleet_missions')

local FleetGui = {}

local GUI_NAME = 'kbve_fleet'
local TABBED_NAME = 'kbve_fleet_tabbed'
local VEHICLES_TAB = 'kbve_fleet_vehicles'
local ZONES_TAB = 'kbve_fleet_zones'
local DISPATCH_TAB = 'kbve_fleet_dispatch'
local MINING_TAB = 'kbve_fleet_mining'
local DEFENSE_TAB = 'kbve_fleet_defense'
local COMBAT_TAB = 'kbve_fleet_combat'
local GROUPS_TAB = 'kbve_fleet_groups'
local CLOSE_NAME = 'kbve_fleet_close'
local REFRESH_NAME = 'kbve_fleet_refresh'
local SYNC_NAME = 'kbve_fleet_sync'
local DISPATCH_PREFIX = 'kbve_fleet_dispatch_'
local TYPE_DROPDOWN = 'kbve_fleet_type'
local ZONE_DROPDOWN = 'kbve_fleet_zone'
local DISPATCH_BUTTON = 'kbve_fleet_dispatch_btn'
local ZONE_ROLE_PREFIX = 'kbve_fleet_zonerole_'
local MINING_DISPATCH = 'kbve_fleet_mining_dispatch'
local MINING_ZONE_DROPDOWN = 'kbve_fleet_mining_zone'
local DEFENSE_DISPATCH = 'kbve_fleet_defense_dispatch'
local DEFENSE_ZONE_DROPDOWN = 'kbve_fleet_defense_zone'
local COMBAT_DISPATCH = 'kbve_fleet_combat_dispatch'
local COMBAT_X = 'kbve_fleet_combat_x'
local COMBAT_Y = 'kbve_fleet_combat_y'
local GROUP_NEW = 'kbve_fleet_group_new'
local GROUP_NAME_FIELD = 'kbve_fleet_group_name'
local GROUP_DELETE_PREFIX = 'kbve_fleet_group_del_'
local GROUP_DISPATCH_PREFIX = 'kbve_fleet_group_dispatch_'
local GROUP_ZONE_PREFIX = 'kbve_fleet_group_zone_'
local SELECT_PREFIX = 'kbve_fleet_select_'
local SELECTION_CLEAR = 'kbve_fleet_sel_clear'
local SELECTION_GROUP_DROPDOWN = 'kbve_fleet_sel_group'
local SELECTION_ADD_BUTTON = 'kbve_fleet_sel_add'

local ROLE_NONE = '— none —'

local function is_miner(name)
	return string.find(name, 'vehicle%-miner', 1, false) ~= nil
end

local function is_combat(name)
	return string.find(name, 'vehicle%-warden', 1, false) ~= nil
		or string.find(name, 'vehicle%-chaingunner', 1, false) ~= nil
		or string.find(name, 'vehicle%-laser%-tank', 1, false) ~= nil
		or string.find(name, 'vehicle%-flame%-tank', 1, false) ~= nil
		or string.find(name, 'vehicle%-flame%-tumbler', 1, false) ~= nil
		or string.find(name, 'vehicle%-ironclad', 1, false) ~= nil
end

local VEHICLE_NAMES_CANDIDATES = {
	'vehicle-miner-0',
	'vehicle-miner-mk2-0',
	'vehicle-miner-mk3-0',
	'vehicle-miner-mk4-0',
	'vehicle-miner-mk5-0',
	'vehicle-hauler-0',
	'vehicle-warden-electro-bolter-gun',
	'vehicle-chaingunner-vehicle-chaingunner-gun',
	'vehicle-laser-tank-laser-tank-cannon',
	'vehicle-flame-tank-flame-tank-flamethrower',
	'vehicle-flame-tumbler-flame-tumbler-flamethrower',
	'vehicle-ironclad-0',
	'vehicle-ironclad-vehicle-ironclad-cannon',
}

local function known_vehicle_names()
	local out = {}
	for _, n in ipairs(VEHICLE_NAMES_CANDIDATES) do
		if prototypes.entity[n] then table.insert(out, n) end
	end
	return out
end

local function destroy(player)
	if player.gui.screen[GUI_NAME] then
		player.gui.screen[GUI_NAME].destroy()
	end
end

local function has_aai_zones()
	return remote and remote.interfaces and remote.interfaces['aai-zones'] ~= nil
end

local function aai_zone_types()
	if not has_aai_zones() then return {} end
	local ok, result = pcall(remote.call, 'aai-zones', 'get_zone_types')
	if not ok or type(result) ~= 'table' then return {} end
	return result
end

local function aai_zone_count(player, zone_name)
	if not has_aai_zones() then return 0 end
	local ok, result = pcall(remote.call, 'aai-zones', 'get_zone_count_of_type', {
		force = player.force,
		surface_index = player.surface.index,
		type = zone_name,
	})
	if not ok then return 0 end
	return result or 0
end

local function active_zones(player)
	local out = {}
	for _, zone in ipairs(aai_zone_types()) do
		local n = aai_zone_count(player, zone.name)
		if n > 0 then
			table.insert(out, { name = zone.name, count = n })
		end
	end
	return out
end

local function aai_zone_position_at(player, zone_name, index)
	if not has_aai_zones() then return nil end
	local ok, result = pcall(remote.call, 'aai-zones', 'get_zone_by_index', {
		force = player.force,
		surface_index = player.surface.index,
		type = zone_name,
		index = index,
	})
	if ok and type(result) == 'table' and result.x and result.y then
		return { x = result.x + 0.5, y = result.y + 0.5 }
	end
	return nil
end

local function aai_zone_first_position(player, zone_name)
	return aai_zone_position_at(player, zone_name, 1)
end

local function has_aai_vehicles()
	return remote and remote.interfaces and remote.interfaces['aai-programmable-vehicles'] ~= nil
end

local function aai_get_unit(entity)
	if not has_aai_vehicles() then return nil end
	local ok, result = pcall(remote.call, 'aai-programmable-vehicles', 'get_unit_by_entity', entity)
	if not ok or type(result) ~= 'table' then return nil end
	return result
end

local function aai_get_unit_id(entity)
	local u = aai_get_unit(entity)
	return u and u.unit_id or nil
end

local function aai_get_all_units()
	if not has_aai_vehicles() then return {} end
	local ok, result = pcall(remote.call, 'aai-programmable-vehicles', 'get_units')
	if not ok or type(result) ~= 'table' then return {} end
	return result
end

local function aai_set_unit_command(args)
	if not has_aai_vehicles() then return false end
	local ok = pcall(remote.call, 'aai-programmable-vehicles', 'set_unit_command', args)
	return ok
end

local function aai_force_register(entity)
	if not has_aai_vehicles() then return false end
	local ok = pcall(remote.call, 'aai-programmable-vehicles', 'on_entity_deployed', {
		entity = entity,
		signals = nil,
	})
	return ok
end

local function list_vehicles(surface)
	local names = known_vehicle_names()
	if #names == 0 then return {} end
	return surface.find_entities_filtered({ name = names })
end

local function render_vehicles(content, player)
	content.clear()
	content.add({ type = 'label', caption = 'AAI vehicles on this surface', style = 'heading_2_label' })

	local vehicles = list_vehicles(player.surface)
	local on_surface = {}
	for _, v in pairs(vehicles) do
		on_surface[v.name] = (on_surface[v.name] or 0) + 1
	end

	local registered = aai_get_all_units()
	local registered_total = 0
	local registered_by_name = {}
	local registered_units_on_surface = {}
	for _, u in pairs(registered) do
		registered_total = registered_total + 1
		if u.vehicle and u.vehicle.valid and u.vehicle.surface.index == player.surface.index then
			local name = u.vehicle.name
			registered_by_name[name] = (registered_by_name[name] or 0) + 1
			table.insert(registered_units_on_surface, u)
		end
	end

	content.add({
		type = 'label',
		caption = { '', 'On surface: ', #vehicles, '   Registered with AAI: ', registered_total },
	})

	content.add({
		type = 'button',
		name = SYNC_NAME,
		caption = 'Sync unregistered vehicles to AAI',
		tooltip = 'Walks every AAI vehicle entity on this surface and force-registers any that AAI is not tracking.',
	})

	if #vehicles == 0 then
		content.add({
			type = 'label',
			caption = 'No AAI vehicles found. Take one from the warehouse and place it down.',
		})
		return
	end

	local scroll = content.add({ type = 'scroll-pane', direction = 'vertical' })
	scroll.style.maximal_height = 360
	scroll.style.minimal_width = 540
	local header = scroll.add({ type = 'flow', direction = 'horizontal' })
	header.add({ type = 'label', caption = 'Vehicle', }).style.minimal_width = 220
	header.add({ type = 'label', caption = 'On surface', }).style.minimal_width = 90
	header.add({ type = 'label', caption = 'Registered', }).style.minimal_width = 90
	header.add({ type = 'label', caption = 'Gap', })

	for name, count in pairs(on_surface) do
		local reg = registered_by_name[name] or 0
		local row = scroll.add({ type = 'flow', direction = 'horizontal' })
		local proto = prototypes.entity[name]
		row.add({
			type = 'label',
			caption = proto and proto.localised_name or name,
		}).style.minimal_width = 220
		row.add({ type = 'label', caption = tostring(count) }).style.minimal_width = 90
		row.add({ type = 'label', caption = tostring(reg) }).style.minimal_width = 90
		local gap = count - reg
		local gap_label = row.add({
			type = 'label',
			caption = gap == 0 and 'ok' or ('-' .. gap),
		})
		if gap ~= 0 then
			gap_label.style.font_color = { r = 1, g = 0.4, b = 0.4 }
		end
	end

	if #registered_units_on_surface > 0 then
		content.add({
			type = 'label',
			caption = 'Registered units (first 20)',
			style = 'heading_2_label',
		})

		local selection = FleetState.get_player_selection(player.index)
		local selection_count = 0
		for _ in pairs(selection) do selection_count = selection_count + 1 end
		local sel_row = content.add({ type = 'flow', name = 'kbve_fleet_sel_row', direction = 'horizontal' })
		sel_row.add({
			type = 'label',
			caption = { '', 'Selected: ', tostring(selection_count) },
		}).style.minimal_width = 120
		local groups = FleetState.groups_list()
		local group_items, group_ids = { 'Pick squad…' }, { 0 }
		for _, g in ipairs(groups) do
			table.insert(group_items, '#' .. g.id .. ' ' .. g.name)
			table.insert(group_ids, g.id)
		end
		sel_row.add({
			type = 'drop-down',
			name = SELECTION_GROUP_DROPDOWN,
			items = group_items,
			selected_index = 1,
		})
		sel_row.add({
			type = 'button',
			name = SELECTION_ADD_BUTTON,
			caption = 'Add to squad',
			enabled = selection_count > 0 and #groups > 0,
		})
		sel_row.add({
			type = 'button',
			name = SELECTION_CLEAR,
			caption = 'Clear',
			enabled = selection_count > 0,
		})

		local detail = content.add({ type = 'scroll-pane', direction = 'vertical' })
		detail.style.maximal_height = 260
		detail.style.minimal_width = 600
		local detail_header = detail.add({ type = 'flow', direction = 'horizontal' })
		detail_header.add({ type = 'label', caption = ' ' }).style.minimal_width = 28
		detail_header.add({ type = 'label', caption = 'ID' }).style.minimal_width = 36
		detail_header.add({ type = 'label', caption = 'Vehicle' }).style.minimal_width = 200
		detail_header.add({ type = 'label', caption = 'Mode' }).style.minimal_width = 90
		detail_header.add({ type = 'label', caption = 'HP' }).style.minimal_width = 50
		detail_header.add({ type = 'label', caption = 'Fuel' }).style.minimal_width = 60
		detail_header.add({ type = 'label', caption = 'Dist→tp' })
		for i = 1, math.min(20, #registered_units_on_surface) do
			local u = registered_units_on_surface[i]
			local v = u.vehicle
			local proto = prototypes.entity[v.name]
			local ok_max, max_hp = pcall(function() return v.prototype.max_health end)
			if not ok_max or not max_hp or max_hp <= 0 then max_hp = v.health > 0 and v.health or 1 end
			local hp_pct = math.floor((v.health / max_hp) * 100)
			local fuel_pct = 0
			local burner = v.burner
			if burner then
				local cur = burner.currently_burning
				local cur_val = (cur and cur.name and prototypes.item[cur.name.name] and prototypes.item[cur.name.name].fuel_value) or 0
				if cur_val > 0 then
					fuel_pct = math.max(0, math.min(100, math.floor((burner.remaining_burning_fuel / cur_val) * 100)))
				end
				if fuel_pct == 0 and burner.inventory and not burner.inventory.is_empty() then
					fuel_pct = -1
				end
			end
			local dist = '-'
			if u.target_position then
				local dx = u.target_position.x - v.position.x
				local dy = u.target_position.y - v.position.y
				dist = tostring(math.floor(math.sqrt(dx * dx + dy * dy)))
			end
			local row = detail.add({ type = 'flow', direction = 'horizontal' })
			row.add({
				type = 'checkbox',
				name = SELECT_PREFIX .. u.unit_id,
				state = selection[u.unit_id] == true,
			}).style.minimal_width = 28
			row.add({ type = 'label', caption = '#' .. u.unit_id }).style.minimal_width = 36
			row.add({
				type = 'label',
				caption = proto and proto.localised_name or v.name,
			}).style.minimal_width = 200
			row.add({ type = 'label', caption = tostring(u.mode) }).style.minimal_width = 90
			local hp_label = row.add({ type = 'label', caption = hp_pct .. '%' })
			hp_label.style.minimal_width = 50
			if hp_pct < 30 then
				hp_label.style.font_color = { r = 1, g = 0.4, b = 0.4 }
			elseif hp_pct < 70 then
				hp_label.style.font_color = { r = 1, g = 0.85, b = 0.3 }
			end
			local fuel_caption
			if not burner then
				fuel_caption = 'n/a'
			elseif fuel_pct < 0 then
				fuel_caption = 'idle'
			else
				fuel_caption = fuel_pct .. '%'
			end
			local fuel_label = row.add({ type = 'label', caption = fuel_caption })
			fuel_label.style.minimal_width = 60
			if burner and fuel_pct >= 0 and fuel_pct < 20 then
				fuel_label.style.font_color = { r = 1, g = 0.4, b = 0.4 }
			end
			row.add({ type = 'label', caption = dist })
		end
	end
end

local function sync_unregistered(player)
	local synced, already, failed = 0, 0, 0
	local vehicles = list_vehicles(player.surface)
	for _, v in pairs(vehicles) do
		if v.valid then
			if aai_get_unit_id(v) then
				already = already + 1
			elseif aai_force_register(v) then
				if aai_get_unit_id(v) then
					synced = synced + 1
				else
					failed = failed + 1
				end
			else
				failed = failed + 1
			end
		end
	end
	player.print({
		'',
		'Sync done — already registered: ', already,
		', newly registered: ', synced,
		', failed: ', failed,
	})
end

local function render_zones(content, player)
	content.clear()
	content.add({ type = 'label', caption = 'Active AAI zones on this surface', style = 'heading_2_label' })

	if not has_aai_zones() then
		content.add({
			type = 'label',
			caption = 'aai-zones not loaded.',
		})
		return
	end

	local active = active_zones(player)
	if #active == 0 then
		content.add({
			type = 'label',
			caption = 'No zones painted. Craft a Zone Planner item, pick a pattern+colour combo, paint an area on the map, then click Refresh.',
		})
		return
	end

	local roles = { ROLE_NONE }
	for _, r in ipairs(FleetState.roles()) do table.insert(roles, r) end

	local scroll = content.add({ type = 'scroll-pane', direction = 'vertical' })
	scroll.style.maximal_height = 360
	scroll.style.minimal_width = 600
	for _, zone in ipairs(active) do
		local row = scroll.add({ type = 'flow', direction = 'horizontal' })
		local proto = prototypes.entity[zone.name]
		local sprite = 'entity/' .. zone.name
		row.add({
			type = 'sprite-button',
			sprite = sprite,
			enabled = false,
			tooltip = proto and proto.localised_name or zone.name,
		})
		row.add({
			type = 'label',
			caption = proto and proto.localised_name or zone.name,
		}).style.minimal_width = 260
		row.add({ type = 'label', caption = { '', zone.count, ' tiles' } }).style.minimal_width = 80
		row.add({ type = 'label', caption = 'Role:' })
		local current = FleetState.get_zone_role(zone.name)
		local selected = 1
		for i, r in ipairs(roles) do
			if r == current then selected = i; break end
		end
		row.add({
			type = 'drop-down',
			name = ZONE_ROLE_PREFIX .. zone.name,
			items = roles,
			selected_index = selected,
		})
	end
end

local ALL_VEHICLES_SENTINEL = '__all__'

local function build_type_items(player)
	local items = { 'All AAI vehicles on this surface' }
	local names = { ALL_VEHICLES_SENTINEL }
	for _, n in ipairs(known_vehicle_names()) do
		if #player.surface.find_entities_filtered({ name = n, limit = 1 }) > 0 then
			local proto = prototypes.entity[n]
			table.insert(items, proto and proto.localised_name or n)
			table.insert(names, n)
		end
	end
	return items, names
end

local function build_zone_items(player)
	local items, names = {}, {}
	for _, zone in ipairs(active_zones(player)) do
		local proto = prototypes.entity[zone.name]
		local label
		if proto then
			label = { '', '[entity=' .. zone.name .. '] ', proto.localised_name, ' (', zone.count, ')' }
		else
			label = zone.name .. ' (' .. zone.count .. ')'
		end
		table.insert(items, label)
		table.insert(names, zone.name)
	end
	if #items == 0 then
		table.insert(items, 'No zones painted')
		table.insert(names, '')
	end
	return items, names
end

local function render_dispatch(content, player)
	content.clear()
	content.add({ type = 'label', caption = 'Dispatch all vehicles of a type to a zone.', style = 'heading_2_label' })
	content.add({
		type = 'label',
		caption = 'Writes the unit-data target on every matching AAI vehicle so they path to the selected zone.',
	})

	local type_row = content.add({ type = 'flow', name = 'kbve_fleet_type_row', direction = 'horizontal' })
	type_row.add({ type = 'label', caption = 'Vehicle type:' })
	local type_items, _ = build_type_items(player)
	type_row.add({
		type = 'drop-down',
		name = TYPE_DROPDOWN,
		items = type_items,
		selected_index = 1,
	})

	local zone_row = content.add({ type = 'flow', name = 'kbve_fleet_zone_row', direction = 'horizontal' })
	zone_row.add({ type = 'label', caption = 'Target zone:' })
	local zone_items, _ = build_zone_items(player)
	zone_row.add({
		type = 'drop-down',
		name = ZONE_DROPDOWN,
		items = zone_items,
		selected_index = 1,
	})

	content.add({
		type = 'button',
		name = DISPATCH_BUTTON,
		caption = 'Dispatch',
		style = 'green_button',
	})
end

local function build_role_zone_items(role)
	local items, names = {}, {}
	local fleet = FleetState.get()
	for zone_name, r in pairs(fleet.zone_roles) do
		if r == role then
			local proto = prototypes.entity[zone_name]
			table.insert(items, proto and proto.localised_name or zone_name)
			table.insert(names, zone_name)
		end
	end
	if #items == 0 then
		table.insert(items, 'No ' .. role .. ' zones — set one in the Zones tab')
		table.insert(names, '')
	end
	return items, names
end

local function units_matching(player, predicate)
	local out = {}
	if not (remote and remote.interfaces and remote.interfaces['aai-programmable-vehicles']) then return out end
	local ok, registered = pcall(remote.call, 'aai-programmable-vehicles', 'get_units')
	if not ok or type(registered) ~= 'table' then return out end
	for _, u in pairs(registered) do
		if u.vehicle and u.vehicle.valid
			and u.vehicle.surface.index == player.surface.index
			and predicate(u.vehicle.name)
		then
			table.insert(out, u.unit_id)
		end
	end
	return out
end

local function render_mission_tab(content, player, opts)
	content.clear()
	content.add({ type = 'label', caption = opts.title, style = 'heading_2_label' })
	content.add({ type = 'label', caption = opts.subtitle })

	local zone_row = content.add({ type = 'flow', name = opts.zone_row_name, direction = 'horizontal' })
	zone_row.add({ type = 'label', caption = opts.zone_label })
	local items, _ = build_role_zone_items(opts.role)
	zone_row.add({
		type = 'drop-down',
		name = opts.dropdown_name,
		items = items,
		selected_index = 1,
	})

	local matching = units_matching(player, opts.predicate)
	content.add({
		type = 'label',
		caption = { '', opts.match_label, tostring(#matching) },
	})

	content.add({
		type = 'button',
		name = opts.button_name,
		caption = opts.button_caption,
		style = 'green_button',
		enabled = #matching > 0,
	})
end

local function render_mining(content, player)
	render_mission_tab(content, player, {
		title = 'Mining missions',
		subtitle = 'Send AAI miners to a mining-tagged zone. Auto-fan keeps them on ore tiles.',
		zone_label = 'Mining zone:',
		zone_row_name = 'kbve_fleet_mining_row',
		dropdown_name = MINING_ZONE_DROPDOWN,
		button_name = MINING_DISPATCH,
		button_caption = 'Send miners',
		match_label = 'Miners on this surface: ',
		predicate = is_miner,
		role = 'mining',
	})
end

local function render_defense(content, player)
	render_mission_tab(content, player, {
		title = 'Defense missions',
		subtitle = 'Hold a defense-tagged zone with warden, chaingunner, laser-tank, ironclad, or flame units.',
		zone_label = 'Defense zone:',
		zone_row_name = 'kbve_fleet_defense_row',
		dropdown_name = DEFENSE_ZONE_DROPDOWN,
		button_name = DEFENSE_DISPATCH,
		button_caption = 'Send combat units',
		match_label = 'Combat units on this surface: ',
		predicate = is_combat,
		role = 'defense',
	})
end

local function render_combat(content, player)
	content.clear()
	content.add({ type = 'label', caption = 'Combat mission', style = 'heading_2_label' })
	content.add({
		type = 'label',
		caption = 'One-shot offensive — every combat unit drives straight to the entered map position.',
	})

	local row = content.add({ type = 'flow', name = 'kbve_fleet_combat_row', direction = 'horizontal' })
	row.add({ type = 'label', caption = 'Target x:' })
	row.add({ type = 'textfield', name = COMBAT_X, text = tostring(math.floor(player.position.x)), numeric = true, allow_negative = true })
	row.add({ type = 'label', caption = 'y:' })
	row.add({ type = 'textfield', name = COMBAT_Y, text = tostring(math.floor(player.position.y)), numeric = true, allow_negative = true })

	local matching = units_matching(player, is_combat)
	content.add({ type = 'label', caption = { '', 'Combat units on this surface: ', tostring(#matching) } })
	content.add({
		type = 'button',
		name = COMBAT_DISPATCH,
		caption = 'Strike',
		style = 'red_back_button',
		enabled = #matching > 0,
	})
end

local function render_groups(content, player)
	content.clear()
	content.add({ type = 'label', caption = 'Squads', style = 'heading_2_label' })
	content.add({
		type = 'label',
		caption = 'Persist named subsets of the fleet. Each squad keeps its own member list across saves.',
	})

	local row = content.add({ type = 'flow', name = 'kbve_fleet_group_new_row', direction = 'horizontal' })
	row.add({ type = 'label', caption = 'New squad name:' })
	row.add({ type = 'textfield', name = GROUP_NAME_FIELD, text = '' })
	row.add({ type = 'button', name = GROUP_NEW, caption = 'Create' })

	local groups = FleetState.groups_list()
	if #groups == 0 then
		content.add({ type = 'label', caption = 'No squads yet.' })
		return
	end

	local _, role_zone_names = build_role_zone_items('defense')
	local mining_items, mining_names = build_role_zone_items('mining')

	local scroll = content.add({ type = 'scroll-pane', direction = 'vertical' })
	scroll.style.maximal_height = 320
	scroll.style.minimal_width = 560

	local fleet = FleetState.get()
	for _, g in ipairs(groups) do
		local mission_counts = {}
		for _, uid in ipairs(g.unit_ids) do
			local st = fleet.unit_state[uid]
			local m = (st and st.mission) or 'idle'
			mission_counts[m] = (mission_counts[m] or 0) + 1
		end
		local badge_parts = {}
		for m, c in pairs(mission_counts) do
			table.insert(badge_parts, m .. ':' .. c)
		end
		table.sort(badge_parts)
		local badge = table.concat(badge_parts, '  ')
		if badge == '' then badge = 'no members' end

		local grow = scroll.add({ type = 'flow', direction = 'vertical' })
		local header = grow.add({ type = 'flow', direction = 'horizontal' })
		header.add({ type = 'label', caption = '#' .. g.id .. ' ' .. g.name }).style.minimal_width = 180
		header.add({ type = 'label', caption = { '', 'units: ', #g.unit_ids } }).style.minimal_width = 90
		header.add({
			type = 'drop-down',
			name = GROUP_ZONE_PREFIX .. g.id,
			items = mining_items,
			selected_index = 1,
		})
		header.add({
			type = 'button',
			name = GROUP_DISPATCH_PREFIX .. g.id,
			caption = 'Dispatch',
			enabled = #g.unit_ids > 0 and #mining_names > 0 and mining_names[1] ~= '',
		})
		header.add({
			type = 'button',
			name = GROUP_DELETE_PREFIX .. g.id,
			caption = 'X',
			tooltip = 'Delete squad',
		})
		grow.add({
			type = 'label',
			caption = '    ' .. badge,
		}).style.font_color = { r = 0.75, g = 0.85, b = 1 }
	end
end

function FleetGui.show(player)
	destroy(player)
	local frame = player.gui.screen.add({
		type = 'frame',
		name = GUI_NAME,
		direction = 'vertical',
		caption = 'KBVE Fleet Commander',
	})
	frame.auto_center = true

	local header = frame.add({ type = 'flow', direction = 'horizontal' })
	header.add({ type = 'empty-widget' }).style.horizontally_stretchable = true
	header.add({ type = 'button', name = REFRESH_NAME, caption = 'Refresh' })
	header.add({ type = 'button', name = CLOSE_NAME, caption = 'Close' })

	local tabbed = frame.add({ type = 'tabbed-pane', name = TABBED_NAME })

	local vehicles_tab = tabbed.add({ type = 'tab', caption = 'Vehicles' })
	local vehicles_content = tabbed.add({
		type = 'flow',
		name = VEHICLES_TAB,
		direction = 'vertical',
	})
	tabbed.add_tab(vehicles_tab, vehicles_content)
	render_vehicles(vehicles_content, player)

	local zones_tab = tabbed.add({ type = 'tab', caption = 'Zones' })
	local zones_content = tabbed.add({
		type = 'flow',
		name = ZONES_TAB,
		direction = 'vertical',
	})
	tabbed.add_tab(zones_tab, zones_content)
	render_zones(zones_content, player)

	local dispatch_tab = tabbed.add({ type = 'tab', caption = 'Dispatch' })
	local dispatch_content = tabbed.add({
		type = 'flow',
		name = DISPATCH_TAB,
		direction = 'vertical',
	})
	tabbed.add_tab(dispatch_tab, dispatch_content)
	render_dispatch(dispatch_content, player)

	local mining_tab = tabbed.add({ type = 'tab', caption = 'Mining' })
	local mining_content = tabbed.add({
		type = 'flow',
		name = MINING_TAB,
		direction = 'vertical',
	})
	tabbed.add_tab(mining_tab, mining_content)
	render_mining(mining_content, player)

	local defense_tab = tabbed.add({ type = 'tab', caption = 'Defense' })
	local defense_content = tabbed.add({
		type = 'flow',
		name = DEFENSE_TAB,
		direction = 'vertical',
	})
	tabbed.add_tab(defense_tab, defense_content)
	render_defense(defense_content, player)

	local combat_tab = tabbed.add({ type = 'tab', caption = 'Combat' })
	local combat_content = tabbed.add({
		type = 'flow',
		name = COMBAT_TAB,
		direction = 'vertical',
	})
	tabbed.add_tab(combat_tab, combat_content)
	render_combat(combat_content, player)

	local groups_tab = tabbed.add({ type = 'tab', caption = 'Squads' })
	local groups_content = tabbed.add({
		type = 'flow',
		name = GROUPS_TAB,
		direction = 'vertical',
	})
	tabbed.add_tab(groups_tab, groups_content)
	render_groups(groups_content, player)

	player.opened = frame
end

function FleetGui.on_gui_closed(event)
	local elem = event.element
	if elem and elem.valid and elem.name == GUI_NAME then
		elem.destroy()
	end
end

local function refresh(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local tabbed = frame[TABBED_NAME]
	if not tabbed then return end
	if tabbed[VEHICLES_TAB] then render_vehicles(tabbed[VEHICLES_TAB], player) end
	if tabbed[ZONES_TAB] then render_zones(tabbed[ZONES_TAB], player) end
	if tabbed[DISPATCH_TAB] then render_dispatch(tabbed[DISPATCH_TAB], player) end
	if tabbed[MINING_TAB] then render_mining(tabbed[MINING_TAB], player) end
	if tabbed[DEFENSE_TAB] then render_defense(tabbed[DEFENSE_TAB], player) end
	if tabbed[COMBAT_TAB] then render_combat(tabbed[COMBAT_TAB], player) end
	if tabbed[GROUPS_TAB] then render_groups(tabbed[GROUPS_TAB], player) end
end

local function dispatch(player)
	log('[kbve_fleet] dispatch called by ' .. player.name)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then log('[kbve_fleet] no frame'); return end
	local tabbed = frame[TABBED_NAME]
	if not tabbed then log('[kbve_fleet] no tabbed'); return end
	local dispatch_content = tabbed[DISPATCH_TAB]
	if not dispatch_content then log('[kbve_fleet] no dispatch tab'); return end
	local type_row = dispatch_content['kbve_fleet_type_row']
	local zone_row = dispatch_content['kbve_fleet_zone_row']
	local type_dd = type_row and type_row[TYPE_DROPDOWN]
	local zone_dd = zone_row and zone_row[ZONE_DROPDOWN]
	if not (type_dd and zone_dd) then log('[kbve_fleet] missing dropdowns'); return end

	local type_index = type_dd.selected_index
	local _, type_names = build_type_items(player)
	local vehicle_name = type_names[type_index]
	log('[kbve_fleet] type_index=' .. tostring(type_index) .. ' vehicle_name=' .. tostring(vehicle_name))
	if not vehicle_name then
		player.print('No vehicle type available.')
		return
	end

	local _, zone_names = build_zone_items(player)
	local target_zone_name = zone_names[zone_dd.selected_index]
	log('[kbve_fleet] zone_index=' .. tostring(zone_dd.selected_index) .. ' zone_name=' .. tostring(target_zone_name))
	if not target_zone_name or target_zone_name == '' then
		player.print('No painted zone selected. Use the Zone Planner first.')
		return
	end

	local zone_count = aai_zone_count(player, target_zone_name)
	if zone_count <= 0 then
		player.print('Zone ' .. target_zone_name .. ' has no tiles.')
		return
	end

	local found
	if vehicle_name == ALL_VEHICLES_SENTINEL then
		found = list_vehicles(player.surface)
	else
		found = player.surface.find_entities_filtered({ name = vehicle_name })
	end
	log('[kbve_fleet] found_entities=' .. #found .. ' zone_count=' .. tostring(zone_count))

	local pos = aai_zone_position_at(player, target_zone_name, 1)
	if not pos then
		player.print('Could not resolve a tile position for zone ' .. target_zone_name .. '.')
		return
	end

	local dispatched, unregistered, inactive = 0, 0, 0
	local valid_targets = {}
	for _, v in pairs(found) do
		if v.valid then
			local unit = aai_get_unit(v)
			if unit and unit.unit_id then
				if unit.active_state == 'inactive' then
					inactive = inactive + 1
				end
				table.insert(valid_targets, unit)
			else
				unregistered = unregistered + 1
			end
		end
	end
	log('[kbve_fleet] valid_targets=' .. #valid_targets .. ' unregistered=' .. unregistered)
	for i, unit in ipairs(valid_targets) do
		local zone_index = math.floor(((i - 1) * zone_count) / math.max(1, #valid_targets)) + 1
		local target_pos = aai_zone_position_at(player, target_zone_name, zone_index) or pos
		local ok1 = aai_set_unit_command({ unit_id = unit.unit_id, target_speed = 0.1 })
		local ok2 = aai_set_unit_command({ unit_id = unit.unit_id, target_position = target_pos })
		log('[kbve_fleet] dispatched unit_id=' .. tostring(unit.unit_id) .. ' tp=(' .. target_pos.x .. ',' .. target_pos.y .. ') ok=' .. tostring(ok1) .. '/' .. tostring(ok2))
		if ok2 then
			dispatched = dispatched + 1
		end
	end
	if unregistered > 0 then
		player.print({
			'',
			tostring(unregistered),
			' vehicle(s) not registered with AAI. Click "Sync unregistered vehicles" in the Vehicles tab.',
		})
	end
	if inactive > 0 then
		player.print({
			'',
			tostring(inactive),
			' vehicle(s) have active_state=inactive and will ignore commands. Toggle them to Auto/On.',
		})
	end
	local label
	if vehicle_name == ALL_VEHICLES_SENTINEL then
		label = 'all AAI vehicles'
	else
		label = prototypes.entity[vehicle_name] and prototypes.entity[vehicle_name].localised_name or vehicle_name
	end
	player.print({
		'',
		'Dispatched ',
		tostring(dispatched),
		' x ',
		label,
		' to ',
		target_zone_name,
		' at (',
		tostring(math.floor(pos.x)),
		',',
		tostring(math.floor(pos.y)),
		').',
	})
end

function FleetGui.on_custom_input(event)
	local player = game.get_player(event.player_index)
	if not player or not player.character then return end
	if player.gui.screen[GUI_NAME] then return end
	local nearby = player.surface.find_entities_filtered({
		position = player.position,
		radius = 3,
		name = 'kbve-fleet-commander',
	})
	if #nearby == 0 then return end
	FleetGui.show(player)
end

local function mining_dispatch(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local tabbed = frame[TABBED_NAME]
	local content = tabbed and tabbed[MINING_TAB]
	if not content then return end
	local row = content['kbve_fleet_mining_row']
	local dd = row and row[MINING_ZONE_DROPDOWN]
	if not dd then return end
	local _, names = build_role_zone_items('mining')
	local zone_name = names[dd.selected_index]
	if not zone_name or zone_name == '' then
		player.print('No mining zone selected. Tag a zone "mining" in the Zones tab first.')
		return
	end
	local unit_ids = units_matching(player, is_miner)
	local n = FleetMissions.assign_mining(player, unit_ids, zone_name)
	player.print({ '', 'Mining mission: ', tostring(n), ' miner(s) sent to ', zone_name, '.' })
end

local function defense_dispatch(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local tabbed = frame[TABBED_NAME]
	local content = tabbed and tabbed[DEFENSE_TAB]
	if not content then return end
	local row = content['kbve_fleet_defense_row']
	local dd = row and row[DEFENSE_ZONE_DROPDOWN]
	if not dd then return end
	local _, names = build_role_zone_items('defense')
	local zone_name = names[dd.selected_index]
	if not zone_name or zone_name == '' then
		player.print('No defense zone selected. Tag a zone "defense" in the Zones tab first.')
		return
	end
	local unit_ids = units_matching(player, is_combat)
	local n = FleetMissions.assign_mining(player, unit_ids, zone_name)
	for _, uid in ipairs(unit_ids) do
		FleetState.set_unit_mission(uid, 'defense', zone_name)
	end
	player.print({ '', 'Defense mission: ', tostring(n), ' combat unit(s) holding ', zone_name, '.' })
end

local function combat_dispatch(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local tabbed = frame[TABBED_NAME]
	local content = tabbed and tabbed[COMBAT_TAB]
	if not content then return end
	local row = content['kbve_fleet_combat_row']
	local xf = row and row[COMBAT_X]
	local yf = row and row[COMBAT_Y]
	if not (xf and yf) then return end
	local x = tonumber(xf.text)
	local y = tonumber(yf.text)
	if not (x and y) then
		player.print('Enter numeric x,y target coordinates.')
		return
	end
	local unit_ids = units_matching(player, is_combat)
	local n = FleetMissions.assign_combat(player, unit_ids, { x = x, y = y })
	player.print({ '', 'Combat strike: ', tostring(n), ' unit(s) en route to (', tostring(x), ',', tostring(y), ').' })
end

local function set_zone_role_from_dropdown(player, elem, zone_name)
	local idx = elem.selected_index
	if idx <= 1 then
		FleetState.set_zone_role(zone_name, nil)
		player.print({ '', 'Cleared role for ', zone_name, '.' })
	else
		local role = FleetState.roles()[idx - 1]
		FleetState.set_zone_role(zone_name, role)
		player.print({ '', zone_name, ' tagged as ', role, '.' })
	end
end

local function group_create(player)
	local frame = player.gui.screen[GUI_NAME]
	local tabbed = frame and frame[TABBED_NAME]
	local content = tabbed and tabbed[GROUPS_TAB]
	if not content then return end
	local row = content['kbve_fleet_group_new_row']
	local field = row and row[GROUP_NAME_FIELD]
	if not field then return end
	local name = field.text
	local id = FleetState.create_group(name)
	field.text = ''
	player.print({ '', 'Created squad #', tostring(id), '.' })
end

local function group_delete(player, group_id)
	FleetState.delete_group(group_id)
	player.print({ '', 'Deleted squad #', tostring(group_id), '.' })
end

local function group_dispatch(player, group_id)
	local frame = player.gui.screen[GUI_NAME]
	local tabbed = frame and frame[TABBED_NAME]
	local content = tabbed and tabbed[GROUPS_TAB]
	if not content then return end
	local dd = content[GROUP_ZONE_PREFIX .. group_id]
	if not dd then return end
	local _, names = build_role_zone_items('mining')
	local zone_name = names[dd.selected_index]
	if not zone_name or zone_name == '' then
		player.print('No mining zone selected for this squad.')
		return
	end
	local g = FleetState.get().groups[group_id]
	if not g then return end
	local n = FleetMissions.assign_mining(player, g.unit_ids, zone_name)
	player.print({ '', 'Squad ', g.name, ': ', tostring(n), ' unit(s) dispatched to ', zone_name, '.' })
end

function FleetGui.on_gui_click(event)
	local elem = event.element
	if not (elem and elem.valid) then return end
	local name = elem.name
	local player = game.get_player(event.player_index)
	if not player then return end

	if name == CLOSE_NAME then
		destroy(player)
		return
	end
	if name == REFRESH_NAME then
		refresh(player)
		return
	end
	if name == SYNC_NAME then
		sync_unregistered(player)
		refresh(player)
		return
	end
	if name == DISPATCH_BUTTON then
		dispatch(player)
		refresh(player)
		return
	end
	if name == MINING_DISPATCH then
		mining_dispatch(player)
		refresh(player)
		return
	end
	if name == DEFENSE_DISPATCH then
		defense_dispatch(player)
		refresh(player)
		return
	end
	if name == COMBAT_DISPATCH then
		combat_dispatch(player)
		refresh(player)
		return
	end
	if name == GROUP_NEW then
		group_create(player)
		refresh(player)
		return
	end
	if name:sub(1, #GROUP_DELETE_PREFIX) == GROUP_DELETE_PREFIX then
		local id = tonumber(name:sub(#GROUP_DELETE_PREFIX + 1))
		if id then
			group_delete(player, id)
			refresh(player)
		end
		return
	end
	if name:sub(1, #GROUP_DISPATCH_PREFIX) == GROUP_DISPATCH_PREFIX then
		local id = tonumber(name:sub(#GROUP_DISPATCH_PREFIX + 1))
		if id then
			group_dispatch(player, id)
			refresh(player)
		end
		return
	end
	if name == SELECTION_CLEAR then
		FleetState.clear_player_selection(player.index)
		refresh(player)
		return
	end
	if name == SELECTION_ADD_BUTTON then
		local frame = player.gui.screen[GUI_NAME]
		local tabbed = frame and frame[TABBED_NAME]
		local content = tabbed and tabbed[VEHICLES_TAB]
		local sel_row = content and content['kbve_fleet_sel_row']
		local dd = sel_row and sel_row[SELECTION_GROUP_DROPDOWN]
		if not dd or dd.selected_index <= 1 then
			player.print('Pick a squad to add the selected units into.')
			return
		end
		local groups = FleetState.groups_list()
		local target_group_id = groups[dd.selected_index - 1] and groups[dd.selected_index - 1].id
		if not target_group_id then return end
		local unit_ids = FleetState.player_selected_unit_ids(player.index)
		FleetState.assign_units_to_group(target_group_id, unit_ids)
		FleetState.clear_player_selection(player.index)
		player.print({ '', 'Added ', tostring(#unit_ids), ' unit(s) to squad #', tostring(target_group_id), '.' })
		refresh(player)
		return
	end
end

function FleetGui.on_gui_checked_state_changed(event)
	local elem = event.element
	if not (elem and elem.valid) then return end
	local name = elem.name or ''
	if name:sub(1, #SELECT_PREFIX) == SELECT_PREFIX then
		local uid = tonumber(name:sub(#SELECT_PREFIX + 1))
		if uid then
			FleetState.toggle_player_selection(event.player_index, uid)
		end
	end
end

function FleetGui.on_gui_selection_state_changed(event)
	local elem = event.element
	if not (elem and elem.valid) then return end
	local name = elem.name or ''
	if name:sub(1, #ZONE_ROLE_PREFIX) == ZONE_ROLE_PREFIX then
		local player = game.get_player(event.player_index)
		if not player then return end
		local zone_name = name:sub(#ZONE_ROLE_PREFIX + 1)
		set_zone_role_from_dropdown(player, elem, zone_name)
	end
end

function FleetGui.on_player_left(event)
	local player = game.get_player(event.player_index)
	if not player then return end
	destroy(player)
end

return FleetGui
