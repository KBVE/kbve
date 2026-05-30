local Vault = require('modules.vault')
local Spawn = require('modules.spawn')

local VaultGui = {}

local GUI_NAME = 'kbve_vault'
local SLOT_PREFIX = 'kbve_vault_slot_'
local CLOSE_NAME = 'kbve_vault_close'
local DEPOSIT_ALL = 'kbve_vault_deposit_all'

local function destroy_existing(player)
	if player.gui.screen[GUI_NAME] then
		player.gui.screen[GUI_NAME].destroy()
	end
end

local function render_grid(content, player)
	content.clear()
	local vault = Vault.get_or_create(player.index)
	local grid = content.add({ type = 'table', column_count = 8 })
	grid.style.horizontal_spacing = 2
	grid.style.vertical_spacing = 2
	for i = 1, Vault.size() do
		local slot = vault[i]
		local btn = grid.add({
			type = 'sprite-button',
			name = SLOT_PREFIX .. i,
			style = 'slot_button',
		})
		btn.tags = { vault_slot = i }
		if slot.valid_for_read then
			btn.sprite = 'item/' .. slot.name
			btn.number = slot.count
			btn.tooltip = { 'item-name.' .. slot.name }
		end
	end
end

function VaultGui.show(player)
	destroy_existing(player)
	local frame = player.gui.screen.add({
		type = 'frame',
		name = GUI_NAME,
		direction = 'vertical',
	})
	frame.auto_center = true

	local title = frame.add({ type = 'flow', direction = 'horizontal' })
	title.add({
		type = 'label',
		caption = { 'kbve.vault_title' },
		style = 'frame_title',
	})
	title.add({ type = 'empty-widget' }).style.horizontally_stretchable = true
	title.add({
		type = 'sprite-button',
		name = CLOSE_NAME,
		style = 'close_button',
		sprite = 'utility/close',
	})

	local body = frame.add({
		type = 'frame',
		direction = 'vertical',
		style = 'inside_shallow_frame_with_padding',
	})
	body.add({
		type = 'label',
		caption = { 'kbve.vault_hint' },
		style = 'description_label',
	})

	local grid_frame = body.add({
		type = 'flow',
		name = 'vault_grid',
		direction = 'vertical',
	})
	render_grid(grid_frame, player)

	local controls = body.add({ type = 'flow', direction = 'horizontal' })
	controls.add({
		type = 'button',
		name = DEPOSIT_ALL,
		caption = { 'kbve.vault_deposit_all' },
	})
end

local function refresh(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local body = frame.children[2]
	if not body then return end
	local grid = body.vault_grid
	if grid then render_grid(grid, player) end
end

local function handle_slot(player, slot_index, shift)
	local vault = Vault.get_or_create(player.index)
	local slot = vault[slot_index]
	local cursor = player.cursor_stack
	if not cursor then return end

	if shift then
		if cursor.valid_for_read then
			local moved = vault.insert(cursor)
			if moved > 0 then
				cursor.count = cursor.count - moved
				if cursor.count <= 0 then cursor.clear() end
			end
		elseif slot.valid_for_read then
			local main = player.get_main_inventory()
			if main then
				local moved = main.insert(slot)
				if moved > 0 then
					slot.count = slot.count - moved
					if slot.count <= 0 then slot.clear() end
				end
			end
		end
		return
	end

	if cursor.valid_for_read then
		cursor.swap_stack(slot)
	elseif slot.valid_for_read then
		cursor.swap_stack(slot)
	end
end

local function deposit_entire_inventory(player)
	local main = player.get_main_inventory()
	if not main then return end
	local vault = Vault.get_or_create(player.index)
	for i = 1, #main do
		local s = main[i]
		if s.valid_for_read then
			local moved = vault.insert(s)
			if moved > 0 then
				s.count = s.count - moved
				if s.count <= 0 then s.clear() end
			end
		end
	end
end

function VaultGui.on_gui_opened(event)
	if event.gui_type ~= defines.gui_type.entity then return end
	local entity = event.entity
	if not Spawn.is_vault_terminal(entity) then return end
	local player = game.get_player(event.player_index)
	if not player then return end
	player.opened = nil
	VaultGui.show(player)
end

function VaultGui.on_gui_click(event)
	local elem = event.element
	if not (elem and elem.valid) then return end
	local name = elem.name
	local player = game.get_player(event.player_index)
	if not player then return end

	if name == CLOSE_NAME then
		destroy_existing(player)
		return
	end

	if name == DEPOSIT_ALL then
		deposit_entire_inventory(player)
		refresh(player)
		return
	end

	if name:sub(1, #SLOT_PREFIX) == SLOT_PREFIX then
		local i = tonumber(name:sub(#SLOT_PREFIX + 1))
		if i then
			handle_slot(player, i, event.shift)
			refresh(player)
		end
	end
end

function VaultGui.on_player_left(event)
	local player = game.get_player(event.player_index)
	if not player then return end
	destroy_existing(player)
end

return VaultGui
