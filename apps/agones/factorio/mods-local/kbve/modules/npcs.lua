local Npcs = {}

local function pick_line(pool, seed)
	if not pool or #pool == 0 then return '' end
	local idx = ((seed or game.tick) % #pool) + 1
	return pool[idx]
end

local KRESS = {
	id = 'kress',
	name = 'Kress',
	role = 'Fleet Dispatcher',
	portrait = 'kbve_portrait_kress',
	greeting_lines = { 'Fleet ready. Where are we sending them?', 'Every chassis on the board, captain. Your call.', 'Wheels lubed, fuel topped, drivers alert.' },
	mining_lines = { 'Miners en route. They will fan out on arrival.', 'Drill bits warm. Ore is borrowed time anyway.' },
	defense_lines = { 'Defenders deployed. They hold or they fall back.', 'Turrets up. Biters will think twice.' },
	combat_lines = { 'Strike package away. Make it count.', 'No survivors at the target. Acknowledged.' },
	sync_lines = { 'New chassis registered with the grid.', 'Headcount updated. The roster is clean.' },
	unregistered_lines = { 'Some vehicles are still off-grid. Run a sync.', 'I count more cars than transponders. Sync them.' },
}

local MIRA = {
	id = 'mira',
	name = 'Mira',
	role = 'Logistics Officer',
	portrait = 'kbve_portrait_mira',
	greeting_lines = { 'Convoys rolling, manifests clean. How can I help?', 'Routes are short today — fewer biters on the south road.', 'Pickup, dropoff, repeat. Easy job. Mostly.' },
	deposit_lines = { 'Manifest closed. Numbers match.', 'Trunk empty. Next run on the board.' },
}

local RENO = {
	id = 'reno',
	name = 'Reno',
	role = 'Combat Lieutenant',
	portrait = 'kbve_portrait_reno',
	greeting_lines = { 'Reno. What is dying today?', 'Lieutenant on station. Awaiting orders.', 'Walls hold or we move outward. Your call.' },
	rally_lines = { 'On me. Tight wedge. Move.', 'Hold the line — fall back on my mark, not before.' },
}

local SILA = {
	id = 'sila',
	name = 'Sila',
	role = 'Vault Keeper',
	portrait = 'kbve_portrait_sila',
	greeting_lines = { 'Your vault is sealed and surveyed.', 'I keep what dies with you — and what does not.', 'Eight by eight, give or take. Pack tight.' },
	deposit_lines = { 'Tucked away. Safer with me than with you.', 'Counted twice. Logged twice.' },
}

local TANN = {
	id = 'tann',
	name = 'Tann',
	role = 'Field Engineer',
	portrait = 'kbve_portrait_tann',
	greeting_lines = { 'Tann here. Wall holding?', 'Plates are bowed but the rivets hold.', 'Stand clear of the welder.' },
	repair_lines = { 'Patched. It will last the night.', 'Worse on the inside than on the spec sheet.' },
}

local VEX = {
	id = 'vex',
	name = 'Vex',
	role = 'Exchange Keeper',
	portrait = 'kbve_portrait_vex',
	greeting_lines = { 'Welcome to the Exchange, engineer. Spend wisely.', 'Coin moves the factory. What will you trade for?', 'Need stock? My shelves are deep.', 'Quality scales with coin, not vice versa.' },
	buy_lines = { 'A solid pick — back to the line with you.', 'Pleasure doing business.', 'Stamped, sealed, yours.' },
	empty_pocket_lines = { 'Come back when the pockets jingle.', 'No coin, no deal. Mine more.' },
}

Npcs.KRESS = KRESS
Npcs.MIRA = MIRA
Npcs.RENO = RENO
Npcs.SILA = SILA
Npcs.TANN = TANN
Npcs.VEX = VEX

function Npcs.greeting(npc, seed)
	return pick_line(npc.greeting_lines, seed)
end

function Npcs.mining(npc, seed)
	return pick_line(npc.mining_lines, seed)
end

function Npcs.defense(npc, seed)
	return pick_line(npc.defense_lines, seed)
end

function Npcs.combat(npc, seed)
	return pick_line(npc.combat_lines, seed)
end

function Npcs.sync(npc, seed)
	return pick_line(npc.sync_lines, seed)
end

function Npcs.unregistered(npc, seed)
	return pick_line(npc.unregistered_lines, seed)
end

function Npcs.deposit(npc, seed)
	return pick_line(npc.deposit_lines, seed)
end

function Npcs.rally(npc, seed)
	return pick_line(npc.rally_lines, seed)
end

function Npcs.repair(npc, seed)
	return pick_line(npc.repair_lines, seed)
end

function Npcs.buy(npc, seed)
	return pick_line(npc.buy_lines, seed)
end

function Npcs.empty_pocket(npc, seed)
	return pick_line(npc.empty_pocket_lines, seed)
end

return Npcs
