#!/usr/bin/env bash
# rustfmt over staged Rust, minus the generated tree.
#
# crates/kbve-proto/src/gen is buf output, committed so that `cargo package`
# carries it. rustfmt disagrees with prost about how to format it, so letting
# the hook near it means every `moon run protobuf:build` reverts the hook and
# every commit re-applies it -- a five-thousand-line diff that says nothing.
# The schema is the source; nobody reads this code.
set -euo pipefail

files=()
for f in "$@"; do
  case "$f" in
    crates/kbve-proto/src/gen/*) continue ;;
    */crates/kbve-proto/src/gen/*) continue ;;
  esac
  files+=("$f")
done

[ ${#files[@]} -eq 0 ] && exit 0
exec rustfmt "${files[@]}"
