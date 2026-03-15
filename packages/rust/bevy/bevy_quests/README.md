# bevy_quests

Proto-driven quest definitions for Bevy games. Compiles `questdb.proto` into typed Rust structs via `prost` and wraps them in a searchable `QuestDb` Bevy resource.

Game-agnostic — any game can load the same proto quest registry and query it by slug, ULID, category, tags, NPC giver, or zone.

## Data Flow

```
questdb.proto          (source of truth — shared quest schema)
      │
      ├──► prost-build ──► quest.rs      (Rust structs for Bevy games)
      │
      └──► protoc/codegen ──► Zod schema (TypeScript for Astro site)
                                  │
                                  ▼
                           Astro MDX files  (human-authored quest content)
                                  │
                                  ▼
                         /api/questdb.json  (runtime JSON endpoint)
                                  │
                                  ▼
                           QuestDb::from_json()  ◄── any Bevy game
```

1. **`questdb.proto`** defines the canonical quest schema (steps, objectives, rewards, choices, outcomes, dialogue hooks, etc.)
2. **Astro MDX files** at `kbve.com/questdb/<slug>/` are the human-authored content — quest descriptions, objectives, rewards
3. **`/api/questdb.json`** serves all quests as JSON at build time
4. **`QuestDb::from_json()`** parses that JSON into proto structs, handling string-to-enum conversion automatically
5. Any Bevy game (Isometric, DiscordSH, etc.) loads the same `QuestDb` and queries quests

## Usage

Add to your `Cargo.toml`:

```toml
[dependencies]
bevy_quests = { path = "packages/rust/bevy/bevy_quests" }
```

### Plugin Setup

```rust
use bevy::prelude::*;
use bevy_quests::BevyQuestsPlugin;

App::new()
    .add_plugins(BevyQuestsPlugin)
    .run();
```

### Loading from Astro JSON

```rust
use bevy_quests::QuestDb;

fn load_quests(mut commands: Commands) {
    let json = include_str!("path/to/questdb.json");
    let db = QuestDb::from_json(json).expect("Failed to parse quest JSON");
    commands.insert_resource(db);
}
```

### Loading from Proto Binary

```rust
let bytes = include_bytes!("path/to/quests.binpb");
let db = QuestDb::from_bytes(bytes).expect("Failed to decode quest registry");
```

### Querying Quests

```rust
fn print_quest(db: Res<QuestDb>) {
    // By slug
    if let Some(quest) = db.get_by_slug("auto-cooker-9000") {
        println!("{}: {}", quest.title, quest.description.as_deref().unwrap_or(""));
    }

    // By category
    use bevy_quests::QuestCategory;
    let dailies = db.find_by_category(QuestCategory::Daily);
    println!("Found {} daily quests", dailies.len());

    // By tag
    let cooking = db.find_by_tag("cooking");
    println!("Found {} cooking quests", cooking.len());

    // By NPC giver
    let npc_quests = db.find_by_giver_npc("npc-chef-gordon");
    println!("Chef Gordon gives {} quests", npc_quests.len());

    // By zone
    let zone_quests = db.find_by_zone("kitchen-zone");
    println!("{} quests in the kitchen", zone_quests.len());
}
```

### ProtoQuestId

`ProtoQuestId` is a stable hash of the quest slug, used as a lightweight key for quest logs, network packets, and save files:

```rust
use bevy_quests::{ProtoQuestId, QuestDb};

let id = ProtoQuestId::from_slug("auto-cooker-9000");
let title = db.display_title(id);  // "Auto Cooker 9000"
```

## Regenerating Proto Types

Proto types are committed to the repo. To regenerate after editing `questdb.proto`:

```bash
BUILD_PROTO=1 cargo build -p bevy_quests
```

This requires `protoc` on your PATH.
