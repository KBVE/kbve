local EVENTS_LOG = os.getenv("PALWORLD_EVENTS_LOG") or "/shared/chat/events.log"
local DEBUG_ALL = os.getenv("PALWORLD_EVENT_DEBUG") == "1"
local RETRY_MS = 15000

local CANDIDATES = {
    "/Script/Pal.PalCharacterParameterComponent:OnDeath",
    "/Script/Pal.PalIndividualCharacterParameter:NotifyDead",
    "/Script/Pal.PalCharacter:OnDeath",
    "/Script/Pal.PalCharacterManager:NotifyDeadCharacter",
    "/Script/Pal.PalDeadBodyManagerComponent:OnCreateDeadBody",
    "/Script/Pal.PalBossBattleManager:OnBossDefeated",
}

local CLASS_PROBES = {
    "/Script/Pal.PalCharacterManager",
    "/Script/Pal.PalCharacterParameterComponent",
    "/Script/Pal.PalBossBattleManager",
}

local function log(msg)
    print("[PalEventRelay] " .. msg)
end

local function now_ms()
    return string.format("%d", os.time() * 1000)
end

local function sanitize(s)
    return (s:gsub("[\t\r\n]", " "))
end

local function append(kind, id, x, y)
    local f = io.open(EVENTS_LOG, "a")
    if not f then
        log("append failed: cannot open " .. EVENTS_LOG)
        return
    end
    f:write(string.format("%s\t%s\t%s\t%.1f\t%.1f\n", now_ms(), kind, sanitize(id), x, y))
    f:close()
end

local function resolve_actor(obj)
    if not obj or not obj.IsValid or not obj:IsValid() then
        return nil
    end
    local ok, loc = pcall(function()
        return obj:K2_GetActorLocation()
    end)
    if ok and loc then
        return obj, loc
    end
    local ok2, owner = pcall(function()
        return obj:GetOwner()
    end)
    if ok2 and owner and owner:IsValid() then
        local ok3, loc2 = pcall(function()
            return owner:K2_GetActorLocation()
        end)
        if ok3 and loc2 then
            return owner, loc2
        end
    end
    return nil
end

local function is_boss_name(name)
    local u = name:upper()
    return u:find("BOSS_", 1, true) ~= nil or u:find("GYM_", 1, true) ~= nil
end

local function on_death(self, ...)
    local ok, err = pcall(function()
        local obj = self and self:get()
        local actor, loc = resolve_actor(obj)
        if not actor then
            return
        end
        local full = tostring(actor:GetFullName() or "?")
        if DEBUG_ALL then
            log("death observed: " .. full)
        end
        if not is_boss_name(full) then
            return
        end
        append("BOSS_DEFEAT", full, loc.X, loc.Y)
        log("boss defeat recorded: " .. full)
    end)
    if not ok and DEBUG_ALL then
        log("on_death handler error: " .. tostring(err))
    end
end

local registered = {}

local function probe_classes()
    for _, c in ipairs(CLASS_PROBES) do
        local ok, obj = pcall(StaticFindObject, c)
        local found = ok and obj and obj:IsValid()
        log("probe " .. c .. " -> " .. (found and "FOUND" or "absent"))
    end
end

local function harvest_hooks()
    for _, c in ipairs(CLASS_PROBES) do
        local ok, cls = pcall(StaticFindObject, c)
        if ok and cls and cls:IsValid() then
            pcall(function()
                cls:ForEachFunction(function(fn)
                    local ok2 = pcall(function()
                        local name = fn:GetFName():ToString()
                        if
                            name:find("Dead")
                            or name:find("Death")
                            or name:find("Defeat")
                        then
                            local full = c .. ":" .. name
                            log("candidate fn discovered: " .. full)
                            if
                                not registered[full]
                                and pcall(RegisterHook, full, on_death)
                            then
                                registered[full] = true
                                log("death hook registered on " .. full)
                            end
                        end
                    end)
                    if not ok2 and DEBUG_ALL then
                        log("harvest iteration error on " .. c)
                    end
                end)
            end)
        end
    end
end

local function try_register()
    local any = false
    for _, fn in ipairs(CANDIDATES) do
        if not registered[fn] then
            if pcall(RegisterHook, fn, on_death) then
                registered[fn] = true
                log("death hook registered on " .. fn)
            end
        end
        if registered[fn] then
            any = true
        end
    end
    return any
end

local function schedule()
    harvest_hooks()
    if try_register() then
        return
    end
    probe_classes()
    log("no death candidate resolved; retrying in " .. (RETRY_MS / 1000) .. "s")
    pcall(ExecuteWithDelay, RETRY_MS, schedule)
end

log("loaded; events log = " .. EVENTS_LOG .. "; debug=" .. tostring(DEBUG_ALL))
probe_classes()
schedule()
