local CHAT_LOG = os.getenv("PALWORLD_CHAT_LOG") or "/shared/chat/chat.log"
local CHAT_FUNC = "/Script/Pal.PalNetworkChatManager:BroadcastChat"

local function log(msg)
    print("[PalChatRelay] " .. msg)
end

local function now_ms()
    return string.format("%d", os.time() * 1000)
end

local function sanitize(s)
    s = s:gsub("[\t\r\n]", " ")
    return s
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

log("loaded; chat log = " .. CHAT_LOG)

local ok, err = pcall(function()
    RegisterHook(CHAT_FUNC, function(self, chat_param)
        local hok, player, text = pcall(function()
            local p = chat_param:get()
            return tostring(p.SenderPlayerName:ToString()), tostring(p.Message:ToString())
        end)
        if hok and player and text and #text > 0 then
            append(player, text)
        end
    end)
end)

if ok then
    log("hook registered on " .. CHAT_FUNC)
else
    log("hook registration FAILED on " .. CHAT_FUNC .. " : " .. tostring(err))
end
