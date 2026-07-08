#!/usr/bin/env python3
"""Mint a Modrinth session token via the WebAuthn assertion flow.

Reads credential material from env MODRINTH_PASSKEY (JSON) and prints the token
to stdout. Diagnostics go to stderr. Deps: cryptography, requests.
"""
import base64
import hashlib
import json
import os
import struct
import sys

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

BASE = "https://api.modrinth.com/_internal/auth"
ORIGIN = "https://modrinth.com"
UA = "kbve-ci/1.0 (+https://github.com/KBVE/kbve)"

FLAGS = b"\x05"
SIGN_COUNT = struct.pack(">I", 0)


def b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def b64url_encode(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def die(msg: str) -> "None":
    print(f"mint_modrinth_session: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    raw = os.environ.get("MODRINTH_PASSKEY")
    if not raw:
        die("MODRINTH_PASSKEY env var is not set")
    try:
        pk = json.loads(raw)
        private_key = serialization.load_pem_private_key(
            pk["private_key_pem"].encode(), password=None
        )
        credential_id = b64url_decode(pk["credential_id"])
        rp_id = pk["rp_id"]
        user_handle = b64url_decode(pk["user_handle"])
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        die(f"invalid MODRINTH_PASSKEY payload: {e}")

    sess = requests.Session()
    sess.headers["User-Agent"] = UA

    r = sess.post(f"{BASE}/passkey/start", timeout=30)
    if r.status_code != 200:
        die(f"passkey/start HTTP {r.status_code}: {r.text[:300]}")
    start = r.json()
    flow = start["flow"]
    challenge = start["options"]["publicKey"]["challenge"]

    client_data = json.dumps(
        {"type": "webauthn.get", "challenge": challenge, "origin": ORIGIN},
        separators=(",", ":"),
    ).encode()
    authenticator_data = hashlib.sha256(rp_id.encode()).digest() + FLAGS + SIGN_COUNT
    signature = private_key.sign(
        authenticator_data + hashlib.sha256(client_data).digest(),
        ec.ECDSA(hashes.SHA256()),
    )
    credential = {
        "type": "public-key",
        "id": b64url_encode(credential_id),
        "rawId": b64url_encode(credential_id),
        "response": {
            "authenticatorData": b64url_encode(authenticator_data),
            "clientDataJSON": b64url_encode(client_data),
            "signature": b64url_encode(signature),
            "userHandle": b64url_encode(user_handle),
        },
        "extensions": {},
    }

    r = sess.post(
        f"{BASE}/passkey/finish",
        json={"flow": flow, "credential": credential},
        timeout=30,
    )
    if r.status_code != 200:
        die(f"passkey/finish HTTP {r.status_code}: {r.text[:300]}")
    token = r.json().get("session")
    if not token or not token.startswith("mra_"):
        die(f"unexpected finish response: {r.text[:300]}")

    print(token)


if __name__ == "__main__":
    main()
