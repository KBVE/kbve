--[[
  KBVE Orc Tribute — gift currency for the reputation system.

  No crafting recipe. Intended source: the KBVE Exchange (see
  mods-local/kbve/modules/market.lua). Drop the item on the ground within the
  gift-scan radius of an orc and control.lua's gift sweep awards +15 rep to
  the dropper's force.
]]

local tribute_item = {
	type = "item",
	name = "kbve-orc-tribute",
	icon = "__kbve-orc__/graphics/icon-tribute.png",
	icon_size = 64,
	icon_mipmaps = 4,
	subgroup = "tool",
	order = "z[kbve-orc-tribute]",
	stack_size = 20,
}

data:extend({ tribute_item })
