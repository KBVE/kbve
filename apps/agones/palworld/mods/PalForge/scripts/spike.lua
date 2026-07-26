local M = {}

local SIGNBOARD_CLASS =
    "/Game/Pal/Blueprint/MapObject/BuildObject/BP_BuildObject_Signboard.BP_BuildObject_Signboard_C"

local WORLD_CANDIDATES = { "PalGameWorld", "World" }
local SIGNBOARD_SHORT = "BP_BuildObject_Signboard_C"
local SETTER_CANDIDATES = {
    "SetSignboardText",
    "SetText",
    "SetMessage",
    "UpdateText",
    "OnUpdateText",
}
local PROBE_TEXT = "PalForge R2 probe"
local SPAWN_TEXT = "PalForge spawn test"
local LOAD_CANDIDATES = { "StaticLoadObject", "LoadObject", "LoadAsset" }

local function is_valid(obj)
    if not obj then
        return false
    end
    local ok, v = pcall(function() return obj:IsValid() end)
    return ok and v
end

local function trim(s)
    return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function try(emit, label, fn)
    local ok, res = pcall(fn)
    if ok then
        emit(label .. " -> OK " .. tostring(res))
        return res
    end
    emit(label .. " -> ERR " .. tostring(res))
    return nil
end

function M.handle(sender, msg, emit, loc_fn, static_find, find_first, find_all)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!signprobe" then
        return false
    end
    static_find = static_find or StaticFindObject
    find_first = find_first or FindFirstOf
    find_all = find_all or FindAllOf

    emit("signprobe: start (recon)")

    local cls = try(emit, "class find", function()
        return static_find(SIGNBOARD_CLASS)
    end)
    local cls_valid = is_valid(cls)
    emit("signprobe class find:IsValid -> " .. tostring(cls_valid))
    if not cls_valid then
        emit("signprobe class not loaded; trying load candidates")
        for _, name in ipairs(LOAD_CANDIDATES) do
            local loader = _G[name]
            if type(loader) ~= "function" then
                emit("signprobe load " .. name .. " -> global absent")
            else
                local loaded = try(emit, "load " .. name, function()
                    return loader(SIGNBOARD_CLASS)
                end)
                if is_valid(loaded) then
                    emit("signprobe load " .. name .. " -> VALID class")
                    cls = loaded
                    cls_valid = true
                    break
                end
            end
        end
    end
    if cls_valid then
        try(emit, "class:GetFullName", function() return cls:GetFullName() end)
    end

    for _, name in ipairs(WORLD_CANDIDATES) do
        local w = try(emit, "world(" .. name .. ")", function()
            return find_first(name)
        end)
        if w then
            try(emit, "world(" .. name .. "):GetFullName", function()
                return w:GetFullName()
            end)
        end
    end

    local boards = try(emit, "FindAllOf(signboard)", function()
        return find_all(SIGNBOARD_SHORT)
    end)
    if type(boards) == "table" and #boards > 0 then
        emit("signprobe instances -> " .. #boards)
        local b = boards[1]
        try(emit, "getter GetSignboardText", function()
            return tostring(b:GetSignboardText():ToString())
        end)
        for _, s in ipairs(SETTER_CANDIDATES) do
            try(emit, "setter " .. s, function()
                b[s](b, PROBE_TEXT)
                return "called"
            end)
        end
    else
        emit("signprobe instances -> 0 (place a signboard to probe the setter)")
    end

    local loc = loc_fn and loc_fn(sender) or nil
    if loc then
        emit(string.format("signprobe target %s -> X=%.1f Y=%.1f Z=%.1f",
            tostring(sender), loc.x, loc.y, loc.z))
    else
        emit("signprobe target " .. tostring(sender) .. " -> unresolved")
    end

    emit("signprobe: done (inspect UE4SS.log; a working setter changes an existing sign's text)")
    return true
end

local function resolve_class(emit, static_find, load_asset)
    local c = static_find(SIGNBOARD_CLASS)
    if is_valid(c) then
        emit("signspawn class -> found (loaded)")
        return c
    end
    if type(load_asset) == "function" then
        local ok, loaded = pcall(load_asset, SIGNBOARD_CLASS)
        if ok and is_valid(loaded) then
            emit("signspawn class -> LoadAsset OK")
            return loaded
        end
    end
    emit("signspawn class -> unresolved")
    return nil
end

function M.spawn(sender, msg, emit, loc_fn, deps)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!signspawn" then
        return false
    end
    deps = deps or {}
    local static_find = deps.static_find or StaticFindObject
    local find_first = deps.find_first or FindFirstOf
    local load_asset = deps.load_asset or LoadAsset

    emit("signspawn: start")

    local cls = resolve_class(emit, static_find, load_asset)
    if not cls then
        emit("signspawn: abort — no class")
        return true
    end

    local world = find_first("World")
    if not is_valid(world) then
        emit("signspawn: abort — no world")
        return true
    end

    local loc = loc_fn and loc_fn(sender) or nil
    if not loc then
        emit("signspawn: abort — no location")
        return true
    end
    emit(string.format("signspawn at X=%.1f Y=%.1f Z=%.1f", loc.x, loc.y, loc.z))

    local location = { X = loc.x, Y = loc.y, Z = loc.z }
    local rotation = { Pitch = 0.0, Yaw = 0.0, Roll = 0.0 }

    local actor = try(emit, "world:SpawnActor", function()
        return world:SpawnActor(cls, location, rotation)
    end)

    if is_valid(actor) then
        emit("signspawn: ACTOR SPAWNED")
        try(emit, "actor:GetFullName", function() return actor:GetFullName() end)
        for _, s in ipairs(SETTER_CANDIDATES) do
            try(emit, "spawn setter " .. s, function()
                actor[s](actor, SPAWN_TEXT)
                return "called"
            end)
        end
    else
        emit("signspawn: no actor from world:SpawnActor")
    end

    emit("signspawn: done")
    return true
end

return M
