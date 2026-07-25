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

_print("=== results ===")
_print(string.format(
    "placed=%d pending=%d setter_callable=%d setter_absent=%d",
    calls.placed, calls.pending, calls.setter_callable, calls.setter_absent))

local ok = calls.pending == 1
    and calls.placed == 0
    and calls.setter_callable == 1
    and calls.setter_absent == 4

if ok then
    _print("HARNESS PASS")
    os.exit(0)
else
    _print("HARNESS FAIL")
    os.exit(1)
end
