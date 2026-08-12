# src layout

ECS framework: `addons/GodotECS` + `addons/GodotUtils` (godothub/godot-ecs, MIT, vendored).

```
src/
  autoload/game.gd     Game singleton: ECSWorld, runners, events, observers, relations
  components/          ECSComponent / ECSDataComponent subclasses (data only)
  systems/             ECSSystem (main thread) / ECSParallel (WorkerThreadPool)
  ecs/                 ObserverHub (reactive), Relations (entity links) — GECS-inspired
  net/                 NetGameClient — renders the authoritative friendslop-server
                       NetSync — ENet ECS snapshot sync (experimental, superseded)
  events/              EventNames StringName constants
  player/              player controller
  world/               world streaming (grass chunks)
  main.gd              main scene root
```

## Events (global bus)

```gdscript
Game.events.add_callable(EventNames.PLAYER_JUMPED, _on_jump)
Game.events.notify(EventNames.PLAYER_JUMPED, global_position)
Game.events.remove_callable(EventNames.PLAYER_JUMPED, _on_jump)
```

Add new names to `events/event_names.gd`, never inline strings.

## Systems

Main-thread logic (input, UI, flow):

```gdscript
Game.logic().add_system("MySystem", MySystem.new())
```

`physics`-rate systems: `Game.physics().add_system(...)`.

Heavy simulation (auto-parallel, DAG-scheduled): subclass `ECSParallel`,
declare component read/write in `_list_components()`, register via
`Game.scheduler().add_systems([...]).build()`.

## Observers (reactive)

Spawn entities via `Game.spawn()` (not `world.create_entity()`) so the hub tracks them.

```gdscript
var w := Game.observers.observe([&"Health"], ObserverHub.ADDED | ObserverHub.REMOVED, _on_health)
func _on_health(event: int, e: ECSEntity, c: ECSComponent) -> void: ...
Game.observers.unobserve(w)
```

Events: `ADDED`/`REMOVED` (watched component, query satisfied), `MATCHED`/`UNMATCHED`
(entity starts/stops satisfying full component set). Empty `required` = watch everything.

## Relationships

```gdscript
Game.relations.link(owner_id, &"owns", item_id, {"since": now})
Game.relations.targets(owner_id, &"owns")
Game.relations.sources(item_id, &"owns")
Game.relations.unlink_all(id)
```

Bidirectional O(1) lookup. Mirrored onto the event bus as
`EventNames.RELATION_ADDED / RELATION_REMOVED`. `Game.despawn()` cleans links.

## NetGameClient

Renders a session hosted by `friendslop-server` (`apps/agones/friendslop/server`).
Wraps the `QNetClient3D` GDExtension node.

```gdscript
var client := NetGameClient.new()
client.server_url = "ws://127.0.0.1:7980/ws"
add_child(client)
client.connect_to_server()
```

Bodies are authored by the server, so avatars are spawned in response to
`body_added` rather than created locally; each is handed to the extension with
`track(id, node)` so the server drives its transform. Input is sent as intent
(`wish_dir` + jump) and never applied locally — the server owns movement.

Set `avatar_scene` to control what a body looks like; without it a plain capsule
mesh is used. Manual end-to-end check against a running server:

```bash
FS_URL=ws://127.0.0.1:7980/ws godot --headless -s tests/live_net.gd
```

## NetSync (experimental)

`NetSync` node: `host(port)` / `join(ip, port)`; server broadcasts full ECS world
snapshots (`ECSWorldPacker` over ENet, unreliable_ordered) at `tick_rate` Hz, clients
unpack. Set `factory` (ObjectFactory with registered component classes) before use.
Whole-world snapshot only — delta compression and interest management TODO before
real multiplayer.

## Future utilities

- Offscreen rendering via RenderingServer (item thumbnails, prop impostors):
  <https://hexaquo.at/pages/using-godots-renderingserver-for-dynamically-rendering-billboards-thumbnails-and-more/>
  — scenario/viewport/instance RIDs, grab via `texture_2d_get`; never `force_draw()`
  mid-gameplay, await `frame_post_draw` or bake during loading.

## Entities

```gdscript
var e := Game.world.create_entity()
e.add_component("Position", CPosition.new())
var list := Game.world.multi_view(["Position", "Velocity"])
```

Use `multi_view_cache()` for hot queries (O(1) cached).
