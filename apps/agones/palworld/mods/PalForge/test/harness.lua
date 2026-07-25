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

local h1 = pos.handle("Al", "/pos", emit, finder_with("Al", 100, 200, 300))
local n_after_h1 = #pos_emits
local h2 = pos.handle("Al", "hello world", emit, finder_with("Al", 1, 2, 3))
local n_after_h2 = #pos_emits
local h3 = pos.handle("Al", "  /POS ", emit, finder_with("Al", 5, 6, 7))
local h4 = pos.handle("Bob", "/pos", emit, function(_) return {} end)

local pos_ok = h1 == true
    and h2 == false
    and n_after_h2 == n_after_h1
    and h3 == true
    and h4 == true
    and pos_emits[1] == "/pos Al -> X=100.0 Y=200.0 Z=300.0"
    and pos_emits[2] == "/pos Al -> X=5.0 Y=6.0 Z=7.0"
    and pos_emits[3]:find("location unresolved", 1, true) ~= nil

_print("=== results ===")
_print(string.format(
    "placed=%d pending=%d setter_callable=%d setter_absent=%d pos_ok=%s",
    calls.placed, calls.pending, calls.setter_callable, calls.setter_absent, tostring(pos_ok)))

local ok = calls.pending == 1
    and calls.placed == 0
    and calls.setter_callable == 1
    and calls.setter_absent == 4
    and pos_ok

if ok then
    _print("HARNESS PASS")
    os.exit(0)
else
    _print("HARNESS FAIL")
    os.exit(1)
end
