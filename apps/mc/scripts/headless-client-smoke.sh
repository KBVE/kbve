#!/usr/bin/env bash
set -euo pipefail

# Boots Loom's runClient under xvfb long enough for Mixin to apply every
# client mixin. If any mixin fails (InvalidMixinException, MixinApplyError,
# "FAILED during APPLY"), exit 1. Otherwise pass — even if MC later dies on
# software-GL quirks, because the bug class we care about (mixin spec
# violations, missing targets, signature drift) trips during class load,
# well before window creation.

JAVA_DIR="${JAVA_DIR:-apps/mc/behavior_statetree/java}"
TIMEOUT_SECS="${TIMEOUT_SECS:-180}"
LOG_FILE="${LOG_FILE:-/tmp/mc-headless-client.log}"

if ! command -v xvfb-run >/dev/null 2>&1; then
    echo "xvfb-run not found — install xvfb" >&2
    exit 2
fi

cd "$JAVA_DIR"

: > "$LOG_FILE"

(
    xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" \
        ./gradlew runClient --no-daemon --console=plain \
        -Pfabric.client.gameDir=run/smoke \
        2>&1 || true
) | tee "$LOG_FILE" &
GRADLE_PID=$!

SUCCESS_MARKERS=(
    "Sound engine started"
    "Created: "
    "Stopping!"
    "Setting user:"
    "[Render thread/INFO]: OpenAL initialized"
)

FAIL_MARKERS=(
    "InvalidMixinException"
    "MixinApplyError"
    "FAILED during APPLY"
    "Mixin apply for mod"
    "MixinTransformerError"
    "contains non-private static field"
)

deadline=$(( SECONDS + TIMEOUT_SECS ))

while kill -0 "$GRADLE_PID" 2>/dev/null; do
    if [ "$SECONDS" -ge "$deadline" ]; then
        echo "[smoke] timeout reached after ${TIMEOUT_SECS}s — killing client" >&2
        break
    fi

    for m in "${FAIL_MARKERS[@]}"; do
        if grep -q -- "$m" "$LOG_FILE"; then
            echo "[smoke] FAIL marker detected: $m" >&2
            kill "$GRADLE_PID" 2>/dev/null || true
            wait "$GRADLE_PID" 2>/dev/null || true
            exit 1
        fi
    done

    for m in "${SUCCESS_MARKERS[@]}"; do
        if grep -q -- "$m" "$LOG_FILE"; then
            echo "[smoke] SUCCESS marker detected: $m"
            kill "$GRADLE_PID" 2>/dev/null || true
            wait "$GRADLE_PID" 2>/dev/null || true
            exit 0
        fi
    done

    sleep 2
done

kill "$GRADLE_PID" 2>/dev/null || true
wait "$GRADLE_PID" 2>/dev/null || true

for m in "${FAIL_MARKERS[@]}"; do
    if grep -q -- "$m" "$LOG_FILE"; then
        echo "[smoke] FAIL marker detected post-exit: $m" >&2
        exit 1
    fi
done

for m in "${SUCCESS_MARKERS[@]}"; do
    if grep -q -- "$m" "$LOG_FILE"; then
        echo "[smoke] SUCCESS marker detected post-exit: $m"
        exit 0
    fi
done

echo "[smoke] no success/fail marker found within ${TIMEOUT_SECS}s — treating as failure" >&2
echo "[smoke] last 60 lines of log:" >&2
tail -n 60 "$LOG_FILE" >&2 || true
exit 1
