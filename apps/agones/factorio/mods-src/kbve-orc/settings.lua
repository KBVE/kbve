--[[
  KBVE Orc mod settings.

  Runtime knobs drive the reputation system (kill penalty, daily decay, gift
  detection radius, tier thresholds). Startup knobs configure stats baked into
  prototypes (max HP, melee damage). All knobs are tuned conservatively so the
  default experience is "neutral creature you can befriend or alienate".
]]

data:extend({
	{
		type = "int-setting",
		name = "kbve-orc-rep-kill-penalty",
		setting_type = "runtime-global",
		default_value = 5,
		minimum_value = 0,
		maximum_value = 100,
		order = "a-a",
	},
	{
		type = "int-setting",
		name = "kbve-orc-rep-daily-decay",
		setting_type = "runtime-global",
		default_value = 5,
		minimum_value = 0,
		maximum_value = 100,
		order = "a-b",
	},
	{
		type = "int-setting",
		name = "kbve-orc-tier-hostile-max",
		setting_type = "runtime-global",
		default_value = -50,
		minimum_value = -100,
		maximum_value = 0,
		order = "b-a",
	},
	{
		type = "int-setting",
		name = "kbve-orc-tier-wary-max",
		setting_type = "runtime-global",
		default_value = -10,
		minimum_value = -100,
		maximum_value = 0,
		order = "b-b",
	},
	{
		type = "int-setting",
		name = "kbve-orc-tier-neutral-max",
		setting_type = "runtime-global",
		default_value = 9,
		minimum_value = 0,
		maximum_value = 100,
		order = "b-c",
	},
	{
		type = "int-setting",
		name = "kbve-orc-tier-friendly-max",
		setting_type = "runtime-global",
		default_value = 49,
		minimum_value = 0,
		maximum_value = 100,
		order = "b-d",
	},
	{
		type = "double-setting",
		name = "kbve-orc-gift-scan-radius",
		setting_type = "runtime-global",
		default_value = 4,
		minimum_value = 1,
		maximum_value = 16,
		order = "c-a",
	},
	{
		type = "int-setting",
		name = "kbve-orc-max-health",
		setting_type = "startup",
		default_value = 300,
		minimum_value = 1,
		maximum_value = 10000,
		order = "z-a",
	},
	{
		type = "int-setting",
		name = "kbve-orc-melee-damage",
		setting_type = "startup",
		default_value = 14,
		minimum_value = 1,
		maximum_value = 1000,
		order = "z-b",
	},
})
