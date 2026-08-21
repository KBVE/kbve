# WoW <-> IRC Chat Bridge — Test Runbook

Executable validation plan for the ToCloud9 (WoW 3.3.5a) <-> ergo IRC relay in
`apps/irc/irc-gateway/src/gateway/wowchat.rs`.

Every command below is real and pasteable. Where a step was actually run against
the live cluster while writing this, the observed result is recorded verbatim;
where it could not be run, the doc says so rather than inventing output.

**Status of the live system when this was written (2026-08-21T00:3x UTC):**
the game cluster IS up, the relay IS connected, and **the outbound direction is
broken** — see [Known live defect](#known-live-defect-outbound-is-currently-dead)
before you spend time on the individual cases.

---

## 0. Environment, verified live

| Thing                   | Value                                                                        | How it was verified                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| gateway ns / deployment | `irc` / `irc-gateway-deployment`                                             | `kubectl -n irc get deploy`                                                                                |
| gateway image           | `ghcr.io/kbve/irc-gateway:0.1.31`                                            | `kubectl -n irc get deploy irc-gateway-deployment -o jsonpath='{.spec.template.spec.containers[0].image}'` |
| gateway pod IP          | `10.244.0.222`                                                               | `kubectl -n irc get pod <pod> -o jsonpath='{.status.podIP}'`                                               |
| ergo service            | `ergo-irc-service.irc.svc.cluster.local:6667` (also 6697 TLS, 8080/8067 ws)  | `kubectl -n irc get svc`                                                                                   |
| ergo version            | `ergo-2.18.0-4fabfb8ee3a79d4f`                                               | RPL_MYINFO from a live probe                                                                               |
| game ns                 | `tocloud9`                                                                   | `kubectl -n tocloud9 get pods`                                                                             |
| chatserver              | `chatserver-<hash>`, image `ghcr.io/kbve/tocloud9-services-playerbots:0.0.2` | `kubectl -n tocloud9 get deploy chatserver -o jsonpath=...`                                                |
| ToCloud9 gateway        | `tocloud9-gateway-<hash>`, containers `gateway`, `agones-bridge`             | `kubectl -n tocloud9 get pod <pod> -o jsonpath='{range .spec.containers[*]}{.name} {end}'`                 |
| NATS                    | `svc/nats` :4222, monitoring on pod port **8222** (`-m 8222`)                | `kubectl -n tocloud9 get pod <nats-pod> -o jsonpath='{.spec.containers[0].args}'`                          |

Relay env as actually deployed — **matches the documented config exactly, no drift**:

```
TOCLOUD9_NATS_URL=nats://nats.tocloud9.svc.cluster.local:4222
WOW_IRC_CHANNEL=#general
WOW_CHAT_CHANNELS=world
WOW_REALM_ID=1
ERGO_IRC_HOST=ergo-irc-service.irc.svc.cluster.local
ERGO_IRC_PORT=6667
RUST_LOG=irc_gateway=trace,tower_http=trace,axum=debug
```

Re-read it any time with:

```bash
kubectl -n irc get deploy irc-gateway-deployment \
  -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}={.value}{"\n"}{end}'
```

### Pod-name helpers

Pod names rotate. Export these first; every later command uses them.

```bash
export GW_POD=$(kubectl -n irc get pod -l app=irc-gateway -o name | head -1 | cut -d/ -f2)
# fall back if the label differs:
[ -z "$GW_POD" ] && export GW_POD=$(kubectl -n irc get pod -o name | grep irc-gateway-deployment | head -1 | cut -d/ -f2)

export T9_GW=$(kubectl -n tocloud9 get pod -o name | grep tocloud9-gateway | head -1 | cut -d/ -f2)
export T9_CHAT=$(kubectl -n tocloud9 get pod -o name | grep chatserver | head -1 | cut -d/ -f2)
export T9_NATS=$(kubectl -n tocloud9 get pod -o name | grep '/nats-' | head -1 | cut -d/ -f2)
echo "$GW_POD | $T9_GW | $T9_CHAT | $T9_NATS"
```

### Tooling

Two dependency-free helper scripts ship next to this doc. Neither needs a
debug pod, a NATS client library, or an ergo account.

- **`wowbridge-probe.py`** — raw IRC client. Modes: `names`, `watch`, `scroll`
  (server-side CHATHISTORY replay), `say`, `burst`.
- **`wowbridge-natstap.py`** — raw NATS subscriber. **Only ever sends `SUB`, never
  `PUB`**, so running it cannot inject anything onto the live bus. It decodes each
  envelope and prints a `DECODE=OK` / `DECODE=FAIL` verdict against exactly what
  `wowchat.rs` requires.

Both need only `python3` and a port-forward:

```bash
kubectl -n irc port-forward svc/ergo-irc-service 16667:6667 &
kubectl -n tocloud9 port-forward svc/nats 14222:4222 &
kubectl -n tocloud9 port-forward pod/$T9_NATS 18222:8222 &
```

If you would rather use the real `nats` CLI, a short-lived box is:

```bash
kubectl -n tocloud9 run nats-box --rm -it --restart=Never --image=natsio/nats-box:latest -- \
  nats --server nats://nats.tocloud9.svc.cluster.local:4222 sub 'chat.gw.>'
```

That creates a pod. The NATS monitoring endpoint (below) answers most questions
without creating anything.

---

## Known live defect: outbound is currently dead

This was found by dry-running case 1 against the live cluster, and it invalidates
"just try it and see" as a test strategy until it is fixed.

**Evidence chain, all observed:**

1. `chatserver` published a real `world` channel message:
    ```
    23:16:38.009 DBG Publishing channel message to NATS channelName=world gatewayID=ALL senderGUID=6 subject=chat.gw.ALL.channel.message
    ```
2. NATS delivered it to the relay. `/connz?subs=detail` shows the relay
   (cid 34, `lang: rust`, ip `10.244.0.222` = the irc-gateway pod) with
   `out_msgs: 2` on `chat.gw.ALL.channel.message` — NATS pushed 2 messages to it.
3. The relay emitted **nothing**. ergo's own channel history for `#general`
   covers that minute (it has a `discordsh-bot` line at `23:16:49Z`, 11s later)
   and contains no `wow-relay` PRIVMSG at all — only
   `wow-relay joined the channel` at `12:25:39Z`.
4. The gateway's `RUST_LOG=irc_gateway=trace` log contains exactly **one** line
   mentioning `wow` for the whole 12h pod lifetime — the startup
   `wow chat bridge connected`. Neither `wow message throttled` nor
   `wow message filtered` fired, so ratelimit and filter are ruled out.

**Root cause: field-name mismatch on `RealmID`.** ToCloud9's payload struct
(`shared/events/events-chat.go`) carries **no JSON tags**, so Go marshals the Go
field names verbatim:

```go
type ChatEventChannelMessagePayload struct {
	RealmID     uint32
	ChannelName string
	ChannelID   uint32
	SenderGUID  uint64
	SenderName  string
	Language    uint32
	Message     string
}
```

`wowchat.rs` derives `#[serde(rename_all = "PascalCase")]`, which produces
`RealmId` for `realm_id`. The author hand-corrected `ChannelID` and `SenderGUID`
with explicit `#[serde(rename = ...)]` but not `RealmID`. serde is
case-sensitive and the field has no `#[serde(default)]`, so
`serde_json::from_value::<ChannelMessagePayload>(env.payload)` fails, `.ok()?`
returns `None`, and the message is dropped with **no log line at all**.

The envelope itself is fine — `shared/events/events.go` defines
`{"v":..., "t":..., "p":...}` and `ChatEventChannelMessage == 2` (`iota + 1`
starting at `ChatEventIncomingWhisper`), both matching the Rust side.

**The direction is asymmetric.** Go's `encoding/json` matches field names
case-insensitively, so the relay's _outbound-to-game_ `RealmId` would still
decode correctly on the ToCloud9 side. Only game -> IRC is broken by this.

**Regression test to add** (in `wowchat.rs`'s existing test module, owned by
another agent right now):

```rust
#[test]
fn decodes_a_real_tocloud9_payload() {
    let raw = br#"{"v":"0.0.1","t":2,"p":{"RealmID":1,"ChannelName":"world","ChannelID":2,"SenderGUID":6,"SenderName":"Kbve","Language":0,"Message":"hi"}}"#;
    let allowed = vec!["world".to_string()];
    assert!(wow_to_irc(raw, "#general", &allowed).is_some());
}
```

Until that passes, cases 1-5 below will all "fail" for the same single reason.
Case 6 and the ergo/flood analysis are independent and still worth running.

---

## Preconditions

| Precondition                          | State right now                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ToCloud9 worldserver up               | **MET** — 2 worldserver pods `3/3 Running`, `AzerothCore rev. f3d7356ec652+ ... ready...`                                              |
| chatserver up and publishing          | **MET** — publishing on `chat.gw.ALL.channel.message`                                                                                  |
| relay connected + joined `#general`   | **MET** — `wow-relay` present in NAMES                                                                                                 |
| A player logged in and joined `world` | **NOT MET** — worldserver logs `0 players online`; chatserver logged the owner logging out at `23:34:37`                               |
| `tocloud9-db-import` job healthy      | **NOT MET** — `Init:ImagePullBackOff`. Unrelated to chat, but it means the realm data may be mid-migration; check before blaming chat. |

So: **cases 1, 2, 3, 4 and 5a require a human to log a character in and join
`/join world`.** They cannot be run unattended. Cases 5b, 6 and all the
prechecks below run right now with nobody online.

---

## Precheck P1 — is the relay actually attached? (runs with 0 players)

```bash
kubectl -n irc port-forward svc/ergo-irc-service 16667:6667 &
python3 apps/irc/irc-gateway/docs/wowbridge-probe.py names --nick bridgecheck --timeout 20
```

**PASS:** the `353` NAMES reply for `#general` lists `wow-relay`.

Observed live:

```
:irc.kbve.com 353 bridgeaudit1 = #general :palworld-bot bbs-bot wow-relay bridgeaudit1 @factorio-bot hist-general discordsh-bot
```

**FAIL:** `wow-relay` absent -> the relay task is not running or ergo rejected it.
Then check `kubectl -n irc logs $GW_POD | grep -i "wow chat"`:

- `wow chat bridge disabled` -> `WOW_CHAT_DISABLED` is set.
- `wow chat bridge dropped: <err>` on a 5s loop -> it cannot reach NATS or ergo.
- nothing at all -> `spawn()` is not being called.

## Precheck P2 — does NATS agree the relay is subscribed? (runs with 0 players)

```bash
kubectl -n tocloud9 port-forward pod/$T9_NATS 18222:8222 &
curl -s http://127.0.0.1:18222/connz?subs=detail | python3 -c '
import json,sys
for c in json.load(sys.stdin)["connections"]:
    subs=[s["subject"] for s in (c.get("subscriptions_list_detail") or [])]
    if any("chat.gw" in x for x in subs):
        print(c["cid"], c.get("name"), c["lang"], c["ip"], "in_msgs", c["in_msgs"], "out_msgs", c["out_msgs"])
'
```

**PASS:** a row with `lang == "rust"` and the irc-gateway pod IP exists, holding
`chat.gw.ALL.channel.message`.

Observed live:

```
29 gateway-1936387874 go   10.244.0.25  in_msgs 426 out_msgs 9
34 None               rust 10.244.0.222 in_msgs 0   out_msgs 2
37 chatserver         go   10.244.0.130 in_msgs 6   out_msgs 6
```

Read those counters as: **`out_msgs` = messages NATS pushed TO the relay**
(the outbound WoW->IRC direction has had traffic), **`in_msgs` = messages the
relay published** (the inbound IRC->WoW direction — **`0`, it has never fired in
production**). Treat every inbound assertion in this runbook as genuinely
unverified rather than assumed-working.

Per-subject counts:

```bash
curl -s http://127.0.0.1:18222/subsz?subs=1 | python3 -c '
import json,sys
for s in json.load(sys.stdin)["subscriptions_list"]:
    if "chat.gw" in s["subject"]: print(s)
'
```

---

## Case 1 — Outbound WoW -> IRC

**Precondition:** a character logged in, `/join world`.

### Run

Terminal A — watch the IRC side live:

```bash
kubectl -n irc port-forward svc/ergo-irc-service 16667:6667 &
python3 apps/irc/irc-gateway/docs/wowbridge-probe.py watch --nick bridgewatch --timeout 300
```

Terminal B — watch what the relay actually receives off NATS:

```bash
kubectl -n tocloud9 port-forward svc/nats 14222:4222 &
python3 apps/irc/irc-gateway/docs/wowbridge-natstap.py \
  --subject chat.gw.ALL.channel.message --channels world --seconds 300
```

Terminal C — relay logs:

```bash
kubectl -n irc logs -f $GW_POD | grep -iE "wow|throttl|filter"
```

In game: `/join world`, then say `bridge test one`.

### Assert

**PASS:** Terminal A shows a line of the shape

```
:wow-relay!~wow-relay@<host> PRIVMSG #general :<envelope containing "bridge test one" from Kbve[wow]>
```

The nick tag is produced by `wow_nick()`: ASCII-alphanumerics only, truncated to
16 chars, plus `[wow]`. `Kbve` -> `Kbve[wow]`. The PRIVMSG body is a
`bevy_chat::ChatMessage` envelope, not the bare string — grep for the message
text and for `[wow]`, not for an exact line format.

**FAIL — and how to tell the three failure classes apart.** Work down this list;
each step eliminates one class.

| Observation                                                                                                  | Diagnosis                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatserver` logs no `Publishing channel message to NATS` line                                               | The game never produced the event. Not a bridge problem: the player is not actually in the channel, or worldserver -> chatserver is broken. Check `kubectl -n tocloud9 logs $T9_CHAT \| grep "channel.joined"`.                                                                                          |
| chatserver publishes, but Terminal B (`natstap`) shows nothing                                               | Subject/interest problem. **Do not** suspect the subject string — `chat.gw.ALL.channel.message` is confirmed correct on both sides; `ALL` is a literal gateway id, not a wildcard (`apps/gateway/service/listener-chat.go`). A silent tap means the port-forward or subscription is wrong, not the code. |
| `natstap` prints the message with `DECODE=OK ... ChannelName='world' is mirrored` but nothing appears in IRC | **This is the current live state.** The relay received it and dropped it internally. Check the relay log for `wow message throttled` / `wow message filtered`; if neither, it is the deserialize failure described in [Known live defect](#known-live-defect-outbound-is-currently-dead).                |
| `natstap` prints `DECODE=OK but ChannelName=... is not in WOW_CHAT_CHANNELS`                                 | Channel not mirrored. Compare the exact `channelName=` string the chatserver logs against `WOW_CHAT_CHANNELS`. Matching is `to_ascii_lowercase()` on both sides, so casing is safe here — but a different channel entirely (`General - Eversong Woods`, `Trade`) is not.                                 |
| `natstap` prints `DECODE=FAIL`                                                                               | Payload shape mismatch — the relay cannot parse it. This is the deserialize class.                                                                                                                                                                                                                       |
| `wow-relay` missing from NAMES (Precheck P1)                                                                 | Relay not connected.                                                                                                                                                                                                                                                                                     |

### Retrospective check (no live player needed)

ergo keeps 2048 lines of server-side history per channel, so you can audit
whether the bridge _ever_ relayed anything:

```bash
python3 apps/irc/irc-gateway/docs/wowbridge-probe.py scroll --nick bridgescroll --count 100 \
  | grep -iE "wow-relay|\[wow\]"
```

Observed live: the only `wow-relay` line in 100 lines of `#general` history is
`HistServ ... :wow-relay joined the channel`. Zero relayed messages. That is the
dry-run failure recorded above.

---

## Case 2 — Inbound IRC -> WoW

**Preconditions:** a character logged in and in `world`, **and case 1 must have
succeeded at least once on this pod's lifetime.**

### The ChannelID bootstrap (current behaviour, not a bug you should chase)

`irc_to_wow` ends with:

```rust
let target = allowed.iter().find(|a| *a != "*")?;
let channel_id = known_channel_id(target)?;
```

`known_channel_id` reads a process-local `OnceLock<Mutex<HashMap>>` populated
only by `remember_channel_id()` inside `wow_to_irc` — i.e. **only by observing an
outbound message**. On a freshly-started pod the map is empty, so every inbound
IRC message returns `None` and is silently discarded. The map does not survive a
restart and is not seeded from config.

Useful detail: `remember_channel_id` runs _before_ the `mirrors()` whitelist
check, so **any** channel's traffic teaches the id — but it must be traffic for
the `world` channel specifically for `known_channel_id("world")` to resolve.

**How to tell the bootstrap gap apart from a genuine inbound failure:**

```bash
# 1. Has the pod ever seen a `world` message since it started?
kubectl -n irc logs $GW_POD | head -1        # note the pod's start timestamp
kubectl -n tocloud9 logs $T9_CHAT | grep 'channelName=world'
```

- No `channelName=world` publish since the pod started -> **bootstrap gap**, not a
  failure. Run case 1 first.
- A `world` publish happened after the pod started, and inbound still does
  nothing -> genuine failure, continue below.

A second, independent tell: NATS `in_msgs` for the relay's connection (Precheck
P2). If `in_msgs == 0` the relay never even attempted a publish, which means it
bailed at `known_channel_id` (or at the wildcard trap, case 6). If `in_msgs > 0`
the relay published and the problem is downstream in the game.

