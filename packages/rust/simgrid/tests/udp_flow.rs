//! End-to-end test for the UDP fast lane: a real WS client joins, receives
//! the UDP offer, completes the UDP hello handshake, receives a snapshot
//! pushed over UDP, and sends a UDP input frame back to the server.

use futures_util::{SinkExt, StreamExt};
use simgrid::net::ServerState;
use simgrid::proto;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn udp_fast_lane_full_flow() {
    let (out_tx, out_rx) = mpsc::unbounded_channel();
    let (input_tx, mut input_rx) = mpsc::unbounded_channel();

    let lane = simgrid::UdpLane::bind("127.0.0.1:0".parse().unwrap())
        .await
        .unwrap();
    lane.spawn_recv_loop(input_tx.clone());

    let state = ServerState::new(input_tx, 1, Vec::new(), false, 4).with_udp(lane.clone());
    state.spawn_event_router(out_rx);
    let router = simgrid::router(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let ws_addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });

    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{ws_addr}/ws"))
        .await
        .unwrap();
    let join = proto::encode(&proto::ClientMessage::JoinMatch(proto::JoinMatch {
        protocol: proto::PROTOCOL_VERSION,
        jwt: String::new(),
        kbve_username: "tester".into(),
    }))
    .unwrap();
    ws.send(Message::Binary(join)).await.unwrap();

    let mut my_slot = None;
    let mut offer: Option<proto::UdpOffer> = None;
    while offer.is_none() {
        let msg = tokio::time::timeout(std::time::Duration::from_secs(2), ws.next())
            .await
            .expect("ws timeout")
            .unwrap()
            .unwrap();
        let Message::Binary(mut bytes) = msg else {
            continue;
        };
        match proto::decode::<proto::ServerEvent>(&mut bytes).unwrap() {
            proto::ServerEvent::Welcome { your_slot, .. } => my_slot = Some(your_slot),
            proto::ServerEvent::Ephemeral { kind, payload, .. }
                if kind == proto::EPHEMERAL_UDP_OFFER =>
            {
                offer = Some(proto::decode_inner(&payload).unwrap());
            }
            _ => {}
        }
    }
    let offer = offer.unwrap();
    let my_slot = my_slot.expect("welcome before offer");
    assert_eq!(offer.port, lane.port());

    let udp = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
    let server_udp = format!("127.0.0.1:{}", offer.port);
    let hello = proto::encode_inner(&proto::UdpPacket::Hello {
        protocol: proto::PROTOCOL_VERSION,
        token: offer.token,
    })
    .unwrap();
    udp.send_to(&hello, &server_udp).await.unwrap();
    let mut buf = [0u8; 2048];
    let n = tokio::time::timeout(std::time::Duration::from_secs(2), udp.recv(&mut buf))
        .await
        .expect("ack timeout")
        .unwrap();
    assert!(matches!(
        proto::decode_inner::<proto::UdpPacket>(&buf[..n]).unwrap(),
        proto::UdpPacket::HelloAck
    ));

    out_tx
        .send(proto::ServerEvent::Snapshot(proto::Snapshot {
            tick: 7,
            server_time_ms: 0,
            input_ack: 0,
            players: Vec::new(),
            entities: Vec::new(),
            keyframe: true,
        }))
        .unwrap();
    let n = tokio::time::timeout(std::time::Duration::from_secs(2), udp.recv(&mut buf))
        .await
        .expect("udp snapshot timeout")
        .unwrap();
    assert!(matches!(
        proto::decode_inner::<proto::UdpPacket>(&buf[..n]).unwrap(),
        proto::UdpPacket::Snapshot(s) if s.tick == 7
    ));

    let frame = proto::encode_inner(&proto::UdpPacket::Frame(proto::ClientFrame {
        client_tick: 1,
        inputs: vec![proto::Input::Move {
            seq: 5,
            mx: 0,
            my: 1,
            run: true,
            tick: 1,
        }],
    }))
    .unwrap();
    udp.send_to(&frame, &server_udp).await.unwrap();
    let (slot, input) = tokio::time::timeout(std::time::Duration::from_secs(2), input_rx.recv())
        .await
        .expect("input timeout")
        .unwrap();
    assert_eq!(slot, my_slot);
    assert!(matches!(input, proto::Input::Move { seq: 5, .. }));
}
