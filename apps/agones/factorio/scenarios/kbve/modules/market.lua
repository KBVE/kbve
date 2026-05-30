local Market = {}

Market.ITEMS = {
	{ item = 'steel-plate', price = 5, count = 10 },
	{ item = 'plastic-bar', price = 8, count = 10 },
	{ item = 'sulfur', price = 8, count = 10 },
	{ item = 'battery', price = 20, count = 5 },
	{ item = 'advanced-circuit', price = 25, count = 5 },
	{ item = 'processing-unit', price = 100, count = 1 },
	{ item = 'engine-unit', price = 30, count = 2 },
	{ item = 'electric-engine-unit', price = 80, count = 2 },
	{ item = 'flying-robot-frame', price = 150, count = 1 },
	{ item = 'construction-robot', price = 200, count = 1 },
	{ item = 'logistic-robot', price = 250, count = 1 },
	{ item = 'roboport', price = 500, count = 1 },
	{ item = 'modular-armor', price = 500, count = 1 },
	{ item = 'power-armor', price = 2000, count = 1 },
	{ item = 'blueprint', price = 25, count = 1 },
	{ item = 'deconstruction-planner', price = 25, count = 1 },
	{ item = 'blueprint-book', price = 50, count = 1 },
}

function Market.populate(market_entity)
	if not (market_entity and market_entity.valid) then return end
	market_entity.clear_market_items()
	for _, entry in ipairs(Market.ITEMS) do
		market_entity.add_market_item({
			price = { { name = 'coin', count = entry.price } },
			offer = { type = 'give-item', item = entry.item, count = entry.count },
		})
	end
end

return Market
