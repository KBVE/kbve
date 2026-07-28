local MOD = "PalForge"
local RETRY_MS = 15000

local GAMESTATE = "/Script/Pal.PalGameStateInGame"
local CHAT_FN = "/Script/Pal.PalGameStateInGame:BroadcastChatMessage"

local chat_registered = false
local CHAT_LOG = os.getenv("PALWORLD_CHAT_LOG") or "/shared/chat/chat.log"

local function log(msg)
    print("[" .. MOD .. "] " .. msg)
end

local function now_ms()
    return string.format("%d", os.time() * 1000)
end

local function chat_write(sender, text)
    local f = io.open(CHAT_LOG, "a")
    if not f then
        return
    end
    local clean = text:gsub("[\t\r\n]", " ")
    f:write(now_ms() .. "\t" .. sender .. "\t" .. clean .. "\n")
    f:close()
end

local function emit(msg)
    log(msg)
    chat_write(MOD, msg)
end

local function require_module(name, fallback)
    local ok, mod = pcall(require, name)
    if not ok or type(mod) ~= "table" then
        log(name .. " module load failed: " .. tostring(mod))
        return fallback
    end
    return mod
end

local pos = require_module("pos", { handle = function() return false end, player_location = function() return nil end })
local signs = require_module("signs", { handle = function() return false end })
local diag = require_module("diag", { handle = function() return false end })

local function extract(param)
    local ok, sender, text = pcall(function()
        local p = param:get()
        local name = (p.Sender and tostring(p.Sender:ToString())) or "?"
        local msg = (p.Message and tostring(p.Message:ToString())) or ""
        return name, msg
    end)
    if ok then
        return sender, text
    end
    return nil, nil
end

local function dispatch(sender, text)
    local ctx = { locate = pos.player_location }
    pcall(pos.handle, sender, text, emit, pos.player_location)
    pcall(signs.handle, sender, text, emit, ctx)
    pcall(diag.handle, sender, text, emit)
end

local function on_chat(_, a, b)
    local sender, text = extract(a)
    if (not text or #text == 0) and b ~= nil then
        sender, text = extract(b)
    end
    if sender and text and #text > 0 then
        dispatch(sender, text)
    end
end

local function register_chat()
    if chat_registered then
        return
    end
    if pcall(RegisterHook, CHAT_FN, on_chat) then
        chat_registered = true
        log("chat command hook registered on " .. CHAT_FN)
    end
end

local function world_ready()
    local ok, obj = pcall(StaticFindObject, GAMESTATE)
    return ok and obj and obj:IsValid()
end

local function schedule()
    if world_ready() then
        register_chat()
    else
        log("world not ready; retry in " .. (RETRY_MS / 1000) .. "s")
    end
    if not chat_registered then
        pcall(ExecuteWithDelay, RETRY_MS, schedule)
    end
end

log("loaded (commands: !pos !signhp !signrepair !httptest !curltest)")
schedule()
