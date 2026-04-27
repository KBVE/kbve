# bevy_supa

Agnostic Supabase (PostgREST) client with optional Bevy integration. Native HTTP via `reqwest` + rustls; WASM transport stub for later.

## Usage

```rust
use bevy_supa::SupaClient;

let client = SupaClient::from_env()?;
let resp = client
    .rpc_schema("service_verify_link", serde_json::json!({
        "p_mc_uuid": "...",
        "p_code": 123456,
    }), "mc")
    .await?;
```

## Features

| Feature            | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `native` (default) | `reqwest` + rustls native HTTP client                  |
| `wasm`             | Browser `fetch` transport (stub — not yet implemented) |
| `bevy`             | Adds `BevySupaPlugin` and `SupaClient` Bevy `Resource` |

Consumers wanting only the type surface can disable default features.

## License

MIT
