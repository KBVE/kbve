# mmorpg_net

Wire protocol for `apps/arcade/kbve-mmorpg` and `apps/agones/kbve-mmorpg/server`: replicated
components, the per-tick input, and the channels they travel on.

Separate from `bevy_kbve_net`, which is isometric's protocol — tiles, creatures,
a worldgen seed. The one thing both games share, netcode `ConnectToken`
helpers, stays in `bevy_kbve_net::net_config` rather than being copied here.

Linked by a headless server and by a wasm client, so it carries no renderer, no
tokio and no axum.
