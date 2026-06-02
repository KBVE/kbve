--[[
  KBVE Spider mod settings.

  Runtime settings (per-map): control.lua reads these via
    settings.global["<name>"].value
  on tick — change without restart by editing in Mod settings → Map.

  Startup settings: data-stage prototype values (ally HP). Requires
  game restart to apply because prototypes are frozen after data-final-fixes.
]]

data:extend({
	{
		type = "double-setting",
		name = "kbve-spider-hatch-seconds",
		setting_type = "runtime-global",
		default_value = 30,
		minimum_value = 1,
		maximum_value = 3600,
		order = "a-a",
	},
	{
		type = "double-setting",
		name = "kbve-spider-sprint-chance",
		setting_type = "runtime-global",
		default_value = 0.45,
		minimum_value = 0,
		maximum_value = 1,
		order = "b-a",
	},
	{
		type = "double-setting",
		name = "kbve-spider-sprint-speed-multiplier",
		setting_type = "startup",
		default_value = 1.9,
		minimum_value = 1.0,
		maximum_value = 5.0,
		order = "z-b",
	},
	{
		type = "double-setting",
		name = "kbve-spider-flee-health-threshold",
		setting_type = "runtime-global",
		default_value = 0.3,
		minimum_value = 0,
		maximum_value = 1,
		order = "c-a",
	},
	{
		type = "int-setting",
		name = "kbve-spider-nervous-pick-count",
		setting_type = "runtime-global",
		default_value = 3,
		minimum_value = 0,
		maximum_value = 20,
		order = "d-a",
	},
	{
		type = "int-setting",
		name = "kbve-spider-ally-max-health",
		setting_type = "startup",
		default_value = 120,
		minimum_value = 1,
		maximum_value = 10000,
		order = "z-a",
	},
})
