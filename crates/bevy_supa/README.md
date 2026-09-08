# bevy_supa

Supabase client with optional Bevy integration. Two halves of Supabase, two clients, one crate: PostgREST over `reqwest` for servers, GoTrue auth over `ehttp` for players — the latter compiling for `wasm32` so browser-hosted Bevy games can log a player in.

The PostgREST half came out of `kbve` as `entity::client::supabase`; the auth half came out of `erust`, where it had been sharing a crate with egui widgets it never used.

## Why

- **Lean** — no diesel, no tower, no Bevy in the default feature set. Just `reqwest` + rustls under `native`.
- **One client, two callers** — the same [`SupaClient`] is used from JNI MC plugins (no Bevy) and from servers as a `Resource` (with the `bevy` feature). No newtype wrapper needed.
- **Browser-capable auth** — [`SupabaseClient`] talks to GoTrue over `ehttp`, which is `ureq` natively and `fetch` on wasm32. It is callback-driven, so it needs no async runtime and works on wasm's single thread.
- **Schema-aware RPC** — [`SupaClient::rpc_schema`] sets `Content-Profile` / `Accept-Profile` headers so PostgREST routes calls to non-default schemas (e.g. `mc`, `tracker`).
- **JWT layering** — [`SupaClient::with_jwt`] swaps just the `Authorization` header so service-role + per-user JWT can coexist on one client.

## Which client?

|                | [`SupaClient`]     | [`SupabaseClient`]           |
| -------------- | ------------------ | ---------------------------- |
| Supabase half  | PostgREST          | GoTrue + Edge Functions      |
| Feature        | `native`           | `auth`                       |
| Transport      | `reqwest` + rustls | `ehttp`                      |
| Call shape     | `async fn` + await | callback                     |
| Session state  | none               | owns a refreshable `Session` |
| Credential     | service-role key   | anon key + player JWT        |
| `wasm32` build | no                 | yes                          |

Neither wraps the other. A game server that reads tables wants `native`; a game client that logs a player in wants `auth`; a host that does both enables both.

## Quick start (PostgREST, non-Bevy)

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

## Quick start (PostgREST, Bevy)

```rust,ignore
use bevy::prelude::*;
use bevy_supa::{BevySupaPlugin, SupaClient};

App::new()
    .add_plugins(BevySupaPlugin::from_env())
    .add_systems(Update, kick_off_rpc)
    .run();

fn kick_off_rpc(client: Res<SupaClient>) {
    // Bevy 0.19 has no async system adapter, so hand the client off to
    // an AsyncComputeTaskPool task or bevy_tasker::spawn.
    let cloned = client.clone();
    bevy_tasker::spawn(async move {
        let _ = cloned.rpc("ping", serde_json::json!({})).await;
    }).detach();
}
```

## Quick start (auth, Bevy)

Auth calls return nothing at the call site — every outcome arrives later as an [`AuthEvent`] message, because the transport's callbacks fire off the Bevy schedule. `SupaAuthPlugin` installs the drain system that bridges the two.

```rust,ignore
use bevy::prelude::*;
use bevy_supa::{AuthEvent, SupaAuthPlugin, SupabaseAuth};

App::new()
    .add_plugins(SupaAuthPlugin::new(supabase_url, anon_key).with_auto_refresh())
    .add_systems(Update, (submit_login, on_auth))
    .run();

fn submit_login(auth: Res<SupabaseAuth>, form: Res<LoginForm>) {
    // `is_loading` is the submit guard: without it a held button fires one
    // request per frame.
    if form.submitted && !auth.is_loading() {
        auth.sign_in_with_password(&form.email, &form.password);
    }
}

fn on_auth(mut events: MessageReader<AuthEvent>, mut state: ResMut<NextState<Screen>>) {
    for event in events.read() {
        match event {
            AuthEvent::SignedIn(session) => {
                info!("welcome {:?}", session.user.email);
                state.set(Screen::World);
            }
            AuthEvent::Failed(err) => warn!("login failed: {err}"),
            _ => {}
        }
    }
}
```

For a provider login, send the player to `auth.authorize_url("discord", redirect_to)` and hand the URL they come back on to `auth.complete_oauth(&url)`; the result arrives as the same `AuthEvent::SignedIn`.

## Quick start (auth, no Bevy)

`SupabaseClient` is a plain callback client — Tauri commands and CLIs use it directly, no ECS involved.

```rust,ignore
use bevy_supa::supabase::SupabaseClient;

let client = SupabaseClient::new(supabase_url, anon_key);
client.sign_in_with_password("player@example.com", "hunter2", |result| {
    match result {
        Ok(session) => println!("token {}", session.access_token),
        Err(err) => eprintln!("{err}"),
    }
});
```

## Surface

| Item                                                                 | Purpose                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`SupaClient`]                                                       | PostgREST client (Clone, Arc'd reqwest under the hood)                         |
| [`SupaClient::new`] / [`with_timeout`] / [`from_env`] / [`with_jwt`] | Constructors + builder ops                                                     |
| [`SupaClient::rpc`]                                                  | RPC in the default schema                                                      |
| [`SupaClient::rpc_schema`]                                           | RPC in a specific PostgreSQL schema                                            |
| [`SupaError`]                                                        | PostgREST error enum (`Config`, `Transport`, `Http`, `Decode`)                 |
| `BevySupaPlugin`                                                     | Bevy plugin — inserts `SupaClient` as a `Resource` (feature `bevy` + `native`) |
| `DEFAULT_TIMEOUT`                                                    | 15 s — tuned for in-cluster Kong → PostgREST hops                              |
| `SupabaseClient`                                                     | GoTrue client — password, OAuth, refresh, sign-out, edge functions             |
| `Session` / `SupabaseUser` / `SupabaseConfig`                        | Session model and endpoint config                                              |
| `SupabaseError`                                                      | Auth error enum                                                                |
| `SupaAuthPlugin` / `SupabaseAuth` / `AuthEvent`                      | Bevy auth layer (feature `bevy` + `auth`)                                      |

## Features

| Feature            | Effect                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `native` (default) | `reqwest` + rustls PostgREST transport. Does not build for `wasm32`.                       |
| `auth`             | `ehttp` GoTrue transport + edge functions. Builds everywhere, `wasm32` included.           |
| `wasm`             | Alias for `auth`, kept as the name browser consumers reach for.                            |
| `bevy`             | Adds the plugin and `Resource` impl for whichever transports are on. Needs one of the two. |

`native` and `auth` are independent — enable either, both, or neither. Disable default features when only the type surface is needed (build scripts, codegen):

```toml
[dependencies]
bevy_supa = { version = "0.2", default-features = false }
```

## Auth model

**PostgREST (`SupaClient`)** sends two headers on every request:

- `apikey` — always the `api_key` passed at construction.
- `Authorization: Bearer …` — the JWT from [`with_jwt`] if set, otherwise falls back to the `api_key`.

This lets a single client carry the service-role key as the apikey while authorizing the request as a specific user via their anon JWT — useful when proxying user sessions through a server.

**GoTrue (`SupabaseClient`)** holds the anon key plus whatever `Session` the player's login produced, and refreshes it from the session's own refresh token. `Session::is_expired` reports true a minute early so a renewal has time to land before the access token actually lapses.

Note that a Supabase project with hCaptcha enabled on its auth settings rejects the password grant outright — provider login is the only path there.

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
[`SupabaseClient`]: https://docs.rs/bevy_supa/latest/bevy_supa/supabase/struct.SupabaseClient.html
[`AuthEvent`]: https://docs.rs/bevy_supa/latest/bevy_supa/enum.AuthEvent.html
