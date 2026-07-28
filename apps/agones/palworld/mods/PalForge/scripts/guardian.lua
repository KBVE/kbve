local M = {}

local SIGNBOARD_MODEL = "PalMapObjectSignboardModel"
local DETER_FIELDS = { "DeteriorationDamage", "DeteriorationTotalDamage" }

local DEFAULT_GUID = { A = 0x4B425645, B = 0x00000001, C = 0x00000000, D = 0x00000000 }
local DEFAULT_CFG = {
    enabled = false,
    interval_ms = 300000,
    sweep_damage = 1000000.0,
    keep_radius = 5000.0,
    max_per_tick = 20,
    zones = {},
}

local function trim(s)
    return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function load_config()
    local ok, board = pcall(require, "signboards")
    if not ok or type(board) ~= "table" then
        return DEFAULT_CFG, DEFAULT_GUID, {}
    end
    local cfg = {}
    for k, v in pairs(DEFAULT_CFG) do
        cfg[k] = v
    end
    if type(board.guardian) == "table" then
        for k, v in pairs(board.guardian) do
            cfg[k] = v
        end
    end
    local guid = (type(board.server_guid) == "table") and board.server_guid or DEFAULT_GUID
    local signs = (type(board.signs) == "table") and board.signs or {}
    return cfg, guid, signs
end

local state = {
    running = false,
    ticks = 0,
    last = { kept = 0, swept = 0, skipped = 0 },
}

local function full_name(obj)
    local s = "?"
    pcall(function() s = tostring(obj:GetFullName()) end)
    return s
end

local function read_owner(model)
    local s = nil
    pcall(function()
        local g = model:GetBuildPlayerUId_BP()
        s = g
        pcall(function() s = g:ToString() end)
        s = tostring(s)
    end)
    return s
end

local function guid_string(g)
    if type(g) ~= "table" then
        return nil
    end
    return string.format("%08X-%08X-%08X-%08X",
        g.A or 0, g.B or 0, g.C or 0, g.D or 0)
end

local function read_loc(model)
    local loc = nil
    pcall(function()
        local v = model:GetMapObjectModelWorldLocation()
        if v then loc = { x = v.X, y = v.Y, z = v.Z } end
    end)
    if loc then return loc end
    pcall(function()
        local v = model:K2_GetActorLocation()
        if v then loc = { x = v.X, y = v.Y, z = v.Z } end
    end)
    return loc
end

local function dist2(a, bx, by, bz)
    local dx, dy, dz = a.x - bx, a.y - by, a.z - bz
    return dx * dx + dy * dy + dz * dz
end

local function near_config_sign(loc, signs, radius)
    local r2 = radius * radius
    for _, s in ipairs(signs) do
        local c = s.coords
        if type(c) == "table" and c[1] then
            if dist2(loc, c[1], c[2], c[3]) <= r2 then
                return true
            end
        end
    end
    return false
end

local function in_any_zone(loc, zones)
    for _, z in ipairs(zones) do
        if z.radius then
            if dist2(loc, z.x, z.y, z.z) <= (z.radius * z.radius) then
                return true
            end
        end
    end
    return false
end

local function classify(model, cfg, guid, signs)
    local owner = read_owner(model)
    local ours_guid = guid_string(guid)
    if owner and ours_guid and owner == ours_guid then
        return "ours"
    end
    local loc = read_loc(model)
    if not loc then
        return "unknown"
    end
    if near_config_sign(loc, signs, cfg.keep_radius) then
        return "ours"
    end
    if in_any_zone(loc, cfg.zones) then
        return "foreign"
    end
    return "unknown"
end

local function write_deterioration(model, value)
    local ok = true
    for _, f in ipairs(DETER_FIELDS) do
        local w = pcall(function() model[f] = value end)
        ok = ok and w
    end
    return ok
end

function M.tick(emit, find_all, deps)
    deps = deps or {}
    local cfg = deps.cfg
    local guid = deps.guid
    local signs = deps.signs
    if not cfg then
        cfg, guid, signs = load_config()
    end
    local models = find_all(SIGNBOARD_MODEL)
    if type(models) ~= "table" then
        models = {}
    end
    local result = { kept = 0, swept = 0, skipped = 0 }
    for i, m in ipairs(models) do
        if i > (cfg.max_per_tick or 20) then break end
        local kind = classify(m, cfg, guid, signs)
        if kind == "ours" then
            write_deterioration(m, 0.0)
            result.kept = result.kept + 1
        elseif kind == "foreign" then
            write_deterioration(m, cfg.sweep_damage)
            result.swept = result.swept + 1
            emit("guardian: SWEEP " .. full_name(m))
        else
            result.skipped = result.skipped + 1
        end
    end
    state.ticks = state.ticks + 1
    state.last = result
    emit(string.format("guardian: tick kept=%d swept=%d skipped=%d",
        result.kept, result.swept, result.skipped))
    return result
end

local function loop(emit, find_all, cfg, guid, signs, schedule)
    if not state.running then
        return
    end
    M.tick(emit, find_all, { cfg = cfg, guid = guid, signs = signs })
    schedule(cfg.interval_ms, function()
        loop(emit, find_all, cfg, guid, signs, schedule)
    end)
end

function M.start(emit, find_all, schedule)
    if state.running then
        emit("guardian: already running")
        return
    end
    local cfg, guid, signs = load_config()
    state.running = true
    emit(string.format("guardian: START interval=%dms zones=%d (keep=deterioration0, sweep=deterioration%d; FGuid claim stays manual)",
        cfg.interval_ms, #cfg.zones, cfg.sweep_damage))
    loop(emit, find_all, cfg, guid, signs, schedule)
end

function M.stop(emit)
    if not state.running then
        emit("guardian: not running")
        return
    end
    state.running = false
    emit("guardian: STOP")
end

function M.status(emit)
    local cfg = load_config()
    emit(string.format("guardian: running=%s ticks=%d last(kept=%d swept=%d skipped=%d) interval=%dms zones=%d",
        tostring(state.running), state.ticks,
        state.last.kept, state.last.swept, state.last.skipped,
        cfg.interval_ms, #cfg.zones))
end

function M.handle(sender, text, emit, ctx)
    if type(text) ~= "string" then
        return false
    end
    ctx = ctx or {}
    local find_all = ctx.find_all or FindAllOf
    local schedule = ctx.schedule or ExecuteWithDelay
    local cmd = trim(text):lower()

    if cmd == "!guardstart" then
        M.start(emit, find_all, schedule)
        return true
    end
    if cmd == "!guardstop" then
        M.stop(emit)
        return true
    end
    if cmd == "!guardstatus" then
        M.status(emit)
        return true
    end
    if cmd == "!guardtick" then
        emit("guardian: manual single tick (opt-in loop stays off)")
        M.tick(emit, find_all)
        return true
    end
    return false
end

return M
