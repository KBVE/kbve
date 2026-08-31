# bevy_dialogue

Conversation graphs for Bevy games, over `kbve.dialogue.v1`.

A graph is a web rather than a tree. It has several entry points, each guarded
by a condition and ordered by priority, so the same NPC opens on a different
line depending on what the player has done. Graphs are addressed by reference,
so several NPCs can share one and a quest choice can drop the player into the
middle of one.

## What is here

- `DialogueDb` — every graph, by ref and by the ULID an NPC points at.
- `DialogueContext` — the player state a condition is asked about: flags,
  level, quests, items, reputation, visits, and what has been seen once.
- `entry_node` — which node the conversation opens on, or `None` when the graph
  has nothing to say right now. That is different from an NPC with no graph at
  all, and a caller should say something different for each.
- `choices` — the options to show, in display order, with the ones that fail
  their condition either hidden or marked unavailable.
- `next_node` — where a node leads, absent a choice.

## What is not

Running the conversation. That loop belongs to the game, because what a line
does on screen is a game's own business. This crate answers questions about a
graph; it does not own the state machine.

Effects are returned, not applied. `DialogueEffect` reaches systems this crate
knows nothing about — inventories, shops, quest journals — so the caller
applies them.

## Content

Graphs load from JSON via `DialogueDb::from_json`, as an array rather than the
`DialogueRegistry` envelope: provenance is something a generated file has and a
hand-authored one does not.

Enum fields are numbers in JSON. Canonical proto JSON writes an enum as its
name, and the generated types take an i32 with no serde adapter for it, so a
name fails to load. The numbers are stable on the wire.
