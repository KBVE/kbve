#!/usr/bin/env bash
set -euo pipefail

# Wrapper entrypoint: lets players mount/dismount Immersive Aircraft inside
# Open Parties and Claims (OPAC) land claims, then hands off to itzg's /start.
#
# WHY: OPAC treats mounting an entity as an "interaction" and blocks it for
# non-owners inside a claim. Vanilla boats are exempt because OPAC ships them
# in friendlyChunkProtectedEntityList (default type ALL_BUT = "protect all
# entities EXCEPT those listed"). IA aircraft aren't in that list, so an
# airship parked on a claim can't be re-mounted — the reported reclaim bug.
# Fix: add immersive_aircraft:* to the same list, mirroring the boat exemption.
#
# WHERE: OPAC writes this per-world at <level>/serverconfig/, but the exact
# path varies by loader/version (sometimes /data/config). We discover the file
# wherever OPAC generated it rather than hardcode a path. On an existing world
# the file is already present, so the entry lands on the next restart. On a
# brand-new world the file doesn't exist yet — we seed a minimal stub OPAC
# merges its defaults into; if the guessed path is wrong it self-heals on the
# second boot once discovery finds OPAC's real file. Edits happen here, before
# /start, so OPAC never re-reads a stale value mid-session.

ENTRY='immersive_aircraft:*'
KEY='friendlyChunkProtectedEntityList'

ensure_entry() {
	local f="$1"
	if grep -q 'immersive_aircraft' "$f" 2>/dev/null; then
		echo "[opac-airship] $f already grants IA claim access — skipping"
		return
	fi
	if ! grep -qE "^[[:space:]]*${KEY}[[:space:]]*=" "$f" 2>/dev/null; then
		echo "[opac-airship] $f has no ${KEY} key yet — OPAC will regenerate it, retry next boot"
		return
	fi
	sed -i -E "s/(^[[:space:]]*${KEY}[[:space:]]*=[[:space:]]*\[)/\1\"${ENTRY}\", /" "$f"
	echo "[opac-airship] added ${ENTRY} to ${KEY} in $f"
}

found=0
while IFS= read -r f; do
	found=1
	ensure_entry "$f"
done < <(find /data -name 'openpartiesandclaims-server.toml' 2>/dev/null)

if [ "$found" -eq 0 ]; then
	stub="/data/${LEVEL:-world}/serverconfig/openpartiesandclaims-server.toml"
	echo "[opac-airship] no OPAC serverconfig found — seeding stub at $stub"
	mkdir -p "$(dirname "$stub")"
	# This entrypoint runs as root before itzg drops to its runtime user, so
	# the <level>/ dirs mkdir just created are root-owned. Left that way the
	# server (uid 1000) can't write <level>/session.lock and dies with
	# AccessDeniedException. Re-own what we created to match /data's owner.
	chown -R --reference=/data "/data/${LEVEL:-world}" 2>/dev/null || true
	cat > "$stub" <<EOF
[serverConfig]

	[serverConfig.claims]

		[serverConfig.claims.protection]
			${KEY}Type = "ALL_BUT"
			${KEY} = ["minecraft:boat", "${ENTRY}"]
EOF
fi

exec /start "$@"
