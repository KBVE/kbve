# Discord Bot Game Idea (Serenity + Poise)

## Project: **Embed Dungeon – “The Glass Catacombs”**

A Discord-native, embed-first mini RPG designed specifically to **stress-test your embed + component system** (buttons, select menus, pagination, message edits, concurrency guards, and state persistence).

---

## 1) Core Pitch

**Embed Dungeon** is a session-based dungeon crawler where a player (or party) advances room-by-room.  
All UI is a single “game message” that gets **edited** every turn. Players interact through **buttons** and **select menus**.

### Why it’s perfect for embed testing

- Repeated **message embed edits** (the common real-world bot pattern)
- Multiple interaction types (buttons + selects)
- **Pagination** for inventory/skills
- Turn timer / idle expiration for cleanup
- Concurrency/race-condition challenges (multi-user parties, shared boss)

---

## 2) Gameplay Loop

1. `/dungeon start` → bot creates a new session + sends the “game message” embed
2. Player chooses actions via buttons:
    - ⚔ Attack
    - 🛡 Defend
    - 🧪 Item
    - 🧭 Explore (advance / interact)
    - 🏃 Flee (end session)
3. Bot updates:
    - Room description
    - Enemy state
    - Player stats
    - Loot drops
    - Turn counter
4. Session ends on victory, defeat, or timeout.

---

## 3) Command Surface (Poise)

### Commands

- `/dungeon start [mode: solo|party]`
- `/dungeon join` (party mode)
- `/dungeon leave`
- `/dungeon status` (re-renders current session embed)
- `/dungeon end` (owner only)
- `/dungeon leaderboard` (optional)

### Component Interactions

- Buttons: `dungeon:atk`, `dungeon:def`, `dungeon:item`, `dungeon:explore`, `dungeon:flee`
- Select menu: `dungeon:item_select` (inventory)
- Optional select menu: `dungeon:target_select` (if multiple enemies)

---

## 4) Embed UI Spec

### Main Game Embed (single message, edited each turn)

**Embed Title:** `🕯️ The Glass Catacombs — Room {N}: {RoomName}`  
**Embed Description:** short narrative + current prompt (“What do you do?”)

**Fields (suggested)**

- **Player**
    - HP: `███░░ 32/50`
    - Armor: `12`
    - Gold: `45`
- **Enemy**
    - Name + level
    - HP bar
    - Intent (telegraphed move): “Charging a heavy strike”
- **Room**
    - Hazards / modifiers (“Fog: accuracy -10%”)
    - Loot potential (“Rare drop chance: 3%”)

**Footer**

- `Turn {t} • Session {short_id} • Expires in {mm:ss}`

**Color**

- Varies by state:
    - Green (safe)
    - Orange (combat)
    - Red (critical HP)

**Optional**

- **Thumbnail:** enemy icon
- **Image:** room art (even if placeholder)

---

## 5) Components Layout

### Primary Row (Buttons)

- ⚔ Attack
- 🛡 Defend
- 🧪 Item
- 🧭 Explore
- 🏃 Flee

### Secondary Row (Context Buttons)

Swap these in/out depending on state:

- 🎯 “Aim” (if fog/hard enemy)
- ✨ “Skill” (if skills exist)
- 🧱 “Interact” (room objects)

### Item Select Menu (only visible when “Item” pressed)

Menu placeholder: “Choose an item”
Options show:

- emoji + name
- remaining quantity
- effect summary in description

Pagination strategy:

- If > 25 items, show “Page 1/3” and Next/Prev buttons, or split into categories.

---

## 6) Data Model (State)

### Session

- `session_id: Uuid`
- `channel_id`
- `message_id` (the game embed message you keep editing)
- `owner_user_id`
- `party: Vec<UserId>`
- `created_at`, `last_action_at`
- `state: Exploring | Combat | Loot | GameOver`

### PlayerState

- `hp, max_hp`
- `armor`
- `inventory: Vec<ItemStack>`
- `effects: Vec<Effect>`
- `cooldowns: HashMap<SkillId, turns>`

### EnemyState

- `enemy_id`
- `hp, max_hp`
- `intent: Intent` (telegraph for next turn)
- `effects`

