local CHAT_LOG = os.getenv("PALWORLD_CHAT_LOG") or "/shared/chat/chat.log"
local RETRY_MS = 15000

local CANDIDATES = {
    "/Script/Pal.PalGameStateInGame:BroadcastChatMessage",
    "/Script/Pal.PalNetworkChatManager:BroadcastChat",
    "/Script/Pal.PalNetworkChatManager:BroadcastChatMessage",
}

local CLASS_PROBES = {
    "/Script/Pal.PalGameStateInGame",
    "/Script/Pal.PalNetworkChatManager",
}

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

local function extract(param)
    local ok, player, text = pcall(function()
        local p = param:get()
        local name = (p.Sender and tostring(p.Sender:ToString()))
            or (p.SenderPlayerName and tostring(p.SenderPlayerName:ToString()))
            or (p.PlayerName and tostring(p.PlayerName:ToString()))
            or "?"
        local msg = (p.Message and tostring(p.Message:ToString()))
            or (p.Text and tostring(p.Text:ToString()))
            or (p.ChatText and tostring(p.ChatText:ToString()))
            or (p.Chat and tostring(p.Chat:ToString()))
            or ""
        return name, msg
    end)
    if ok then
        return player, text
    end
    return nil, nil
end

local function on_chat(self, a, b)
    local player, text = extract(a)
    if (not text or #text == 0) and b ~= nil then
        player, text = extract(b)
    end
    if player and text and #text > 0 then
        append(player, text)
    end
end

local function probe_classes()
    for _, c in ipairs(CLASS_PROBES) do
        local ok, obj = pcall(StaticFindObject, c)
        local found = ok and obj and obj:IsValid()
        log("probe " .. c .. " -> " .. (found and "FOUND" or "absent"))
    end
end

local registered = false

local function try_register()
    if registered then
        return true
    end
    for _, fn in ipairs(CANDIDATES) do
        if pcall(RegisterHook, fn, on_chat) then
            registered = true
            log("chat hook registered on " .. fn)
            return true
        end
    end
    return false
end

local function schedule()
    if try_register() then
        return
    end
    probe_classes()
    log("no chat candidate resolved; retrying in " .. (RETRY_MS / 1000) .. "s")
    pcall(ExecuteWithDelay, RETRY_MS, schedule)
end

log("loaded; chat log = " .. CHAT_LOG .. "; capture v2 (retry-forever + probe)")
probe_classes()
schedule()
