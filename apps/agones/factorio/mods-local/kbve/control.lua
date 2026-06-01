local Coins = require('modules.coins')
local Spawn = require('modules.spawn')
local Vault = require('modules.vault')
local ExchangeGui = require('modules.exchange_gui')
local FleetGui = require('modules.fleet_gui')
local FleetState = require('modules.fleet_state')
local FleetMissions = require('modules.fleet_missions')

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
	FleetGui.on_player_left(event)
end

local function on_gui_click(event)
	ExchangeGui.on_gui_click(event)
	FleetGui.on_gui_click(event)
end

local function on_gui_closed(event)
	ExchangeGui.on_gui_closed(event)
	FleetGui.on_gui_closed(event)
end

local function init_world()
	Coins.init_state()
	Vault.init_state()
	FleetState.init()
	local surface = game.surfaces['nauvis'] or game.surfaces[1]
	if surface then
		Spawn.build_compound(surface)
	end
end

script.on_init(init_world)

script.on_configuration_changed(function()
	Coins.init_state()
	Vault.init_state()
	FleetState.init()
end)

script.on_event(defines.events.on_player_joined_game, on_player_joined)
script.on_event(defines.events.on_player_left_game, on_player_left)
script.on_event(defines.events.on_pre_player_mined_item, Coins.handle_pre_player_mined)
script.on_event(defines.events.on_entity_died, Coins.handle_entity_died)
script.on_event(defines.events.on_gui_click, on_gui_click)
script.on_event(defines.events.on_gui_closed, on_gui_closed)
script.on_event(defines.events.on_gui_selection_state_changed, FleetGui.on_gui_selection_state_changed)
script.on_event(defines.events.on_gui_checked_state_changed, FleetGui.on_gui_checked_state_changed)
script.on_event(defines.events.on_gui_selected_tab_changed, ExchangeGui.on_gui_selected_tab_changed)
script.on_event('kbve-open-exchange', ExchangeGui.on_custom_input)
script.on_event('kbve-open-fleet', FleetGui.on_custom_input)
script.on_event(defines.events.on_tick, FleetMissions.on_tick)