### RoomState

- `room_index`
- `room_seed`
- `room_type: Combat | Treasure | Event | Rest`
- `modifiers: Vec<Modifier>`

---

## 7) Interaction Rules (Important for Testing)

### Session Ownership & Access

- **Solo mode:** only owner can press buttons
- **Party mode:** party members can act, but:
    - Implement **turn ownership** (one action per turn)
    - Or implement **vote-based** action (collect clicks for 10 seconds)

### Concurrency / Race Conditions

You want to test:

- Two interactions arriving nearly simultaneously
- Multiple users spamming buttons

**Hard requirement:** per-session locking / serialization:

- “first valid interaction wins”
- others receive ephemeral message: “Turn already taken”

### Timeout & Cleanup

If no actions for `N` minutes:

- disable components
- edit embed footer: “Session expired”
- remove session from storage

---

## 8) Content: Rooms & Events (Simple but Enough)

### Room Types

1. **Combat**
2. **Treasure**
3. **Trap**
4. **Merchant**
5. **Rest Shrine**
6. **Boss**

### Example Events

- “A mirror whispers your name” → choose:
    - `Listen` (gain buff)
    - `Smash` (take damage, get loot)
- “Rusty chest” → choose:
    - `Open` (chance trap)
    - `Inspect` (safer)

These choices are perfect for **dynamic embed field swaps** and component changes.

---

## 9) Minimal Item Set (for inventory testing)

- 🧪 Potion (heal 15)
- 🧷 Bandage (heal 5, remove bleed)
- 💣 Bomb (deal 10)
- 🧿 Ward (reduce next hit by 50%)
- 🍞 Rations (small heal + buff out of combat)

Give stacks to force:

- select menus
- pagination
- conditional enable/disable (no potion left)

---

## 10) Implementation Notes (Serenity + Poise)

### Interaction Handler Shape

- A single `ComponentInteraction` router:
    - parse `custom_id` like `dungeon:atk:{session_id}`
    - validate session exists
    - acquire session lock
    - apply action
    - render updated embed + components
    - edit original message

### Rendering Strategy

Build a pure function:

- `render(session_state) -> (CreateEmbed, Vec<CreateActionRow>)`
  So you can test rendering without Discord calls.

### Storage Strategy (choose one)

- In-memory `DashMap<SessionId, Session>`
- Or persistent DB (SQLite/Postgres) if you want resilience

---

## 11) Test Checklist (Embed/System QA)

### Embed

- [ ] Title/description updates correctly
- [ ] Fields swap between Exploring/Combat/Loot
- [ ] Footer countdown updates on each action
- [ ] Colors change on critical HP

### Components

- [ ] Buttons disable when invalid (e.g., Explore during combat)
- [ ] Item select appears only when needed
- [ ] Pagination works (over 25 options)
- [ ] Session expiration disables all components

### Interaction Safety

- [ ] Turn locking works (no double actions)
- [ ] Only allowed users can act (solo vs party)
- [ ] Ephemeral errors returned for invalid actions

---

## 12) Optional: “Raid Boss” Add-on (Stress Test Mode)

Add `/raid start` that creates a server-wide boss with one shared embed:

- HP bar updates on every hit
- leaderboard field updates live
- test rate limiting + batching edits (e.g., update every 2 seconds)

---

## 13) Deliverable Summary

You end up with:

- A fun mini game
- A real embed “UI engine”
- A reusable component router pattern
- A rendering function you can reuse across other bot features

---

## 14) Next Steps (If You Want Code After This)

If you tell me:

- whether you’re using **DashMap**, **tokio::sync::Mutex**, or a DB
- whether you want **solo only** first
  I can produce:
- Poise command stubs
- a full component router skeleton
- a render module layout (`embed.rs`, `components.rs`, `state.rs`)
- a safe session lock pattern for Serenity interactions

---

# Embed Dungeon (Serenity + Poise) — Helper Spec + Proof-of-Concept Code

> A practical “helper markdown” you can keep in your repo alongside your bot.  
> Focus: embed rendering, components, interaction routing, session state, locking, and persistence patterns.

---

## Table of Contents

