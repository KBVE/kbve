local RETRY_MS = 30000
local MAX_TRIES = 40

local SHIELD_PASSIVES = {
    Shield_Ultra = "TemperatureResist_Heat1Cold1",
    Shield_SF = "TemperatureResist_Heat2Cold2",
    Shield_07 = "TemperatureResist_Heat3Cold3",
}

local ITEM_CLASSES = {
    "PalStaticArmorItemData",
    "PalStaticShieldItemData",
    "PalStaticItemDataBase",
}

local function log(msg)
    print("[PalTweaks] " .. msg)
end

local applied = {}
local tries = 0

local function pending_count()
    local n = 0
    for id in pairs(SHIELD_PASSIVES) do
        if not applied[id] then
            n = n + 1
        end
    end
    return n
end

local function try_apply_object(obj)
    local ok = pcall(function()
        local name = obj:GetFName():ToString()
        local id = nil
        for candidate in pairs(SHIELD_PASSIVES) do
            if name == candidate or name:find("^" .. candidate .. "_") then
                id = candidate
                break
            end
        end
        if not id or applied[id] then
            return
        end
        local passive = SHIELD_PASSIVES[id]
        obj.PassiveSkillName = FName(passive)
        local check = tostring(obj.PassiveSkillName:ToString())
        if check == passive then
            applied[id] = true
            log(("applied %s -> %s (object %s)"):format(id, passive, name))
        else
            log(("write did not stick on %s (read back %s)"):format(name, check))
        end
    end)
    return ok
end

local function sweep()
    tries = tries + 1
    for _, cls in ipairs(ITEM_CLASSES) do
        if pending_count() == 0 then
            break
        end
        local ok, objs = pcall(FindAllOf, cls)
        if ok and objs then
            for _, obj in ipairs(objs) do
                if obj and obj:IsValid() then
                    try_apply_object(obj)
                end
            end
        end
    end
    if pending_count() == 0 then
        log("all shield passives applied")
        return
    end
    if tries >= MAX_TRIES then
        log(("giving up after %d sweeps; still pending: %d"):format(tries, pending_count()))
        return
    end
    pcall(ExecuteWithDelay, RETRY_MS, sweep)
end

log("loaded; patching shield passives outside the PalSchema items loader")
pcall(ExecuteWithDelay, RETRY_MS, sweep)
