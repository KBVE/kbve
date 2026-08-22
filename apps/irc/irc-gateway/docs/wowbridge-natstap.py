#!/usr/bin/env python3
"""Read-only NATS tap for the ToCloud9 chat subjects.

Speaks the NATS text protocol directly (CONNECT / SUB / PING-PONG) so it needs
no client library and no nats-box pod. It NEVER sends PUB — running it cannot
inject anything into the live bus.

  kubectl -n tocloud9 port-forward svc/nats 14222:4222
  ./wowbridge-natstap.py --subject 'chat.gw.>' --seconds 120

Every message is printed raw, then pretty-printed, then checked against what
apps/irc/irc-gateway/src/gateway/wowchat.rs expects to be able to decode. The
`DECODE` line is the whole point: it tells you whether the relay could have
parsed the payload it just received.
"""

import argparse
import json
import socket
import sys
import time

EVENT_CHANNEL_MESSAGE = 2

# Exact JSON keys wowchat.rs::ChannelMessagePayload requires. serde has no
# `default` on any of them, so a single missing key fails the whole decode and
# the relay drops the message with no log line.
REQUIRED = [
    "RealmID",
    "ChannelName",
    "ChannelID",
    "SenderGUID",
    "SenderName",
    "Language",
    "Message",
]
# serde `rename_all = "PascalCase"` produces these for the fields that carry no
# explicit #[serde(rename)]. Where the wire key differs, the relay cannot decode.
SERDE_PASCAL = {
    "RealmID": "RealmId",
    "ChannelName": "ChannelName",
    "ChannelID": "ChannelID",
    "SenderGUID": "SenderGUID",
    "SenderName": "SenderName",
    "Language": "Language",
    "Message": "Message",
}


def emit(s):
    print(f"[{time.strftime('%H:%M:%S')}] {s}", flush=True)


def check(payload, allowed):
    missing = [k for k in REQUIRED if k not in payload]
    if missing:
        return f"DECODE=FAIL missing={missing} -> relay drops this silently"
    mismatched = [k for k in REQUIRED if SERDE_PASCAL[k] != k]
    if mismatched:
        return (
            f"DECODE=FAIL wire key(s) {mismatched} do not match what serde "
            "derives -> relay drops this silently"
        )
    name = str(payload.get("ChannelName", ""))
    if allowed and "*" not in allowed and name.lower() not in allowed:
        return f"DECODE=OK but ChannelName={name!r} is not in WOW_CHAT_CHANNELS -> not mirrored"
    return f"DECODE=OK and ChannelName={name!r} is mirrored -> expect a PRIVMSG in IRC"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=14222)
    ap.add_argument("--subject", default="chat.gw.ALL.channel.message")
    ap.add_argument("--seconds", type=float, default=120.0)
    ap.add_argument(
        "--channels",
        default="world",
        help="comma list mirroring WOW_CHAT_CHANNELS, for the mirrored/not check",
    )
    a = ap.parse_args()
    allowed = [c.strip().lower() for c in a.channels.split(",") if c.strip()]

    sock = socket.create_connection((a.host, a.port), timeout=10)
    sock.settimeout(1.0)
    opts = json.dumps(
        {"verbose": False, "pedantic": False,
            "name": "wowbridge-natstap", "lang": "python"}
    )
    sock.sendall(f"CONNECT {opts}\r\n".encode())
    sock.sendall(f"SUB {a.subject} 1\r\n".encode())
    emit(f"subscribed to {a.subject} (read-only, no PUB will ever be sent)")

    buf = b""
    end = time.time() + a.seconds
    seen = 0
    while time.time() < end:
        try:
            data = sock.recv(65536)
        except socket.timeout:
            continue
        if not data:
            emit("!! NATS closed the connection")
            break
        buf += data
        while b"\r\n" in buf:
            head, rest = buf.split(b"\r\n", 1)
            line = head.decode("utf-8", "replace")
            if line.startswith("PING"):
                sock.sendall(b"PONG\r\n")
                buf = rest
                continue
            if line.startswith("MSG "):
                parts = line.split()
                n = int(parts[-1])
                if len(rest) < n + 2:
                    break
                body, buf = rest[:n], rest[n + 2:]
                seen += 1
                emit(f"MSG {parts[1]} bytes={n}")
                emit(f"  RAW {body.decode('utf-8', 'replace')}")
                try:
                    env = json.loads(body)
                except Exception as e:
                    emit(f"  DECODE=FAIL not JSON: {e}")
                    continue
                emit(f"  v={env.get('v')!r} t={env.get('t')!r}")
                if env.get("t") != EVENT_CHANNEL_MESSAGE:
                    emit(
                        f"  DECODE=SKIP t != {EVENT_CHANNEL_MESSAGE}, relay ignores it")
                    continue
                p = env.get("p") or {}
                emit("  " + check(p, allowed))
                continue
            if line.startswith(("-ERR", "+OK", "INFO")):
                emit(line)
            buf = rest

    emit(f"RESULT: {seen} message(s) observed on {a.subject}")
    if seen == 0:
        emit("RESULT: nothing published during the window — no player spoke, or the")
        emit("        channel is not the one being watched. This is NOT proof of a bug.")
        sys.exit(1)


if __name__ == "__main__":
    main()