Another agent is fixing this bootstrap; until then it is expected behaviour.

### Run

```bash
python3 apps/irc/irc-gateway/docs/wowbridge-probe.py say \
  --nick bridgesay --message "hello from irc" --timeout 120
```

Watch the game side:

```bash
kubectl -n tocloud9 logs -f $T9_GW -c gateway | grep -i eventData
```

That `eventData:` print is a stray debug line in the upstream ToCloud9 gateway
(`apps/gateway/session/channels.go`). It fires for every chat event the gateway
processes, which makes it a **free confirmation that the relay's publish landed
even with no player watching**. Its format is `eventData: <Message> from <SenderName>`.

Observed live (2 lines total, both from real in-game speech, none from the relay):

```
eventData: Hmm Kbve from Kbve
eventData: Okay Kbve from Kbve
```

Note the print does **not** include `ChannelName` — see case 2b.

### Assert

**PASS:** the in-game client shows the message in `world` as `Bridgesay[irc]`.
`irc_nick()` strips anything from the first `[` onward, keeps ASCII
alphanumerics, truncates to 16, and appends `[irc]`.

**FAIL matrix:**

| Observation                                  | Diagnosis                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| relay `in_msgs == 0` in `/connz`             | Relay never published: bootstrap gap (case 2), or `WOW_CHAT_CHANNELS=*` (case 6).                |
| relay `in_msgs > 0`, no `eventData:` line    | Published but the ToCloud9 gateway did not process it — envelope/`t` mismatch, or wrong subject. |
| `eventData:` line appears, no player sees it | Channel-name matching failure (case 2b) or GUID collision (case 4).                              |
| PRIVMSG never reaches ergo at all            | Your probe is not in `#general`, or ergo dropped it.                                             |

