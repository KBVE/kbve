# Simgrid UDP Fast Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional UDP data plane for the simgrid/arpg server so the Unreal client sends movement inputs and receives snapshots over UDP, with WS remaining the canonical transport and automatic fallback.

**Architecture:** New `UdpLane` module in simgrid owning one tokio `UdpSocket`. WS connect flow issues a per-session token and sends a `UdpOffer` as a new Ephemeral kind right after Welcome (no Welcome shape change, no protocol bump). Client sends `UdpPacket::Hello{token}`; server binds `addr → slot`. Snapshot routing diverts to UDP for bound slots (falls back to WS per-tick if the encoded datagram exceeds 1200 B or the binding is stale). Staleness is checked lazily at send time — no sweeper task.

**Tech Stack:** Rust (tokio UdpSocket, postcard, dashmap), UE C++ (FUdpSocketBuilder/FUdpSocketReceiver, existing hand-written postcard codec), k8s (Agones Fleet, Cilium L4 Service).

**Spec:** `docs/superpowers/specs/2026-07-02-simgrid-udp-fastlane-design.md` (amended: UdpOffer rides an Ephemeral, not appended Welcome fields; PROTOCOL_VERSION stays 16).

## Global Constraints

- Worktree: `/Users/alappatel/Documents/GitHub/kbve-atom-arpg-udp-transport`, branch `atom-07020646-arpg-udp-transport`. All commands run from worktree root.
- Rust tests: `cargo test -p simgrid` (direct cargo is fine for crate-level test loops; user's nx preference applies to builds/releases).
- NO inline comments in new code. Doc comments only where a constraint cannot be expressed in code, one line, terse. (Standing user preference, flagged 9×.)
- postcard is positional: never insert enum variants or struct fields mid-shape; append only. `UdpPacket` is a NEW enum — order is frozen once the UE codec pins it.
- Existing WS behavior must not change for clients that never send a UDP Hello. `PROTOCOL_VERSION` stays `16`.
- Datagram cap: 1200 bytes (`UDP_MAX_DATAGRAM`).
- Stale binding threshold: 10 s (`UDP_STALE_SECS`).
- Commit messages: conventional commits, no co-author trailers.

---

### Task 1: Wire types — `UdpPacket`, `UdpOffer`, constants

**Files:**

- Modify: `packages/rust/simgrid/src/proto.rs` (append near `ServerEvent`, around line 713)

**Interfaces:**

- Produces: `proto::UdpPacket` (enum: `Hello { protocol: u32, token: [u8; 16] }`, `HelloAck`, `Frame(ClientFrame)`, `Snapshot(Snapshot)`), `proto::UdpOffer { token: [u8; 16], port: u16 }`, `proto::EPHEMERAL_UDP_OFFER: u16 = 20`, `proto::UDP_MAX_DATAGRAM: usize = 1200`. Encoded with existing `encode_inner`/`decode_inner` (plain postcard, no COBS).

- [ ] **Step 1: Write failing tests** — append to `mod tests` in `proto.rs`:

```rust
#[test]
fn udp_packet_round_trips() {
    let hello = UdpPacket::Hello {
        protocol: PROTOCOL_VERSION,
        token: [7u8; 16],
    };
    let bytes = encode_inner(&hello).expect("encode");
    match decode_inner::<UdpPacket>(&bytes).expect("decode") {
        UdpPacket::Hello { protocol, token } => {
            assert_eq!(protocol, PROTOCOL_VERSION);
            assert_eq!(token, [7u8; 16]);
        }
        _ => panic!("wrong variant"),
    }

    let frame = UdpPacket::Frame(ClientFrame {
        client_tick: 9,
        inputs: vec![Input::Move { seq: 3, mx: 1, my: -1, run: false, tick: 9 }],
    });
    let bytes = encode_inner(&frame).expect("encode");
    assert!(matches!(
        decode_inner::<UdpPacket>(&bytes).expect("decode"),
        UdpPacket::Frame(f) if f.client_tick == 9
    ));

    let ack = encode_inner(&UdpPacket::HelloAck).expect("encode");
    assert!(matches!(
        decode_inner::<UdpPacket>(&ack).expect("decode"),
        UdpPacket::HelloAck
    ));
}

#[test]
fn udp_offer_round_trips() {
    let offer = UdpOffer { token: [0xAB; 16], port: 7977 };
    let bytes = encode_inner(&offer).expect("encode");
    let back: UdpOffer = decode_inner(&bytes).expect("decode");
    assert_eq!(back.token, [0xAB; 16]);
    assert_eq!(back.port, 7977);
}

#[test]
fn udp_hello_fixture_is_stable() {
    let hello = UdpPacket::Hello { protocol: 16, token: [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
        0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    ]};
    let hex: String = encode_inner(&hello)
        .expect("encode")
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    assert_eq!(hex, "0010000102030405060708090a0b0c0d0e0f");
}
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cargo test -p simgrid udp_ 2>&1 | tail -20`
Expected: compile error `cannot find type UdpPacket`

- [ ] **Step 3: Implement types** — in `proto.rs`, after the `ServerEvent` enum (line ~713), and the constant next to the other `EPHEMERAL_*` constants (line ~51):

```rust
pub const EPHEMERAL_UDP_OFFER: u16 = 20;
```

```rust
pub const UDP_MAX_DATAGRAM: usize = 1200;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum UdpPacket {
    Hello { protocol: u32, token: [u8; 16] },
    HelloAck,
    Frame(ClientFrame),
    Snapshot(Snapshot),
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct UdpOffer {
    pub token: [u8; 16],
    pub port: u16,
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cargo test -p simgrid udp_ 2>&1 | tail -5`
Expected: `3 passed`. If `udp_hello_fixture_is_stable` fails on the hex, the discriminant/varint math differs — print the actual hex, verify by hand against postcard rules (varint discriminant `0x00`, varint protocol `0x10`, 16 raw token bytes), and pin the ACTUAL bytes; this hex is the cross-language fixture Task 7 copies.

- [ ] **Step 5: Full crate test + commit**

Run: `cargo test -p simgrid 2>&1 | tail -5` — expected all pass.

```bash
git add packages/rust/simgrid/src/proto.rs
git commit -m "feat(simgrid): UdpPacket + UdpOffer wire types for UDP fast lane"
```

---

### Task 2: `UdpLane` — socket, token registry, bindings, recv loop

**Files:**

- Create: `packages/rust/simgrid/src/net_udp.rs`
- Modify: `packages/rust/simgrid/src/lib.rs` (add `pub mod net_udp;` and re-export `UdpLane`)
- Modify: `packages/rust/simgrid/Cargo.toml` (tokio `net` feature, `getrandom`)

**Interfaces:**

- Consumes: `proto::UdpPacket`, `proto::UdpOffer`, `net::SlotInput` (`(proto::PlayerSlot, Input)`), `mpsc::UnboundedSender<SlotInput>`.
- Produces:
    - `UdpLane::bind(addr: std::net::SocketAddr) -> std::io::Result<Arc<UdpLane>>`
    - `UdpLane::port(&self) -> u16`
    - `UdpLane::issue_token(&self, slot: proto::PlayerSlot) -> [u8; 16]`
    - `UdpLane::revoke(&self, slot: proto::PlayerSlot)`
    - `UdpLane::bound_addr(&self, slot: proto::PlayerSlot) -> Option<std::net::SocketAddr>` (None when unbound or stale)
    - `UdpLane::try_send_snapshot(&self, addr: std::net::SocketAddr, snap: &proto::Snapshot) -> bool` (false = oversize or send failure → caller falls back to WS)
    - `UdpLane::spawn_recv_loop(self: &Arc<Self>, input_tx: mpsc::UnboundedSender<SlotInput>)`

- [ ] **Step 1: Cargo features**

In `packages/rust/simgrid/Cargo.toml`: change the tokio line to add `"net"`, and add getrandom:

```toml
tokio = { version = "1.49", features = ["rt-multi-thread", "macros", "sync", "time", "net"] }
getrandom = "0.2"
```

- [ ] **Step 2: Write failing tests** — create `net_udp.rs` containing ONLY a `#[cfg(test)] mod tests` for now (module compiles, functions missing):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto;

    #[tokio::test]
    async fn token_binds_addr_and_acks() {
        let lane = UdpLane::bind("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        lane.spawn_recv_loop(&tx_sender(&tx));

        let slot = proto::PlayerSlot(3);
        let token = lane.issue_token(slot);

        let client = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let server_addr = format!("127.0.0.1:{}", lane.port());
        let hello = proto::encode_inner(&proto::UdpPacket::Hello {
            protocol: proto::PROTOCOL_VERSION,
            token,
        })
        .unwrap();
        client.send_to(&hello, &server_addr).await.unwrap();

        let mut buf = [0u8; 64];
        let n = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            client.recv(&mut buf),
        )
        .await
        .expect("ack timeout")
        .unwrap();
        assert!(matches!(
            proto::decode_inner::<proto::UdpPacket>(&buf[..n]).unwrap(),
            proto::UdpPacket::HelloAck
        ));
        assert_eq!(
            lane.bound_addr(slot).unwrap(),
            client.local_addr().unwrap()
        );

        let frame = proto::encode_inner(&proto::UdpPacket::Frame(proto::ClientFrame {
            client_tick: 1,
            inputs: vec![proto::Input::Move { seq: 1, mx: 1, my: 0, run: false, tick: 1 }],
        }))
        .unwrap();
        client.send_to(&frame, &server_addr).await.unwrap();
        let (got_slot, input) = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            rx.recv(),
        )
        .await
        .expect("input timeout")
        .unwrap();
        assert_eq!(got_slot, slot);
        assert!(matches!(input, proto::Input::Move { seq: 1, .. }));
    }

    #[tokio::test]
    async fn bad_token_and_unknown_addr_are_dropped() {
        let lane = UdpLane::bind("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        lane.spawn_recv_loop(&tx_sender(&tx));
        let server_addr = format!("127.0.0.1:{}", lane.port());

        let client = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let hello = proto::encode_inner(&proto::UdpPacket::Hello {
            protocol: proto::PROTOCOL_VERSION,
            token: [9u8; 16],
        })
        .unwrap();
        client.send_to(&hello, &server_addr).await.unwrap();

        let frame = proto::encode_inner(&proto::UdpPacket::Frame(proto::ClientFrame {
            client_tick: 1,
            inputs: vec![proto::Input::Leave],
        }))
        .unwrap();
        client.send_to(&frame, &server_addr).await.unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn revoke_unbinds_and_rebind_moves_addr() {
        let lane = UdpLane::bind("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        lane.spawn_recv_loop(&tx_sender(&tx));
        let slot = proto::PlayerSlot(1);
        let token = lane.issue_token(slot);
        let server_addr = format!("127.0.0.1:{}", lane.port());

        let a = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let hello = proto::encode_inner(&proto::UdpPacket::Hello {
            protocol: proto::PROTOCOL_VERSION,
            token,
        })
        .unwrap();
        a.send_to(&hello, &server_addr).await.unwrap();
        let mut buf = [0u8; 8];
        a.recv(&mut buf).await.unwrap();
        assert_eq!(lane.bound_addr(slot).unwrap(), a.local_addr().unwrap());

        let b = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        b.send_to(&hello, &server_addr).await.unwrap();
        b.recv(&mut buf).await.unwrap();
        assert_eq!(lane.bound_addr(slot).unwrap(), b.local_addr().unwrap());

        lane.revoke(slot);
        assert!(lane.bound_addr(slot).is_none());
        assert!(lane.issue_token(slot) != token);
    }

    #[tokio::test]
    async fn oversize_snapshot_reports_false() {
        let lane = UdpLane::bind("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let big = proto::Snapshot {
            tick: 1,
            server_time_ms: 0,
            input_ack: 0,
            players: Vec::new(),
            entities: (0..200)
                .map(|i| proto::EntityDelta {
                    eid: proto::EntityId(i),
                    kind: 1,
                    owner: proto::PlayerSlot(0),
                    tile: proto::Tile::new(i as i32, i as i32),
                    facing: proto::Facing::Down,
                    sub: 0,
                    qx: 0,
                    qy: 0,
                    qvx: 0,
                    qvy: 0,
                    input_ack: 0,
                    hp: 100,
                    max_hp: 100,
                    destroyed: false,
                    z: 0,
                    effects: Vec::new(),
                    piloting: 0,
                    mp: 0,
                    max_mp: 0,
                    energy: 0,
                    max_energy: 0,
                    stamina: 0,
                    max_stamina: 0,
                })
                .collect(),
            keyframe: true,
        };
        let addr = "127.0.0.1:9".parse().unwrap();
        assert!(!lane.try_send_snapshot(addr, &big));
        let small = proto::Snapshot {
            tick: 1,
            server_time_ms: 0,
            input_ack: 0,
            players: Vec::new(),
            entities: Vec::new(),
            keyframe: false,
        };
        assert!(lane.try_send_snapshot(addr, &small));
    }

    fn tx_sender(
        tx: &tokio::sync::mpsc::UnboundedSender<crate::net::SlotInput>,
    ) -> tokio::sync::mpsc::UnboundedSender<crate::net::SlotInput> {
        tx.clone()
    }
}
```

Add to `lib.rs` after `pub mod net;`:

```rust
pub mod net_udp;
```

and to the `pub use net::…` block area:

```rust
pub use net_udp::UdpLane;
```

- [ ] **Step 3: Run tests, verify fail**

Run: `cargo test -p simgrid net_udp 2>&1 | tail -10`
Expected: compile error `cannot find UdpLane`

- [ ] **Step 4: Implement `UdpLane`** — top of `net_udp.rs`, above the tests:

```rust
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use tokio::net::UdpSocket;
use tokio::sync::mpsc;

use crate::net::SlotInput;
use crate::proto::{self, UdpPacket};

const UDP_STALE_SECS: u64 = 10;

struct Binding {
    addr: SocketAddr,
    last_seen: Instant,
}

pub struct UdpLane {
    socket: Arc<UdpSocket>,
    port: u16,
    tokens: DashMap<[u8; 16], proto::PlayerSlot>,
    slot_tokens: DashMap<proto::PlayerSlot, [u8; 16]>,
    bindings: DashMap<proto::PlayerSlot, Binding>,
    addr2slot: DashMap<SocketAddr, proto::PlayerSlot>,
}

impl UdpLane {
    pub async fn bind(addr: SocketAddr) -> std::io::Result<Arc<Self>> {
        let socket = UdpSocket::bind(addr).await?;
        let port = socket.local_addr()?.port();
        Ok(Arc::new(Self {
            socket: Arc::new(socket),
            port,
            tokens: DashMap::new(),
            slot_tokens: DashMap::new(),
            bindings: DashMap::new(),
            addr2slot: DashMap::new(),
        }))
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn issue_token(&self, slot: proto::PlayerSlot) -> [u8; 16] {
        self.revoke(slot);
        let mut token = [0u8; 16];
        let _ = getrandom::getrandom(&mut token);
        self.tokens.insert(token, slot);
        self.slot_tokens.insert(slot, token);
        token
    }

    pub fn revoke(&self, slot: proto::PlayerSlot) {
        if let Some((_, token)) = self.slot_tokens.remove(&slot) {
            self.tokens.remove(&token);
        }
        if let Some((_, b)) = self.bindings.remove(&slot) {
            self.addr2slot.remove(&b.addr);
        }
    }

    pub fn bound_addr(&self, slot: proto::PlayerSlot) -> Option<SocketAddr> {
        let b = self.bindings.get(&slot)?;
        if b.last_seen.elapsed() > Duration::from_secs(UDP_STALE_SECS) {
            return None;
        }
        Some(b.addr)
    }

    pub fn try_send_snapshot(&self, addr: SocketAddr, snap: &proto::Snapshot) -> bool {
        let Ok(bytes) = proto::encode_inner(&UdpPacket::Snapshot(snap.clone())) else {
            return false;
        };
        if bytes.len() > proto::UDP_MAX_DATAGRAM {
            tracing::debug!(len = bytes.len(), "udp snapshot oversize; falling back to ws");
            return false;
        }
        self.socket.try_send_to(&bytes, addr).is_ok()
    }

    pub fn spawn_recv_loop(self: &Arc<Self>, input_tx: mpsc::UnboundedSender<SlotInput>) {
        let lane = self.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 2048];
            loop {
                let Ok((n, from)) = lane.socket.recv_from(&mut buf).await else {
                    continue;
                };
                let Ok(pkt) = proto::decode_inner::<UdpPacket>(&buf[..n]) else {
                    continue;
                };
                match pkt {
                    UdpPacket::Hello { protocol, token } => {
                        if protocol != proto::PROTOCOL_VERSION {
                            continue;
                        }
                        let Some(slot) = lane.tokens.get(&token).map(|e| *e.value()) else {
                            continue;
                        };
                        lane.bind_slot(slot, from);
                        let Ok(ack) = proto::encode_inner(&UdpPacket::HelloAck) else {
                            continue;
                        };
                        let _ = lane.socket.try_send_to(&ack, from);
                    }
                    UdpPacket::Frame(frame) => {
                        let Some(slot) = lane.addr2slot.get(&from).map(|e| *e.value()) else {
                            continue;
                        };
                        lane.touch(slot);
                        for input in frame.inputs {
                            let _ = input_tx.send((slot, input));
                        }
                    }
                    UdpPacket::HelloAck | UdpPacket::Snapshot(_) => {}
                }
            }
        });
    }

    fn bind_slot(&self, slot: proto::PlayerSlot, addr: SocketAddr) {
        if let Some(prev) = self.bindings.insert(
            slot,
            Binding {
                addr,
                last_seen: Instant::now(),
            },
        ) {
            if prev.addr != addr {
                self.addr2slot.remove(&prev.addr);
            }
        }
        self.addr2slot.insert(addr, slot);
        tracing::info!(slot = slot.0, %addr, "udp lane bound");
    }

    fn touch(&self, slot: proto::PlayerSlot) {
        if let Some(mut b) = self.bindings.get_mut(&slot) {
            b.last_seen = Instant::now();
        }
    }
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cargo test -p simgrid net_udp 2>&1 | tail -5`
Expected: `4 passed`

- [ ] **Step 6: Commit**

```bash
git add packages/rust/simgrid/src/net_udp.rs packages/rust/simgrid/src/lib.rs packages/rust/simgrid/Cargo.toml Cargo.lock
git commit -m "feat(simgrid): UdpLane token-bound UDP transport"
```

---

### Task 3: Wire `UdpLane` into WS connect flow + snapshot routing

**Files:**

- Modify: `packages/rust/simgrid/src/net.rs`

**Interfaces:**

- Consumes: `UdpLane` API from Task 2, `proto::{EPHEMERAL_UDP_OFFER, UdpOffer, encode_inner}`.
- Produces: `ServerState::with_udp(self, lane: Arc<crate::net_udp::UdpLane>) -> Self`; new public field `pub udp: Option<Arc<crate::net_udp::UdpLane>>` on `ServerState`. Behavior: UdpOffer Ephemeral sent right after Welcome when lane present; `route_snapshot_aoi` diverts to UDP for bound slots; `revoke` on disconnect.

- [ ] **Step 1: Write failing test** — append to `mod tests` in `net.rs`:

```rust
#[tokio::test]
async fn snapshot_diverts_to_udp_when_bound() {
    let lane = crate::net_udp::UdpLane::bind("127.0.0.1:0".parse().unwrap())
        .await
        .unwrap();
    let (itx, _irx) = mpsc::unbounded_channel();
    lane.spawn_recv_loop(&itx);
    let slot = proto::PlayerSlot(0);
    let token = lane.issue_token(slot);

    let client = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
    let server_addr = format!("127.0.0.1:{}", lane.port());
    let hello = proto::encode_inner(&proto::UdpPacket::Hello {
        protocol: proto::PROTOCOL_VERSION,
        token,
    })
    .unwrap();
    client.send_to(&hello, &server_addr).await.unwrap();
    let mut buf = [0u8; 2048];
    client.recv(&mut buf).await.unwrap();

    let conns: DashMap<Ulid, ConnHandle> = DashMap::new();
    let (wtx, mut wrx) = mpsc::channel(8);
    conns.insert(ulid_from_identity("a"), ConnHandle { tx: wtx, slot });
    let roster = Arc::new(RwLock::new(Roster::new(4)));

    let snap = proto::Snapshot {
        tick: 42,
        server_time_ms: 0,
        input_ack: 0,
        players: Vec::new(),
        entities: Vec::new(),
        keyframe: false,
    };
    route_snapshot_aoi(&conns, &roster, snap, Some(&lane));

    let n = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        client.recv(&mut buf),
    )
    .await
    .expect("udp snapshot timeout")
    .unwrap();
    assert!(matches!(
        proto::decode_inner::<proto::UdpPacket>(&buf[..n]).unwrap(),
        proto::UdpPacket::Snapshot(s) if s.tick == 42
    ));
    assert!(wrx.try_recv().is_err());
}

