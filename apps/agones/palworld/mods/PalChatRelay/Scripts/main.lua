local CHAT_LOG = os.getenv("PALWORLD_CHAT_LOG") or "/palworld/chat-relay/chat.log"
local CHAT_FUNC = "/Script/Pal.PalNetworkChatManager:BroadcastChat"

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
        return
    end
    f:write(now_ms() .. "\t" .. sanitize(player) .. "\t" .. sanitize(text) .. "\n")
    f:close()
end

RegisterHook(CHAT_FUNC, function(self, chat_param)
    local ok, player, text = pcall(function()
        local p = chat_param:get()
        return tostring(p.SenderPlayerName:ToString()), tostring(p.Message:ToString())
    end)
    if ok and player and text and #text > 0 then
        append(player, text)
    end
end)
