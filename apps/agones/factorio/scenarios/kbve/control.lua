local Coins = require('modules.coins')
local Spawn = require('modules.spawn')
local Vault = require('modules.vault')
local ExchangeGui = require('modules.exchange_gui')

local function on_player_joined(event)
	local player = game.get_player(event.player_index)
	if player then
		player.print({ 'kbve.welcome', player.name })
	end
	Coins.handle_player_joined(event)
	Vault.get_or_create(event.player_index)
end

local function on_player_left(event)
	local player = game.get_player(event.player_index)
	if player then
		game.print({ 'kbve.player_left', player.name })
	end
	ExchangeGui.on_player_left(event)
end

local function init_world()
	Coins.init_state()
	Vault.init_state()
	local surface = game.surfaces['nauvis'] or game.surfaces[1]
	if surface then
		Spawn.build_compound(surface)
	end
end

script.on_init(init_world)

script.on_configuration_changed(function()
	Coins.init_state()
	Vault.init_state()
end)

script.on_event(defines.events.on_player_joined_game, on_player_joined)
script.on_event(defines.events.on_player_left_game, on_player_left)
script.on_event(defines.events.on_pre_player_mined_item, Coins.handle_pre_player_mined)
script.on_event(defines.events.on_entity_died, Coins.handle_entity_died)
script.on_event(defines.events.on_gui_opened, ExchangeGui.on_gui_opened)
script.on_event(defines.events.on_gui_click, ExchangeGui.on_gui_click)