#[test]
fn snapshot_stays_on_ws_when_unbound() {
    let conns: DashMap<Ulid, ConnHandle> = DashMap::new();
    let (wtx, mut wrx) = mpsc::channel(8);
    conns.insert(
        ulid_from_identity("a"),
        ConnHandle {
            tx: wtx,
            slot: proto::PlayerSlot(0),
        },
    );
    let roster = Arc::new(RwLock::new(Roster::new(4)));
    let snap = proto::Snapshot {
        tick: 1,
        server_time_ms: 0,
        input_ack: 0,
        players: Vec::new(),
        entities: Vec::new(),
        keyframe: false,
    };
    route_snapshot_aoi(&conns, &roster, snap, None);
    assert!(wrx.try_recv().is_ok());
}
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cargo test -p simgrid --lib net:: 2>&1 | tail -10`
Expected: compile error — `route_snapshot_aoi` takes 3 args, tests pass 4.

- [ ] **Step 3: Implement wiring** — five edits in `net.rs`:

(a) `ServerState` field + builder (after the `kicks` field, line ~147, and after `with_registry`):

```rust
    pub udp: Option<Arc<crate::net_udp::UdpLane>>,
```

```rust
    pub fn with_udp(mut self, lane: Arc<crate::net_udp::UdpLane>) -> Self {
        self.udp = Some(lane);
        self
    }
