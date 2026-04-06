# bevy_kbve_net

Shared lightyear protocol for KBVE multiplayer — replicated components, inputs, channels.

## Usage

```rust
use bevy::prelude::*;
use bevy_kbve_net::ProtocolPlugin;

fn main() {
    App::new()
        .add_plugins(ProtocolPlugin)
        .run();
}
```

## Key Types

- `ProtocolPlugin` — registers all replicated components and channels
- `PlayerInput` / `PlayerColor` / `PlayerId` / `PlayerName` — player state
- `PositionUpdate` / `PlayerVitals` — replicated transforms and health
- `AuthMessage` / `AuthAck` / `AuthResponse` — authentication handshake
- `GameChannel` / `TimeSyncMessage` — networking channels

## Features

| Feature     | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `client`    | Lightyear client with WebSocket, WebTransport, and UDP transports |
| `npcdb`     | NPC creature support via `bevy_npc`                               |
| `creatures` | Full creature system with pooling and async tasks                 |

## License

MIT
