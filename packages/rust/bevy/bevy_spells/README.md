# bevy_spells

Proto-driven spell definitions for Bevy games. Compiles `spelldb.proto` into
typed Rust structs via `prost` and wraps them in a searchable [`SpellDb`] Bevy
resource — the Rust counterpart to the MDX→proto spelldb pipeline.

The spell source of truth is the MDX catalog under
`apps/kbve/astro-kbve/src/content/docs/spelldb/`, codegen'd to
`spelldb-data.binpb`. Load it at startup:

```rust,ignore
use bevy_spells::{BevySpellsPlugin, SpellDb};

let bytes = include_bytes!("path/to/spelldb-data.binpb");
let db = SpellDb::from_bytes(bytes).expect("decode spell registry");
commands.insert_resource(db);
```

The prost-generated `src/proto/spell.rs` is committed; the `build.rs` only
recompiles the proto when `BUILD_PROTO=1` is set.
