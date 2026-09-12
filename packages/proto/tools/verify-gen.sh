#!/usr/bin/env bash
# Every language produced output.
#
# buf exits zero whether a plugin wrote files or not, so a plugin that ran and
# produced nothing is a silent failure: the generate task succeeds, its outputs
# are empty, and the first sign of trouble is a consumer failing to resolve an
# import. Checking the tree is the only way to catch it.
set -euo pipefail

cd "$(dirname "$0")/.."

# rust is not under gen/ with the others. Its output is committed inside
# crates/kbve-proto so that `cargo package` carries it -- a path that escapes
# the package root is not, and the published crate would fail to compile for
# everyone who installed it from the registry.
status=0
for entry in ts:gen/ts rust:../../crates/kbve-proto/src/gen csharp:gen/csharp python:gen/python; do
  lang="${entry%%:*}"
  dir="${entry#*:}"
  count=$(find "$dir" -type f 2>/dev/null | wc -l | tr -d ' ')
  printf '%-8s %s files\n' "$lang" "$count"
  if [ "$count" -eq 0 ]; then
    echo "::error::no output generated for $lang"
    status=1
  fi
done
exit $status
