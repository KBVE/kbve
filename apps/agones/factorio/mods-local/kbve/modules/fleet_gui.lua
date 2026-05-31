local FleetGui = {}

local GUI_NAME = 'kbve_fleet'
local TABBED_NAME = 'kbve_fleet_tabbed'
local VEHICLES_TAB = 'kbve_fleet_vehicles'
local ZONES_TAB = 'kbve_fleet_zones'
local DISPATCH_TAB = 'kbve_fleet_dispatch'
local CLOSE_NAME = 'kbve_fleet_close'
local REFRESH_NAME = 'kbve_fleet_refresh'
local DISPATCH_PREFIX = 'kbve_fleet_dispatch_'
local TYPE_DROPDOWN = 'kbve_fleet_type'
local ZONE_DROPDOWN = 'kbve_fleet_zone'
local DISPATCH_BUTTON = 'kbve_fleet_dispatch_btn'

local VEHICLE_NAMES = {
	'vehicle-miner',
	'vehicle-hauler',
	'vehicle-warden',
	'vehicle-chaingunner',
	'vehicle-laser-tank',
	'vehicle-ironclad',
}

local function destroy(player)
	if player.gui.screen[GUI_NAME] then
		player.gui.screen[GUI_NAME].destroy()
	end
end

local function aai_zones()
	if not (remote and remote.interfaces and remote.interfaces['aai-zones']) then
		return {}
	end
	local ok, result = pcall(remote.call, 'aai-zones', 'get_zones')
	if not ok or type(result) ~= 'table' then return {} end
	return result
end

local function aai_set_unit_data(unit_number, data)
	if not (remote and remote.interfaces and remote.interfaces['aai-programmable-vehicles']) then
		return false
	end
	local ok = pcall(remote.call, 'aai-programmable-vehicles', 'set_unit_data', unit_number, data)
	return ok
end

local function list_vehicles(surface)
	local found = surface.find_entities_filtered({ name = VEHICLE_NAMES })
	return found
end

local function render_vehicles(content, player)
	content.clear()
	content.add({ type = 'label', caption = 'AAI vehicles on this surface', style = 'heading_2_label' })
	local vehicles = list_vehicles(player.surface)
	content.add({ type = 'label', caption = { '', 'Total: ', #vehicles } })
	if #vehicles == 0 then
		content.add({
			type = 'label',
			caption = 'No AAI vehicles found. Build one via the AAI Industry tech tree.',
		})
		return
	end
	local counts = {}
	for _, v in pairs(vehicles) do
		counts[v.name] = (counts[v.name] or 0) + 1
	end
	local scroll = content.add({ type = 'scroll-pane', direction = 'vertical' })
	scroll.style.maximal_height = 360
	scroll.style.minimal_width = 480
	for name, count in pairs(counts) do
		local row = scroll.add({ type = 'flow', direction = 'horizontal' })
		local proto = prototypes.entity[name]
		row.add({ type = 'label', caption = proto and proto.localised_name or name }).style.minimal_width = 240
		row.add({ type = 'empty-widget' }).style.horizontally_stretchable = true
		row.add({ type = 'label', caption = { '', count, ' active' } })
	end
end

local function render_zones(content, player)
	content.clear()
	content.add({ type = 'label', caption = 'AAI zones', style = 'heading_2_label' })
	local zones = aai_zones()
	if next(zones) == nil then
		content.add({
			type = 'label',
			caption = 'No zones detected. Use the AAI Zone tool to define one.',
		})
		return
	end
	local scroll = content.add({ type = 'scroll-pane', direction = 'vertical' })
	scroll.style.maximal_height = 360
	scroll.style.minimal_width = 480
	for id, zone in pairs(zones) do
		local row = scroll.add({ type = 'flow', direction = 'horizontal' })
		local name = (type(zone) == 'table' and zone.name) or ('zone-' .. tostring(id))
		row.add({ type = 'label', caption = name }).style.minimal_width = 240
		row.add({ type = 'empty-widget' }).style.horizontally_stretchable = true
		local size = type(zone) == 'table' and zone.size or '?'
		row.add({ type = 'label', caption = { '', size, ' tiles' } })
	end
end

local function build_type_items()
	local out = {}
	for _, n in ipairs(VEHICLE_NAMES) do
		local proto = prototypes.entity[n]
		table.insert(out, proto and { 'entity-name.' .. n } or n)
	end
	return out
end

local function build_zone_items()
	local items, ids = {}, {}
	local zones = aai_zones()
	for id, zone in pairs(zones) do
		local name = (type(zone) == 'table' and zone.name) or ('zone-' .. tostring(id))
		table.insert(items, name)
		table.insert(ids, id)
	end
	if #items == 0 then
		table.insert(items, 'No zones')
		table.insert(ids, 0)
	end
	return items, ids
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
	local zone_items = build_zone_items()
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
	local vehicle_name = VEHICLE_NAMES[type_index]
	if not vehicle_name then return end

	local zones = aai_zones()
	local zone_ids = {}
	for id, _ in pairs(zones) do table.insert(zone_ids, id) end
	local target_zone = zone_ids[zone_dd.selected_index]
	if not target_zone then
		player.print('No valid zone selected. Draw a zone with the AAI Zone tool first.')
		return
	end

	local found = player.surface.find_entities_filtered({ name = vehicle_name })
	local dispatched = 0
	for _, v in pairs(found) do
		if v.valid and v.unit_number then
			if aai_set_unit_data(v.unit_number, { target_zone = target_zone, command = 'goto-zone' }) then
				dispatched = dispatched + 1
			end
		end
	end
	player.print({ '', 'Dispatched ', dispatched, ' x ', { 'entity-name.' .. vehicle_name }, ' to zone.' })
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
