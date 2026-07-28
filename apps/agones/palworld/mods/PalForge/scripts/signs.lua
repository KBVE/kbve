local M = {}

local SIGNBOARD_MODEL = "PalMapObjectSignboardModel"
local DETER_FIELDS = { "DeteriorationDamage", "DeteriorationTotalDamage" }

local function trim(s)
    return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

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

local function full_name(obj)
    local s = "?"
    pcall(function() s = tostring(obj:GetFullName()) end)
    return s
end

local function cmd_signhp(emit, find_all)
    emit("signhp: start (read-only; stand near a sign)")
    local models = sign_models(find_all)
    if #models == 0 then
        emit("signhp: no signboard models loaded")
        emit("signhp: done")
        return
    end
    emit("signhp: " .. #models .. " signboard model(s) loaded")
    for i, m in ipairs(models) do
        if i > 5 then break end
        emit("sign " .. i .. " " .. full_name(m))
        pcall(function() emit("  IsDamaged -> " .. tostring(m:IsDamaged())) end)
        pcall(function() emit("  BuildPlayerUId -> " .. tostring(m:GetBuildPlayerUId_BP())) end)
        for _, f in ipairs(DETER_FIELDS) do
            emit("  " .. f .. " = " .. tostring(read_num(m, f)))
        end
    end
    emit("signhp: done")
end

local function cmd_signrepair(emit, find_all)
    emit("signrepair: start (zeroes deterioration on loaded signs; property write only)")
    local models = sign_models(find_all)
    if #models == 0 then
        emit("signrepair: no signboard models loaded")
        emit("signrepair: done")
        return
    end
    local repaired = 0
    for i, m in ipairs(models) do
        if i > 5 then break end
        local full = full_name(m)
        local before = read_num(m, "DeteriorationDamage")
        emit("signrepair: WRITING deterioration=0 on " .. full .. " (before=" .. tostring(before) .. ")")
        local ok = true
        for _, f in ipairs(DETER_FIELDS) do
            local w = pcall(function() m[f] = 0.0 end)
            ok = ok and w
        end
        local after = read_num(m, "DeteriorationDamage")
        emit("signrepair: " .. full .. " DeteriorationDamage " .. tostring(before) ..
            " -> " .. tostring(after) .. " (write_ok=" .. tostring(ok) .. ")")
        repaired = repaired + 1
    end
    emit("signrepair: done repaired=" .. repaired)
end

function M.handle(sender, text, emit, ctx)
    if type(text) ~= "string" then
        return false
    end
    ctx = ctx or {}
    local find_all = ctx.find_all or FindAllOf
    local cmd = trim(text):lower()

    if cmd == "!signhp" then
        cmd_signhp(emit, find_all)
        return true
    end
    if cmd == "!signrepair" then
        cmd_signrepair(emit, find_all)
        return true
    end
    return false
end

return M
