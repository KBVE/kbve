//! The seam between session logic and the wire.
//!
//! Exists because Steam P2P cannot run in CI: it needs a live Steam client and
//! a real appid, so any netcode written directly against `SteamNetworkingSockets`
//! is untestable by construction. Session logic talks to [`Transport`] instead,
//! and the tests drive it through [`Loopback`] in-process.
//!
//! Deliberately byte-oriented. Framing and message types stay in `crate::proto`
//! so a transport swap cannot quietly change the wire format.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

/// A participant in a session. The listen-server host is always [`PeerId::HOST`];
/// with one client hosting, "host" is a role, not a separate build.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash, PartialOrd, Ord)]
pub struct PeerId(pub u32);

impl PeerId {
    pub const HOST: Self = PeerId(0);

    pub fn is_host(self) -> bool {
        self == Self::HOST
    }
}

/// Delivery guarantee for one send.
///
/// The distinction is load-bearing, not decoration: snapshots must be
/// [`Unreliable`](Delivery::Unreliable) because a retransmitted snapshot is
/// worthless — a newer one is already in flight, and retrying old state buys
/// head-of-line blocking in exchange for data nobody wants.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Delivery {
    /// Retransmitted and ordered. Joins, spawns, inventory, chat.
    Reliable,
    /// Dropped rather than retransmitted. World snapshots.
    Unreliable,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Envelope {
    pub from: PeerId,
    pub delivery: Delivery,
    pub payload: Vec<u8>,
}

pub trait Transport {
    type Error: std::fmt::Debug;

    /// Local endpoint's own id.
    fn local_peer(&self) -> PeerId;

