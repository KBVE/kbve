# bevy_supa

Transport-agnostic Supabase / PostgREST client with optional Bevy integration. Originally lived inside `kbve` as `entity::client::supabase`; extracted so JNI plugins, CLIs, and Bevy games can share one client without dragging diesel / axum / tower along.

## Why

- **Lean** — no diesel, no tower, no Bevy in the default feature set. Just `reqwest` + rustls under `native`.
- **One client, two callers** — the same [`SupaClient`] is used from JNI MC plugins (no Bevy) and from Bevy games as a `Resource` (with the `bevy` feature). No newtype wrapper needed.
- **Schema-aware RPC** — [`SupaClient::rpc_schema`] sets `Content-Profile` / `Accept-Profile` headers so PostgREST routes calls to non-default schemas (e.g. `mc`, `tracker`).
- **JWT layering** — [`SupaClient::with_jwt`] swaps just the `Authorization` header so service-role + per-user JWT can coexist on one client.

## Quick start (non-Bevy)

```rust,ignore
use bevy_supa::SupaClient;

let client = SupaClient::from_env()
    .ok_or("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY missing")?;

let resp = client
    .rpc_schema(
        "service_verify_link",
        serde_json::json!({
            "p_mc_uuid": "0123…",
            "p_code": 123_456,
        }),
        "mc",
    )
    .await?;

let verified = resp.error_for_status()?.json::<bool>().await?;
```

## Quick start (Bevy)

```rust,ignore
use bevy::prelude::*;
use bevy_supa::{BevySupaPlugin, SupaClient};

App::new()
    .add_plugins(BevySupaPlugin::from_env())
    .add_systems(Update, kick_off_rpc)
    .run();

fn kick_off_rpc(client: Res<SupaClient>) {
    // Bevy 0.18 has no async system adapter, so hand the client off to
    // an AsyncComputeTaskPool task or bevy_tasker::spawn.
    let cloned = client.clone();
    bevy_tasker::spawn(async move {
        let _ = cloned.rpc("ping", serde_json::json!({})).await;
    }).detach();
}
```

## Surface

| Item                                                                 | Purpose                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`SupaClient`]                                                       | PostgREST client (Clone, Arc'd reqwest under the hood)                         |
| [`SupaClient::new`] / [`with_timeout`] / [`from_env`] / [`with_jwt`] | Constructors + builder ops                                                     |
| [`SupaClient::rpc`]                                                  | RPC in the default schema                                                      |
| [`SupaClient::rpc_schema`]                                           | RPC in a specific PostgreSQL schema                                            |
| [`SupaError`]                                                        | Error enum (`Config`, `Transport`, `Http`, `Decode`)                           |
| `BevySupaPlugin`                                                     | Bevy plugin — inserts `SupaClient` as a `Resource` (feature `bevy` + `native`) |
| `DEFAULT_TIMEOUT`                                                    | 15 s — tuned for in-cluster Kong → PostgREST hops                              |

## Features

| Feature            | Effect                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| `native` (default) | `reqwest` + rustls native HTTP transport                                          |
| `wasm`             | Browser `fetch` transport — currently a stub, see `src/wasm.rs`                   |
| `bevy`             | Adds `BevySupaPlugin` and the `Resource` impl on `SupaClient`. Requires `native`. |

Disable default features when only the type surface is needed (build scripts, codegen):

```toml
[dependencies]
bevy_supa = { version = "0.1", default-features = false }
```

## Auth model

Two headers are sent on every request:

- `apikey` — always the `api_key` passed at construction.
- `Authorization: Bearer …` — the JWT from [`with_jwt`] if set, otherwise falls back to the `api_key`.

This lets a single client carry the service-role key as the apikey while authorizing the request as a specific user via their anon JWT — useful when proxying user sessions through a server.

## License

MIT

[`SupaClient`]: https://docs.rs/bevy_supa/latest/bevy_supa/struct.SupaClient.html
[`SupaClient::new`]: https://docs.rs/bevy_supa/latest/bevy_supa/struct.SupaClient.html#method.new
[`with_timeout`]: https://docs.rs/bevy_supa/latest/bevy_supa/struct.SupaClient.html#method.with_timeout
[`from_env`]: https://docs.rs/bevy_supa/latest/bevy_supa/struct.SupaClient.html#method.from_env
[`with_jwt`]: https://docs.rs/bevy_supa/latest/bevy_supa/struct.SupaClient.html#method.with_jwt
[`SupaClient::rpc`]: https://docs.rs/bevy_supa/latest/bevy_supa/struct.SupaClient.html#method.rpc
[`SupaClient::rpc_schema`]: https://docs.rs/bevy_supa/latest/bevy_supa/struct.SupaClient.html#method.rpc_schema
[`SupaError`]: https://docs.rs/bevy_supa/latest/bevy_supa/enum.SupaError.html
