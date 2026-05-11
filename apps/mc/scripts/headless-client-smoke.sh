#!/usr/bin/env bash
set -euo pipefail

# Boots Loom's runClient under xvfb long enough for Mixin to apply every
# client mixin. If any mixin fails (InvalidMixinException, MixinApplyError,
# "FAILED during APPLY"), exit 1. Otherwise pass — even if MC later dies on
# software-GL quirks, because the bug class we care about (mixin spec
# violations, missing targets, signature drift) trips during class load,
# well before window creation.
#
# Process management: launch the whole xvfb-run + gradle + JVM stack inside
# a fresh process group via setsid, then on exit/timeout signal the PG so
# every descendant (Xvfb, gradle daemon, forked client JVM) goes down. A
# bare `kill $PID` only kills the immediate child, leaving the JVM as an
# orphan that holds the GH Actions step alive until the 25min job ceiling.

JAVA_DIR="${JAVA_DIR:-apps/mc/behavior_statetree/java}"
TIMEOUT_SECS="${TIMEOUT_SECS:-300}"
LOG_FILE="${LOG_FILE:-/tmp/mc-headless-client.log}"
GRACE_SECS="${GRACE_SECS:-5}"

if ! command -v xvfb-run >/dev/null 2>&1; then
    echo "xvfb-run not found — install xvfb" >&2
    exit 2
fi
if ! command -v setsid >/dev/null 2>&1; then
    echo "setsid not found — install util-linux" >&2
    exit 2
fi

cd "$JAVA_DIR"
: > "$LOG_FILE"

setsid bash -c "
    exec xvfb-run --auto-servernum --server-args='-screen 0 1280x720x24' \
        ./gradlew runClient --no-daemon --console=plain \
        -Pfabric.client.gameDir=run/smoke
" >"$LOG_FILE" 2>&1 &
RUN_PID=$!

PGID=""
for _ in 1 2 3 4 5; do
    PGID=$(ps -o pgid= -p "$RUN_PID" 2>/dev/null | tr -d ' ' || true)
    [ -n "$PGID" ] && break
    sleep 0.2
done
if [ -z "$PGID" ]; then
    echo "[smoke] could not resolve PGID for $RUN_PID — falling back to single-process kill" >&2
    PGID="$RUN_PID"
fi
echo "[smoke] launched runClient pid=$RUN_PID pgid=$PGID, watching $LOG_FILE (timeout=${TIMEOUT_SECS}s)"

kill_group() {
    local sig="${1:-TERM}"
    if [ "$PGID" = "$RUN_PID" ]; then
        kill "-${sig}" "$RUN_PID" 2>/dev/null || true
    else
        kill "-${sig}" -- "-${PGID}" 2>/dev/null || true
    fi
}

shutdown_and_exit() {
    local code="$1"
    kill_group TERM
    local waited=0
    while kill -0 "$RUN_PID" 2>/dev/null && [ "$waited" -lt "$GRACE_SECS" ]; do
        sleep 1
        waited=$(( waited + 1 ))
    done
    kill_group KILL
    wait "$RUN_PID" 2>/dev/null || true
    exit "$code"
}

trap 'shutdown_and_exit 130' INT TERM

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

while kill -0 "$RUN_PID" 2>/dev/null; do
    if [ "$SECONDS" -ge "$deadline" ]; then
        echo "[smoke] timeout reached after ${TIMEOUT_SECS}s — killing process group $PGID" >&2
        break
    fi

    for m in "${FAIL_MARKERS[@]}"; do
        if grep -q -F -- "$m" "$LOG_FILE"; then
            echo "[smoke] FAIL marker detected: $m" >&2
            shutdown_and_exit 1
        fi
    done

    for m in "${SUCCESS_MARKERS[@]}"; do
        if grep -q -F -- "$m" "$LOG_FILE"; then
            echo "[smoke] SUCCESS marker detected: $m"
            shutdown_and_exit 0
        fi
    done

    sleep 2
done

for m in "${FAIL_MARKERS[@]}"; do
    if grep -q -F -- "$m" "$LOG_FILE"; then
        echo "[smoke] FAIL marker detected post-exit: $m" >&2
        shutdown_and_exit 1
    fi
done

for m in "${SUCCESS_MARKERS[@]}"; do
    if grep -q -F -- "$m" "$LOG_FILE"; then
        echo "[smoke] SUCCESS marker detected post-exit: $m"
        shutdown_and_exit 0
    fi
done

echo "[smoke] no success/fail marker found within ${TIMEOUT_SECS}s — treating as failure" >&2
echo "[smoke] last 60 lines of log:" >&2
tail -n 60 "$LOG_FILE" >&2 || true
shutdown_and_exit 1
