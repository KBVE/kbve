local Coins = require('modules.coins')
local Market = require('modules.market')
local Vault = require('modules.vault')
local Spawn = require('modules.spawn')
local Npcs = require('modules.npcs')
local NpcPanel = require('modules.npc_panel')

local ExchangeGui = {}

local GUI_NAME = 'kbve_exchange'
local TABBED_NAME = 'kbve_tabbed'
local BUY_TAB_CONTENT = 'kbve_buy_content'
local VAULT_TAB_CONTENT = 'kbve_vault_content'
local BUY_BALANCE_NAME = 'kbve_buy_balance'
local BUY_SCROLL_NAME = 'kbve_buy_scroll'
local BUY_PREFIX = 'kbve_buy_'
local EXCHANGE_RADIUS = 3
local SLOT_PREFIX = 'kbve_vault_slot_'
local CLOSE_NAME = 'kbve_close'
local DEPOSIT_ALL = 'kbve_deposit_all'
local BODY_NAME = 'kbve_exchange_body'
local NPC_PANEL_NAME = 'kbve_npc_panel'
local NPC_NAME_PREFIX = 'kbve_exchange_npc_'

local function render_npc_panel(panel, npc, line)
	NpcPanel.render(panel, npc, line, NPC_NAME_PREFIX)
end

local function destroy(player)
	if player.gui.screen[GUI_NAME] then
		player.gui.screen[GUI_NAME].destroy()
	end
end

local function is_near_exchange(player)
	if not (player and player.valid and player.character) then return false end
	local surface = player.surface
	if not surface then return false end
	local nearby = surface.find_entities_filtered({
		position = player.position,
		radius = EXCHANGE_RADIUS,
		name = 'kbve-exchange',
	})
	return #nearby > 0
end

local function render_buy(content, player)
	content.clear()
	local balance = Coins.get_balance(player.index)
	content.add({
		type = 'label',
		name = BUY_BALANCE_NAME,
		caption = { '', 'Balance: [item=coin] ', balance },
	})
	local scroll = content.add({
		type = 'scroll-pane',
		name = BUY_SCROLL_NAME,
		direction = 'vertical',
	})
	scroll.style.maximal_height = 480
	scroll.style.minimal_width = 480
	for i, entry in ipairs(Market.ITEMS) do
		local proto = prototypes.item[entry.item]
		if proto then
			local row = scroll.add({ type = 'flow', direction = 'horizontal' })
			row.add({
				type = 'sprite',
				sprite = 'item/' .. entry.item,
				tooltip = proto.localised_name,
			})
			row.add({
				type = 'label',
				caption = { '', proto.localised_name, '  x', entry.count },
			}).style.minimal_width = 240
			row.add({ type = 'empty-widget' }).style.horizontally_stretchable = true
			row.add({
				type = 'button',
				name = BUY_PREFIX .. i,
				caption = { '', 'Buy ', entry.price, ' [item=coin]' },
				enabled = balance >= entry.price,
			})
		end
	end
end

