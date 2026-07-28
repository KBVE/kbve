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

local function value_desc(obj, pname)
    local desc = "nil/unread"
    pcall(function()
        local v = obj[pname]
        if v == nil then
            desc = "nil"
        elseif type(v) == "userdata" then
            local fn = "?"
            pcall(function() fn = tostring(v:GetFullName()) end)
            desc = (is_valid(v) and "OBJ " or "obj(invalid) ") .. fn
        else
            desc = type(v) .. " " .. tostring(v)
        end
    end)
    return desc
end

local function dump_all_props(emit, obj, cap)
    cap = cap or 80
    local n = 0
    pcall(function()
        obj:ForEachProperty(function(prop)
            n = n + 1
            if n <= cap then
                local pname = tostring(prop:GetName())
                emit("  ." .. pname .. " = " .. value_desc(obj, pname))
            end
        end)
    end)
    emit("  (total props = " .. n .. ")")
    return n
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

        emit("signspawn: full property dump (find the model/mesh slot)")
        dump_all_props(emit, actor, 80)
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
    "PalMapObjectModel",
    "PalBuildInternalManager",
    "PalBuildObjectManager",
    "PalBuildObjectInterface",
    "PalWorldMapObjectManager",
    "PalMapObjectManager",
    "PalGameInstanceInGame",
    "PalPlayerBuildComponent",
}

local MODEL_CLASSES = {
    "PalMapObjectSignboardModel",
    "PalMapObjectConcreteModel",
    "PalMapObjectConcreteModelBase",
}

local function full_name(obj)
    local fn = nil
    pcall(function() fn = tostring(obj:GetFullName()) end)
    return fn
end

