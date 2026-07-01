# RentEarth ↔ ARPG Agones Multiplayer — Phase 3: Ephemeral Gameplay Events

**Date:** 2026-07-01
**Status:** Approved (design)
**Scope:** Phase 3 of the rentearth ARPG multiplayer effort. Decodes the server "ephemeral" gameplay events (Phase 1 extracts the envelope but leaves the payload raw) and drives the Unreal client HUD + worldspace FX. Builds on merged KBVESimgrid (transport, #13626) and KBVESimgridRender (render, #13629).

## Goal

Turn server ephemeral events into visible client feedback: floating damage numbers, projectile tracers, HUD bars (HP/MP/level), status effects, inventory refresh, and toasts. The Rust server remains full authority; the client only decodes and renders.

## Prior Art (do not rewrite)

- **KBVESimgrid** (`packages/unreal/KBVENet/Source/KBVESimgrid/`) — transport: WebSocket + COBS + postcard, `USimgridClientSubsystem`, `FPostcardReader`, `FProtoCodec`.
  - `FServerDecoded` already carries `EphemeralKind (uint16)`, `EphemeralTo (uint16)`, `EphemeralPayload (TArray<uint8>)` — the envelope is decoded; the inner payload is left raw.
  - `FProtoCodec::DecodeServerEvent` sets `Type == EServerEventType::Ephemeral` for these frames.
- **KBVESimgridRender** (`packages/unreal/KBVENet/Source/KBVESimgridRender/`) — `USimgridEntityManager` holds a `TMap<Eid, ASimgridEntityActor*>` (entity world positions); `FSimgridCoords` tile→world helpers.
- **chuck UI bus** — `UchuckUIEvents` (GameInstanceSubsystem) exposes `TKBVEChannel<T>` pub-sub channels (`Health`, `Mana`, `Stamina`, `DamageReceived`, `InventoryDirty`, `ItemConsumed`, `Tooltip`, …); HUD widgets (`SchuckHUD`, `SchuckToastHost` → `SKBVEToastLayer::PushToast`) already subscribe. `TKBVEChannel<T>::Publish` is synchronous, game-thread only.

Source of truth for the wire format:
- `packages/rust/simgrid/src/proto.rs` (structs + kind constants)
- `packages/npm/laser/src/lib/net/postcard-wire.ts` (TS decoders)
- `packages/npm/laser/src/lib/net/postcard-wire.spec.ts` (pinned hex fixtures)

## Ephemeral Envelope

`ServerEvent::Ephemeral { kind: u16, to: PlayerSlot(u16), payload: Vec<u8> }`. The outer envelope is COBS-framed postcard; the inner `payload` is raw postcard (no COBS). `to == u16::MAX` (65535) is broadcast; otherwise a specific player slot.

## Event Set (this phase)

| Kind | Event | Payload fields (postcard order) |
|---|---|---|
| 1 | InventorySync | `items: Vec<{ id:String, item_ref:String, count:u32 }>` |
| 2 | CombatEvent | `attacker:u32, target:u32, target_ref:Option<String>, dmg:i32, crit:bool, died:bool` |
| 3 | PickupEvent | `item_ref:String, count:u32` |
| 5 | ItemUsedEvent | `item_ref:String, heal:i32` |
| 6 | EquippedEvent | `item_ref:Option<String>, slot:String, attack:i32, defense:i32` |
| 7 | StatsEvent | `level:i32, xp:i32, xp_next:i32, max_hp:i32, attack:i32, kills:u32, mp:i32, max_mp:i32` |
| 8 | StatusEvent | `kind:u8, magnitude:i32, remaining:u32` |
| 12 | ProjectileEvent | `attacker:u32, from:Tile{x:i32,y:i32}, to:Tile, kind:String, hit:bool` |

## Module Layout

### KBVESimgrid (transport — additive only)
- **`SimgridEphemeral.h/.cpp`** — the 8 payload structs (`FSimgridCombat`, `FSimgridProjectile`, `FSimgridPickup`, `FSimgridItemUsed`, `FSimgridInventory` + `FSimgridInvItem`, `FSimgridStats`, `FSimgridStatus`, `FSimgridEquipped`) and a decoder facade `FEphemeralCodec` with one static method per kind: `DecodeCombat(const TArray<uint8>&) -> FSimgridCombat`, etc. Each uses `FPostcardReader` (existing). Option<String> read as a leading present-byte then String.
- **`USimgridClientSubsystem`** gains: a `FSimgridOnEphemeral` dynamic multicast delegate (`OnEphemeral`, no params — mirrors `OnSnapshot`), and getters `int32 GetLastEphemeralKind()`, `int32 GetLastEphemeralTo()`, `const TArray<uint8>& GetLastEphemeralPayload()`. `HandleBinary` fires `OnEphemeral` (and stores the three fields) when `Type == Ephemeral`.

### KBVESimgridRender (worldspace FX — reusable)
- **`ASimgridDamageText`** — a `UTextRenderComponent` (or widget-component) actor spawned at a world position; on spawn stores damage/crit; `Tick` floats up and fades over a fixed lifetime, then self-destroys. `Init(int32 Amount, bool bCrit)`.
- **`ASimgridProjectileTracer`** — an actor that lerps a mesh/beam from a start to an end world position over a fixed duration, then self-destroys. `Init(const FVector& From, const FVector& To)`.

Both are pure worldspace render; they take resolved world coordinates and own their own lifetime (no manager needed).

### chuck (game dispatch + UI)
- **`UchuckEphemeralRouter`** (or methods on the existing `AchuckSimgridController`) — subscribes `USimgridClientSubsystem::OnEphemeral`; on fire, reads `GetLastEphemeralKind/To/Payload`, calls the matching `FEphemeralCodec::Decode*`, then:
  - **Combat** → look up the `target` eid's world position via the Phase 2 `USimgridEntityManager`; spawn `ASimgridDamageText` there; publish a combat toast/log.
  - **Projectile** → `FSimgridCoords::TileToWorldXY` for `from`/`to` (+ terrain height via the world bridge); spawn `ASimgridProjectileTracer`.
  - **Pickup / ItemUsed** → `SKBVEToastLayer` toast via `UchuckUIEvents` (`ItemConsumed`/a pickup channel).
  - **Stats** → publish HP/MP/level to `UchuckUIEvents` (`Health`, `Mana`, plus a stats/level payload) → HUD bars.
  - **Status** → publish a status payload (toast + buff/debuff indicator).
  - **Inventory** → publish `InventoryDirty` → inventory panel refresh.
  - **Equipped** → publish an equipped payload (toast/gear slot).
- New `UchuckUIEvents` channels + payload structs are added only where an existing channel does not fit (e.g. `CombatHit`, `ProjectileFired` if needed; reuse `Health`/`Mana`/`InventoryDirty`/`ItemConsumed` where they do).

The router needs the `USimgridEntityManager` (for target positions) and the world bridge (for terrain Z) — both already owned by `AchuckSimgridController` from Phase 2.

## `to` Filtering

- **Combat, Projectile** — rendered for all entities (worldspace at the referenced eids), regardless of `to`.
- **Stats, Inventory, Status, Equipped** — applied only when `To == YourSlot` (the local player's own state). Broadcast copies for these are ignored.
- `YourSlot` comes from the Phase 1 `Welcome` (already stored by the controller).

## Data Flow

```
WS binary → USimgridClientSubsystem::HandleBinary → FProtoCodec::DecodeServerEvent
  Type == Ephemeral → store {Kind, To, Payload}; fire OnEphemeral()

UchuckEphemeralRouter::OnEphemeralReceived():
  kind = GetLastEphemeralKind(); to = GetLastEphemeralTo(); payload = GetLastEphemeralPayload()
  switch kind:
    2  Combat     → c = DecodeCombat(payload); pos = EntityManager.WorldPosOf(c.target)
                    → spawn ASimgridDamageText(pos, c.dmg, c.crit); toast if c.died
    12 Projectile → p = DecodeProjectile(payload)
                    → From = tile→world(p.from), To = tile→world(p.to)
                    → spawn ASimgridProjectileTracer(From, To)
    3  Pickup     → toast "picked up N × ref"
    5  ItemUsed   → toast "used ref (+heal)"
    7  Stats      → if to==slot: publish Health/Mana/level → HUD
    8  Status     → if to==slot: publish status → indicator + toast
    1  Inventory  → if to==slot: publish InventoryDirty → panel
    6  Equipped   → if to==slot: publish equipped → toast/gear
```

## Error Handling

- Unknown/out-of-scope kind → ignore (log at verbose). Never crash.
- Decode failure (short payload) → the decoder returns a zero-value struct and the router drops the event; the reader is bounds-checked (existing `FPostcardReader` behavior).
- Combat target eid not in the entity map (culled/local) → skip the worldspace text; still emit the toast/log.
- Worldspace actors self-destroy on a timer; disconnect does not need to reap them (short-lived).

## Testing

- **KBVESimgrid decoder tests** (`KBVE.Simgrid.Ephemeral.*`) — one automation test per event, asserting the decoded struct field-for-field against the **pinned laser hex fixtures**:
  - Combat `02070106676f626c696e0a0100` → `{attacker:2,target:7,target_ref:"goblin",dmg:5,crit:true,died:false}` (use the exact fixture from `postcard-wire.spec.ts`).
  - Projectile `020a050e04056172726f7701` → `{attacker:2,from:(5,-3),to:(7,2),kind:"arrow",hit:true}`.
  - Pickup `056172726f7703` → `{item_ref:"arrow",count:3}`.
  - ItemUsed `06706f74696f6e18` → `{item_ref:"potion",heal:12}`.
  - Equipped `010573776f726406776561706f6e0602` → `{item_ref:"sword",slot:"weapon",attack:3,defense:1}`.
  - Stats `0464c801500e031428` → `{level:2,xp:50,xp_next:100,max_hp:40,attack:7,kills:3,mp:10,max_mp:20}`.
  - Status `030305` → `{kind:3,magnitude:-2,remaining:5}`.
  - Inventory `0200056172726f77030006706f74696f6e01` → `{items:[{id:"",ref:"arrow",count:3},{id:"",ref:"potion",count:1}]}`.
  - (Copy each fixture verbatim from `postcard-wire.spec.ts` during planning; the bytes above are the reference.)
- **Render actors + chuck router** — compile-verified + manual integration (as in Phase 2): run a local ARPG server, trigger combat/pickups, confirm damage numbers, tracers, HUD bars, and toasts.

## Out of Scope (Phase 4)

- Trade (9), Shop (10), Blackjack (11), Corpse (16), Pet roster/battle (17-19) UIs.
- Spell (15), FloorChange (13), ItemPlaced (14).
- Damage-text object pooling, status-icon widget polish, audio/SFX.
- MoveTo, offline mode, client prediction (other deferred Phase 2 items).

## Definition of Done

- KBVESimgrid decodes all 8 events; `OnEphemeral` + `GetLastEphemeral*` exposed; decoder automation tests pass against pinned fixtures.
- KBVESimgridRender ships `ASimgridDamageText` + `ASimgridProjectileTracer` (compile-verified).
- chuck router maps all 8 kinds to HUD/toast/worldspace via `UchuckUIEvents`; `to`-filtering correct for state events.
- Module compiles in `chuckEditor`; decoder tests green.
