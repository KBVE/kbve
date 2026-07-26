local SCRIPTS = assert(arg[1], "usage: lua harness.lua <abs path to PalForge/scripts>")
package.path = SCRIPTS .. "/?.lua;" .. package.path

local calls = { pending = 0, placed = 0, setter_callable = 0, setter_absent = 0 }

local _print = print
function print(msg)
    if type(msg) == "string" then
        if msg:find("PENDING", 1, true) then
            calls.pending = calls.pending + 1
        elseif msg:find("placed sign", 1, true) then
            calls.placed = calls.placed + 1
        elseif msg:find("CALLABLE", 1, true) then
            calls.setter_callable = calls.setter_callable + 1
        elseif msg:find("absent/threw", 1, true) then
            calls.setter_absent = calls.setter_absent + 1
        end
    end
    _print(msg)
end

function StaticFindObject(_)
    return { IsValid = function() return true end }
end

function ExecuteWithDelay(_, _) end

function RegisterHook(_, _)
    return true
end

function FindAllOf(_)
    local board = {
        GetSignboardText = function()
            return { ToString = function() return "existing sign text" end }
        end,
        SetText = function() return true end,
    }
    return { board }
end

_print("=== load main.lua ===")
dofile(SCRIPTS .. "/main.lua")

_print("=== load probe.lua ===")
dofile(SCRIPTS .. "/probe.lua")

_print("=== pos.lua command ===")
local pos = require("pos")

local pos_emits = {}
local function emit(m)
    pos_emits[#pos_emits + 1] = m
    _print("  emit: " .. m)
end

local function finder_with(name, x, y, z)
    local pc = {
        PlayerState = { PlayerNamePrivate = { ToString = function() return name end } },
        Pawn = { K2_GetActorLocation = function() return { X = x, Y = y, Z = z } end },
    }
    return function(_)
        return { pc }
    end
end

local h1 = pos.handle("Al", "!pos", emit, finder_with("Al", 100, 200, 300))
local n_after_h1 = #pos_emits
local h2 = pos.handle("Al", "/pos", emit, finder_with("Al", 1, 2, 3))
local n_after_h2 = #pos_emits
local h3 = pos.handle("Al", "  !POS ", emit, finder_with("Al", 5, 6, 7))
local h4 = pos.handle("Bob", "!pos", emit, function(_) return {} end)

local pos_ok = h1 == true
    and h2 == false
    and n_after_h2 == n_after_h1
    and h3 == true
    and h4 == true
    and pos_emits[1] == "!pos Al -> X=100.0 Y=200.0 Z=300.0"
    and pos_emits[2] == "!pos Al -> X=5.0 Y=6.0 Z=7.0"
    and pos_emits[3]:find("location unresolved", 1, true) ~= nil

_print("=== spike.lua command ===")
local spike = require("spike")
local sp_emits = {}
local function sp_emit(m)
    sp_emits[#sp_emits + 1] = m
    _print("  spike: " .. m)
end
local mock_static = function()
    return { IsValid = function() return true end, GetFullName = function() return "SignboardClass" end }
end
local mock_find = function()
    return { GetFullName = function() return "PalGameWorld_0" end }
end
local mock_loc = function()
    return { x = 1, y = 2, z = 3 }
end
local s1 = spike.handle("Al", "!signprobe", sp_emit, mock_loc, mock_static, mock_find)
local s2 = spike.handle("Al", "nope", sp_emit, mock_loc, mock_static, mock_find)
local spike_ok = s1 == true
    and s2 == false
    and sp_emits[1]:find("signprobe: start", 1, true) ~= nil
    and sp_emits[#sp_emits]:find("done", 1, true) ~= nil

_print("=== spike.spawn command ===")
local spawned = {
    IsValid = function() return true end,
    GetFullName = function() return "Signboard_spawned_1" end,
    SetText = function() return true end,
}
local spawn_deps = {
    static_find = function() return { IsValid = function() return false end } end,
    load_asset = function() return { IsValid = function() return true end } end,
    find_first = function()
        return { IsValid = function() return true end, SpawnActor = function() return spawned end }
    end,
}
local sw_emits = {}
local function sw_emit(m)
    sw_emits[#sw_emits + 1] = m
    _print("  spawn: " .. m)
end
local w1 = spike.spawn("Al", "!signspawn", sw_emit, mock_loc, spawn_deps)
local w2 = spike.spawn("Al", "nope", sw_emit, mock_loc, spawn_deps)
local function emitted(list, needle)
    for _, m in ipairs(list) do
        if m:find(needle, 1, true) then return true end
    end
    return false
end
local spawn_ok = w1 == true
    and w2 == false
    and emitted(sw_emits, "ACTOR SPAWNED")
    and sw_emits[#sw_emits]:find("signspawn: done", 1, true) ~= nil

_print("=== spike.httptest command ===")
local ht_emits = {}
local function ht_emit(m)
    ht_emits[#ht_emits + 1] = m
    _print("  http: " .. m)
end
local ht1 = spike.httptest("Al", "!httptest", ht_emit)
local ht2 = spike.httptest("Al", "nope", ht_emit)
local httptest_ok = ht1 == true
    and ht2 == false
    and ht_emits[1]:find("httptest: start", 1, true) ~= nil
    and ht_emits[#ht_emits]:find("httptest: done", 1, true) ~= nil

_print("=== results ===")
_print(string.format(
    "placed=%d pending=%d setter_callable=%d setter_absent=%d pos_ok=%s",
    calls.placed, calls.pending, calls.setter_callable, calls.setter_absent, tostring(pos_ok)))

local ok = calls.pending == 1
    and calls.placed == 0
    and calls.setter_callable == 1
    and calls.setter_absent == 4
    and pos_ok
    and spike_ok
    and spawn_ok
    and httptest_ok

if ok then
    _print("HARNESS PASS")
    os.exit(0)
else
    _print("HARNESS FAIL")
    os.exit(1)
end