local function is_tracked(actor)
    local target = full_name(actor)
    for _, a in ipairs(spawned) do
        if a == actor or (target and full_name(a) == target) then
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

    for _, cname in ipairs(MODEL_CLASSES) do
        local models = find_all(cname)
        if type(models) == "table" and #models > 0 then
            emit("model " .. cname .. " -> " .. #models .. " instance(s)")
            local m = models[1]
            local mfull = "?"
            pcall(function() mfull = tostring(m:GetFullName()) end)
            emit("  first: " .. mfull)
            try(emit, "  model:GetSignboardText", function()
                return tostring(m:GetSignboardText():ToString())
            end)
            dump_all_props(emit, m, 60)
        else
            emit("model " .. cname .. " -> none")
        end
    end

    local boards = try(emit, "FindAllOf(signboard)", function()
        return find_all(SIGNBOARD_SHORT)
    end)
    if type(boards) ~= "table" then
        boards = {}
    end
    for _, a in ipairs(spawned) do
        local afull = full_name(a)
        local seen = false
        for _, b in ipairs(boards) do
            if b == a or (afull and full_name(b) == afull) then
                seen = true
                break
            end
        end
        if not seen then
            boards[#boards + 1] = a
        end
    end
    if #boards == 0 then
        emit("signinspect: no signboard instances (FindAllOf nil + none tracked; place/spawn one first)")
        emit("signinspect: done")
        return true
    end
    emit("signinspect instances -> " .. #boards)

    for i, b in ipairs(boards) do
        local tag = is_tracked(b) and "SPAWNED(bare)" or "PLACED?"
        local full = "?"
        pcall(function() full = tostring(b:GetFullName()) end)
        emit(string.format("--- instance %d [%s] %s", i, tag, full))

        dump_all_props(emit, b, 80)
    end

    emit("signinspect: done (populated model/mesh props on PLACED = what bare spawn lacks)")
    return true
end

local SIGNBOARD_ONSETMODEL_CANDS = {
    "/Game/Pal/Blueprint/MapObject/BuildObject/BP_BuildObject_Signboard.BP_BuildObject_Signboard_C:OnSetConcreteModel",
    "BP_BuildObject_Signboard_C:OnSetConcreteModel",
}
local trace_registered = false

function M.signtrace(sender, msg, emit, deps)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!signtrace" then
        return false
    end
    deps = deps or {}
    local register = deps.register or RegisterHook
    local load_asset = deps.load_asset or LoadAsset

    if trace_registered then
        emit("signtrace: already armed — place a signboard and watch for TRACE")
        return true
    end

    emit("signtrace: arming OnSetConcreteModel hook (force-load class first)")
    pcall(load_asset, SIGNBOARD_CLASS)

    local function cb(ctx, model_param)
        pcall(function()
            local actor = ctx and ctx:get()
            local afull = "?"
            pcall(function() afull = tostring(actor:GetFullName()) end)
            emit("TRACE OnSetConcreteModel actor=" .. afull)

            local model = model_param and model_param:get()
            if not model then
                emit("TRACE   model = nil")
                return
            end
            local mfull, mcls = "?", "?"
            pcall(function() mfull = tostring(model:GetFullName()) end)
            pcall(function() mcls = tostring(model:GetClass():GetFullName()) end)
            emit("TRACE   model class = " .. mcls)
            emit("TRACE   model full  = " .. mfull)
            pcall(function()
                emit("TRACE   model outer = " .. tostring(model:GetOuter():GetFullName()))
            end)

            local id_read = false
            pcall(function()
                local id = model:TryGetMapObjectId()
                local s = id
                pcall(function() s = id:ToString() end)
                emit("TRACE   MapObjectId (TryGetMapObjectId) = " .. tostring(s))
                id_read = true
            end)
            if not id_read then
                emit("TRACE   MapObjectId -> TryGetMapObjectId unavailable")
            end
            for _, field in ipairs({ "MapObjectMasterDataId", "BuildObjectId" }) do
                pcall(function()
                    local v = model[field]
                    local s = v
                    pcall(function() s = v:ToString() end)
                    emit("TRACE   " .. field .. " = " .. tostring(s))
                end)
            end
        end)
    end

    for _, fn in ipairs(SIGNBOARD_ONSETMODEL_CANDS) do
        local ok = pcall(register, fn, cb)
        emit("signtrace hook " .. fn .. " -> " .. (ok and "registered" or "FAILED"))
        if ok then
            trace_registered = true
            break
        end
    end
    emit("signtrace: armed=" .. tostring(trace_registered) .. " — now MANUALLY place a signboard")
    return true
end

local ID_MODEL_CLASSES = { "PalMapObjectConcreteModelBase" }

local function read_id(model)
    local s = nil
    pcall(function()
        local id = model:TryGetMapObjectId()
        s = id
        pcall(function() s = id:ToString() end)
        s = tostring(s)
    end)
    if s == nil or s == "" or s == "nil" then
        return nil
    end
    return s
end

local function collect_ids(find_all)
    local set = {}
    for _, cname in ipairs(ID_MODEL_CLASSES) do
        local models = find_all(cname)
        if type(models) == "table" then
            for _, m in ipairs(models) do
                local s = read_id(m)
                if s then
                    set[s] = (set[s] or 0) + 1
                end
            end
        end
    end
    return set
end

function M.mapids(sender, msg, emit, deps)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!mapids" then
        return false
    end
    deps = deps or {}
    local find_all = deps.find_all or FindAllOf

    emit("mapids: start (read-only; live model MapObjectIds)")
    local set = collect_ids(find_all)

    local total, shown = 0, 0
    local signs = {}
    for id, n in pairs(set) do
        total = total + 1
        if id:lower():find("sign", 1, true) then
            signs[#signs + 1] = id .. " (x" .. n .. ")"
        end
        if shown < 25 then
            emit("mapid " .. id .. " x" .. n)
            shown = shown + 1
        end
    end
    emit("mapids: unique ids = " .. total .. " (showed " .. shown .. ")")
    if #signs > 0 then
        emit("mapids SIGN matches -> " .. table.concat(signs, " | "))
    else
        emit("mapids: no id containing 'sign' among live models")
    end
    emit("mapids: done")
    return true
end

function M.signtry(sender, msg, emit, loc_fn, deps)
    if type(msg) ~= "string" then
        return false
    end
    local body = trim(msg)
    local id = body:match("^[!]signtry%s+(.+)$")
    if not id then
        if body:lower() == "!signtry" then
            emit("signtry: usage !signtry <MapObjectId> (id must exist among live models)")
            return true
        end
        return false
    end
    id = trim(id)

    deps = deps or {}
    local find_first = deps.find_first or FindFirstOf
    local find_all = deps.find_all or FindAllOf

    emit("signtry: request id='" .. id .. "'")

    local known = collect_ids(find_all)
    if not known[id] then
        emit("signtry: REFUSED — id '" .. id .. "' not found among live models (avoid null-row crash). Run !mapids.")
        return true
    end
    emit("signtry: id validated (x" .. known[id] .. " live)")

    local mgr = find_first("PalMapObjectManager")
    if not is_valid(mgr) then
        emit("signtry: abort — PalMapObjectManager not found")
        return true
    end

    local loc = loc_fn and loc_fn(sender) or nil
    if not loc then
        emit("signtry: abort — no location")
        return true
    end

    local location = { X = loc.x, Y = loc.y, Z = loc.z }
    local rotation = { Pitch = 0.0, Yaw = 0.0, Roll = 0.0 }

    local in_thread = deps.in_thread or ExecuteInGameThread
    emit("signtry: ExecuteInGameThread -> " .. type(in_thread))

    local function do_spawn()
        emit(string.format(
            "signtry: CALLING RequestSpawnMapObject_Server id='%s' loc=%.1f,%.1f,%.1f",
            id, loc.x, loc.y, loc.z))
        local ok, res = pcall(function()
            return mgr:RequestSpawnMapObject_Server(id, location, rotation)
        end)
        emit("signtry: RETURNED ok=" .. tostring(ok) .. " res=" .. tostring(res))
        if ok and res == true then
            emit("signtry: SUCCESS — LOOK for the object")
        end
        emit("signtry: done")
    end

    if type(in_thread) == "function" then
        emit("signtry: dispatching spawn on game thread (may crash — pre-logged)")
        local disp_ok = pcall(in_thread, do_spawn)
        if not disp_ok then
            emit("signtry: ExecuteInGameThread dispatch ERR — falling back to direct")
            do_spawn()
        end
    else
        emit("signtry: no ExecuteInGameThread — direct call (may crash — pre-logged)")
        do_spawn()
    end
    return true
end

local SIGNBOARD_MODEL = "PalMapObjectSignboardModel"
local DETER_FIELDS = { "DeteriorationDamage", "DeteriorationTotalDamage" }

local function sign_models(find_all)
    local models = find_all(SIGNBOARD_MODEL)
    if type(models) ~= "table" then
        return {}
    end
    return models
end

local function read_num(obj, field)
    local v = nil
    pcall(function() v = obj[field] end)
    return v
end

function M.signhp(sender, msg, emit, deps)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!signhp" then
        return false
    end
    deps = deps or {}
    local find_all = deps.find_all or FindAllOf

    emit("signhp: start (read-only; stand near a sign)")
    local models = sign_models(find_all)
    if #models == 0 then
        emit("signhp: no signboard models loaded")
        emit("signhp: done")
        return true
    end
    emit("signhp: " .. #models .. " signboard model(s) loaded")

    for i, m in ipairs(models) do
        if i > 5 then break end
        local full = "?"
        pcall(function() full = tostring(m:GetFullName()) end)
        emit("sign " .. i .. " " .. full)
        pcall(function() emit("  IsDamaged -> " .. tostring(m:IsDamaged())) end)
        for _, f in ipairs(DETER_FIELDS) do
            emit("  " .. f .. " = " .. tostring(read_num(m, f)))
        end
    end
    emit("signhp: done")
    return true
end

function M.signrepair(sender, msg, emit, deps)
    if type(msg) ~= "string" or trim(msg):lower() ~= "!signrepair" then
        return false
    end
    deps = deps or {}
    local find_all = deps.find_all or FindAllOf

    emit("signrepair: start (zeroes deterioration on loaded signs; property write only)")
    local models = sign_models(find_all)
    if #models == 0 then
        emit("signrepair: no signboard models loaded")
        emit("signrepair: done")
        return true
    end

    local repaired = 0
    for i, m in ipairs(models) do
        if i > 5 then break end
        local full = "?"
        pcall(function() full = tostring(m:GetFullName()) end)
        local before = read_num(m, "DeteriorationDamage")
        emit("signrepair: WRITING deterioration=0 on " .. full .. " (before=" .. tostring(before) .. ")")
        local ok = true
        for _, f in ipairs(DETER_FIELDS) do
            local w = pcall(function() m[f] = 0.0 end)
            ok = ok and w
        end
        local after = read_num(m, "DeteriorationDamage")
        emit("signrepair: " .. full .. " DeteriorationDamage " .. tostring(before) .. " -> " .. tostring(after) .. " (write_ok=" .. tostring(ok) .. ")")
        repaired = repaired + 1
    end
    emit("signrepair: done repaired=" .. repaired)
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