```

Initialize `udp: None` in `ServerState::new`.

(b) `spawn_event_router` (line ~190): clone `self.udp` and thread it into `route_event`:

```rust
    pub fn spawn_event_router(&self, mut out_rx: mpsc::UnboundedReceiver<ServerEvent>) {
        let conns = self.conns.clone();
        let slot2id = self.slot2id.clone();
        let roster = self.roster.clone();
        let udp = self.udp.clone();
        tokio::spawn(async move {
            while let Some(evt) = out_rx.recv().await {
                route_event(&conns, &slot2id, &roster, udp.as_ref(), evt);
            }
        });
    }
```

(c) `route_event` signature gains `udp: Option<&Arc<crate::net_udp::UdpLane>>`; the Snapshot arm becomes:

```rust
        ServerEvent::Snapshot(snap) => {
            route_snapshot_aoi(conns, roster, snap, udp.map(|u| u.as_ref()));
            return;
        }
```

Update the two existing `route_event(...)` calls in tests (`targeted_event_reaches_only_owner`, `global_event_reaches_all`) to pass `None` as the new fourth argument.

(d) `route_snapshot_aoi` gains `udp: Option<&crate::net_udp::UdpLane>`; inside the per-connection loop, after building `view`, replace the unconditional WS deliver:

```rust
        if let Some(lane) = udp
            && let Some(addr) = lane.bound_addr(h.slot)
            && lane.try_send_snapshot(addr, &view)
        {
            continue;
        }
        let frame = Arc::new(encode_frame(&ServerEvent::Snapshot(view)));
        deliver(h.value(), frame);
