local Spawn = {}

local CENTER = { x = 0, y = 0 }
local WALL_HALF = 6

local STARTER_KIT_A = {
	['iron-plate'] = 50,
	['copper-plate'] = 50,
	['stone'] = 25,
	['coal'] = 10,
	['wood'] = 50,
}
local STARTER_KIT_B = {
	['burner-mining-drill'] = 2,
	['stone-furnace'] = 2,
	['transport-belt'] = 25,
	['inserter'] = 10,
	['small-electric-pole'] = 5,
}

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
			local gate_south = math.abs(x) <= 1 and y == half
			local gate_north = math.abs(x) <= 1 and y == -half
			if on_edge and not gate_south and not gate_north then
				surface.create_entity({
					name = 'stone-wall',
					position = { cx + x, cy + y },
					force = 'player',
				})
			end
		end
	end
end

local function place_chest(surface, position, items, indestructible)
	local chest = surface.create_entity({
		name = 'steel-chest',
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
			inv.insert({ name = item, count = count })
		end
	end
	return chest
end

function Spawn.build_compound(surface)
	storage.kbve = storage.kbve or {}
	if storage.kbve.spawn_built then return end

	clear_area(surface, CENTER.x, CENTER.y, WALL_HALF + 2)
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

	place_chest(surface, { CENTER.x - 3, CENTER.y + 2 }, STARTER_KIT_A, false)
	place_chest(surface, { CENTER.x + 3, CENTER.y + 2 }, STARTER_KIT_B, false)

	storage.kbve.spawn_built = true
end

function Spawn.is_market(entity)
	if not (entity and entity.valid) then return false end
	return entity.unit_number == (storage.kbve and storage.kbve.market_unit_number)
end

return Spawn
