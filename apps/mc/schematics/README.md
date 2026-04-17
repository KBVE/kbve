# MC Schematics

Versioned WorldEdit schematics that get pasted into the survival world after
every map rotation. The pinned seed (`-4470905440626961808`) means the
underlying terrain — coastlines, biomes, sea level — is identical across
prod, dev, CI, and contributor laptops, so a schematic exported from any
environment pastes cleanly into every other one.

This directory is the **single source of truth** for any persistent build
that should survive a map wipe — the main city, ports, dungeon entrances,
event arenas, and anything else we want to re-establish on world reset.
Future tooling (the rotation job, event spawners, automated dungeons) reads
from here.

## Format

Sponge Schematic v2 (`.schem`), the default WorldEdit 7.4 export. Avoid the
older `.schematic` (legacy MCEdit) format — it doesn't carry block-entity NBT
correctly for modded blocks.

## Layout

```
apps/mc/schematics/
├── README.md          ← this file
├── manifest.toml      ← what gets pasted, where, in what order
└── *.schem            ← Sponge v2 schematic blobs (gzipped NBT)
```

Schematics are flat in the directory; logical grouping (city/ports/etc.)
lives in `manifest.toml`, not in subdirectories. This keeps the WorldEdit
schematic name (used by `//schematic load <name>`) a single token and avoids
path quoting headaches when the rotation job RCONs the paste commands.

## Where the server looks for these

Inside the running survival pod, WorldEdit Fabric reads from
`/data/config/worldedit/schematics/`. The rotation job copies every `.schem`
from this directory into that path before triggering the paste, so the names
in `manifest.toml` must match the bare filename (without the `.schem`
extension).

## Contributor workflow — exporting a build

1. Connect to the local dev server (`nx run mc:dev`, then join
   `localhost:25565` with a Java client).
2. Op yourself in the Velocity console: `op <yourname>`.
3. Stand at one corner of the build and run `//pos1`, then the opposite
   corner and `//pos2`. Verify the bounding box covers what you want
   with `//size`.
4. Copy with the **paste origin set to a known anchor** — this matters
   because the rotation job pastes at fixed coordinates from
   `manifest.toml`. Stand exactly at the anchor block (the block the
   manifest's `paste_at` coordinates should land on) and run `//copy`.
   That makes the copy's origin offset relative to your feet, so paste
   coords are predictable.
5. Save: `//schem save <name>`. The file lands in
   `/data/config/worldedit/schematics/<name>.schem` inside the container.
6. Pull it out of the container into the repo:
    ```sh
    docker cp kbve-mc-dev-fabric:/data/config/worldedit/schematics/<name>.schem \
        apps/mc/schematics/<name>.schem
    ```
7. Add an entry to `manifest.toml` (see schema below) and commit both
   files together.

## Manual paste recipe — validating end-to-end

Before wiring this into the rotation job, validate the paste mechanism
works against the dev server. From a fresh dev stack with a placeholder
schematic at `apps/mc/schematics/test_pillar.schem`:

```sh
# 1. Drop the schematic into the dev container
docker cp apps/mc/schematics/test_pillar.schem \
    kbve-mc-dev-fabric:/data/config/worldedit/schematics/test_pillar.schem

# 2. RCON in (password: dev) and paste it
mcrcon -H localhost -P 25575 -p dev "schematic load test_pillar"
mcrcon -H localhost -P 25575 -p dev "pos1 100 70 100"
mcrcon -H localhost -P 25575 -p dev "paste -a"
```

If the pillar appears at (100, 70, 100), the primitive works and the
rotation job can drive the same flow with `manifest.toml` as input.

If `paste` fails because WorldEdit needs a player session, that's the
known Fabric-WE limitation and we'll need an alternate mechanism (a
small Fabric mod that pastes on first boot, or `worldedit-cli` offline
paste). Document the failure mode here before redesigning.

## manifest.toml schema

```toml
# Each [[schematic]] entry is one paste operation, applied in array order.
# The rotation job iterates entries and runs the equivalent of:
#   //schem load <name>
#   //pos1 <paste_at>
#   //paste -a
#
# Coordinates are absolute world block coords (overworld). The pinned seed
# guarantees the terrain at these coordinates is the same in every environment.

[[schematic]]
name        = "main_city"          # bare schematic name (no extension)
paste_at    = [0, 67, 0]           # [x, y, z] absolute block coords
description = "Spawn city — town hall, market, info boards"

[[schematic]]
name        = "north_port"
paste_at    = [0, 63, -800]        # tweak Y to match coastline at this seed
description = "North dock — connects spawn to taiga biome"

# ... add ports, arenas, etc. as the world is built out
```

The current manifest in this directory is empty pending the first real
build. Every schematic added here gets a corresponding `[[schematic]]`
entry in the same PR — orphan `.schem` files without a manifest entry
are unused and should be cleaned up.