---

## Case 2b — Injected `ChannelName` casing must match what players joined

The ToCloud9 gateway's `HandleEventChannelMessage` matches session channel
membership by **`ChannelName` string**, not by `ChannelID`. If the relay injects
`world` but the client joined a channel the server records as `World`, injection
silently no-ops while every other signal looks healthy: `in_msgs` increments, the
`eventData:` line prints, and nobody sees anything.

The relay always injects `allowed.iter().find(|a| *a != "*")` verbatim — i.e. the
value of `WOW_CHAT_CHANNELS` **after `to_ascii_lowercase()`** (see
`wow_channels()`). So the injected name is always lowercase regardless of how you
write the env var.

### Check

```bash
# what the server calls the channel players actually joined
kubectl -n tocloud9 logs $T9_CHAT | grep -iE "channelName=" | sort -u
# what the relay will inject
kubectl -n irc get deploy irc-gateway-deployment \
  -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}={.value}{"\n"}{end}' | grep WOW_CHAT_CHANNELS
```

**PASS:** the lowercased `WOW_CHAT_CHANNELS` entry appears byte-for-byte among the
chatserver's `channelName=` values.

Observed live — the chatserver names its channels
`world`, `General`, `Trade`, `Local`, `LocalDefense`, `WorldDefense`,
`LookingForGroup`, `General - Eversong Woods`, `LocalDefense - Eversong Woods`.
`world` is already lowercase, so `WOW_CHAT_CHANNELS=world` matches. **Any other
channel you add to that list (e.g. `Trade`) will be lowercased to `trade` and
will not match `Trade`** — that is a live trap waiting for the next config change.

