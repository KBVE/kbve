# KBVEAgones

Server-only bridge between the vendored [Agones](../Agones) SDK and [KBVEROWS](../KBVEROWS).

## What it does

Agones owns the GameServer lifecycle: `UAgonesSubsystem` (dedicated-server only)
auto-connects on init — polls `/gameserver`, calls `/ready`, and pings
`/health` on a timer. This plugin does **not** reimplement any of that.

`UKBVEAgonesBridgeSubsystem` listens for the Agones `ConnectedDelegate` (fires
once the GameServer is Ready and its identity is known) and registers the
instance with ROWS via `UROWSInstanceSubsystem::RegisterLauncher(Address, Port,
MaxInstances)`, using the address/port Agones reports.

## Boundaries

- Module is `TargetAllowList: [ "Server" ]` — never compiled into Client/Game
  builds. The subsystem also gates on `IsRunningDedicatedServer()`.
- ROWS stays a pure REST plugin; this bridge is the only thing that depends on
  both ROWS and Agones.

## Config (`[/Script/KBVEAgones.KBVEAgonesBridgeSubsystem]` in `DefaultGame.ini`)

- `GamePortName` — which Agones named port to register (empty = first port).
- `MaxInstances` — passed to `RegisterLauncher` (default 10).

Do not set Agones `bDisableAutoConnect` — the bridge relies on auto-connect to
fire `ConnectedDelegate`.

## Shutdown

Not driven here. On termination the server stops health-pinging; Agones marks
the GameServer unhealthy and the ROWS watcher reconciles the instance out. An
explicit `UAgonesSubsystem::Shutdown()` call can be added if deterministic
drain is needed.
