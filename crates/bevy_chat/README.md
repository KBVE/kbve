# bevy_chat

IRC-backed chat and event bridge for MUD and game clients. Headless async client with optional Bevy plugin.

## Transports

- **Native** — tokio TCP to IRC (port 6667). Used by Discord bot and Lightyear server.
- **WASM** — `web_sys::WebSocket` against an IRC-over-WebSocket gateway (e.g. `wss://chat.kbve.com`). Used by the isometric game in-browser.

Selected at compile time via `cfg(target_arch)`. Public API (`ChatClient`, `connect`, `send`, `subscribe`/`drain_incoming`) is identical on both targets.

## Usage

```rust
use bevy_chat::{ChatClient, IrcConfig};

let cfg = IrcConfig::default();
let client = ChatClient::connect(cfg).await?;
```

## Features

| Feature  | Description                                                 |
| -------- | ----------------------------------------------------------- |
| `plugin` | Adds `ChatPlugin` that bridges IRC into ECS events          |
| `ffi`    | C-FFI surface for JNI / `csbindgen` consumers (native only) |

## License

MIT
