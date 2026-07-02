use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
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
    oversize_count: AtomicU64,
}

impl UdpLane {
    /// Awaits initial writability so `try_send_to` has cached readiness before first use.
    pub async fn bind(addr: SocketAddr) -> std::io::Result<Arc<Self>> {
        let socket = UdpSocket::bind(addr).await?;
        socket.writable().await?;
        let port = socket.local_addr()?.port();
        Ok(Arc::new(Self {
            socket: Arc::new(socket),
            port,
            tokens: DashMap::new(),
            slot_tokens: DashMap::new(),
            bindings: DashMap::new(),
            addr2slot: DashMap::new(),
            oversize_count: AtomicU64::new(0),
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
            let count = self.oversize_count.fetch_add(1, Ordering::Relaxed) + 1;
            if count == 1 || count % 100 == 0 {
                tracing::warn!(
                    len = bytes.len(),
                    count,
                    "udp snapshot oversize; falling back to ws"
                );
            } else {
                tracing::debug!(
                    len = bytes.len(),
                    count,
                    "udp snapshot oversize; falling back to ws"
                );
            }
            return false;
        }
        self.socket.try_send_to(&bytes, addr).is_ok()
    }

    pub fn spawn_recv_loop(self: &Arc<Self>, input_tx: mpsc::UnboundedSender<SlotInput>) {
        let lane = self.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 2048];
            loop {
                let (n, from) = match lane.socket.recv_from(&mut buf).await {
                    Ok(v) => v,
                    Err(e) => {
                        tracing::warn!(error = %e, "udp recv_from failed; backing off");
                        tokio::time::sleep(Duration::from_millis(50)).await;
                        continue;
                    }
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
        if let Some(existing) = self.addr2slot.get(&addr).map(|e| *e.value())
            && existing != slot
        {
            self.bindings.remove(&existing);
        }
        let prev = self.bindings.insert(
            slot,
            Binding {
                addr,
                last_seen: Instant::now(),
            },
        );
        let rebound = match &prev {
            Some(p) => p.addr != addr,
            None => true,
        };
        if let Some(p) = prev
            && p.addr != addr
        {
            self.addr2slot.remove(&p.addr);
        }
        self.addr2slot.insert(addr, slot);
        if rebound {
            tracing::info!(slot = slot.0, %addr, "udp lane bound");
        }
    }

    fn touch(&self, slot: proto::PlayerSlot) {
        if let Some(mut b) = self.bindings.get_mut(&slot) {
            b.last_seen = Instant::now();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto;

    #[tokio::test]
    async fn token_binds_addr_and_acks() {
        let lane = UdpLane::bind("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        lane.spawn_recv_loop(tx_sender(&tx));

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
        let n = tokio::time::timeout(std::time::Duration::from_secs(1), client.recv(&mut buf))
            .await
            .expect("ack timeout")
            .unwrap();
        assert!(matches!(
            proto::decode_inner::<proto::UdpPacket>(&buf[..n]).unwrap(),
            proto::UdpPacket::HelloAck
        ));
        assert_eq!(lane.bound_addr(slot).unwrap(), client.local_addr().unwrap());

        let frame = proto::encode_inner(&proto::UdpPacket::Frame(proto::ClientFrame {
            client_tick: 1,
            inputs: vec![proto::Input::Move {
                seq: 1,
                mx: 1,
                my: 0,
                run: false,
                tick: 1,
            }],
        }))
        .unwrap();
        client.send_to(&frame, &server_addr).await.unwrap();
        let (got_slot, input) = tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
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
        lane.spawn_recv_loop(tx_sender(&tx));
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
        lane.spawn_recv_loop(tx_sender(&tx));
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
    async fn same_addr_rebound_to_new_slot_evicts_old_slot() {
        let lane = UdpLane::bind("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        lane.spawn_recv_loop(tx_sender(&tx));
        let server_addr = format!("127.0.0.1:{}", lane.port());

        let slot_a = proto::PlayerSlot(1);
        let slot_b = proto::PlayerSlot(2);
        let token_a = lane.issue_token(slot_a);

        let x = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let hello_a = proto::encode_inner(&proto::UdpPacket::Hello {
            protocol: proto::PROTOCOL_VERSION,
            token: token_a,
        })
        .unwrap();
        x.send_to(&hello_a, &server_addr).await.unwrap();
        let mut buf = [0u8; 8];
        x.recv(&mut buf).await.unwrap();
        assert_eq!(lane.bound_addr(slot_a).unwrap(), x.local_addr().unwrap());

        let token_b = lane.issue_token(slot_b);
        let hello_b = proto::encode_inner(&proto::UdpPacket::Hello {
            protocol: proto::PROTOCOL_VERSION,
            token: token_b,
        })
        .unwrap();
        x.send_to(&hello_b, &server_addr).await.unwrap();
        x.recv(&mut buf).await.unwrap();

        assert!(lane.bound_addr(slot_a).is_none());
        assert_eq!(lane.bound_addr(slot_b).unwrap(), x.local_addr().unwrap());
    }

    #[tokio::test]
    async fn oversize_snapshot_reports_false() {
        let lane = UdpLane::bind("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let peer = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let peer_addr = peer.local_addr().unwrap();

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
        assert!(!lane.try_send_snapshot(peer_addr, &big));

        let small = proto::Snapshot {
            tick: 1,
            server_time_ms: 0,
            input_ack: 0,
            players: Vec::new(),
            entities: Vec::new(),
            keyframe: false,
        };
        assert!(lane.try_send_snapshot(peer_addr, &small));

        let mut buf = [0u8; 2048];
        let n = tokio::time::timeout(std::time::Duration::from_secs(1), peer.recv(&mut buf))
            .await
            .expect("snapshot timeout")
            .unwrap();
        assert!(matches!(
            proto::decode_inner::<proto::UdpPacket>(&buf[..n]).unwrap(),
            proto::UdpPacket::Snapshot(s) if s.tick == 1 && s.entities.is_empty()
        ));
    }

    fn tx_sender(
        tx: &tokio::sync::mpsc::UnboundedSender<crate::net::SlotInput>,
    ) -> tokio::sync::mpsc::UnboundedSender<crate::net::SlotInput> {
        tx.clone()
    }
}
