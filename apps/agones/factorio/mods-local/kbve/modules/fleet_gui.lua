local FleetGui = {}

local GUI_NAME = 'kbve_fleet'
local TABBED_NAME = 'kbve_fleet_tabbed'
local VEHICLES_TAB = 'kbve_fleet_vehicles'
local ZONES_TAB = 'kbve_fleet_zones'
local DISPATCH_TAB = 'kbve_fleet_dispatch'
local CLOSE_NAME = 'kbve_fleet_close'
local REFRESH_NAME = 'kbve_fleet_refresh'
local SYNC_NAME = 'kbve_fleet_sync'
local DISPATCH_PREFIX = 'kbve_fleet_dispatch_'
local TYPE_DROPDOWN = 'kbve_fleet_type'
local ZONE_DROPDOWN = 'kbve_fleet_zone'
local DISPATCH_BUTTON = 'kbve_fleet_dispatch_btn'

local VEHICLE_NAMES_CANDIDATES = {
	'vehicle-miner',
	'vehicle-hauler',
	'vehicle-warden',
	'vehicle-chaingunner',
	'vehicle-laser-tank',
	'vehicle-ironclad',
	'aai-vehicle-miner',
	'aai-vehicle-hauler',
	'aai-vehicle-warden',
	'aai-vehicle-chaingunner',
	'aai-vehicle-laser-tank',
	'aai-vehicle-ironclad',
	'miner',
	'hauler',
	'warden',
	'chaingunner',
	'laser-tank',
	'ironclad',
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

local function aai_zone_first_position(player, zone_name)
	if not has_aai_zones() then return nil end
	local ok, result = pcall(remote.call, 'aai-zones', 'get_zone_by_index', {
		force = player.force,
		surface_index = player.surface.index,
		type = zone_name,
		index = 1,
	})
	if ok and type(result) == 'table' and result.x and result.y then
		return { x = result.x + 0.5, y = result.y + 0.5 }
	end
	return nil
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
	header.add({ type = 'label', caption = 'Vehicle', style = 'bold_label' }).style.minimal_width = 220
	header.add({ type = 'label', caption = 'On surface', style = 'bold_label' }).style.minimal_width = 90
	header.add({ type = 'label', caption = 'Registered', style = 'bold_label' }).style.minimal_width = 90
	header.add({ type = 'label', caption = 'Gap', style = 'bold_label' })

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
		row.add({
			type = 'label',
			caption = gap == 0 and 'ok' or ('-' .. gap),
			style = gap == 0 and 'description_label' or 'bold_red_label',
		})
	end

	if #registered_units_on_surface > 0 then
		content.add({
			type = 'label',
			caption = 'Registered units (first 20)',
			style = 'heading_2_label',
		})
		local detail = content.add({ type = 'scroll-pane', direction = 'vertical' })
		detail.style.maximal_height = 220
		detail.style.minimal_width = 540
		for i = 1, math.min(20, #registered_units_on_surface) do
			local u = registered_units_on_surface[i]
			local pos = u.vehicle.position
			local tp = u.target_position
			detail.add({
				type = 'label',
				caption = {
					'',
					'#', tostring(u.unit_id),
					' ', u.vehicle.name,
					' mode=', tostring(u.mode),
					' state=', tostring(u.active_state),
					' pos=(', tostring(math.floor(pos.x)), ',', tostring(math.floor(pos.y)), ')',
					' tp=', tp and ('(' .. math.floor(tp.x) .. ',' .. math.floor(tp.y) .. ')') or 'nil',
				},
			})
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

	local scroll = content.add({ type = 'scroll-pane', direction = 'vertical' })
	scroll.style.maximal_height = 360
	scroll.style.minimal_width = 480
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
		}).style.minimal_width = 280
		row.add({ type = 'empty-widget' }).style.horizontally_stretchable = true
		row.add({ type = 'label', caption = { '', zone.count, ' tiles' } })
	end
end

local function build_type_items()
	local out = {}
	for _, n in ipairs(known_vehicle_names()) do
		local proto = prototypes.entity[n]
		table.insert(out, proto and proto.localised_name or n)
	end
	if #out == 0 then table.insert(out, 'No AAI vehicles loaded') end
	return out
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

	local type_row = content.add({ type = 'flow', direction = 'horizontal' })
	type_row.add({ type = 'label', caption = 'Vehicle type:' })
	type_row.add({
		type = 'drop-down',
		name = TYPE_DROPDOWN,
		items = build_type_items(),
		selected_index = 1,
	})

	local zone_row = content.add({ type = 'flow', direction = 'horizontal' })
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
end

local function dispatch(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local tabbed = frame[TABBED_NAME]
	if not tabbed then return end
	local dispatch_content = tabbed[DISPATCH_TAB]
	if not dispatch_content then return end
	local type_dd = dispatch_content[TYPE_DROPDOWN]
	local zone_dd = dispatch_content[ZONE_DROPDOWN]
	if not (type_dd and zone_dd) then return end

	local type_index = type_dd.selected_index
	local names = known_vehicle_names()
	local vehicle_name = names[type_index]
	if not vehicle_name then
		player.print('No vehicle type available.')
		return
	end

	local _, zone_names = build_zone_items(player)
	local target_zone_name = zone_names[zone_dd.selected_index]
	if not target_zone_name or target_zone_name == '' then
		player.print('No painted zone selected. Use the Zone Planner first.')
		return
	end

	local pos = aai_zone_first_position(player, target_zone_name)
	if not pos then
		player.print('Could not resolve a tile position for zone ' .. target_zone_name .. '.')
		return
	end

	local found = player.surface.find_entities_filtered({ name = vehicle_name })
	local dispatched, unregistered, inactive = 0, 0, 0
	for _, v in pairs(found) do
		if v.valid then
			local unit = aai_get_unit(v)
			if unit and unit.unit_id then
				if unit.active_state == 'inactive' then
					inactive = inactive + 1
				end
				if aai_set_unit_command({ unit_id = unit.unit_id, target_position = pos }) then
					dispatched = dispatched + 1
				end
			else
				unregistered = unregistered + 1
			end
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
	player.print({
		'',
		'Dispatched ',
		tostring(dispatched),
		' x ',
		prototypes.entity[vehicle_name] and prototypes.entity[vehicle_name].localised_name or vehicle_name,
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
end

function FleetGui.on_player_left(event)
	local player = game.get_player(event.player_index)
	if not player then return end
	destroy(player)
end

return FleetGui