local function refresh_balance_state(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local body = frame[BODY_NAME]
	local tabbed = body and body[TABBED_NAME]
	local content = tabbed and tabbed[BUY_TAB_CONTENT]
	if not content then return end
	local balance = Coins.get_balance(player.index)
	local label = content[BUY_BALANCE_NAME]
	if label then
		label.caption = { '', 'Balance: [item=coin] ', balance }
	end
	local scroll = content[BUY_SCROLL_NAME]
	if not scroll then return end
	for _, row in ipairs(scroll.children) do
		for _, child in ipairs(row.children) do
			if child.type == 'button' and child.name:sub(1, #BUY_PREFIX) == BUY_PREFIX then
				local i = tonumber(child.name:sub(#BUY_PREFIX + 1))
				local entry = i and Market.ITEMS[i]
				if entry then
					child.enabled = balance >= entry.price
				end
			end
		end
	end
end

local function render_vault(content, player)
	content.clear()
	content.add({
		type = 'label',
		caption = 'Personal vault — persists across deaths and rejoins.',
	})
	local grid = content.add({ type = 'table', column_count = 8 })
	grid.style.horizontal_spacing = 2
	grid.style.vertical_spacing = 2
	local vault = Vault.get_or_create(player.index)
	for i = 1, Vault.size() do
		local slot = vault[i]
		local btn = grid.add({ type = 'sprite-button', name = SLOT_PREFIX .. i })
		btn.style.size = 40
		if slot.valid_for_read then
			btn.sprite = 'item/' .. slot.name
			btn.number = slot.count
			local proto = prototypes.item[slot.name]
			btn.tooltip = proto and proto.localised_name or slot.name
		end
	end
	content.add({ type = 'button', name = DEPOSIT_ALL, caption = 'Deposit my entire inventory' })
end

local function npc_for_tab(tab_index)
	if tab_index == 2 then return Npcs.SILA end
	return Npcs.VEX
end

function ExchangeGui.show(player)
	destroy(player)
	local frame = player.gui.screen.add({
		type = 'frame',
		name = GUI_NAME,
		direction = 'vertical',
		caption = 'KBVE Exchange',
	})
	local res = player.display_resolution
	local scale = player.display_scale or 1
	local frame_width_est = 760 * scale
	local x = math.max(20, res.width - frame_width_est - 20)
	local y = 80 * scale
	frame.location = { x, y }

	local close_flow = frame.add({ type = 'flow', direction = 'horizontal' })
	close_flow.add({ type = 'empty-widget' }).style.horizontally_stretchable = true
	close_flow.add({ type = 'button', name = CLOSE_NAME, caption = 'Close' })

	local body = frame.add({ type = 'flow', name = BODY_NAME, direction = 'horizontal' })

	local npc_panel = body.add({
		type = 'flow',
		name = NPC_PANEL_NAME,
		direction = 'vertical',
	})
	render_npc_panel(npc_panel, Npcs.VEX, Npcs.greeting(Npcs.VEX, player.index))

	local tabbed = body.add({ type = 'tabbed-pane', name = TABBED_NAME })

	local buy_tab = tabbed.add({ type = 'tab', caption = 'Buy' })
	local buy_content = tabbed.add({
		type = 'flow',
		name = BUY_TAB_CONTENT,
		direction = 'vertical',
	})
	tabbed.add_tab(buy_tab, buy_content)
	render_buy(buy_content, player)

	local vault_tab = tabbed.add({ type = 'tab', caption = 'Vault' })
	local vault_content = tabbed.add({
		type = 'flow',
		name = VAULT_TAB_CONTENT,
		direction = 'vertical',
	})
	tabbed.add_tab(vault_tab, vault_content)
	render_vault(vault_content, player)
end

function ExchangeGui.on_gui_closed(event)
	local elem = event.element
	if elem and elem.valid and elem.name == GUI_NAME then
		elem.destroy()
	end
end

local function refresh_npc(player, npc, line)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local body = frame[BODY_NAME]
	local panel = body and body[NPC_PANEL_NAME]
	if panel then render_npc_panel(panel, npc, line) end
end

local function refresh_buy(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local body = frame[BODY_NAME]
	local tabbed = body and body[TABBED_NAME]
	if not tabbed then return end
	local content = tabbed[BUY_TAB_CONTENT]
	if content then render_buy(content, player) end
end

local function refresh_vault(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local body = frame[BODY_NAME]
	local tabbed = body and body[TABBED_NAME]
	if not tabbed then return end
	local content = tabbed[VAULT_TAB_CONTENT]
	if content then render_vault(content, player) end
end

local function handle_buy(player, index)
	if not is_near_exchange(player) then
		player.print('Too far from the KBVE Exchange.')
		destroy(player)
		return
	end
	local entry = Market.ITEMS[index]
	if not entry then return end
	local balance = Coins.get_balance(player.index)
	if balance < entry.price then
		player.print({ '', 'Need ', entry.price, ' coins, balance is ', balance, '.' })
		refresh_npc(player, Npcs.VEX, Npcs.empty_pocket(Npcs.VEX, player.index + game.tick))
		return
	end
	local inserted = player.insert({ name = entry.item, count = entry.count })
	if inserted == 0 then
		player.print('Inventory full.')
		return
	end
	local cost = math.ceil(entry.price * inserted / entry.count)
	Coins.spend(player.index, cost, 'market_purchase')
	player.print({ '', 'Bought ', inserted, ' x [item=', entry.item, '] for ', cost, ' coins.' })
	refresh_npc(player, Npcs.VEX, Npcs.buy(Npcs.VEX, player.index + game.tick))
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

function ExchangeGui.on_custom_input(event)
	local player = game.get_player(event.player_index)
	if not player or not player.character then return end
	if player.gui.screen[GUI_NAME] then
		destroy(player)
		return
	end
	if not is_near_exchange(player) then return end
	ExchangeGui.show(player)
end

function ExchangeGui.on_tick(event)
	if (event.tick % 30) ~= 0 then return end
	for _, player in pairs(game.connected_players) do
		if player.gui.screen[GUI_NAME] and not is_near_exchange(player) then
			destroy(player)
			player.print('Too far from the KBVE Exchange — closing.')
		end
	end
end

function ExchangeGui.on_gui_click(event)
	local elem = event.element
	if not (elem and elem.valid) then return end
	local name = elem.name
	local player = game.get_player(event.player_index)
	if not player then return end

	if name == CLOSE_NAME then
		destroy(player)
		return
	end

	if name == DEPOSIT_ALL then
		deposit_entire_inventory(player)
		refresh_vault(player)
		refresh_npc(player, Npcs.SILA, Npcs.deposit(Npcs.SILA, player.index + game.tick))
		return
	end

	if name:sub(1, #BUY_PREFIX) == BUY_PREFIX then
		local i = tonumber(name:sub(#BUY_PREFIX + 1))
		if i then
			handle_buy(player, i)
			refresh_balance_state(player)
		end
		return
	end

	if name:sub(1, #SLOT_PREFIX) == SLOT_PREFIX then
		local i = tonumber(name:sub(#SLOT_PREFIX + 1))
		if i then
			handle_slot(player, i, event.shift)
			refresh_vault(player)
		end
	end
end

function ExchangeGui.on_gui_selected_tab_changed(event)
	local elem = event.element
	if not (elem and elem.valid and elem.name == TABBED_NAME) then return end
	local player = game.get_player(event.player_index)
	if not player then return end
	local npc = npc_for_tab(elem.selected_tab_index)
	refresh_npc(player, npc, Npcs.greeting(npc, player.index + game.tick))
end

function ExchangeGui.on_player_left(event)
	local player = game.get_player(event.player_index)
	if not player then return end
	destroy(player)
end

return ExchangeGui
