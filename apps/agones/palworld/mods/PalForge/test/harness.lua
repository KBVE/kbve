local SCRIPTS = assert(arg[1], "usage: lua harness.lua <abs path to PalForge/scripts>")
package.path = SCRIPTS .. "/?.lua;" .. package.path

local _print = print
local loaded_line = nil
function print(msg)
    if type(msg) == "string" and msg:find("PalForge] loaded", 1, true) then
        loaded_line = msg
    end
    _print(msg)
end

function StaticFindObject(_)
    return { IsValid = function() return true end }
end
function ExecuteWithDelay(_, _) end
function RegisterHook(_, _) return true end
function FindFirstOf(_) return { IsValid = function() return true end } end
function FindAllOf(_) return {} end

local function emitted(list, needle)
    for _, m in ipairs(list) do
        if m:find(needle, 1, true) then return true end
    end
    return false
end

_print("=== load main.lua ===")
dofile(SCRIPTS .. "/main.lua")
assert(loaded_line ~= nil, "main.lua did not emit loaded line")

_print("=== pos.lua ===")
local pos = require("pos")
local pos_emits = {}
local function pos_emit(m) pos_emits[#pos_emits + 1] = m; _print("  pos: " .. m) end
local function finder_with(name, x, y, z)
    local pc = {
        PlayerState = { PlayerNamePrivate = { ToString = function() return name end } },
        Pawn = { K2_GetActorLocation = function() return { X = x, Y = y, Z = z } end },
    }
    return function(_) return { pc } end
end
local p1 = pos.handle("Al", "!pos", pos_emit, finder_with("Al", 100, 200, 300))
local p2 = pos.handle("Al", "nope", pos_emit, finder_with("Al", 1, 2, 3))
local pos_ok = p1 == true and p2 == false
    and pos_emits[1] == "!pos Al -> X=100.0 Y=200.0 Z=300.0"

_print("=== signs.lua ===")
local signs = require("signs")
local function sign_model_mock(deter)
    return {
        GetFullName = function() return "PalMapObjectSignboardModel_1" end,
        IsDamaged = function() return deter > 0 end,
        GetBuildPlayerUId_BP = function() return "GUID-ABCD" end,
        DeteriorationDamage = deter,
        DeteriorationTotalDamage = deter,
    }
end
local sign_ctx = { find_all = function() return { sign_model_mock(50) } end }

local hp_emits = {}
local function hp_emit(m) hp_emits[#hp_emits + 1] = m; _print("  signs: " .. m) end
local h1 = signs.handle("Al", "!signhp", hp_emit, sign_ctx)
local h2 = signs.handle("Al", "nope", hp_emit, sign_ctx)
local signhp_ok = h1 == true and h2 == false
    and emitted(hp_emits, "DeteriorationDamage = 50")
    and emitted(hp_emits, "BuildPlayerUId -> GUID-ABCD")
    and emitted(hp_emits, "signhp: done")

local rp_emits = {}
local function rp_emit(m) rp_emits[#rp_emits + 1] = m; _print("  signs: " .. m) end
local r1 = signs.handle("Al", "!signrepair", rp_emit, sign_ctx)
local signrepair_ok = r1 == true
    and emitted(rp_emits, "WRITING deterioration=0")
    and emitted(rp_emits, "-> 0")
    and emitted(rp_emits, "repaired=1")

local cl_emits = {}
local function cl_emit(m) cl_emits[#cl_emits + 1] = m; _print("  signs: " .. m) end
local c1 = signs.handle("Al", "!signclaim", cl_emit, sign_ctx)
local c2 = signs.handle("Al", "nope", cl_emit, sign_ctx)
local signclaim_ok = c1 == true and c2 == false
    and emitted(cl_emits, "WRITING BuildPlayerUId")
    and emitted(cl_emits, "claimed=1")

_print("=== guardian.lua ===")
local guardian = require("guardian")
local function guardian_model(owner, loc, deter)
    return {
        GetFullName = function() return "PalMapObjectSignboardModel_G" end,
        GetBuildPlayerUId_BP = function() return owner end,
        GetMapObjectModelWorldLocation = function() return loc end,
        DeteriorationDamage = deter,
        DeteriorationTotalDamage = deter,
    }
end
local OURS_STR = "4B425645-00000001-00000000-00000000"
local g_cfg = {
    max_per_tick = 20, keep_radius = 5000.0, sweep_damage = 999.0,
    zones = { { x = 0, y = 0, z = 0, radius = 1000.0 } },
}
local g_guid = { A = 0x4B425645, B = 1, C = 0, D = 0 }
local g_signs = { { coords = { 100000, 100000, 100000 } } }

local m_owner = guardian_model(OURS_STR, { X = 500000, Y = 0, Z = 0 }, 50)
local m_coord = guardian_model("SOMEPLAYER", { X = 100000, Y = 100000, Z = 100000 }, 50)
local m_foreign = guardian_model("SOMEPLAYER", { X = 0, Y = 0, Z = 0 }, 50)
local m_unknown = guardian_model("SOMEPLAYER", nil, 50)
local g_find = function() return { m_owner, m_coord, m_foreign, m_unknown } end

local g_emits = {}
local function g_emit(m) g_emits[#g_emits + 1] = m; _print("  guardian: " .. m) end
local tick = guardian.tick(g_emit, g_find, { cfg = g_cfg, guid = g_guid, signs = g_signs })
local classify_ok = tick.kept == 2 and tick.swept == 1 and tick.skipped == 1
    and m_owner.DeteriorationDamage == 0.0
    and m_coord.DeteriorationDamage == 0.0
    and m_foreign.DeteriorationDamage == 999.0
    and m_unknown.DeteriorationDamage == 50

local gr_emits = {}
local function gr_emit(m) gr_emits[#gr_emits + 1] = m; _print("  guardian: " .. m) end
local g_ctx = { find_all = function() return {} end, schedule = function() end }
local gs0 = guardian.handle("Al", "!guardstatus", gr_emit, g_ctx)
local gstart = guardian.handle("Al", "!guardstart", gr_emit, g_ctx)
local gs1 = guardian.handle("Al", "!guardstatus", gr_emit, g_ctx)
local gstop = guardian.handle("Al", "!guardstop", gr_emit, g_ctx)
local gtick = guardian.handle("Al", "!guardtick", gr_emit, g_ctx)
local gnope = guardian.handle("Al", "nope", gr_emit, g_ctx)
local route_ok = gs0 == true and gstart == true and gs1 == true
    and gstop == true and gtick == true and gnope == false
    and emitted(gr_emits, "running=false")
    and emitted(gr_emits, "running=true")
    and emitted(gr_emits, "guardian: STOP")
    and emitted(gr_emits, "manual single tick")
local guardian_ok = classify_ok and route_ok

_print("=== diag.lua ===")
local diag = require("diag")
local d_emits = {}
local function d_emit(m) d_emits[#d_emits + 1] = m; _print("  diag: " .. m) end
local dh = diag.handle("Al", "!httptest", d_emit)
local dc = diag.handle("Al", "!curltest", d_emit)
local dn = diag.handle("Al", "nope", d_emit)
local diag_ok = dh == true and dc == true and dn == false
    and emitted(d_emits, "httptest: done")
    and emitted(d_emits, "curltest: done")

_print("=== results ===")
_print(string.format("pos=%s signhp=%s signrepair=%s signclaim=%s guardian=%s diag=%s",
    tostring(pos_ok), tostring(signhp_ok), tostring(signrepair_ok), tostring(signclaim_ok),
    tostring(guardian_ok), tostring(diag_ok)))

if pos_ok and signhp_ok and signrepair_ok and signclaim_ok and guardian_ok and diag_ok then
    _print("HARNESS PASS")
    os.exit(0)
else
    _print("HARNESS FAIL")
    os.exit(1)
end
