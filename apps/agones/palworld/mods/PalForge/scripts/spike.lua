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

local DESTROY_CANDIDATES = { "K2_DestroyActor", "DestroyActor", "Destroy" }

local spawned = {}

local function is_valid(obj)
    if not obj then
        return false
    end
    local ok, v = pcall(function() return obj:IsValid() end)
    return ok and v
end

local function destroy_actor(a)
    for _, m in ipairs(DESTROY_CANDIDATES) do
        pcall(function() a[m](a) end)
        if not is_valid(a) then
            return m
        end
    end
    return nil
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
        spawned[#spawned + 1] = actor
        emit("signspawn: ACTOR SPAWNED (tracked " .. #spawned .. " this session)")
        try(emit, "actor:GetFullName", function() return actor:GetFullName() end)

        try(emit, "SetReplicates(true)", function() actor:SetReplicates(true) return "ok" end)
        try(emit, "SetReplicateMovement(true)", function() actor:SetReplicateMovement(true) return "ok" end)
        try(emit, "ForceNetUpdate", function() actor:ForceNetUpdate() return "ok" end)
        try(emit, "SetActorHiddenInGame(false)", function() actor:SetActorHiddenInGame(false) return "ok" end)
        try(emit, "SetActorEnableCollision(true)", function() actor:SetActorEnableCollision(true) return "ok" end)
        try(emit, "OnUpdateText", function() actor:OnUpdateText(SPAWN_TEXT) return "ok" end)

        emit("signspawn: scanning actor properties")
        local hits = 0
        pcall(function()
            actor:ForEachProperty(function(prop)
                local name = tostring(prop:GetName())
                local low = name:lower()
                if low:find("mesh") or low:find("model") or low:find("widget")
                    or low:find("param") or low:find("sign") or low:find("concrete")
                    or low:find("root") then
                    hits = hits + 1
                    if hits <= 20 then
                        emit("prop " .. name)
                    end
                end
            end)
        end)
        emit("signspawn: relevant props = " .. hits)
    else
        emit("signspawn: no actor from world:SpawnActor")
    end

    emit("signspawn: done")
    return true
end

function M.clear(sender, msg, emit)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!signclear" then
        return false
    end
    emit("signclear: start (" .. #spawned .. " tracked this session)")
    local destroyed, stale = 0, 0
    for i = #spawned, 1, -1 do
        local a = spawned[i]
        if is_valid(a) then
            local m = destroy_actor(a)
            if m then
                destroyed = destroyed + 1
                emit("signclear destroyed via " .. m)
            else
                emit("signclear FAILED to destroy index " .. i)
            end
        else
            stale = stale + 1
        end
        spawned[i] = nil
    end
    emit("signclear: done destroyed=" .. destroyed .. " stale=" .. stale)
    return true
end

local SUBSYSTEM_CANDIDATES = {
    "PalMapObjectSubsystem",
    "PalMapObjectConcreteModelBase",
    "PalBuildInternalManager",
    "PalBuildObjectManager",
    "PalBuildObjectInterface",
    "PalWorldMapObjectManager",
}

local INSPECT_HINTS = {
    "mesh", "model", "component", "root", "concrete", "sign",
    "widget", "static", "instance", "collision", "text",
}

local function hint_match(name)
    local low = name:lower()
    for _, h in ipairs(INSPECT_HINTS) do
        if low:find(h, 1, true) then
            return true
        end
    end
    return false
end

local function is_tracked(actor)
    for _, a in ipairs(spawned) do
        if a == actor then
            return true
        end
    end
    return false
end

function M.signinspect(sender, msg, emit, find_first, find_all)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!signinspect" then
        return false
    end
    find_first = find_first or FindFirstOf
    find_all = find_all or FindAllOf

    emit("signinspect: start (read-only; compares placed sign vs bare spawn)")

    for _, name in ipairs(SUBSYSTEM_CANDIDATES) do
        local s = find_first(name)
        emit("subsystem " .. name .. " -> " .. (is_valid(s) and "VALID" or "absent"))
    end

    local boards = try(emit, "FindAllOf(signboard)", function()
        return find_all(SIGNBOARD_SHORT)
    end)
    if type(boards) ~= "table" or #boards == 0 then
        emit("signinspect: no signboard instances (place one first)")
        emit("signinspect: done")
        return true
    end
    emit("signinspect instances -> " .. #boards)

    for i, b in ipairs(boards) do
        local tag = is_tracked(b) and "SPAWNED(bare)" or "PLACED?"
        local full = "?"
        pcall(function() full = tostring(b:GetFullName()) end)
        emit(string.format("--- instance %d [%s] %s", i, tag, full))

        local hits = 0
        pcall(function()
            b:ForEachProperty(function(prop)
                local pname = tostring(prop:GetName())
                if not hint_match(pname) then
                    return
                end
                local vdesc = "nil/unread"
                pcall(function()
                    local v = b[pname]
                    if v == nil then
                        vdesc = "nil"
                    elseif type(v) == "userdata" then
                        local fn = "?"
                        pcall(function() fn = tostring(v:GetFullName()) end)
                        vdesc = "obj " .. fn
                    else
                        vdesc = type(v) .. " " .. tostring(v)
                    end
                end)
                hits = hits + 1
                if hits <= 30 then
                    emit("  prop " .. pname .. " = " .. vdesc)
                end
            end)
        end)
        emit(string.format("  instance %d relevant props = %d", i, hits))
    end

    emit("signinspect: done (populated model/mesh props on PLACED = what bare spawn lacks)")
    return true
end

local HTTP_GLOBALS = { "http", "socket", "curl", "https", "ssl" }
local HTTP_MODULES = { "socket", "socket.http", "ssl", "ssl.https", "http", "http.request" }

local CURL_CANDIDATES = { "curl --version", "curl.exe --version" }

function M.curltest(sender, msg, emit)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!curltest" then
        return false
    end
    emit("curltest: start (runs 'curl --version' only; NO network)")

    local ok0 = pcall(function()
        local h = io.popen("echo palforge_popen_ok")
        if h then
            local out = h:read("*l")
            h:close()
            emit("curltest popen echo -> " .. tostring(out))
        else
            emit("curltest popen echo -> no handle")
        end
    end)
    if not ok0 then
        emit("curltest popen echo -> ERR (io.popen blocked)")
    end

    for _, cmd in ipairs(CURL_CANDIDATES) do
        local ok = pcall(function()
            local h = io.popen(cmd .. " 2>&1")
            if not h then
                emit("curltest " .. cmd .. " -> no handle")
                return
            end
            local out = h:read("*l")
            h:close()
            emit("curltest " .. cmd .. " -> " .. tostring(out))
        end)
        if not ok then
            emit("curltest " .. cmd .. " -> ERR")
        end
    end

    emit("curltest: done")
    return true
end

function M.httptest(sender, msg, emit)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!httptest" then
        return false
    end

    emit("httptest: start (capability detection only; NO network, NO exec)")

    emit("httptest package -> " .. type(package))
    if type(package) == "table" then
        emit("httptest package.loadlib -> " .. type(package.loadlib))
        emit("httptest package.cpath -> " .. tostring(package.cpath))
    end
    emit("httptest os.execute -> " .. type(os.execute))
    emit("httptest io.popen -> " .. type(io.popen))

    for _, g in ipairs(HTTP_GLOBALS) do
        emit("httptest global " .. g .. " -> " .. type(_G[g]))
    end

    for _, name in ipairs(HTTP_MODULES) do
        local ok, mod = pcall(require, name)
        emit("httptest require " .. name .. " -> " .. (ok and type(mod) or "absent"))
    end

    emit("httptest: done (nothing loaded, nothing sent)")
    return true
end

return M
