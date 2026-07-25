local M = {}

local function trim(s)
    return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

function M.player_location(sender, finder)
    finder = finder or FindAllOf
    local ok, loc = pcall(function()
        local pcs = finder("PalPlayerController")
        if type(pcs) ~= "table" then
            return nil
        end
        for _, pc in ipairs(pcs) do
            local name
            pcall(function()
                name = pc.PlayerState.PlayerNamePrivate:ToString()
            end)
            if not name then
                pcall(function()
                    name = pc.PlayerState.PlayerName:ToString()
                end)
            end
            if name == sender then
                local pawn = pc.Pawn
                if not pawn and pc.K2_GetPawn then
                    pcall(function()
                        pawn = pc:K2_GetPawn()
                    end)
                end
                if pawn then
                    local v = pawn:K2_GetActorLocation()
                    return { x = v.X, y = v.Y, z = v.Z }
                end
            end
        end
        return nil
    end)
    if ok then
        return loc
    end
    return nil
end

function M.handle(sender, msg, emit, finder)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!pos" then
        return false
    end
    local loc = M.player_location(sender, finder)
    if loc then
        emit(string.format(
            "!pos %s -> X=%.1f Y=%.1f Z=%.1f",
            tostring(sender), loc.x, loc.y, loc.z))
    else
        emit("!pos " .. tostring(sender) .. " -> location unresolved")
    end
    return true
end

return M
