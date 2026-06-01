local Npcs = {}

local EXCHANGE_KEEPER = {
	id = 'exchange_keeper',
	name = 'Vex',
	role = 'Exchange Keeper',
	portrait = 'kbve_portrait_1',
	greetings = {
		'Welcome to the Exchange, engineer. Spend wisely.',
		'Coin moves the factory. What will you trade for?',
		'Need stock? My shelves are deep.',
		'Quality scales with coin, not vice versa.',
	},
	buy_lines = {
		'A solid pick — back to the line with you.',
		'Pleasure doing business.',
		'Stamped, sealed, yours.',
	},
	empty_pocket_lines = {
		'Come back when the pockets jingle.',
		'No coin, no deal. Mine more.',
	},
}

local VAULT_KEEPER = {
	id = 'vault_keeper',
	name = 'Sila',
	role = 'Vault Keeper',
	portrait = 'kbve_portrait_2',
	greetings = {
		'Your vault is sealed and surveyed.',
		'I keep what dies with you — and what does not.',
		'Eight by eight, give or take. Pack tight.',
	},
	deposit_lines = {
		'Tucked away. Safer with me than with you.',
		'Counted twice. Logged twice.',
	},
}

local FLEET_DISPATCHER = {
	id = 'fleet_dispatcher',
	name = 'Kress',
	role = 'Fleet Dispatcher',
	portrait = 'kbve_portrait_3',
	greetings = {
		'Fleet ready. Where are we sending them?',
		'Every chassis on the board, captain. Your call.',
		'Wheels lubed, fuel topped, drivers alert.',
	},
	mining_lines = {
		'Miners en route. They will fan out on arrival.',
		'Drill bits warm. Ore is borrowed time anyway.',
	},
	defense_lines = {
		'Defenders deployed. They hold or they fall back.',
		'Turrets up. Biters will think twice.',
	},
	combat_lines = {
		'Strike package away. Make it count.',
		'No survivors at the target. Acknowledged.',
	},
	sync_lines = {
		'New chassis registered with the grid.',
		'Headcount updated. The roster is clean.',
	},
	unregistered_lines = {
		'Some vehicles are still off-grid. Run a sync.',
		'I count more cars than transponders. Sync them.',
	},
}

Npcs.EXCHANGE_KEEPER = EXCHANGE_KEEPER
Npcs.VAULT_KEEPER = VAULT_KEEPER
Npcs.FLEET_DISPATCHER = FLEET_DISPATCHER

local function pick_line(pool, seed)
	if not pool or #pool == 0 then return '' end
	local idx = ((seed or game.tick) % #pool) + 1
	return pool[idx]
end

function Npcs.greeting(npc, seed)
	return pick_line(npc.greetings, seed)
end

function Npcs.buy_line(npc, seed)
	return pick_line(npc.buy_lines, seed)
end

function Npcs.empty_pocket_line(npc, seed)
	return pick_line(npc.empty_pocket_lines, seed)
end

function Npcs.deposit_line(npc, seed)
	return pick_line(npc.deposit_lines, seed)
end

function Npcs.mining_line(npc, seed)
	return pick_line(npc.mining_lines, seed)
end

function Npcs.defense_line(npc, seed)
	return pick_line(npc.defense_lines, seed)
end

function Npcs.combat_line(npc, seed)
	return pick_line(npc.combat_lines, seed)
end

function Npcs.sync_line(npc, seed)
	return pick_line(npc.sync_lines, seed)
end

function Npcs.unregistered_line(npc, seed)
	return pick_line(npc.unregistered_lines, seed)
end

return Npcs
