#!/bin/bash
#
# run_tests.sh - Start PostgreSQL, run kilobase SQL tests, output results
#
set -euo pipefail

PASS_COUNT=0
FAIL_COUNT=0
TOTAL=0
FAILED_TESTS=""

echo "============================================"
echo "[kilobase-test] Starting PostgreSQL..."
echo "============================================"

# PGDATA is initialised at image build time, so the server is started directly
# rather than through the official entrypoint. The entrypoint boots a temporary
# server and shuts it down before starting the real one, and pg_durable's worker
# takes ~10s to notice a shutdown when it cannot reach the database over TCP,
# which the temporary server does not allow. Starting once avoids that cost and
# means there is no bootstrap server to race.
postgres -D "${PGDATA:-/pgdata}" &
PG_PID=$!

echo "[kilobase-test] Waiting for PostgreSQL to be ready..."
READY=0
for i in $(seq 1 60); do
    if psql -h 127.0.0.1 -U postgres -d postgres -tAc 'SELECT 1' >/dev/null 2>&1; then
        echo "[kilobase-test] PostgreSQL is ready (${i}s)"
        READY=1
        break
    fi
    sleep 1
done
if [ "$READY" -ne 1 ]; then
    echo "[kilobase-test] FATAL: PostgreSQL did not start within 60s"
    exit 1
fi

echo ""
echo "============================================"
echo "[kilobase-test] Running SQL test suite..."
echo "============================================"
echo ""

# Run the test SQL and capture output
PSQL_RC=0
TEST_OUTPUT=$(psql -h 127.0.0.1 -U postgres -d postgres -f /tests/test_kilobase.sql 2>&1) || PSQL_RC=$?
if [ "$PSQL_RC" -ne 0 ]; then
    echo "[kilobase-test] psql exited $PSQL_RC while running the suite:"
    echo "$TEST_OUTPUT"
fi

# Parse PASS/FAIL from NOTICE messages
while IFS= read -r line; do
    if echo "$line" | grep -q "NOTICE:  PASS:"; then
        TOTAL=$((TOTAL + 1))
        PASS_COUNT=$((PASS_COUNT + 1))
        TEST_NAME=$(echo "$line" | sed 's/.*PASS: //')
        echo "  PASS: $TEST_NAME"
    elif echo "$line" | grep -q "ERROR:" && echo "$line" | grep -q "FAIL:"; then
        TOTAL=$((TOTAL + 1))
        FAIL_COUNT=$((FAIL_COUNT + 1))
        TEST_NAME=$(echo "$line" | sed 's/.*FAIL: //')
        echo "  FAIL: $TEST_NAME"
        FAILED_TESTS="$FAILED_TESTS $TEST_NAME"
    fi
done <<< "$TEST_OUTPUT"

# Stop PostgreSQL. SIGQUIT (immediate shutdown) rather than SIGTERM only to keep
# teardown quick — a fast shutdown is clean but waits on pg_durable's worker.
kill -QUIT $PG_PID 2>/dev/null || true
wait $PG_PID 2>/dev/null || true

echo ""
echo "============================================"
if [ "$FAIL_COUNT" -eq 0 ] && [ "$PASS_COUNT" -gt 0 ] && [ "$PSQL_RC" -eq 0 ]; then
    echo "[kilobase-test] ALL TESTS PASSED"
    echo "  Passed: $PASS_COUNT / $TOTAL"
    STATUS="passed"
else
    echo "[kilobase-test] TESTS FAILED"
    echo "  Passed: $PASS_COUNT / $TOTAL"
    echo "  Failed: $FAIL_COUNT"
    echo "  Failed tests:$FAILED_TESTS"
    if [ "$PSQL_RC" -ne 0 ]; then
        # ON_ERROR_STOP aborts the run, so the tests after the error never
        # report at all. Counting only PASS/FAIL notices would call that a pass.
        echo "  psql exited $PSQL_RC — suite aborted before completing"
    fi
    STATUS="failed"
fi
echo "============================================"

# Output machine-readable result line for the e2e script to parse
echo ""
echo "test result: $STATUS. $PASS_COUNT passed; $FAIL_COUNT failed; 0 ignored; 0 measured; 0 filtered out"

# A suite that parsed zero tests, or that aborted partway, is a failure rather
# than a pass. Guarding on FAIL_COUNT alone let both cases exit 0.
[ "$FAIL_COUNT" -eq 0 ] && [ "$PASS_COUNT" -gt 0 ] && [ "$PSQL_RC" -eq 0 ]
