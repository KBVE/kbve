//! Integration tests for the full axum WS + sim loop: a real client joins the
//! router, the bevy sim spawns/moves the player, snapshots stream back, and the
//! single-session + capacity rules hold. Spins everything in-process on an
//! ephemeral port — no network, no auth (empty jwt_secret -> username trusted).

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

use simgrid::proto::{
    self, ClientFrame, ClientMessage, Dir, Input, JoinMatch, PROTOCOL_VERSION, ServerEvent,
};
use simgrid::{
    KindRegistry, ServerState, SimConfig, WalkableMap, build_app, proto::Tile, router, run_sim_loop,
};
use tokio::sync::mpsc;

type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;

const SPAWN: Tile = Tile::new(5, 5);

/// Boot a sim + router on an ephemeral port; returns the ws:// URL.
async fn spawn_server(capacity: usize) -> String {
    let (out_tx, out_rx) = mpsc::unbounded_channel();
    let (input_tx, input_rx) = mpsc::unbounded_channel();
    let state = ServerState::new(input_tx, 7, Vec::new(), true, capacity);
    let roster = state.roster.clone();
    state.spawn_event_router(out_rx);
    let config = SimConfig {
        spawn: SPAWN,
        ticks_per_tile: 1,
        ..Default::default()
    };
    let map = WalkableMap::open(20, 20);
    let registry = KindRegistry::new();

    // Sim runs on its own current-thread runtime, like the gameserver binary.
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("sim runtime");
        let app = build_app(out_tx, input_rx, roster, 7, config, map, registry);
        rt.block_on(run_sim_loop(app));
    });

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let addr = listener.local_addr().expect("addr");
    tokio::spawn(async move {
        let _ = axum::serve(listener, router(state)).await;
    });
    format!("ws://{addr}/ws")
}

fn join(user: &str) -> Message {
    let jm = ClientMessage::JoinMatch(JoinMatch {
        protocol: PROTOCOL_VERSION,
        jwt: String::new(),
        kbve_username: user.to_string(),
    });
    Message::Text(proto::encode_json(&jm).expect("encode join"))
}

/// Next decoded ServerEvent within a timeout, or None.
async fn next_event(ws: &mut Ws) -> Option<ServerEvent> {
    let deadline = Duration::from_secs(5);
    loop {
        let msg = tokio::time::timeout(deadline, ws.next())
            .await
            .ok()??
            .ok()?;
        match msg {
            Message::Text(t) => {
                if let Ok(evt) = proto::decode_json::<ServerEvent>(&t) {
                    return Some(evt);
                }
            }
            Message::Close(_) => return None,
            _ => {}
        }
    }
}

async fn join_and_welcome(url: &str, user: &str) -> Ws {
    let (mut ws, _) = connect_async(url).await.expect("connect");
    ws.send(join(user)).await.expect("send join");
    match next_event(&mut ws).await {
        Some(ServerEvent::Welcome { protocol, .. }) => {
            assert_eq!(protocol, PROTOCOL_VERSION);
        }
        other => panic!("expected Welcome, got {other:?}"),
    }
    ws
}

#[tokio::test]
async fn join_spawns_player_at_spawn_tile() {
    let url = spawn_server(8).await;
    let mut ws = join_and_welcome(&url, "ann").await;

    // A snapshot should soon carry our player entity at the spawn tile.
    for _ in 0..200 {
        if let Some(ServerEvent::Snapshot(snap)) = next_event(&mut ws).await
            && let Some(e) = snap.entities.iter().find(|e| e.tile == SPAWN)
        {
            assert_eq!(e.tile, SPAWN);
            return;
        }
    }
    panic!("never saw the player spawn at {SPAWN:?}");
}

#[tokio::test]
async fn step_input_moves_player() {
    let url = spawn_server(8).await;
    let mut ws = join_and_welcome(&url, "mover").await;

    // Wait for the spawn snapshot.
    let mut start_y = None;
    for _ in 0..200 {
        if let Some(ServerEvent::Snapshot(s)) = next_event(&mut ws).await
            && let Some(e) = s.entities.iter().find(|e| e.tile.x == SPAWN.x)
        {
            start_y = Some(e.tile.y);
            break;
        }
    }
    let start_y = start_y.expect("player spawned");

    // Step up a few times; y should decrease.
    let frame = ClientMessage::Frame(ClientFrame {
        client_tick: 1,
        inputs: vec![Input::Step { dir: Dir::Up }],
    });
    for _ in 0..5 {
        ws.send(Message::Text(proto::encode_json(&frame).unwrap()))
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(120)).await;
    }

    for _ in 0..200 {
        if let Some(ServerEvent::Snapshot(s)) = next_event(&mut ws).await
            && let Some(e) = s.entities.iter().find(|e| e.tile.x == SPAWN.x)
            && e.tile.y < start_y
        {
            return;
        }
    }
    panic!("player never moved up from y={start_y}");
}

#[tokio::test]
async fn second_login_evicts_first() {
    let url = spawn_server(8).await;
    let mut first = join_and_welcome(&url, "dup").await;
    let _second = join_and_welcome(&url, "dup").await;

    // The first session should be disconnected (stream ends) by the newest-wins
    // eviction once "dup" reconnects.
    for _ in 0..200 {
        match next_event(&mut first).await {
            None => return, // closed/evicted
            Some(_) => continue,
        }
    }
    panic!("first session for duplicate username was never evicted");
}

#[tokio::test]
async fn full_match_rejects_extra_player() {
    let url = spawn_server(1).await;
    let _first = join_and_welcome(&url, "one").await;

    let (mut second, _) = connect_async(&url).await.expect("connect");
    second.send(join("two")).await.expect("send join");
    match next_event(&mut second).await {
        Some(ServerEvent::Reject { reason }) => assert!(reason.contains("full")),
        other => panic!("expected Reject for a full match, got {other:?}"),
    }
}