    fn send(&self, to: PeerId, delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error>;

    /// Sends to every connected peer except the local one.
    fn broadcast(&self, delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error>;

    /// Non-blocking. Returns `None` when nothing is queued — never parks, so a
    /// caller can drain it from a fixed-tick loop without stalling the tick.
    fn try_recv(&self) -> Option<Envelope>;

    /// Connected peers, excluding the local one.
    fn peers(&self) -> Vec<PeerId>;
}

#[derive(Debug)]
pub enum LoopbackError {
    /// Addressed a peer that is not part of this mesh.
    UnknownPeer(PeerId),
}

#[derive(Default)]
struct Router {
    inboxes: HashMap<PeerId, VecDeque<Envelope>>,
    /// When set, unreliable sends are discarded — lets a test assert the game
    /// survives snapshot loss without waiting on real packet loss.
    drop_unreliable: bool,
}

/// In-process [`Transport`] for tests and single-player.
///
/// Every endpoint shares one router, so a send is immediately visible to the
/// recipient's `try_recv`. No timing, no loss, and no ordering surprises unless
/// a test asks for them via [`Loopback::set_drop_unreliable`].
#[derive(Clone)]
pub struct Loopback {
    router: Arc<Mutex<Router>>,
    me: PeerId,
}

impl Loopback {
    /// Builds `count` mutually-connected endpoints. Index 0 is [`PeerId::HOST`].
    pub fn mesh(count: u32) -> Vec<Loopback> {
        let router = Arc::new(Mutex::new(Router::default()));
        {
            let mut r = router.lock().unwrap();
            for id in 0..count {
                r.inboxes.insert(PeerId(id), VecDeque::new());
            }
        }
        (0..count)
            .map(|id| Loopback {
                router: router.clone(),
                me: PeerId(id),
            })
            .collect()
    }

    /// Applies to the whole mesh — the router is shared.
    pub fn set_drop_unreliable(&self, drop: bool) {
        self.router.lock().unwrap().drop_unreliable = drop;
    }

    fn deliver(&self, to: PeerId, delivery: Delivery, payload: &[u8]) -> Result<(), LoopbackError> {
        let mut r = self.router.lock().unwrap();
        if r.drop_unreliable && delivery == Delivery::Unreliable {
            // Still an Ok: dropping an unreliable datagram is normal operation,
            // not a transport failure, and callers must not treat it as one.
            return Ok(());
        }
        let inbox = r
            .inboxes
            .get_mut(&to)
            .ok_or(LoopbackError::UnknownPeer(to))?;
        inbox.push_back(Envelope {
            from: self.me,
            delivery,
            payload: payload.to_vec(),
        });
        Ok(())
    }
}

impl Transport for Loopback {
    type Error = LoopbackError;

    fn local_peer(&self) -> PeerId {
        self.me
    }

    fn send(&self, to: PeerId, delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        self.deliver(to, delivery, payload)
    }

    fn broadcast(&self, delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        for peer in self.peers() {
            self.deliver(peer, delivery, payload)?;
        }
        Ok(())
    }

    fn try_recv(&self) -> Option<Envelope> {
        self.router
            .lock()
            .unwrap()
            .inboxes
            .get_mut(&self.me)?
            .pop_front()
    }

    fn peers(&self) -> Vec<PeerId> {
        let mut peers: Vec<_> = self
            .router
            .lock()
            .unwrap()
            .inboxes
            .keys()
            .copied()
            .filter(|p| *p != self.me)
            .collect();
        // HashMap order is arbitrary; broadcast order should not be.
        peers.sort_unstable();
        peers
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn drain<T: Transport>(t: &T) -> Vec<Envelope> {
        std::iter::from_fn(|| t.try_recv()).collect()
    }

    #[test]
    fn reliable_message_reaches_the_addressed_peer_only() {
        let mesh = Loopback::mesh(3);
        let (host, a, b) = (&mesh[0], &mesh[1], &mesh[2]);

        host.send(PeerId(1), Delivery::Reliable, b"hello").unwrap();

        let got = drain(a);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].from, PeerId::HOST);
        assert_eq!(got[0].payload, b"hello");
        assert!(drain(b).is_empty(), "peer 2 was not addressed");
        assert!(
            drain(host).is_empty(),
            "sender must not receive its own send"
        );
    }

    #[test]
    fn broadcast_reaches_every_peer_except_the_sender() {
        let mesh = Loopback::mesh(3);
        mesh[0].broadcast(Delivery::Unreliable, b"tick").unwrap();

        assert_eq!(drain(&mesh[1]).len(), 1);
        assert_eq!(drain(&mesh[2]).len(), 1);
        assert!(drain(&mesh[0]).is_empty());
    }

    #[test]
    fn dropping_unreliable_spares_reliable_traffic() {
        let mesh = Loopback::mesh(2);
        mesh[0].set_drop_unreliable(true);

        mesh[0]
            .send(PeerId(1), Delivery::Unreliable, b"snapshot")
            .unwrap();
        mesh[0]
            .send(PeerId(1), Delivery::Reliable, b"join")
            .unwrap();

        let got = drain(&mesh[1]);
        assert_eq!(got.len(), 1, "only the reliable message should survive");
        assert_eq!(got[0].payload, b"join");
    }

    #[test]
    fn addressing_an_unknown_peer_is_an_error() {
        let mesh = Loopback::mesh(2);
        assert!(matches!(
            mesh[0].send(PeerId(99), Delivery::Reliable, b"x"),
            Err(LoopbackError::UnknownPeer(PeerId(99)))
        ));
    }

    #[test]
    fn peers_excludes_self_and_is_ordered() {
        let mesh = Loopback::mesh(4);
        assert_eq!(mesh[2].peers(), vec![PeerId(0), PeerId(1), PeerId(3)]);
    }

    #[test]
    fn delivery_is_fifo_per_peer() {
        let mesh = Loopback::mesh(2);
        for i in 0..5u8 {
            mesh[0].send(PeerId(1), Delivery::Reliable, &[i]).unwrap();
        }
        let got: Vec<u8> = drain(&mesh[1]).iter().map(|e| e.payload[0]).collect();
        assert_eq!(got, vec![0, 1, 2, 3, 4]);
    }

    /// The seam's actual job: carry real sim state between a host and a client
    /// with no engine and no Steam client anywhere in the test.
    #[cfg(feature = "rapier3d-sim")]
    #[test]
    fn a_sim_snapshot_survives_the_round_trip() {
        use crate::proto;
        use crate::rapier::sim3d::{BodyId, BodySnapshot, Iso, SimSnapshot};

        let snapshot = SimSnapshot {
            tick: 1234,
            sim_time: 20.5,
            bodies: vec![
                BodySnapshot {
                    id: BodyId(1),
                    iso: Iso::at(1.0, 2.0, 3.0),
                    linvel: [0.5, -1.0, 0.0],
                    grounded: true,
                },
                BodySnapshot {
                    id: BodyId(7),
                    iso: Iso::at(-4.0, 0.25, 8.0),
                    linvel: [0.0; 3],
                    grounded: false,
                },
            ],
        };

        let mesh = Loopback::mesh(2);
        let encoded = proto::encode(&snapshot).expect("encode");
        mesh[0]
            .broadcast(Delivery::Unreliable, &encoded)
            .expect("broadcast");

        let mut envelope = mesh[1].try_recv().expect("client should receive it");
        let decoded: SimSnapshot = proto::decode(&mut envelope.payload).expect("decode");

        assert_eq!(envelope.from, PeerId::HOST);
        assert_eq!(decoded.tick, 1234);
        assert_eq!(decoded.bodies.len(), 2);
        // Still bisectable on the far side — sorted order must survive the wire.
        let body = decoded.body(BodyId(7)).expect("body 7");
        assert_eq!(body.iso.pos, [-4.0, 0.25, 8.0]);
        assert!(!body.grounded);
        assert!(decoded.body(BodyId(1)).unwrap().grounded);
    }
}
