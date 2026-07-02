# Simgrid UDP Fast Lane for Unreal — Design

Date: 2026-07-02
Status: Approved (WS stays first-class; UDP is Unreal-only accelerator)

## Goal

Add an optional UDP data plane to the simgrid/arpg server for the Unreal client
(`packages/unreal/KBVENet/Source/KBVESimgrid`), bypassing WebSocket head-of-line
blocking for latency-sensitive traffic. WebSocket remains the canonical,
first-class transport for web, Discord Activity, and any client that never opens
UDP. A client that cannot reach UDP plays identically over WS, just with higher
latency.

## Principles

- WS = control plane and canonical transport. Untouched semantics for existing
  clients.
- UDP = optional accelerator carrying only loss-tolerant traffic:
  `ClientFrame` movement inputs up, `Snapshot` down.
- No sim changes. The Bevy sim keeps talking only channels
  (`mpsc<SlotInput>` in, `mpsc<ServerEvent>` out); UDP is a sibling transport
  module next to `net.rs`.
- Reliable one-shot inputs (trade, shop, spells, blackjack, fell, inventory)
  stay on WS. Ephemeral events, Reject, kick stay on WS.

## Architecture

### Server: `packages/rust/simgrid/src/net_udp.rs`

One tokio `UdpSocket` bound to `ARPG_UDP_ADDR` (default `0.0.0.0:7977`).
Feature-gated or config-gated so cryptothrone and other simgrid hosts can leave
it off.

Session flow:

1. Client joins over WS exactly as today (JoinMatch → JWT verify → Welcome).
2. `Welcome` gains appended fields (postcard append rule keeps old decoders
   working): `udp_token: Option<[u8; 16]>`, `udp_port: u16`. Token is random
   per-session, bound to the slot, generated at admit time when UDP is enabled.
3. Client sends `UdpPacket::Hello { protocol, token }` datagrams (~4 Hz) until
   it receives `HelloAck`. Server validates the token, maps
   `SocketAddr → slot`, replies `HelloAck`.
4. After ack:
    - Up (UDP): `UdpPacket::Frame(ClientFrame)` — movement inputs only.
    - Down (UDP): `UdpPacket::Snapshot(Snapshot)`. The WS event router stops
      sending snapshots to that slot (per-conn flag); everything else still WS.
5. Address migration: a valid-token Hello from a new address re-binds the slot
   (NAT rebind).
6. Liveness: no UDP traffic from a bound client for 10 s → unbind, revert the
   slot to WS snapshots. Client watchdog mirrors this (no UDP snapshots →
   consume WS snapshots again, may re-Hello).

### Wire format

- Plain postcard per datagram — no COBS (COBS exists only for the TCP byte
  stream). Model on the existing `encode_inner`/`decode_inner`.
- New envelope enum:

    ```rust
    pub enum UdpPacket {
        Hello { protocol: u32, token: [u8; 16] },
        HelloAck,
        Frame(ClientFrame),
        Snapshot(Snapshot),
    }
    ```

- MTU: hard cap 1200 bytes per datagram. If a client's AOI snapshot encodes
  larger, that tick's snapshot is delivered over WS for that client instead
  (no fragmentation layer in v1). Counter/log so oversize frequency is visible.

### Protocol version

`PROTOCOL_VERSION` 16 → 17. Welcome fields are appended; verify against the
cross-language decoder fixtures (`proto.rs` fixture tests) that the TS web
client tolerates the appended fields, since web ships from the same protocol
constant.

### Unreal client: `KBVESimgrid`

- New `FSimgridUdpSocket` using `FUdpSocketBuilder` + `FUdpSocketReceiver`.
- Reuses the existing hand-written postcard codec (`SimgridPostcard.*`,
  `SimgridProto.*`); adds `UdpPacket` encode/decode. No COBS on this path.
- Subsystem flow: on Welcome carrying `udp_token`, start the Hello loop; on
  HelloAck, route `ClientFrame` out via UDP and consume snapshots from UDP;
  watchdog reverts to WS on silence. WS connection stays open the whole time.

## Ops

No hostPort. Mirror the existing single-stable-endpoint pattern:

- `fleet.yaml`: add `containerPort: 7977, protocol: UDP, portPolicy: None`,
  env `ARPG_UDP_ADDR=0.0.0.0:7977`.
- New/extended k8s Service exposing 7977/UDP (Cilium L4 — LoadBalancer or
  NodePort; the Gateway API HTTPRoute cannot carry UDP),
  `sessionAffinity: ClientIP`, same model as the existing `arpg-game` service.
- PodSecurity baseline stays intact.

Ops details (exact Service type, LB IP, DNS name for the Unreal client) are
deferred to rollout; server/client code takes host+port config.

## Security

- No credentials ever cross UDP. The only secret is the random 128-bit session
  token delivered inside the WSS-protected Welcome. Token knowledge grants:
  submitting movement inputs for that slot and receiving that slot's AOI
  snapshots.
- v1 datagrams are plaintext: position/velocity state and movement inputs are
  visible to on-path observers. JWTs and all economy/one-shot commands remain
  on WSS/TLS.
- Socket hardening: drop any non-Hello datagram from an unbound address;
  rate-limit Hello processing per source address; HelloAck is small (no
  amplification value).
- Upgrade path if plaintext becomes unacceptable: per-datagram AEAD keyed from
  Welcome, or migrate the lane to QUIC. Deferred deliberately — UE has no
  first-party AEAD and the exposed data is transient position state.

## Testing

- Rust unit: token bind/rebind/expiry, unbind-on-silence, MTU fallback path,
  `UdpPacket` roundtrip, unknown-address drop.
- Rust integration: tokio test client performs WS JoinMatch + UDP Hello,
  asserts snapshots arrive via UDP and cease on WS, then asserts WS fallback
  after simulated UDP silence.
- Cross-language postcard fixtures for `UdpPacket` (same pattern as existing
  proto fixtures) so the UE codec is pinned.
- UE: codec unit coverage where the existing harness allows; manual end-to-end
  against local server via `apps/agones/arpg/server/dev.sh`.

## Out of scope (future improvements)

- Datagram encryption / QUIC / WebTransport.
- Snapshot fragmentation for >1200 B AOI payloads.
- Delta-compressed snapshots.
- Browser UDP-ish path (WebTransport) for the web client.