```

(e) `handle_socket`: after the Welcome send succeeds (line ~383), send the offer; and at the end (after `cleanup_join`, line ~417), revoke:

```rust
    if let Some(lane) = &state.udp {
        let offer = proto::UdpOffer {
            token: lane.issue_token(slot),
            port: lane.port(),
        };
        if let Ok(payload) = proto::encode_inner(&offer)
            && let Some(msg) = encode_event(&ServerEvent::Ephemeral {
                kind: proto::EPHEMERAL_UDP_OFFER,
                to: slot,
                payload,
            })
        {
            let _ = socket.send(msg).await;
        }
    }
```

```rust
    if let Some(lane) = &state.udp {
        lane.revoke(slot);
    }
```

- [ ] **Step 4: Run all simgrid tests, verify pass**

Run: `cargo test -p simgrid 2>&1 | tail -5`
Expected: all pass, including the pre-existing `ws_flow` integration test (WS-only path unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/rust/simgrid/src/net.rs
git commit -m "feat(simgrid): route snapshots over UDP for token-bound slots"
```

---

### Task 4: arpg server opt-in via `ARPG_UDP_ADDR`

**Files:**

- Modify: `apps/agones/arpg/server/src/main.rs` (around lines 79-86 and 188)

**Interfaces:**

- Consumes: `simgrid::UdpLane`, `ServerState::with_udp`.
- Produces: server binds UDP lane only when env `ARPG_UDP_ADDR` is set (e.g. `0.0.0.0:7977`). Unset → identical behavior to today. cryptothrone unaffected (different binary, never sets the var).

