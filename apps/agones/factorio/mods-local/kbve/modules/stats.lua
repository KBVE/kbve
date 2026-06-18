local Stats = {}

Stats.SNAPSHOT_INTERVAL_TICKS = 300

function Stats.snapshot()
	local surface = game.surfaces['nauvis'] or game.surfaces[1]
	local seed = 0
	if surface and surface.map_gen_settings then
		seed = surface.map_gen_settings.seed or 0
	end
	log(string.format(
		'[STATS] kind=snapshot players=%d game_tick=%d seed=%d',
		#game.connected_players,
		game.tick,
		seed
	))
end

function Stats.player_event(kind, player_name)
	log(string.format(
		'[STATS] kind=player_event event=%s player=%s game_tick=%d',
		kind,
		player_name or 'unknown',
		game.tick
	))
end

return Stats
