local market_proto = data.raw.market and data.raw.market['market']

local function clone_market_as(new_name)
	if not market_proto then return nil end
	local clone = table.deepcopy(market_proto)
	clone.name = new_name
	clone.minable = nil
	clone.flags = {
		'placeable-neutral',
		'not-rotatable',
		'not-blueprintable',
		'not-deconstructable',
		'placeable-off-grid',
	}
	clone.localised_name = { 'entity-name.' .. new_name }
	clone.localised_description = { 'entity-description.' .. new_name }
	return clone
end

local exchange = clone_market_as('kbve-exchange')
local fleet = clone_market_as('kbve-fleet-commander')

local to_add = {}
if exchange then table.insert(to_add, exchange) end
if fleet then table.insert(to_add, fleet) end

table.insert(to_add, {
	type = 'custom-input',
	name = 'kbve-open-exchange',
	key_sequence = '',
	linked_game_control = 'open-gui',
	consuming = 'none',
})

table.insert(to_add, {
	type = 'custom-input',
	name = 'kbve-open-fleet',
	key_sequence = '',
	linked_game_control = 'open-gui',
	consuming = 'none',
})

for i = 1, 6 do
	table.insert(to_add, {
		type = 'sprite',
		name = 'kbve_portrait_' .. i,
		filename = '__kbve__/graphics/portraits/portrait_' .. i .. '.png',
		width = 640,
		height = 960,
		flags = { 'gui-icon' },
	})
end

data:extend(to_add)