1. Goals & Non-Goals
2. Architecture Overview
3. Data Model (Expanded)
4. Custom ID Scheme
5. Rendering Model (Embed + Components)
6. Interaction Routing (Poise + Serenity)
7. Session Locking & Concurrency
8. Storage Options (In-Memory + DB Notes)
9. Proof-of-Concept: Minimal Working Skeleton
10. Proof-of-Concept: Action Handling + Message Editing
11. Proof-of-Concept: Inventory Select Menu + Pagination
12. Proof-of-Concept: Timers / Expiration Cleanup
13. Testing & QA Checklist
14. Suggested File Layout

---

## 1) Goals & Non-Goals

### Goals

- Validate **editing a single “game message”** repeatedly (typical Discord UX).
- Exercise **buttons**, **select menus**, and conditional component visibility.
- Prove out:
    - session creation
    - per-session state
    - concurrency locks
    - interaction routing + validation
    - embed rendering as a pure function

### Non-Goals

- Perfect game balance.
- Full content pipeline (images, localization).
- Full persistence on day 1.

---

## 2) Architecture Overview

### Core Loop

1. `/dungeon start` creates `SessionState`
2. bot sends a message with:
    - 1 embed (primary UI)
    - components (action buttons)
3. user interactions call a single router:
    - parse `custom_id`
    - acquire lock
    - apply action
    - render updated embed/components
    - edit original message
4. session expires after inactivity or game over.

### Recommended Core Abstractions

- `SessionStore`: get/insert/remove sessions
- `SessionState`: all game state
- `render(session) -> RenderedMessage`: pure rendering
- `apply_action(session, action, actor) -> Result<()>`: pure state transform

---

## 3) Data Model (Expanded)

### High-level types

- `SessionId`: `Uuid`
- `UserId`: Serenity `UserId`
- `ChannelId`: Serenity `ChannelId`
- `MessageId`: Serenity `MessageId`

### Expanded enums

- `GamePhase`:

    - `Exploring`
    - `Combat`
    - `Looting`
    - `Event`
    - `Rest`
    - `Merchant`
    - `GameOver { reason: GameOverReason }`

- `GameOverReason`:

    - `Defeated`
    - `Escaped`
    - `Victory`
    - `Expired`

- `RoomType`:

    - `Combat`
    - `Treasure`
    - `Trap`
    - `RestShrine`
    - `Merchant`
    - `Boss`
    - `Story`

- `Intent` (enemy telegraph):
    - `Attack { dmg: i32 }`
    - `HeavyAttack { dmg: i32, windup: u8 }`
    - `Defend { armor: i32 }`
    - `Debuff { effect: EffectKind }`
    - `Charge`
    - `Flee`

### Effects

- `EffectKind`:

    - `Poison`
    - `Burning`
    - `Bleed`
    - `Shielded`
    - `Focused`
    - `Weakened`
    - `Stunned`

- `EffectInstance`:
    - `kind: EffectKind`
    - `stacks: u8`
    - `turns_left: u8`

### Inventory

- `ItemId`: `String` (`"potion_small"`, `"bomb_rusty"`)
- `ItemRarity`:

    - `Common`, `Uncommon`, `Rare`, `Epic`, `Legendary`

- `ItemKind`:

    - `Consumable`
    - `Equipment`
    - `Quest`
    - `Currency`

- `ItemDef` (static):

    - `id, name, emoji, rarity, kind`
    - `description`
    - `max_stack: u16`
    - `use_effect: Option<UseEffect>`

- `UseEffect`:

    - `Heal { amount: i32 }`
    - `DamageEnemy { amount: i32 }`
    - `ApplyEffect { kind: EffectKind, stacks: u8, turns: u8 }`
    - `RemoveEffect { kind: EffectKind }`

- `ItemStack`:
    - `item_id: ItemId`
    - `qty: u16`

### PlayerState (expanded)

- `name: String`
- `hp, max_hp: i32`
- `armor: i32`
- `gold: i32`
- `effects: Vec<EffectInstance>`
- `inventory: Vec<ItemStack>`
- `cooldowns: HashMap<String, u8>`
- `crit_chance: f32`
- `accuracy: f32`

