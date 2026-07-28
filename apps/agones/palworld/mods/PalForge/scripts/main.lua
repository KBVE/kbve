local MOD = "PalForge"
local RETRY_MS = 15000

local GAMESTATE = "/Script/Pal.PalGameStateInGame"
local CHAT_FN = "/Script/Pal.PalGameStateInGame:BroadcastChatMessage"
local SIGNBOARD_CLASS =
    "/Game/Pal/Blueprint/MapObject/BuildObject/BP_BuildObject_Signboard.BP_BuildObject_Signboard_C"

local placed = false
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

local function pos_emit(msg)
    log(msg)
    chat_write(MOD, msg)
end

local ok_pos, pos = pcall(require, "pos")
if not ok_pos or type(pos) ~= "table" then
    log("pos module load failed: " .. tostring(pos))
    pos = { handle = function() return false end, player_location = function() return nil end }
end

local ok_spike, spike = pcall(require, "spike")
if not ok_spike or type(spike) ~= "table" then
    log("spike module load failed: " .. tostring(spike))
    spike = { handle = function() return false end }
end

local function load_signs()
    local ok, cfg = pcall(require, "signboards")
    if not ok or type(cfg) ~= "table" then
        log("config load failed: " .. tostring(cfg))
        return {}
    end
    return cfg.signs or {}
end

local function coord_str(coords)
    if type(coords) ~= "table" then
        return "?"
    end
    return table.concat(coords, ",")
end

local function spawn_signboard(coords, rot)
    local _ = SIGNBOARD_CLASS
    local _ = coords
    local _ = rot
    return nil
end

local function set_sign_text(actor, text)
    local _ = actor
    local _ = text
    return false
end

local function place_all()
    if placed then
        return
    end
    placed = true

    local signs = load_signs()
    log("placing " .. #signs .. " sign(s)")

    for _, s in ipairs(signs) do
        local actor = spawn_signboard(s.coords, s.rot)
        if actor and set_sign_text(actor, s.text) then
            log("placed sign @ " .. coord_str(s.coords) .. " : " .. tostring(s.text))
        else
            log("PENDING spawn/setter unresolved (Phase 0 spike) @ " .. coord_str(s.coords))
        end
    end
end

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

local function on_chat(_, a, b)
    local sender, text = extract(a)
    if (not text or #text == 0) and b ~= nil then
        sender, text = extract(b)
    end
    if sender and text and #text > 0 then
        pcall(pos.handle, sender, text, pos_emit)
        pcall(spike.handle, sender, text, pos_emit, pos.player_location)
        pcall(spike.spawn, sender, text, pos_emit, pos.player_location)
        pcall(spike.clear, sender, text, pos_emit)
        pcall(spike.signinspect, sender, text, pos_emit)
        pcall(spike.signtrace, sender, text, pos_emit)
        pcall(spike.signplace, sender, text, pos_emit, pos.player_location)
        pcall(spike.httptest, sender, text, pos_emit)
        pcall(spike.curltest, sender, text, pos_emit)
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
        place_all()
        register_chat()
    else
        log("world not ready; retry in " .. (RETRY_MS / 1000) .. "s")
    end
    if not chat_registered then
        pcall(ExecuteWithDelay, RETRY_MS, schedule)
    end
end

log("loaded (spawn/setter pending Phase 0 spike; !pos command active)")
schedule()
