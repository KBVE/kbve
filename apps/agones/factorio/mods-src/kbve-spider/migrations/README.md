# Migrations

Factorio runs every file in this directory as Lua against existing save games
when a player loads a save that was created against an older version of this
mod. Add files named `<version>.lua` (semver of the version that introduces the
schema change) when:

- The shape of `storage.*` tables changes.
- A prototype name is renamed / removed (use `game.surfaces[...].find_entities_filtered` + `entity.destroy()` to clean stale entities).
- A new event handler depends on `storage.*` state that didn't exist on older saves.

Empty directory is fine — Factorio skips it cleanly.

Reference: https://lua-api.factorio.com/latest/auxiliary/migrations.html
