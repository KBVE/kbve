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
    self, ClientFrame, ClientMessage, EntityId, Input, JoinMatch, PROTOCOL_VERSION, PlayerSlot,
    ServerEvent,
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
    Message::Binary(proto::encode(&jm).expect("encode join"))
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
            Message::Binary(mut b) => {
                if let Ok(evt) = proto::decode::<ServerEvent>(&mut b) {
                    return Some(evt);
                }
            }
            Message::Close(_) => return None,
            _ => {}
        }
    }
}

async fn join_and_welcome(url: &str, user: &str) -> Ws {
    join_with_slot(url, user).await.0
}

/// Join and return the socket plus the slot the server assigned us.
async fn join_with_slot(url: &str, user: &str) -> (Ws, PlayerSlot) {
    let (mut ws, _) = connect_async(url).await.expect("connect");
    ws.send(join(user)).await.expect("send join");
    match next_event(&mut ws).await {
        Some(ServerEvent::Welcome {
            protocol,
            your_slot,
            ..
        }) => {
            assert_eq!(protocol, PROTOCOL_VERSION);
            (ws, your_slot)
        }
        other => panic!("expected Welcome, got {other:?}"),
    }
}

async fn send_frame(ws: &mut Ws, inputs: Vec<Input>) {
    let frame = ClientMessage::Frame(ClientFrame {
        client_tick: 1,
        inputs,
    });
    ws.send(Message::Binary(proto::encode(&frame).unwrap()))
        .await
        .unwrap();
}

/// Read snapshots until we see an entity owned by `slot`, returning its eid.
async fn eid_owned_by(ws: &mut Ws, slot: PlayerSlot) -> EntityId {
    for _ in 0..200 {
        if let Some(ServerEvent::Snapshot(snap)) = next_event(ws).await
            && let Some(e) = snap.entities.iter().find(|e| e.owner == slot)
        {
            return e.eid;
        }
    }
    panic!("never saw an entity owned by {slot:?}");
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
async fn move_input_moves_player() {
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

    // Steer the float body up (negative y); y should decrease.
    let frame = ClientMessage::Frame(ClientFrame {
        client_tick: 1,
        inputs: vec![Input::Move {
            seq: 1,
            mx: 0,
            my: -127,
            run: true,
        }],
    });
    for _ in 0..5 {
        ws.send(Message::Binary(proto::encode(&frame).unwrap()))
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
async fn second_live_session_is_rejected() {
    let url = spawn_server(8).await;
    let mut first = join_and_welcome(&url, "dup").await;

    // A second live login for the same identity is rejected — the existing
    // session keeps the slot (reject-duplicate, not newest-wins eviction).
    let (mut second, _) = connect_async(&url).await.expect("connect");
    second.send(join("dup")).await.expect("send join");
    match next_event(&mut second).await {
        Some(ServerEvent::Reject { reason }) => {
            assert!(
                reason.contains("already connected"),
                "unexpected reason: {reason}"
            );
        }
        other => panic!("expected Reject for a duplicate live session, got {other:?}"),
    }

    // The first session survives — it still receives snapshots.
    match next_event(&mut first).await {
        Some(_) => {}
        None => panic!("first session was evicted; it should outlive the rejected duplicate"),
    }
}

#[tokio::test]
async fn trade_offer_accept_completes_over_ws() {
    let url = spawn_server(8).await;
    let (mut alice, a_slot) = join_with_slot(&url, "alice").await;
    let (mut bob, b_slot) = join_with_slot(&url, "bob").await;

    // Alice learns Bob's entity id from a snapshot, then opens a trade.
    let b_eid = eid_owned_by(&mut alice, b_slot).await;
    let _ = a_slot;
    send_frame(
        &mut alice,
        vec![Input::TradeOffer {
            target: b_eid,
            items: Vec::new(),
        }],
    )
    .await;
    tokio::time::sleep(Duration::from_millis(120)).await;
    send_frame(&mut alice, vec![Input::TradeAccept]).await;
    send_frame(&mut bob, vec![Input::TradeAccept]).await;

    // Both clients should observe the trade reach "completed".
    for ws in [&mut alice, &mut bob] {
        let mut done = false;
        for _ in 0..200 {
            if let Some(ServerEvent::Ephemeral { kind, payload, .. }) = next_event(ws).await
                && kind == proto::EPHEMERAL_TRADE
            {
                let body = String::from_utf8(payload).unwrap();
                if body.contains("\"status\":\"completed\"") {
                    done = true;
                    break;
                }
            }
        }
        assert!(done, "client never saw the trade complete");
    }
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