- [ ] **Step 1: Implement** — in `main.rs`, after `state` is built and BEFORE `state.spawn_event_router(out_rx)` (currently line 85 — the router captures `state.udp`, so the lane must be attached first):

```rust
    let udp_lane = match std::env::var("ARPG_UDP_ADDR") {
        Ok(raw) => {
            let udp_addr: SocketAddr = raw.parse()?;
            let lane = simgrid::UdpLane::bind(udp_addr).await?;
            lane.spawn_recv_loop(state.input_tx.as_ref().expect("input_tx set").clone());
            tracing::info!(port = lane.port(), "udp fast lane enabled");
            Some(lane)
        }
        Err(_) => None,
    };
    if let Some(lane) = udp_lane {
        state = lane_into_state(state, lane);
    }
```

Add next to `shutdown_signal`:

```rust
fn lane_into_state(
    state: simgrid::net::ServerState,
    lane: std::sync::Arc<simgrid::UdpLane>,
) -> simgrid::net::ServerState {
    state.with_udp(lane)
}
```

(Or inline `state = state.with_udp(lane);` — use the inline form; the helper exists only if borrow order forces it. Prefer:)

```rust
    if let Ok(raw) = std::env::var("ARPG_UDP_ADDR") {
        let udp_addr: SocketAddr = raw.parse()?;
        let lane = simgrid::UdpLane::bind(udp_addr).await?;
        lane.spawn_recv_loop(state.input_tx.as_ref().expect("input_tx set").clone());
        tracing::info!(port = lane.port(), "udp fast lane enabled");
        state = state.with_udp(lane);
    }
```

