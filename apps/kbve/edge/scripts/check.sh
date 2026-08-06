#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

bad=$(perl -ne 'print "$ARGV:$.: $_" if /^\s*(?:import|export)[^"'\''"]*from\s*["'\''](?!\.{1,2}\/|npm:|jsr:|node:|https?:\/\/)/; close ARGV if eof' $(find functions -name "*.ts" ! -name "*.d.ts") || true)
if [ -n "$bad" ]; then
  echo "Bare import specifiers found — user workers boot with importMapPath null, so these crash at runtime:"
  echo "$bad"
  exit 1
fi

stubbed=0
if [ ! -f functions/_shared/manifest.ts ]; then
  stubbed=1
  printf 'export const VERSION = "0.0.0";\nexport const FUNCTIONS: { name: string; label: string; description: string }[] = [];\n' \
    > functions/_shared/manifest.ts
fi
trap '[ "$stubbed" = 1 ] && rm -f functions/_shared/manifest.ts' EXIT

for entry in functions/*/index.ts; do
  deno check "$entry"
done
