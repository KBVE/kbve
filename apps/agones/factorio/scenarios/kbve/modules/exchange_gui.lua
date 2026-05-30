local Coins = require('modules.coins')
local Market = require('modules.market')
local Vault = require('modules.vault')
local Spawn = require('modules.spawn')

local ExchangeGui = {}

local GUI_NAME = 'kbve_exchange'
local TABBED_NAME = 'kbve_tabbed'
local BUY_TAB_CONTENT = 'kbve_buy_content'
local VAULT_TAB_CONTENT = 'kbve_vault_content'
local BUY_PREFIX = 'kbve_buy_'
local SLOT_PREFIX = 'kbve_vault_slot_'
local CLOSE_NAME = 'kbve_close'
local DEPOSIT_ALL = 'kbve_deposit_all'

local function destroy(player)
	if player.gui.screen[GUI_NAME] then
		player.gui.screen[GUI_NAME].destroy()
	end
end

local function render_buy(content, player)
	content.clear()
	content.add({
		type = 'label',
		caption = { '', 'Balance: [item=coin] ', Coins.get_balance(player.index) },
	})
	local scroll = content.add({ type = 'scroll-pane', direction = 'vertical' })
	scroll.style.maximal_height = 480
	scroll.style.minimal_width = 480
	for i, entry in ipairs(Market.ITEMS) do
		local row = scroll.add({ type = 'flow', direction = 'horizontal' })
		row.add({ type = 'sprite-button', sprite = 'item/' .. entry.item, enabled = false })
		row.add({
			type = 'label',
			caption = { '', { 'item-name.' .. entry.item }, '  x', entry.count },
		}).style.minimal_width = 240
		row.add({ type = 'empty-widget' }).style.horizontally_stretchable = true
		row.add({
			type = 'button',
			name = BUY_PREFIX .. i,
			caption = { '', 'Buy ', entry.price, ' [item=coin]' },
		})
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
			btn.tooltip = { 'item-name.' .. slot.name }
		end
	end
	content.add({ type = 'button', name = DEPOSIT_ALL, caption = 'Deposit my entire inventory' })
end

function ExchangeGui.show(player)
	destroy(player)
	local frame = player.gui.screen.add({
		type = 'frame',
		name = GUI_NAME,
		direction = 'vertical',
		caption = 'KBVE Exchange',
	})
	frame.auto_center = true

	local close_flow = frame.add({ type = 'flow', direction = 'horizontal' })
	close_flow.add({ type = 'empty-widget' }).style.horizontally_stretchable = true
	close_flow.add({ type = 'button', name = CLOSE_NAME, caption = 'Close' })

	local tabbed = frame.add({ type = 'tabbed-pane', name = TABBED_NAME })

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

local function refresh_buy(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local tabbed = frame[TABBED_NAME]
	if not tabbed then return end
	local content = tabbed[BUY_TAB_CONTENT]
	if content then render_buy(content, player) end
end

local function refresh_vault(player)
	local frame = player.gui.screen[GUI_NAME]
	if not frame then return end
	local tabbed = frame[TABBED_NAME]
	if not tabbed then return end
	local content = tabbed[VAULT_TAB_CONTENT]
	if content then render_vault(content, player) end
end

local function handle_buy(player, index)
	local entry = Market.ITEMS[index]
	if not entry then return end
	local balance = Coins.get_balance(player.index)
	if balance < entry.price then
		player.print({ '', 'Need ', entry.price, ' coins, balance is ', balance, '.' })
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

function ExchangeGui.on_gui_opened(event)
	if event.gui_type ~= defines.gui_type.entity then return end
	local entity = event.entity
	if not Spawn.is_market(entity) then return end
	local player = game.get_player(event.player_index)
	if not player then return end
	player.opened = nil
	ExchangeGui.show(player)
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
		return
	end

	if name:sub(1, #BUY_PREFIX) == BUY_PREFIX then
		local i = tonumber(name:sub(#BUY_PREFIX + 1))
		if i then
			handle_buy(player, i)
			refresh_buy(player)
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

function ExchangeGui.on_player_left(event)
	local player = game.get_player(event.player_index)
	if not player then return end
	destroy(player)
end

return ExchangeGui