Note `let mut state = …` on line 79. The existing `state.spawn_event_router(out_rx)` and `roster` clone stay AFTER this block.

- [ ] **Step 2: Verify build + existing tests**

Run: `cargo check -p arpg-server 2>&1 | tail -5` — expected clean.
Run: `cargo test -p simgrid 2>&1 | tail -3` — expected all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/agones/arpg/server/src/main.rs
git commit -m "feat(arpg): opt-in UDP fast lane via ARPG_UDP_ADDR"
```

---

### Task 5: End-to-end integration test (WS join → UDP offer → hello → UDP snapshots)

**Files:**

- Create: `packages/rust/simgrid/tests/udp_flow.rs` (model on existing `tests/ws_flow.rs` — read it first and reuse its server-spinup helper pattern verbatim where possible)

**Interfaces:**

- Consumes: full stack — `simgrid::router`, `ServerState`, `UdpLane`, tokio-tungstenite client.

- [ ] **Step 1: Read `tests/ws_flow.rs`** to copy its spin-up helpers (how it builds `ServerState`, binds an ephemeral TcpListener, runs axum, and drives a tungstenite client through JoinMatch/Welcome). Reuse the same style and helpers.

- [ ] **Step 2: Write the test** — full flow, dev-accept auth (empty `jwt_secret`, `require_username: false`, no verifier):

```rust
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
    lane.spawn_recv_loop(&input_tx);

    let state = ServerState::new(input_tx.clone(), 1, Vec::new(), false, 4)
        .with_udp(lane.clone());
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
        let Message::Binary(mut bytes) = msg else { continue };
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
        inputs: vec![proto::Input::Move { seq: 5, mx: 0, my: 1, run: true, tick: 1 }],
    }))
    .unwrap();
    udp.send_to(&frame, &server_udp).await.unwrap();
    let (slot, input) = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        input_rx.recv(),
    )
    .await
    .expect("input timeout")
    .unwrap();
    assert_eq!(slot, my_slot);
    assert!(matches!(input, proto::Input::Move { seq: 5, .. }));
}
```

Adjust to match `ws_flow.rs` conventions where they differ (e.g. if it wraps `ServerState` construction in a helper, reuse that helper). If `ServerState::new` signature differs from what's shown, follow the real one.

- [ ] **Step 3: Run, verify pass**

Run: `cargo test -p simgrid --test udp_flow 2>&1 | tail -5`
Expected: `1 passed`. Also run `cargo test -p simgrid 2>&1 | tail -3` — all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/rust/simgrid/tests/udp_flow.rs
git commit -m "test(simgrid): end-to-end UDP fast lane flow"
```

---

### Task 6: k8s manifests — fleet UDP port + L4 service

**Files:**

- Modify: `apps/kube/agones/arpg/manifests/fleet.yaml` (container ports + env)
- Create: `apps/kube/agones/arpg/manifests/game-udp-service.yaml`
- Modify: `apps/kube/agones/arpg/manifests/kustomization.yaml` (if resources are listed there — check first; add the new file)

**Interfaces:**

- Produces: pod listens on 7977/UDP; a `LoadBalancer` Service exposes it. NOT applied to prod by this task — lands with the PR and syncs via ArgoCD from main per normal flow.

- [ ] **Step 1: fleet.yaml** — in the GameServer template ports list (the existing `ws` entry around line 23), append a sibling port, keeping `portPolicy: None` / no hostPort:

```yaml
- name: udp
  portPolicy: None
  containerPort: 7977
  protocol: UDP
```

In the container env list add:

```yaml
- name: ARPG_UDP_ADDR
  value: '0.0.0.0:7977'
```

And in the container `ports:` list (next to the existing 7979 entry):

```yaml
- containerPort: 7977
  protocol: UDP
```

Match surrounding indentation exactly — read the file first; the snippets above assume the existing style.

- [ ] **Step 2: game-udp-service.yaml** — model on `game-service.yaml` (read it first, copy labels/selector verbatim):

```yaml
apiVersion: v1
kind: Service
metadata:
    name: arpg-game-udp
    namespace: arpg
spec:
    type: LoadBalancer
    selector:
        agones.dev/fleet: arpg-server
    ports:
        - name: udp
          port: 7977
          targetPort: 7977
          protocol: UDP
    sessionAffinity: ClientIP
```

Copy the real namespace and selector labels from `game-service.yaml` — do not trust the values above; the selector especially must match what the existing service uses.

- [ ] **Step 3: Validate + commit**

