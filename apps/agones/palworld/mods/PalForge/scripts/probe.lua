local MOD = "PalForge/probe"
local RETRY_MS = 15000

local GAMESTATE = "/Script/Pal.PalGameStateInGame"
local SIGNBOARD_SHORT = "BP_BuildObject_Signboard_C"

local SETTER_CANDIDATES = {
    "SetSignboardText",
    "SetText",
    "UpdateText",
    "SetMessage",
    "OnUpdateText",
}

local ran = false

local function log(msg)
    print("[" .. MOD .. "] " .. msg)
end

local function world_ready()
    local ok, obj = pcall(StaticFindObject, GAMESTATE)
    return ok and obj and obj:IsValid()
end

local function find_existing_signboards()
    local ok, list = pcall(FindAllOf, SIGNBOARD_SHORT)
    if not ok or type(list) ~= "table" then
        return {}
    end
    return list
end

local function probe_getter(actor)
    local ok, val = pcall(function()
        return tostring(actor:GetSignboardText():ToString())
    end)
    if ok then
        log("R2 getter GetSignboardText() -> " .. val)
    else
        log("R2 getter GetSignboardText() failed: " .. tostring(val))
    end
end

local function probe_setters(actor)
    for _, name in ipairs(SETTER_CANDIDATES) do
        local ok = pcall(function()
            actor[name](actor, "PalForge probe text")
        end)
        log("R2 setter " .. name .. " -> " .. (ok and "CALLABLE" or "absent/threw"))
    end
end

local function probe_r2()
    local boards = find_existing_signboards()
    log("R2: found " .. #boards .. " existing signboard(s)")
    if #boards == 0 then
        log("R2: no existing signboards to probe; place one in-game then rerun")
        return
    end
    local actor = boards[1]
    probe_getter(actor)
    probe_setters(actor)
end

local function probe_r1()
    log("R1: spawn probe is manual for now — attempt SpawnActor of "
        .. SIGNBOARD_SHORT .. " via UE4SS Live View / world SpawnActor and log result")
end

local function run()
    if ran then
        return
    end
    if not world_ready() then
        log("world not ready; retry in " .. (RETRY_MS / 1000) .. "s")
        pcall(ExecuteWithDelay, RETRY_MS, run)
        return
    end
    ran = true
    log("world ready; running Phase 0 probes")
    probe_r2()
    probe_r1()
    log("probe complete")
end

log("loaded probe (Phase 0 spike; run manually, do not ship)")
run()
