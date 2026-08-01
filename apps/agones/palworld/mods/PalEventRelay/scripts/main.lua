local EVENTS_LOG = os.getenv("PALWORLD_EVENTS_LOG") or "/shared/chat/events.log"
local DEBUG_ALL = os.getenv("PALWORLD_EVENT_DEBUG") == "1"
local RETRY_MS = 15000
local SCAN_MS = tonumber(os.getenv("PALWORLD_EVENT_SCAN_MS") or "") or 20000
local DEATH_DEDUPE_S = 600

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

local SCAN_KINDS = {
    supply = {
        "PalSupplyDrop",
        "BP_SupplyDrop_C",
        "PalCargoDrop",
        "BP_PalCargoDrop_C",
        "PalTreasureBoxSupplyDrop",
        "PalSupplyDropModel",
    },
    meteor = {
        "PalMeteorFragment",
        "BP_Meteor_C",
        "PalMeteorDropSpawner",
        "PalHugeMeteorFragment",
        "PalMeteorDropModel",
    },
    dungeon = {
        "PalDungeonPortal",
        "BP_DungeonEntrance_C",
        "PalOneshotDungeonPortal",
        "PalDungeonPointMarkerModel",
    },
}

local extra = os.getenv("PALWORLD_EVENT_CLASSES")
if extra then
    for pair in extra:gmatch("[^,]+") do
        local kind, cls = pair:match("^%s*(%w+)%s*=%s*(.+)%s*$")
        if kind and cls then
            SCAN_KINDS[kind] = SCAN_KINDS[kind] or {}
            table.insert(SCAN_KINDS[kind], cls)
        end
    end
end

local function log(msg)
    print("[PalEventRelay] " .. msg)
end

local function now_ms()
    return string.format("%d", os.time() * 1000)
end

local function sanitize(s)
    return (s:gsub("[\t\r\n;]", " "))
end

local function append_line(line)
    local f = io.open(EVENTS_LOG, "a")
    if not f then
        log("append failed: cannot open " .. EVENTS_LOG)
        return
    end
    f:write(line .. "\n")
    f:close()
end

local function append(kind, id, x, y)
    append_line(string.format("%s\t%s\t%s\t%.1f\t%.1f", now_ms(), kind, sanitize(id), x, y))
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

local seen_deaths = {}
local seen_count = 0

local function death_seen(full)
    local now = os.time()
    if seen_count > 256 then
        for k, t in pairs(seen_deaths) do
            if now - t > DEATH_DEDUPE_S then
                seen_deaths[k] = nil
                seen_count = seen_count - 1
            end
        end
    end
    local t = seen_deaths[full]
    if t and now - t < DEATH_DEDUPE_S then
        return true
    end
    if not t then
        seen_count = seen_count + 1
    end
    seen_deaths[full] = now
    return false
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
        if death_seen(full) then
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
                    pcall(function()
                        local name = fn:GetFName():ToString()
                        if
                            name:find("Dead")
                            or name:find("Death")
                            or name:find("Defeat")
                        then
                            local full = c .. ":" .. name
                            if
                                not registered[full]
                                and pcall(RegisterHook, full, on_death)
                            then
                                registered[full] = true
                                log("death hook registered on " .. full)
                            end
                        end
                    end)
                end)
            end)
        end
    end
end

local function try_register()
    for _, fn in ipairs(CANDIDATES) do
        if not registered[fn] then
            if pcall(RegisterHook, fn, on_death) then
                registered[fn] = true
                log("death hook registered on " .. fn)
            end
        end
    end
    return next(registered) ~= nil
end

local function schedule()
    harvest_hooks()
    if try_register() then
        log("death hooks active; harvest loop stopped")
        return
    end
    probe_classes()
    log("no death candidate resolved; retrying in " .. (RETRY_MS / 1000) .. "s")
    pcall(ExecuteWithDelay, RETRY_MS, schedule)
end

local scan_found_logged = {}

local function sweep_events()
    local items = {}
    for kind, classes in pairs(SCAN_KINDS) do
        for _, cls in ipairs(classes) do
            local ok, objs = pcall(FindAllOf, cls)
            if ok and objs then
                if not scan_found_logged[cls] then
                    scan_found_logged[cls] = true
                    log("event class active: " .. kind .. "=" .. cls .. " (" .. #objs .. ")")
                end
                for _, obj in ipairs(objs) do
                    local actor, loc = resolve_actor(obj)
                    if actor and loc then
                        items[#items + 1] = string.format(
                            "%s:%s:%.1f:%.1f",
                            kind,
                            sanitize(cls),
                            loc.X,
                            loc.Y
                        )
                    end
                end
            end
        end
    end
    append_line(
        now_ms() .. "\tEVENTS\t" .. (#items > 0 and table.concat(items, ";") or "-")
    )
    if DEBUG_ALL then
        log("event sweep: " .. #items .. " present")
    end
    pcall(ExecuteWithDelay, SCAN_MS, sweep_events)
end

log("loaded; events log = " .. EVENTS_LOG .. "; debug=" .. tostring(DEBUG_ALL))
probe_classes()
schedule()
pcall(ExecuteWithDelay, SCAN_MS, sweep_events)