Run: `kubectl kustomize apps/kube/agones/arpg/manifests 2>&1 | tail -5` (or `kubectl apply --dry-run=client -f` each file if no kustomization). Expected: renders clean, no schema errors. Do NOT apply to the cluster.

```bash
git add apps/kube/agones/arpg/manifests/
git commit -m "feat(arpg): expose 7977/UDP fast lane in fleet + L4 service"
```

---

### Task 7: UE codec — `UdpPacket` encode/decode in `FProtoCodec`

**Files:**

- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridProto.h`
- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridProto.cpp`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/Tests/SimgridUdpPacketTests.cpp`

**Interfaces:**

- Consumes: existing `FPostcardWriter`/`FPostcardReader` (in `SimgridPostcard.h`) and `FProtoCodec::DecodeServerEventRaw` internals — read `SimgridProto.cpp` first to mirror its writer/reader idioms exactly.
- Produces:

```cpp
struct FSimgridUdpOffer
{
	uint8 Token[16] = {};
	uint16 Port = 0;
	bool bOk = false;
};

enum class EUdpPacketType : uint8 { Hello, HelloAck, Frame, Snapshot, Unknown };

struct FUdpDecoded
{
	EUdpPacketType Type = EUdpPacketType::Unknown;
	FSimgridSnapshot Snapshot;
	bool bOk = false;
};
```

on `FProtoCodec`:

```cpp
	static FSimgridUdpOffer DecodeUdpOffer(const TArray<uint8>& Payload);
	static TArray<uint8> EncodeUdpHello(uint32 Protocol, const uint8 (&Token)[16]);
	static TArray<uint8> EncodeUdpFrameMove(uint32 ClientTick, const FSimgridMove& Move);
	static FUdpDecoded DecodeUdpPacket(const TArray<uint8>& Datagram);
```

Wire layout (postcard, no COBS): `Hello` = varint discriminant `0x00`, varint protocol, 16 raw token bytes. `HelloAck` = single byte `0x01`. `Frame` = `0x02` + the exact bytes `RawFrameMove` already produces. `Snapshot` = `0x03` + the same snapshot body `DecodeServerEventRaw` already parses for the `Snapshot` ServerEvent variant — factor the existing snapshot-body reader into a shared private helper rather than duplicating it. `UdpOffer` payload = 16 raw token bytes + varint port (postcard `u16` is varint).

- [ ] **Step 1: Write the test** — `SimgridUdpPacketTests.cpp`, modeled on the existing tests in `Private/Tests/` (read `SimgridPostcardTests.cpp` first for the automation-test macro style used — copy the same `IMPLEMENT_SIMPLE_AUTOMATION_TEST` flags):

```cpp
#include "Misc/AutomationTest.h"
#include "SimgridProto.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSimgridUdpHelloFixtureTest,
	"KBVE.Simgrid.Udp.HelloFixture",
	EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::SmokeFilter)

bool FSimgridUdpHelloFixtureTest::RunTest(const FString& Parameters)
{
	uint8 Token[16];
	for (int32 i = 0; i < 16; ++i) { Token[i] = static_cast<uint8>(i); }
	const TArray<uint8> Bytes = FProtoCodec::EncodeUdpHello(16, Token);
	FString Hex;
	for (uint8 B : Bytes) { Hex += FString::Printf(TEXT("%02x"), B); }
	TestEqual(TEXT("hello fixture"), Hex,
		FString(TEXT("0010000102030405060708090a0b0c0d0e0f")));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSimgridUdpAckDecodeTest,
	"KBVE.Simgrid.Udp.AckDecode",
	EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::SmokeFilter)

bool FSimgridUdpAckDecodeTest::RunTest(const FString& Parameters)
{
	TArray<uint8> Ack;
	Ack.Add(0x01);
	const FUdpDecoded Decoded = FProtoCodec::DecodeUdpPacket(Ack);
	TestTrue(TEXT("ok"), Decoded.bOk);
	TestTrue(TEXT("type"), Decoded.Type == EUdpPacketType::HelloAck);
	return true;
}
```

The `HelloFixture` hex MUST equal the hex pinned by the Rust test `udp_hello_fixture_is_stable` (Task 1) — if Task 1 corrected the fixture, copy the corrected value here. Add a third test decoding a snapshot datagram: take any snapshot body hex already pinned in `SimgridServerEventTests.cpp` (read it), strip its ServerEvent discriminant, prepend `0x03`, and assert `DecodeUdpPacket` yields `EUdpPacketType::Snapshot` with the same field values that test asserts.

- [ ] **Step 2: Implement** encode/decode in `SimgridProto.cpp` following the existing writer/reader helpers. Factor the snapshot-body parse out of `DecodeServerEventRaw` into `static bool ReadSnapshotBody(FPostcardReader& Reader, FSimgridSnapshot& Out)` and call it from both paths.

- [ ] **Step 3: Compile check** — Mac editor build of the plugin module is the available proof here:

Run: `./kbve.sh -nx <the unreal build target used for KBVENet — check packages/unreal/KBVENet/project.json for the compile/test target name and use it>`. If no local UE build target exists on this Mac, state that explicitly in the task report and rely on CI plugin build (`gh workflow` list for the unreal plugin CI per `project_ue_plugin_dep_builds` memory). Do not claim compile success without one of the two.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid/
git commit -m "feat(unreal): UdpPacket codec for simgrid UDP fast lane"
```

---

### Task 8: UE UDP link + subsystem integration

**Files:**

- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridUdpLink.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridUdpLink.cpp`
- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridClientSubsystem.cpp`
- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridClientSubsystem.h`
- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/KBVESimgrid.Build.cs` (add `"Sockets"`, `"Networking"` to dependency modules)

**Interfaces:**

- Consumes: Task 7 codec, `EPHEMERAL_UDP_OFFER == 20`, existing subsystem flow (`ConnectToServer`, `HandleBinary`, `SendMove`).
- Produces: `FSimgridUdpLink` with:

```cpp
class KBVESIMGRID_API FSimgridUdpLink : public TSharedFromThis<FSimgridUdpLink>
{
public:
	bool Start(const FString& Host, uint16 Port, uint32 Protocol, const uint8 (&Token)[16]);
	void Stop();
	bool IsActive() const;
	bool SendFrame(const TArray<uint8>& FrameDatagram);
	DECLARE_DELEGATE_OneParam(FOnUdpSnapshot, const FSimgridSnapshot&);
	FOnUdpSnapshot OnSnapshot;
};
```

Behavior contract:

- `Start` resolves Host (`ISocketSubsystem::GetHostByName` or `FIPv4Address::Parse`), builds a socket via `FUdpSocketBuilder`, spawns `FUdpSocketReceiver`, and begins a Hello timer: send `EncodeUdpHello` every 250 ms until a `HelloAck` datagram arrives, giving up after 20 attempts (5 s) → stays inactive, client remains WS-only.
- After ack: `IsActive()` true; incoming `Snapshot` datagrams decode via `DecodeUdpPacket` and fire `OnSnapshot` ON THE GAME THREAD (marshal with `AsyncTask(ENamedThreads::GameThread, …)` — `FUdpSocketReceiver` callbacks arrive on its own thread).
- Watchdog: if active and no datagram received for 3 s, revert to inactive (server sim ticks at 20 Hz, so silence means the path died); subsystem falls back to WS sends. Server side independently reverts snapshots to WS after its own 10 s staleness.
- Subsystem changes: on `Ephemeral` with kind 20, decode `UdpOffer` via `DecodeUdpOffer`, extract host from the connected WS URL (strip scheme/path — parse with `FGenericPlatformHttp::GetUrlDomain` or manual split), `Start` the link. In `SendMove`: if `Link && Link->IsActive()`, wrap the existing raw frame bytes as `0x02 + RawFrameMove(...)` via `EncodeUdpFrameMove` and `SendFrame`; else existing WS path. On UDP `OnSnapshot`, feed the same snapshot-applied path `HandleBinary` uses for WS snapshots (factor that into a shared private method `ApplySnapshot(const FSimgridSnapshot&)`). `Disconnect`/`Deinitialize` call `Stop()`.

- [ ] **Step 1: Read** `SimgridClientSubsystem.cpp`, `SimgridWebSocket.h/.cpp`, and `KBVESimgrid.Build.cs` fully before writing code — mirror their delegate, logging (`LogKBVESimgrid` category if one exists), and lifetime patterns.

- [ ] **Step 2: Implement** `FSimgridUdpLink` (socket + receiver + hello timer via `FTSTicker::GetCoreTicker().AddTicker`), then subsystem wiring per the behavior contract above.

- [ ] **Step 3: Compile check** — same rule as Task 7 Step 3: local UE target if present, else CI, and say which was used.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid/
git commit -m "feat(unreal): UDP fast lane link in simgrid client subsystem"
```

---

### Task 9: Manual end-to-end vs local server + spec/plan tidy

**Files:**

- Modify: `docs/superpowers/specs/2026-07-02-simgrid-udp-fastlane-design.md` (record the Ephemeral-offer amendment if not already done)

- [ ] **Step 1: Local server smoke** — from worktree root:

Run: `ARPG_UDP_ADDR=0.0.0.0:7977 cargo run -p arpg-server 2>&1 | head -20` (or via `apps/agones/arpg/server/dev.sh` with the env var exported — read dev.sh first; it may set up jedi/agones stubs the binary expects). Expected log line: `udp fast lane enabled` with `port=7977`. Ctrl-C after confirming.

- [ ] **Step 2: Scripted client probe** — run the Task 5 integration test against the crate one more time as the final gate: `cargo test -p simgrid --test udp_flow 2>&1 | tail -3`. UE-in-editor testing against the local server is a human step — note it as follow-up for the user, do not fake it.

- [ ] **Step 3: Commit any spec amendments, push branch**

```bash
git push -u origin atom-07020646-arpg-udp-transport
```

ci-atom.yml auto-creates the PR to dev.

---

## Self-review notes

- Spec coverage: types (T1), lane (T2), connect-flow + routing + revoke (T3), server opt-in (T4), integration test (T5), ops (T6), UE codec (T7), UE link + fallback watchdog (T8), smoke + handoff (T9). Spec's "Welcome appended fields" superseded by Ephemeral offer — spec amended in T9 (or earlier).
- Types consistent: `UdpLane` methods used in T3/T4/T5 match T2 signatures; `EPHEMERAL_UDP_OFFER = 20` used in T3/T5/T8; fixture hex shared T1→T7.
- Known judgment points for implementers: exact indentation/labels in fleet.yaml + service selector (read files first, snippets are approximations); `ws_flow.rs` helper reuse in T5; UE compile verification path depends on what targets exist on this Mac.