### EnemyState (expanded)

- `name: String`
- `level: u8`
- `hp, max_hp: i32`
- `armor: i32`
- `effects: Vec<EffectInstance>`
- `intent: Intent`
- `loot_table_id: String`

### RoomState (expanded)

- `index: u32`
- `room_type: RoomType`
- `name: String`
- `description: String`
- `modifiers: Vec<RoomModifier>`
- `hazards: Vec<Hazard>`
- `seed: u64`

- `RoomModifier`:

    - `Fog { accuracy_penalty: f32 }`
    - `Blessing { heal_bonus: i32 }`
    - `Cursed { dmg_taken_multiplier: f32 }`

- `Hazard`:
    - `Spikes { dmg: i32 }`
    - `Gas { effect: EffectKind, stacks: u8 }`

### SessionState (expanded)

- `id: SessionId`
- `owner: UserId`
- `party: Vec<UserId>`
- `phase: GamePhase`
- `channel_id: ChannelId`
- `message_id: MessageId`
- `created_at: Instant`
- `last_action_at: Instant`
- `turn: u32`
- `rng_seed: u64`
- `player: PlayerState` _(solo mode; party can be Vec<PlayerState>)_
- `enemy: Option<EnemyState>`
- `room: RoomState`
- `log: Vec<String>` _(last N events, used for debug embed field / page)_

---

## 4) Custom ID Scheme

You want IDs that are:

- short enough for Discord limits
- easy to parse
- include session id
- include an action code
- optionally include pagination or target data

### Suggested format

`dng|<sid>|<act>|<arg>`

Where:

- `sid`: a short session id (e.g., first 8 chars of UUID)
- `act`: `atk`, `def`, `item`, `explore`, `flee`, `invpage`, etc.
- `arg`: optional, like `p2` or `item:potion_small`

Examples:

- `dng|a1b2c3d4|atk|`
- `dng|a1b2c3d4|item|`
- `dng|a1b2c3d4|invpage|next`
- `dng|a1b2c3d4|useitem|potion_small`

---

## 5) Rendering Model (Embed + Components)

### Pure rendering is critical

Write rendering functions that take `&SessionState` and return:

- `CreateEmbed`
- `Vec<CreateActionRow>`

So you can test render output without Discord.

### Suggested Embed Layout

- Title: `🕯️ The Glass Catacombs — Room {idx}: {name}`
- Description: narrative + prompt
- Fields:
    - Player stats
    - Enemy stats (if any)
    - Room modifiers/hazards
    - Log (last 3-5 events)
- Footer:
    - `Turn {turn} • Session {sid} • Idle {mm:ss} remaining`

---

## 6) Interaction Routing (Poise + Serenity)

### How it typically works

Poise registers slash commands, and you also register an event handler for component interactions.

You can do this either by:

- Poise’s built-in `event_handler`, or
- Serenity `EventHandler` that delegates to your router.

**Key requirement:** one “router” function that handles all `MessageComponent` interactions.

---

## 7) Session Locking & Concurrency

Discord interactions can arrive concurrently.

### Requirement

Per-session lock so only one action mutates state at a time.

### Recommended pattern

- `DashMap<ShortSid, Arc<tokio::sync::Mutex<SessionState>>>`
- Lock, validate, mutate, render, edit message, unlock.

Alternative:

- `RwLock` but write lock on every action anyway.

---

## 8) Storage Options

### Option A: In-memory (fastest)

- `DashMap` + periodic cleanup task
- easiest to implement

### Option B: DB-backed

- store sessions in SQLite/Postgres
- still use in-memory lock for live session, commit snapshot after action

**Recommendation:** start with A, add B once embed system is proven.

---

## 9) Proof-of-Concept: Minimal Working Skeleton

> The following snippets are “compilable-ish” patterns.  
> They may require small adjustments based on your exact Poise/Serenity versions.

### Cargo dependencies (conceptual)

```toml
[dependencies]
poise = "0.6"
serenity = { version = "0.12", features = ["client", "gateway", "rustls_backend", "model"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread", "time"] }
dashmap = "5"
uuid = { version = "1", features = ["v4"] }
```
