# bevy_items

Proto-driven item definitions for Bevy games. Compiles `itemdb.proto` into typed Rust structs via `prost` and wraps them in a searchable `ItemDb` Bevy resource.

Game-agnostic — any game can load the same proto item registry and query it by slug, ULID, type flags, or rarity.

## Data Flow

```
itemdb.proto          (source of truth — shared item schema)
      │
      ├──► prost-build ──► item.rs       (Rust structs for Bevy games)
      │
      └──► protoc/codegen ──► Zod schema (TypeScript for Astro site)
                                  │
                                  ▼
                           Astro MDX files  (human-authored item content)
                                  │
                                  ▼
                         /api/itemdb.json   (runtime JSON endpoint)
                                  │
                                  ▼
                            ItemDb::from_json()  ◄── any Bevy game
```

1. **`itemdb.proto`** defines the canonical item schema (stats, rarity, equipment, recipes, etc.)
2. **Astro MDX files** at `kbve.com/itemdb/<slug>/` are the human-authored content — names, descriptions, lore, stat values
3. **`/api/itemdb.json`** serves all items as JSON at build time
4. **`ItemDb::from_json()`** parses that JSON into proto structs, handling string→enum conversion automatically
5. Any Bevy game (Isometric, DiscordSH, etc.) loads the same `ItemDb` and queries items by slug, ULID, type flags, or rarity

## Usage

Add to your `Cargo.toml`:

```toml
[dependencies]
bevy_items = { path = "packages/rust/bevy/bevy_items" }
```

### Plugin Setup

```rust
use bevy::prelude::*;
use bevy_items::BevyItemsPlugin;

App::new()
    .add_plugins(BevyItemsPlugin)
    .run();
```

### Loading from Astro JSON

```rust
use bevy_items::ItemDb;

fn load_items(mut commands: Commands) {
    let json = include_str!("path/to/itemdb.json");
    let db = ItemDb::from_json(json).expect("Failed to parse item JSON");
    commands.insert_resource(db);
}
```

### Loading from Proto Binary

```rust
let bytes = include_bytes!("path/to/items.binpb");
let db = ItemDb::from_bytes(bytes).expect("Failed to decode item registry");
```

### Querying Items

```rust
fn print_item(db: Res<ItemDb>) {
    // By slug
    if let Some(item) = db.get_by_slug("blue-shark") {
        println!("{}: {}", item.name, item.description.as_deref().unwrap_or(""));
    }

    // By ULID
    if let Some(item) = db.get_by_ulid("01JQPJV...") {
        println!("Found: {}", item.name);
    }

    // By type flags
    let weapons = db.find_by_type_flags(0x02); // TYPE_WEAPON
    println!("Found {} weapons", weapons.len());

    // By rarity
    use bevy_items::ItemRarity;
    let rares = db.find_by_rarity(ItemRarity::Rare);
    println!("Found {} rare items", rares.len());
}
```

### ProtoItemId

`ProtoItemId` is a stable hash of the item slug, used as a lightweight key for inventory slots, network packets, and save files:

```rust
use bevy_items::{ProtoItemId, ItemDb};

let id = ProtoItemId::from_slug("blue-shark");
let name = db.display_name(id);       // "Blue Shark"
let stack = db.max_stack(id);          // e.g. 1
```

## Regenerating Proto Types

Proto types are committed to the repo. To regenerate after editing `itemdb.proto`:

```bash
BUILD_PROTO=1 cargo build -p bevy_items
```

This requires `protoc` on your PATH.