**FAIL:** the lowercased name is absent from the chatserver list -> injection will
no-op. Do not add mixed-case channels to `WOW_CHAT_CHANNELS` until the relay stops
lowercasing the injected name.

> **Settled.** The live chatserver names the channel **`world`, lowercase** —
> verified from its own `channelName=world` lines, which sit alongside correctly
> cased `Trade`, `LocalDefense`, `LookingForGroup` and `WorldDefense`, so the
> lowercase spelling is real and not a logging artefact. `WOW_CHAT_CHANNELS`
> stays `world`. The relay no longer depends on this being right: it injects the
> spelling observed on the wire and falls back to the configured value only
> before any message has been seen.

---

## Case 3 — Round-trip echo suppression

Both correct suppression and total failure look like silence, so this case is only
meaningful once cases 1 and 2 individually pass. **Never run it as the first test.**

### The two suppression layers

`echoes()` is a `HashMap<hash(sender, message), Instant>` with a 30s TTL.
`mark_echo` records what the relay is about to emit; `take_echo` **removes** the
entry and returns `true`, so each mark suppresses exactly one echo.

Direction A (WoW -> IRC -> must not return to WoW):

1. `wow_to_irc` calls `mark_echo("Kbve[wow]", "hi")` and writes the PRIVMSG.
2. ergo reflects it back to the relay's own socket as `:wow-relay!... PRIVMSG`.
3. `irc_to_wow` bails on `sender == RELAY_NICK` — first layer, hit immediately.
4. Even if the message arrives via some other nick, `ChatMessage::from_irc_or_plain`
   recovers the envelope author `Kbve[wow]`, and `take_echo` drops it — second layer.

