#!/usr/bin/env python3
"""Persistent Factorio RCON helper.

Single long-lived TCP connection. Batches multiple Lua statements into one
SERVERDATA_EXECCOMMAND packet to avoid hammering the RCON thread. Reassembles
fragmented multi-packet responses (Factorio splits >4 KB replies).

Usage
-----
    # one-shot
    python3 rcon.py '/sc rcon.print(#game.surfaces)'

    # repl
    python3 rcon.py

    # programmatic
    from rcon import RCON
    with RCON('127.0.0.1', 27015, 'localdev') as c:
        print(c.cmd('/sc rcon.print(#game.surfaces)'))

Environment
-----------
    FACTORIO_RCON_HOST   default 127.0.0.1
    FACTORIO_RCON_PORT   default 27015
    FACTORIO_RCON_PASS   default localdev
"""
from __future__ import annotations

import os
import socket
import struct
import sys
import time

SERVERDATA_AUTH = 3
SERVERDATA_EXECCOMMAND = 2
SERVERDATA_RESPONSE_VALUE = 0
SERVERDATA_AUTH_RESPONSE = 2

SENTINEL_ID = 0x7FFFFFFE
EXEC_ID = 0x7FFFFFFD


class RCONError(RuntimeError):
    pass


class RCON:
    def __init__(self, host: str, port: int, password: str, timeout: float = 30.0):
        self.host = host
        self.port = port
        self.password = password
        self.timeout = timeout
        self.sock: socket.socket | None = None

    def __enter__(self) -> "RCON":
        self.connect()
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def connect(self) -> None:
        self.sock = socket.create_connection(
            (self.host, self.port), timeout=self.timeout)
        self.sock.settimeout(self.timeout)
        self._send(1, SERVERDATA_AUTH, self.password)
        while True:
            rid, ptype, _ = self._recv()
            if ptype == SERVERDATA_AUTH_RESPONSE:
                if rid == -1:
                    raise RCONError("auth rejected")
                return

    def close(self) -> None:
        if self.sock is not None:
            try:
                self.sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self.sock.close()
            self.sock = None

    def cmd(self, command: str) -> str:
        if not self.sock:
            self.connect()
        self._send(EXEC_ID, SERVERDATA_EXECCOMMAND, command)
        self._send(SENTINEL_ID, SERVERDATA_EXECCOMMAND, "")
        parts: list[str] = []
        while True:
            rid, _, body = self._recv()
            if rid == SENTINEL_ID:
                self._recv()
                break
            parts.append(body)
        return "".join(parts)

    def batch(self, statements: list[str]) -> str:
        joined = "; ".join(s.strip().rstrip(";")
                           for s in statements if s.strip())
        return self.cmd(f"/sc {joined}")

    def _send(self, req_id: int, ptype: int, body: str) -> None:
        assert self.sock is not None
        payload = struct.pack("<ii", req_id, ptype) + \
            body.encode("utf-8") + b"\x00\x00"
        self.sock.sendall(struct.pack("<i", len(payload)) + payload)

    def _recv(self) -> tuple[int, int, str]:
        size_buf = self._recv_n(4)
        size = struct.unpack("<i", size_buf)[0]
        data = self._recv_n(size)
        req_id, ptype = struct.unpack("<ii", data[:8])
        body = data[8:-2].decode("utf-8", errors="replace")
        return req_id, ptype, body

    def _recv_n(self, n: int) -> bytes:
        assert self.sock is not None
        buf = bytearray()
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise RCONError("connection closed mid-packet")
            buf.extend(chunk)
        return bytes(buf)


def _client_from_env() -> RCON:
    return RCON(
        os.environ.get("FACTORIO_RCON_HOST", "127.0.0.1"),
        int(os.environ.get("FACTORIO_RCON_PORT", "27015")),
        os.environ.get("FACTORIO_RCON_PASS", "localdev"),
    )


def _repl(c: RCON) -> None:
    sys.stderr.write("rcon> ")
    sys.stderr.flush()
    for line in sys.stdin:
        line = line.rstrip("\n")
        if not line:
            sys.stderr.write("rcon> ")
            sys.stderr.flush()
            continue
        if line in {"quit", "exit"}:
            return
        t0 = time.monotonic()
        try:
            print(c.cmd(line), end="")
        except RCONError as e:
            print(f"[rcon error] {e}")
            c.close()
            c.connect()
        sys.stderr.write(f"  ({(time.monotonic()-t0)*1000:.0f} ms)\nrcon> ")
        sys.stderr.flush()


def main() -> int:
    with _client_from_env() as c:
        if len(sys.argv) > 1:
            print(c.cmd(" ".join(sys.argv[1:])), end="")
            return 0
        if not sys.stdin.isatty():
            print(c.cmd(sys.stdin.read()), end="")
            return 0
        _repl(c)
        return 0


if __name__ == "__main__":
    sys.exit(main())
