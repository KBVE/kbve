local Vault = {}

local SIZE = 48

function Vault.init_state()
	storage.kbve = storage.kbve or {}
	storage.kbve.vaults = storage.kbve.vaults or {}
end

function Vault.get_or_create(player_index)
	Vault.init_state()
	local v = storage.kbve.vaults[player_index]
	if not v or not v.valid then
		v = game.create_inventory(SIZE)
		storage.kbve.vaults[player_index] = v
	end
	return v
end

function Vault.size()
	return SIZE
end

return Vault
