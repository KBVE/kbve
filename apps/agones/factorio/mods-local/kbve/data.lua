local market_proto = data.raw.market and data.raw.market['market']

if market_proto then
	local exchange = table.deepcopy(market_proto)
	exchange.name = 'kbve-exchange'
	exchange.minable = nil
	exchange.flags = {
		'placeable-neutral',
		'not-rotatable',
		'not-blueprintable',
		'not-deconstructable',
		'placeable-off-grid',
	}
	exchange.localised_name = { 'entity-name.kbve-exchange' }
	exchange.localised_description = { 'entity-description.kbve-exchange' }
	data:extend({ exchange })
end

data:extend({
	{
		type = 'custom-input',
		name = 'kbve-open-exchange',
		key_sequence = '',
		linked_game_control = 'open-gui',
		consuming = 'none',
	},
})
