# reel — deployment notes

## VPN port forwarding stays OFF

`VPN_PORT_FORWARDING` on the gluetun container must remain `'off'`. It has been
enabled and reverted three times (#14797 → #14871, #14872 → #14883, #15075 →
#15496); each attempt cost days of "downloads keep stalling" debugging.

**Why it cannot work here:** ProtonVPN's NAT-PMP hands back a *fresh* external
port on every renewal (~45–90s) instead of honouring the held mapping. gluetun
treats the renewal as failed and restarts port forwarding, which rebuilds
iptables and flushes conntrack — killing every live BitTorrent peer. Downloads
burst inside one renewal window, then flatline with peers stuck `connecting`.
librqbit cannot hot-rebind its listen socket, so reel cannot follow the rotating
port either.

This is universal Proton behaviour, not a bad server: pinning
`SERVER_CITIES: Frankfurt` (#14872) showed identical rotation. "Observe mode"
(`REEL_BT_PORT_WATCH_RESTART: false`, #15075) does not help — the peer wipe is
gluetun's firewall rebuild, which happens whether or not reel reacts.

Restoring inbound peers requires a VPN provider that issues a **static**
forwarded port. The provider is fixed, so treat inbound as unavailable and tune
outbound only (librqbit `peer_opts`, trackers/DHT).

**Diagnosing a suspected relapse:**

```sh
kubectl -n reel logs <pod> -c gluetun | grep 'port forwarding.*starting'
```

Repeated hits every 45–90s means port forwarding is live again. Cross-check
`port_rotations` on `GET /status`.
