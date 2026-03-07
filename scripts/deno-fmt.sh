#!/bin/sh
# Wrapper for deno fmt that gracefully skips when deno is not installed.
# Used by lint-staged so local devs without deno aren't blocked.
if command -v deno >/dev/null 2>&1; then
  exec deno fmt "$@"
fi
