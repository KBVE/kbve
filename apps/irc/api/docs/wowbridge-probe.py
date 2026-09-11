#!/usr/bin/env python3
"""Raw IRC probe for the WoW<->IRC bridge in apps/irc/irc-gateway.

Speaks plain RFC1459 over a TCP socket so it needs no dependencies and no
ergo account. Point it at a `kubectl port-forward` of ergo-irc-service.

  kubectl -n irc port-forward svc/ergo-irc-service 16667:6667

  watch  -- join the channel and print every line, timestamped
  names  -- print the channel member list once, then exit
  say    -- send one PRIVMSG, then keep watching for the round trip
  burst  -- send N messages at a fixed rate, then watch for the fallout
  scroll -- replay ergo's server-side channel history (CHATHISTORY), then exit

Exit codes: 0 normal, 2 connection/registration failure, 3 killed by server.
"""

import argparse
import socket
import sys
import time

KILL_MARKERS = ("ERROR :", "Excess flood", "Killed", "excess flood")


def now():
    return time.strftime("%H:%M:%S")


def emit(line):
    print(f"[{now()}] {line}", flush=True)


class Probe:
    def __init__(self, host, port, nick, channel, timeout):
        self.channel = channel
        self.nick = nick
        self.deadline = time.time() + timeout
        self.buf = b""
        self.sock = socket.create_connection((host, port), timeout=10)
        self.sock.settimeout(1.0)
        self.killed = False

    def send(self, line):
        emit(f">> {line}")
        self.sock.sendall(line.encode("utf-8", "replace") + b"\r\n")

    def register(self, caps=False):
        if caps:
            self.send("CAP REQ :server-time draft/chathistory batch message-tags")
        self.send(f"NICK {self.nick}")
        self.send(f"USER {self.nick} 0 * :bridge probe")
        if caps:
            self.send("CAP END")
        registered = False
        while not registered and time.time() < self.deadline:
            for line in self.read():
                if " 001 " in line or " 376 " in line or " 422 " in line:
                    registered = True
        if not registered:
            emit("!! never saw RPL_WELCOME — registration failed")
            sys.exit(2)
        self.send(f"JOIN {self.channel}")

    def read(self):
        try:
            data = self.sock.recv(8192)
        except socket.timeout:
            return []
        if not data:
            emit("!! server closed the connection")
            self.killed = True
            return []
        self.buf += data
        out = []
        while b"\n" in self.buf:
            raw, self.buf = self.buf.split(b"\n", 1)
            line = raw.decode("utf-8", "replace").rstrip("\r")
            if not line:
                continue
            if line.startswith("PING "):
                self.send("PONG " + line[5:])
                continue
            if any(m in line for m in KILL_MARKERS):
                emit(f"<< {line}")
                emit("!! looks like a server-side kill/flood disconnect")
                self.killed = True
                continue
            emit(f"<< {line}")
            out.append(line)
        return out

    def pump(self):
        while time.time() < self.deadline and not self.killed:
            self.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=[
                    "watch", "names", "say", "burst", "scroll"])
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=16667)
    ap.add_argument("--nick", default="probe" + str(int(time.time()) % 10000))
    ap.add_argument("--channel", default="#general")
    ap.add_argument("--message", default="bridge probe")
    ap.add_argument("--count", type=int, default=15,
                    help="burst: messages to send")
    ap.add_argument("--rate", type=float, default=2.0,
                    help="burst: messages per second")
    ap.add_argument("--timeout", type=float, default=60.0,
                    help="seconds to stay connected")
    a = ap.parse_args()

    p = Probe(a.host, a.port, a.nick, a.channel, a.timeout)
    p.register(caps=(a.mode == "scroll"))

    if a.mode == "scroll":
        time.sleep(1)
        p.send(f"CHATHISTORY LATEST {a.channel} * {a.count}")
        end = time.time() + 10
        while time.time() < end and not p.killed:
            p.read()
    elif a.mode == "names":
        p.send(f"NAMES {a.channel}")
        end = time.time() + 8
        while time.time() < end and not p.killed:
            p.read()
    elif a.mode == "say":
        time.sleep(2)
        p.send(f"PRIVMSG {a.channel} :{a.message}")
        p.pump()
    elif a.mode == "burst":
        time.sleep(2)
        gap = 1.0 / a.rate if a.rate > 0 else 0.0
        for i in range(a.count):
            if p.killed:
                break
            p.send(f"PRIVMSG {a.channel} :{a.message} {i + 1}/{a.count}")
            end = time.time() + gap
            while time.time() < end:
                p.read()
        emit(f"-- burst done, {a.count} sent; watching for fallout")
        p.pump()
    else:
        p.pump()

    if p.killed:
        emit("RESULT: connection was terminated by the server")
        sys.exit(3)
    emit("RESULT: connection survived to timeout")


if __name__ == "__main__":
    main()
