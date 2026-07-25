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

local function trim(s)
    return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function try(emit, label, fn)
    local ok, res = pcall(fn)
    if ok then
        emit("signprobe " .. label .. " -> OK " .. tostring(res))
        return res
    end
    emit("signprobe " .. label .. " -> ERR " .. tostring(res))
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

    local cls = try(emit, "class", function()
        return static_find(SIGNBOARD_CLASS)
    end)
    if cls then
        try(emit, "class:IsValid", function() return cls:IsValid() end)
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

return M
