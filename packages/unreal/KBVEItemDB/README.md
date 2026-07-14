# KBVEItemDB

Game-agnostic item database, inventory model, and item Mass fragments for KBVE Unreal games. The data + inventory half to [KBVEGameplay](../KBVEGameplay)'s effect half.

## What it provides

### Item catalog (read-only reference data)

- **`FKBVEItemDef` / `FKBVEItemFood`** — runtime item def: identity, type flags, rarity, stacking, prices, tags, and consumable/food effect fields (`Heals` / `RestoreMana` / `RestoreEnergy` / `RegenPerSecond` / `RegenDuration` / `Cooldown` / `AnimationRef`) — shaped to map straight into KBVEGameplay's `FKBVEEffectSpec`.
- **`UKBVEItemDatabase`** (GameInstance subsystem) — loads `Content/Data/itemdb-data.json` (the shared itemdb codegen artifact) into in-memory defs; `LookupByKey` / `LookupByRef`. Fast O(1) hot-path lookups.

### Inventory model

- **`FKBVEInventory` / `FKBVEInventoryBag` / `FKBVEInventoryStack`** — generic bags + slots.
- **`UKBVEInventoryLibrary`** — `TryAdd` / `CountItem` / `FindFirstSlot`.

### Mass

- **`FKBVEDroppedItemFragment` / `FKBVEDroppedItemTag`** — world-dropped item entities (key, count, rarity, lifetime, magnet/pickup radius).

### Persistence (SQLite, via KBVESQLite)

- **`FKBVEInventoryStore` / `UKBVEInventoryStoreSubsystem`** — durable inventory save/load, row-per-slot (`player_inventory`), keyed by player id. Opens `Saved/KBVE/inventory.db`.
- **`FKBVEItemCatalogStore`** + `UKBVEItemDatabase::PersistCatalogToDb(path)` — emit the catalog to a queryable read-only `item_def` table.

## Where the data lives (the boundaries)

```
itemdb MDX  ──codegen──▶  itemdb-data.json  (canonical source)
                               │ load
                               ▼
        UKBVEItemDatabase (in-memory defs, hot lookups)
                               │ optional PersistCatalogToDb
                               ▼
        SQLite item_def  (read-only "safe data", queryable)

LIVE inventory  =  Mass fragment (the game's inventory fragment)  ← authoritative gameplay, worker-thread accessible
                               │ flush at boundaries (game thread / async)
                               ▼
        SQLite player_inventory  (durable persistence snapshot)
```

- **Live, mutable inventory = Mass.** That is the single authoritative copy and the worker-thread path. SQLite is **not** the live store.
- **SQLite = persistence boundary + queryable static catalog.** Load→seed at spawn/login, flush at intervals/logout. Never queried in the Mass hot loop.
- **No dupes.** One canonical source (MDX→JSON); the in-memory map and the SQLite catalog are read-only projections of it — not divergent writable copies.
- **KBVESQLite is the single sqlite provider** (never link UE `SQLiteCore` alongside). KBVEItemDB declares `dependency_plugins: packages/unreal/KBVESQLite`.

## Composition

Consuming an item = lookup (`UKBVEItemDatabase`) → build an `FKBVEEffectSpec` from the def's food fields → apply via KBVEGameplay's `UKBVEEffectComponent`. KBVEItemDB never applies effects; it carries data + inventory.

Icon/atlas rendering is deferred (UI-coupled).