Direction B (IRC -> WoW -> must not return to IRC):

1. `publish()` calls `mark_echo("Bridgesay[irc]", "hello from irc")`.
2. The relay's **own NATS subscription receives its own publish** (NATS delivers
   to every subscriber including the publisher).
3. `wow_to_irc` calls `take_echo(payload.sender_name, payload.message)` with the
   same `"Bridgesay[irc]"` / `"hello from irc"` pair — note this runs on the raw
   `SenderName`, _before_ `wow_nick()` mangles it — and returns `None`.

### Run

```bash
# terminal A
python3 apps/irc/irc-gateway/docs/wowbridge-probe.py watch --nick bridgeecho --timeout 180
# terminal B
kubectl -n irc logs -f $GW_POD
# terminal C
kubectl -n tocloud9 logs -f $T9_GW -c gateway | grep -i eventData
```

Then: (A) speak in game once; (B) speak in `#general` once, via a _different_ IRC
nick than the watcher.

### Assert — distinguishing "suppressed" from "never relayed"

The discriminator is that a suppressed echo still leaves a trace on the
_forward_ leg. Read them as a pair:

| Direction      | Correctly suppressed                                                                                                                                                                                    | Never relayed at all                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A: game speech | Terminal A shows **exactly one** `wow-relay` PRIVMSG; relay `in_msgs` in `/connz` does **not** increment; terminal C shows no new `eventData:`                                                          | Terminal A shows **zero** PRIVMSGs. Forward leg failed — this is case 1, not echo suppression.                |
| B: IRC speech  | Terminal C shows **exactly one** new `eventData:` line; relay `in_msgs` increments by **1**; terminal A shows your own message once (ergo's normal fan-out) and **no** `wow-relay` PRIVMSG repeating it | relay `in_msgs` does not move and no `eventData:` appears. Forward leg failed — case 2, not echo suppression. |

**FAIL (a real loop):** `in_msgs` / `out_msgs` climb in lockstep without anyone
typing, or terminal A fills with `wow-relay` repeating the same text. Since
`take_echo` removes on match, one message can only be suppressed once — a
double-delivery from NATS would loop. Stop it with the recovery in case 5.

**Watch the 30s TTL.** `ECHO_TTL` is 30 seconds. If the round trip takes longer
than 30s (it should be milliseconds; only a stalled relay would), the mark expires
and the echo _will_ loop. A slow-loop symptom half a minute after the fact is this,
not a logic bug.

---

## Case 4 — Injected `SenderGUID: 0` is deliberate; keep it

`irc_to_wow` hardcodes `sender_guid: 0`. **This is correct and must not be
"fixed" to a real GUID.** The ToCloud9 gateway performs its own echo suppression
by skipping the session whose `character.GUID == SenderGUID`. GUID 0 matches no
logged-in character, so _every_ player — including whoever the message is about —
receives it. Injecting a real player's GUID would silently hide the message from
exactly that player.

This case is therefore a **regression check, not a robustness check**.

### Check A — the constant is still 0 (runs now, no player needed)

```bash
grep -n "sender_guid" apps/irc/irc-gateway/src/gateway/wowchat.rs
```

**PASS:** the injection path sets `sender_guid: 0`.
**FAIL:** it derives a GUID from anything — that player stops seeing bridge
messages, and it will look like a per-user bug, not a bridge bug.

### Check B — behavioural (needs two logged-in characters)

Preconditions: two characters online, both in `world`; case 2 passing.

1. Send from IRC: `python3 .../wowbridge-probe.py say --nick guidtest --message "guid zero check"`.
2. **PASS:** _both_ characters see `Guidtest[irc]: guid zero check`.
3. **FAIL:** one character does not see it -> a non-zero GUID is being injected and
   it collides with that character.

### Check C — the client renders it sanely

With GUID 0 the 3.3.5a client cannot resolve a player link for the sender.

**PASS:** the line renders as normal channel chat with the name `Name[irc]`.
Right-clicking the name doing nothing, or `/who`-ing it failing, is **expected**
and is not a failure.
**FAIL:** the client disconnects, the chat frame errors, or the message renders
with an empty/garbage sender.

Nothing downstream indexes on GUID for channel messages, so a zero GUID has no
other consumer. **Not verified live** — requires two logged-in characters, which
was not possible while writing this (0 players online).

---

## Case 5 — Flood and rate limiting

The relay is **one shared IRC connection for every player in the game**. Anything
that penalises `wow-relay` penalises the entire bridge. This case establishes
whether that is actually reachable.

### 5.0 What the code and the server config actually do (analysed, not guessed)

**Layer 1 — `ratelimit::check` (outbound only).** Keyed on the _tagged_ nick
(`Kbve[wow]`), 10s fixed window: `count > 10` -> `Throttle`, `count > 30` -> `Kick`.

> **Defect found while writing this.** `wow_to_irc` gates on
> `matches!(ratelimit::check(&nick), ratelimit::Verdict::Throttle)` — it drops only
> on `Throttle`. `Verdict::Kick` does not match, so once a single player exceeds
> **30 messages in 10 seconds the limiter inverts and lets every subsequent message
> through**. Messages 11-30 are dropped; messages 31+ are relayed. The protection
> is strongest in the middle of a flood and absent at the top of it. Assert this
> explicitly in the burst test below.

**Layer 2 — `filter::check` (outbound only).** Blocks links (`://`, `www.`,
`discord.gg`, `.gg/`, `t.me/`, `bit.ly`, `tinyurl`), a Valkey word blocklist
(live count observed: `chat word blocklist refreshed from Valkey count=5`), and a
repeat-flood rule: the **same content 3 times in 15 seconds** is blocked. A burst
of identical lines is stopped by _this_, not by the rate limiter — so a burst test
must use **unique** message bodies to exercise layer 1. `wowbridge-probe.py burst`
appends `i/N` for exactly this reason.

**Layer 3 — none, inbound.** `irc_to_wow` calls **neither** `ratelimit::check` nor
`filter::check`. An IRC-side flood is relayed 1:1 into the game with no throttle
and no content filtering. See 5b.

**What ergo will actually do to the shared connection.** From the live
`ergo-config` ConfigMap:

- There is **no `fakelag:` block**. ergo's Go config zero-value leaves fakelag
  disabled, so ergo will **not** throttle or kill `wow-relay` for message _rate_.
  This is the key finding: the feared "one spammer gets the bridge banned" does
  not happen via fakelag on this server as configured.
- `server.max-sendq: 1MB` **is** set. That is the real kill vector, and it fires on
  a slow _reader_, not a fast writer — if the relay stops draining its socket while
  a busy channel fans out, ergo drops it with `ERROR :... SendQ exceeded`.
- `connection-limits: connections-per-cidr: 12`, `cidr-len-ipv4: 32`,
  `throttle-duration: 10m`. **This is the bounded resource to actually worry
  about.** Every gateway connection comes from the single pod IP `10.244.0.222`,
  i.e. one /32. The pod already holds 4 permanent connections (`wow-relay`,
  `hist-general`, `hist-worldevents`, `hist-mcglobal`) plus one per live
  minechat/gamechat session plus one per staff `/mod/announce`. Cross 12 and ergo
  throttles the whole pod for 10 minutes — which takes the bridge **and** history
  **and** every web chat session down together.
- `accounts.nick-reservation: method: strict` with `force-nick-equals-account: true`.
  The relay registers `NICK wow-relay` unauthenticated. If anyone ever registers
  the `wow-relay` account, ergo renames the relay to `Guest-xxxx`; it will keep
  sending PRIVMSGs under the new nick and `irc_to_wow`'s `sender == RELAY_NICK`
  echo guard will stop matching — a loop. Check with `python3 .../wowbridge-probe.py
names` that the nick is still literally `wow-relay`.

### 5a — In-game burst (needs a player; bounded and recoverable)

**Bound it.** Send **20 unique** lines over 10 seconds — enough to cross the
`Throttle` boundary (10) but chosen to stop short of the `Kick` ceiling (30) on
the first pass. Then repeat with 40 to probe the inverted-Kick defect.

1. Terminal A: `python3 .../wowbridge-probe.py watch --nick floodwatch --timeout 300`
2. Terminal B: `kubectl -n irc logs -f $GW_POD | grep -iE "throttl|filter|dropped"`
3. In game, one character types 20 **distinct** short lines in `world` over ~10s
   (`flood 1` ... `flood 20`).

**Assert, pass 1 (20 messages):**

- Terminal A shows roughly the first 10, then stops.
- Terminal B shows `wow message throttled` for the remainder.
- **PASS:** `wow-relay` is still in NAMES afterwards and no `ERROR :` appeared —
  i.e. throttling protected the shared connection and ergo took no action.
- **FAIL:** terminal A shows all 20, or the relay disconnects.

**Assert, pass 2 (40 messages, probes the Kick inversion):**

- **Expected given the code:** messages ~11-30 dropped, messages ~31-40 **relayed**.
- **PASS for the fixed code:** nothing past message 10 is relayed.
- Recording which of these you observe is the point of the test.

### 5b — IRC-side burst (runs NOW, no player needed)

This exercises the completely unthrottled inbound path and the ergo connection
limits, without needing the game.

```bash
kubectl -n irc port-forward svc/ergo-irc-service 16667:6667 &
python3 apps/irc/irc-gateway/docs/wowbridge-probe.py burst \
  --nick floodtest --count 20 --rate 2 --message "irc flood" --timeout 90
```

The script exits **3** and prints `RESULT: connection was terminated by the
server` if ergo kills it, **0** otherwise. It detects `ERROR :`, `Excess flood`
and `Killed`.

**Assert:**

- **PASS:** exit 0; `wow-relay` still in NAMES (`... probe.py names`); the relay's
  `in_msgs` in `/connz` increased by ~20 **or** stayed at 0 because of the case-2
  bootstrap gap — either is consistent, and the `/connz` counter tells you which.
- **FAIL:** exit 3, **or** `wow-relay` has vanished from NAMES — collateral damage
  to the shared connection.

**Escalate carefully.** Raise `--rate` in steps (2 -> 5 -> 10 msg/s) and stop at the
first non-zero exit. Do not exceed `--count 50`. Each run opens **one** connection
from your workstation, and it exits on the timeout — but note the port-forward
makes ergo see the traffic as coming from `localhost`, which the `exempted` list
in `connection-limits` covers, so your probe will not itself trip the CIDR limit.

**Stop and recover.**

- Stop the script: `Ctrl-C`, or wait for `--timeout` (default 60s). It always
  disconnects on its own.
- Kill leftovers: `pkill -f wowbridge-probe.py`.
- Drop port-forwards: `pkill -f "port-forward"`.
- If ergo throttled the gateway pod's CIDR, it clears itself after
  `throttle-duration: 10m`. **Wait it out** — do not restart pods, and note that
  restarting the gateway would also wipe the case-2 ChannelID map.
- Confirm recovery: `python3 .../wowbridge-probe.py names` shows `wow-relay`,
  `hist-general`, `hist-worldevents`, `hist-mcglobal` back in `#general`.

---

## Case 6 — `WOW_CHAT_CHANNELS=*` disables the inbound direction

Setting the wildcard makes the bridge one-way, silently.

`wow_channels()` yields `["*"]`. `mirrors()` then returns `true` for every
channel, so outbound relays everything. But `irc_to_wow` needs a concrete channel
name to inject into:

```rust
let target = allowed.iter().find(|a| *a != "*")?;
```

With `*` as the only entry, `find` yields `None`, the `?` returns early, and every
inbound IRC message is dropped before it is even considered. Note the trap is
specifically a **pure** `*`: a mixed value like `world,*` still works, because
`find` returns the first non-`*` entry (`world`) — so this fails only in the
configuration someone would most plausibly reach for.

### Symptom

WoW -> IRC works, and works for _more_ channels than before (`Trade`, `General`,
zone channels all start appearing in `#general`). IRC -> WoW goes completely dead
with no error, no log line, and no change in relay health. Because the outbound
direction visibly improves at the same moment inbound dies, this reads as
"the bridge is working better than ever" from a casual glance at `#general`.

### Check (runs now)

```bash
kubectl -n irc get deploy irc-gateway-deployment \
  -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="WOW_CHAT_CHANNELS")].value}{"\n"}'
```

**PASS:** the value is a concrete channel list. Observed live: `world`. Inbound is
config-enabled.

**FAIL:** the value is exactly `*` (or a comma list whose every entry is `*`) ->
inbound is disabled by configuration, not broken.

Confirm behaviourally with `/connz`: the relay's `in_msgs` stays at `0` no matter
how much is typed in `#general`.

**Discriminating case 6 from case 2:** both produce `in_msgs == 0`. Case 6 is
decided purely by the env var and is fixed by changing config; case 2 is a
pod-lifetime bootstrap and is fixed by generating one outbound `world` message.
Check the env var first — it is a one-liner and rules case 6 in or out completely.

---

## Summary — what runs when

| Case                                 | Runnable now (0 players online)?                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| P1 relay attached to `#general`      | **Yes — run, PASSES**                                                                        |
| P2 NATS subscription + counters      | **Yes — run, PASSES**                                                                        |
| 1 outbound WoW -> IRC                | Needs a player. **Retrospective ergo-history check ran and FAILED** — see Known live defect. |
| 2 inbound IRC -> WoW                 | Needs a player + case 1 first                                                                |
| 2b ChannelName casing                | **Yes — config comparison ran, PASSES for `world`**                                          |
| 3 echo suppression                   | Needs cases 1 and 2 passing                                                                  |
| 4a `sender_guid: 0` constant         | **Yes — source check**                                                                       |
| 4b/4c GUID behaviour + client render | Needs two logged-in characters                                                               |
| 5a in-game burst                     | Needs a player                                                                               |
| 5b IRC-side burst                    | **Yes**                                                                                      |
| 6 wildcard config trap               | **Yes — ran, PASSES (`world`)**                                                              |
