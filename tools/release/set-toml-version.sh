#!/bin/sh
# Rewrite a TOML file's own `version` key, leaving dependency versions alone.
#
# Anchoring on the first `version =` line in the file is not enough. TOML lets a
# dependency table sit before [package], and an unanchored rewrite is what once
# wrote jedi's own version into its tracing-subscriber pin — which only surfaced
# when cargo next re-resolved against the registry.
#
# Writable tables: none at all (bare version.toml), [package] (Cargo), [project]
# and [tool.poetry] (Python). Anything else is left untouched.
set -eu

MODE="set"
if [ "${1:-}" = "--get" ]; then
	MODE="get"
	shift
fi

case "$MODE:$#" in
get:1 | set:2) ;;
*)
	echo "usage: ${0##*/} <file.toml> <version>" >&2
	echo "       ${0##*/} --get <file.toml>" >&2
	exit 2
	;;
esac

FILE="$1"
VERSION="${2:-}"

if [ ! -f "$FILE" ]; then
	echo "set-toml-version: no such file: $FILE" >&2
	exit 1
fi

# Reading has to use the same table rule as writing; a read that picks a
# different line than the write would reintroduce the bug from the other side.
if [ "$MODE" = "get" ]; then
	awk '
		/^[ \t]*\[/ {
			sec = $0
			sub(/^[ \t]*\[+/, "", sec)
			sub(/\].*$/, "", sec)
		}
		!done && /^[ \t]*version[ \t]*=/ && (sec == "" || sec == "package" || sec == "project" || sec == "tool.poetry") {
			line = $0
			sub(/^[^=]*=[ \t]*/, "", line)
			sub(/^["'"'"']/, "", line)
			sub(/["'"'"'].*$/, "", line)
			print line
			done = 1
		}
		END { if (!done) exit 3 }
	' "$FILE"
	exit $?
fi

# POSIX awk only — docker-test-app.yml runs on a caller-supplied runner that may
# ship busybox, where GNU sed's `0,/re/` address is silently ignored.
if awk -v v="$VERSION" '
	/^[ \t]*\[/ {
		sec = $0
		sub(/^[ \t]*\[+/, "", sec)
		sub(/\].*$/, "", sec)
	}
	!done && /^[ \t]*version[ \t]*=/ && (sec == "" || sec == "package" || sec == "project" || sec == "tool.poetry") {
		print "version = \"" v "\""
		done = 1
		next
	}
	{ print }
	END { if (!done) exit 3 }
' "$FILE" >"$FILE.tmp"; then
	mv "$FILE.tmp" "$FILE"
else
	rc=$?
	rm -f "$FILE.tmp"
	if [ "$rc" -eq 3 ]; then
		echo "set-toml-version: no package version key in $FILE — refusing to guess" >&2
	fi
	exit "$rc"
fi
