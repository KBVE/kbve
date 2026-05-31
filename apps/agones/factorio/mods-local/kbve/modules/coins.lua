local Coins = {}

local WELCOME_BONUS = 250
local COIN = 'coin'

local MINE_DROP = {
	['iron-ore'] = { chance = 0.01, amount = 1 },
	['copper-ore'] = { chance = 0.01, amount = 1 },
	['stone'] = { chance = 0.01, amount = 1 },
	['coal'] = { chance = 0.005, amount = 1 },
	['uranium-ore'] = { chance = 0.02, amount = 2 },
}

local KILL_REWARD = {
	['small-biter'] = 1,
	['medium-biter'] = 3,
	['big-biter'] = 7,
	['behemoth-biter'] = 15,
	['small-spitter'] = 1,
	['medium-spitter'] = 3,
	['big-spitter'] = 7,
	['behemoth-spitter'] = 15,
	['small-worm-turret'] = 10,
	['medium-worm-turret'] = 20,
	['big-worm-turret'] = 35,
	['behemoth-worm-turret'] = 60,
	['biter-spawner'] = 20,
	['spitter-spawner'] = 20,
}

function Coins.init_state()
	storage.kbve = storage.kbve or {}
	storage.kbve.seen_players = storage.kbve.seen_players or {}
end

local function emit_stats(player_name, amount, reason)
	log(string.format(
		'[STATS] kind=coin_grant player=%s amount=%d reason=%s game_tick=%d',
		player_name or 'unknown',
		amount,
		reason,
		game.tick
	))
end

function Coins.grant(player_index, amount, reason)
	if not amount or amount <= 0 then return 0 end
	local player = game.get_player(player_index)
	if not player then return 0 end
	local inserted = player.insert({ name = COIN, count = amount })
	if inserted > 0 then
		emit_stats(player.name, inserted, reason)
	end
	return inserted
end

function Coins.get_balance(player_index)
	local player = game.get_player(player_index)
	if not player then return 0 end
	local inv = player.get_main_inventory()
	if not inv then return 0 end
	return inv.get_item_count(COIN)
end

function Coins.spend(player_index, amount, reason)
	if not amount or amount <= 0 then return false end
	local player = game.get_player(player_index)
	if not player then return false end
	local inv = player.get_main_inventory()
	if not inv then return false end
	local removed = inv.remove({ name = COIN, count = amount })
	if removed <= 0 then return false end
	emit_stats(player.name, -removed, reason or 'spend')
	return removed == amount
end

function Coins.handle_player_joined(event)
	Coins.init_state()
	local player = game.get_player(event.player_index)
	if not player then return end
	local name = player.name
	if not storage.kbve.seen_players[name] then
		storage.kbve.seen_players[name] = true
		Coins.grant(event.player_index, WELCOME_BONUS, 'welcome')
		player.print({ 'kbve.coin_welcome', name, WELCOME_BONUS })
	end
end

function Coins.handle_pre_player_mined(event)
	local entity = event.entity
	if not (entity and entity.valid) then return end
	local rule = MINE_DROP[entity.name]
	if not rule then return end
	if math.random() < rule.chance then
		Coins.grant(event.player_index, rule.amount, 'mine')
	end
end

function Coins.handle_entity_died(event)
	local cause = event.cause
	if not (cause and cause.valid and cause.type == 'character') then return end
	local player = cause.player
	if not player then return end
	local entity = event.entity
	if not (entity and entity.valid) then return end
	local reward = KILL_REWARD[entity.name]
	if not reward then return end
	Coins.grant(player.index, reward, 'kill')
end

return Coins
