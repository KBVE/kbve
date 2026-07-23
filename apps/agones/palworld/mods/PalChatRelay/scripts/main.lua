local CHAT_LOG = os.getenv("PALWORLD_CHAT_LOG") or "/shared/chat/chat.log"
local CHAT_FUNC = "/Script/Pal.PalNetworkChatManager:BroadcastChat"

local function log(msg)
    print("[PalChatRelay] " .. msg)
end

local function now_ms()
    return string.format("%d", os.time() * 1000)
end

local function sanitize(s)
    return (s:gsub("[\t\r\n]", " "))
end

local function append(player, text)
    local f = io.open(CHAT_LOG, "a")
    if not f then
        log("append failed: cannot open " .. CHAT_LOG)
        return
    end
    f:write(now_ms() .. "\t" .. sanitize(player) .. "\t" .. sanitize(text) .. "\n")
    f:close()
end

local function on_chat(self, chat_param)
    local ok, player, text = pcall(function()
        local p = chat_param:get()
        return tostring(p.SenderPlayerName:ToString()), tostring(p.Message:ToString())
    end)
    if ok and player and text and #text > 0 then
        append(player, text)
    end
end

local registered = false
local function try_register()
    if registered then
        return
    end
    if pcall(RegisterHook, CHAT_FUNC, on_chat) then
        registered = true
        log("chat hook registered on " .. CHAT_FUNC)
    else
        log("chat function not ready; will retry")
    end
end

log("loaded; chat log = " .. CHAT_LOG)

-- The chat manager class is not loaded at mod-init; defer registration so
-- RegisterHook does not error at startup. Retry a few times as the world loads.
try_register()
if not registered then
    pcall(function()
        ExecuteWithDelay(20000, try_register)
        ExecuteWithDelay(60000, try_register)
        ExecuteWithDelay(120000, try_register)
    end)
end
