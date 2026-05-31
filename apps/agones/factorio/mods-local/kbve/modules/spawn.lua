local Spawn = {}

local CENTER = { x = 0, y = 0 }
local WALL_HALF = 12

local STARTER_KIT_A = {
	['iron-plate'] = 200,
	['copper-plate'] = 200,
	['steel-plate'] = 100,
	['stone'] = 100,
	['coal'] = 100,
	['wood'] = 100,
}
local STARTER_KIT_B = {
	['burner-mining-drill'] = 5,
	['electric-mining-drill'] = 5,
	['stone-furnace'] = 5,
	['steel-furnace'] = 3,
	['transport-belt'] = 100,
	['fast-transport-belt'] = 50,
	['underground-belt'] = 20,
	['splitter'] = 20,
	['inserter'] = 50,
	['fast-inserter'] = 25,
	['small-electric-pole'] = 25,
	['medium-electric-pole'] = 10,
	['big-electric-pole'] = 5,
	['substation'] = 4,
	['solar-panel'] = 20,
	['accumulator'] = 10,
	['steam-engine'] = 4,
	['boiler'] = 4,
	['offshore-pump'] = 2,
	['pipe'] = 50,
	['pipe-to-ground'] = 10,
	['pump'] = 5,
	['assembling-machine-2'] = 10,
	['lab'] = 4,
	['gun-turret'] = 10,
	['piercing-rounds-magazine'] = 200,
	['radar'] = 4,
}

local WAREHOUSE_KIT_ORE = {
	['iron-ore'] = 5000,
	['copper-ore'] = 5000,
	['stone'] = 2000,
	['coal'] = 2000,
}
local WAREHOUSE_KIT_BUILD = {
	['iron-plate'] = 2000,
	['copper-plate'] = 2000,
	['steel-plate'] = 1000,
	['iron-gear-wheel'] = 1000,
	['copper-cable'] = 2000,
	['electronic-circuit'] = 1000,
	['advanced-circuit'] = 500,
	['processing-unit'] = 100,
	['plastic-bar'] = 500,
	['sulfur'] = 200,
}
local WAREHOUSE_KIT_AAI = {
	['engine-unit'] = 200,
	['electric-engine-unit'] = 100,
	['flying-robot-frame'] = 50,
	['construction-robot'] = 50,
	['logistic-robot'] = 50,
	['solid-fuel'] = 500,
	['rocket-fuel'] = 100,
	['repair-pack'] = 100,
	['big-electric-pole'] = 50,
	['substation'] = 20,
	['roboport'] = 5,
}

local WAREHOUSE_CANDIDATES = {
	'aai-strongbox-warehouse',
	'aai-storehouse',
	'aai-warehouse',
	'aai-container-storage',
	'aai-strongbox-passive-provider',
	'storage-chest',
	'steel-chest',
}

local function pick_warehouse_proto()
	for _, name in ipairs(WAREHOUSE_CANDIDATES) do
		if prototypes.entity[name] then return name end
	end
	return 'steel-chest'
end

local function clear_area(surface, cx, cy, radius)
	local found = surface.find_entities_filtered({
		area = { { cx - radius, cy - radius }, { cx + radius, cy + radius } },
		type = { 'resource', 'tree', 'simple-entity', 'cliff' },
	})
	for _, e in pairs(found) do
		if e.valid then e.destroy() end
	end
end

local function build_walls(surface, cx, cy, half)
	for x = -half, half do
		for y = -half, half do
			local on_edge = math.abs(x) == half or math.abs(y) == half
			local gate_south = math.abs(x) <= 2 and y == half
			local gate_north = math.abs(x) <= 2 and y == -half
			local gate_east = math.abs(y) <= 2 and x == half
			local gate_west = math.abs(y) <= 2 and x == -half
			if on_edge and not gate_south and not gate_north and not gate_east and not gate_west then
				surface.create_entity({
					name = 'stone-wall',
					position = { cx + x, cy + y },
					force = 'player',
				})
			end
		end
	end
end

local function place_chest_named(surface, name, position, items, indestructible)
	local chest = surface.create_entity({
		name = name,
		position = position,
		force = 'player',
	})
	if not (chest and chest.valid) then return nil end
	if indestructible then
		chest.minable = false
		chest.destructible = false
	end
	local inv = chest.get_inventory(defines.inventory.chest)
	if inv and items then
		for item, count in pairs(items) do
			if prototypes.item[item] then
				inv.insert({ name = item, count = count })
			end
		end
	end
	return chest
end

local function place_chest(surface, position, items, indestructible)
	return place_chest_named(surface, 'steel-chest', position, items, indestructible)
end

function Spawn.build_compound(surface)
	storage.kbve = storage.kbve or {}
	if storage.kbve.spawn_built then return end

	clear_area(surface, CENTER.x, CENTER.y, WALL_HALF + 3)
	build_walls(surface, CENTER.x, CENTER.y, WALL_HALF)

	local kind = prototypes.entity['kbve-exchange'] and 'kbve-exchange' or 'market'
	local market = surface.create_entity({
		name = kind,
		position = { CENTER.x, CENTER.y - 1 },
		force = 'neutral',
	})
	if market and market.valid then
		market.destructible = false
		market.minable = false
		market.operable = false
		storage.kbve.market_unit_number = market.unit_number
	end

	local fleet_kind = prototypes.entity['kbve-fleet-commander'] and 'kbve-fleet-commander' or nil
	if fleet_kind then
		local fleet = surface.create_entity({
			name = fleet_kind,
			position = { CENTER.x + 3, CENTER.y - 1 },
			force = 'neutral',
		})
		if fleet and fleet.valid then
			fleet.destructible = false
			fleet.minable = false
			fleet.operable = false
			storage.kbve.fleet_unit_number = fleet.unit_number
		end
	end

	place_chest(surface, { CENTER.x - 4, CENTER.y - 1 }, STARTER_KIT_A, false)
	place_chest(surface, { CENTER.x - 5, CENTER.y - 1 }, STARTER_KIT_B, false)

	local warehouse_proto = pick_warehouse_proto()
	place_chest_named(surface, warehouse_proto, { CENTER.x - 6, CENTER.y + 4 }, WAREHOUSE_KIT_ORE, false)
	place_chest_named(surface, warehouse_proto, { CENTER.x, CENTER.y + 5 }, WAREHOUSE_KIT_BUILD, false)
	place_chest_named(surface, warehouse_proto, { CENTER.x + 6, CENTER.y + 4 }, WAREHOUSE_KIT_AAI, false)

	storage.kbve.warehouse_proto = warehouse_proto
	storage.kbve.spawn_built = true
	game.print({ '', 'KBVE spawn compound built with ', warehouse_proto, ' warehouses.' })
end

function Spawn.is_market(entity)
	if not (entity and entity.valid) then return false end
	return entity.unit_number == (storage.kbve and storage.kbve.market_unit_number)
end

return Spawn
