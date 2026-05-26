local function on_player_joined(event)
    local player = game.get_player(event.player_index)
    if not player then return end
    player.print({"kbve.welcome", player.name})
end

local function on_player_left(event)
    local player = game.get_player(event.player_index)
    if not player then return end
    game.print({"kbve.player_left", player.name})
end

script.on_event(defines.events.on_player_joined_game, on_player_joined)
script.on_event(defines.events.on_player_left_game, on_player_left)
