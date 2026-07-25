local MOD = "PalForge"
local RETRY_MS = 15000

local GAMESTATE = "/Script/Pal.PalGameStateInGame"
local SIGNBOARD_CLASS =
    "/Game/Pal/Blueprint/MapObject/BuildObject/BP_BuildObject_Signboard.BP_BuildObject_Signboard_C"

local placed = false

local function log(msg)
    print("[" .. MOD .. "] " .. msg)
end

local function load_signs()
    local ok, cfg = pcall(require, "signboards")
    if not ok or type(cfg) ~= "table" then
        log("config load failed: " .. tostring(cfg))
        return {}
    end
    return cfg.signs or {}
end

local function coord_str(coords)
    if type(coords) ~= "table" then
        return "?"
    end
    return table.concat(coords, ",")
end

local function spawn_signboard(coords, rot)
    local _ = SIGNBOARD_CLASS
    local _ = coords
    local _ = rot
    return nil
end

local function set_sign_text(actor, text)
    local _ = actor
    local _ = text
    return false
end

local function place_all()
    if placed then
        return
    end
    placed = true

    local signs = load_signs()
    log("placing " .. #signs .. " sign(s)")

    for _, s in ipairs(signs) do
        local actor = spawn_signboard(s.coords, s.rot)
        if actor and set_sign_text(actor, s.text) then
            log("placed sign @ " .. coord_str(s.coords) .. " : " .. tostring(s.text))
        else
            log("PENDING spawn/setter unresolved (Phase 0 spike) @ " .. coord_str(s.coords))
        end
    end
end

local function world_ready()
    local ok, obj = pcall(StaticFindObject, GAMESTATE)
    return ok and obj and obj:IsValid()
end

local function schedule()
    if world_ready() then
        place_all()
        return
    end
    log("world not ready; retry in " .. (RETRY_MS / 1000) .. "s")
    pcall(ExecuteWithDelay, RETRY_MS, schedule)
end

log("loaded (spawn/setter pending Phase 0 spike)")
schedule()
