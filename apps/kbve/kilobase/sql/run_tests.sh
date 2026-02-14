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

# Start PostgreSQL in the background using the official entrypoint
docker-entrypoint.sh postgres &
PG_PID=$!

# Wait for PostgreSQL to be ready
echo "[kilobase-test] Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
    if pg_isready -U postgres -d kilobase_test -q 2>/dev/null; then
        echo "[kilobase-test] PostgreSQL is ready (${i}s)"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "[kilobase-test] FATAL: PostgreSQL did not start within 30s"
        exit 1
    fi
    sleep 1
done

echo ""
echo "============================================"
echo "[kilobase-test] Running SQL test suite..."
echo "============================================"
echo ""

# Run the test SQL and capture output
TEST_OUTPUT=$(psql -U postgres -d kilobase_test -f /tests/test_kilobase.sql 2>&1) || true

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

# Stop PostgreSQL
kill $PG_PID 2>/dev/null || true
wait $PG_PID 2>/dev/null || true

echo ""
echo "============================================"
if [ "$FAIL_COUNT" -eq 0 ] && [ "$PASS_COUNT" -gt 0 ]; then
    echo "[kilobase-test] ALL TESTS PASSED"
    echo "  Passed: $PASS_COUNT / $TOTAL"
    STATUS="passed"
else
    echo "[kilobase-test] TESTS FAILED"
    echo "  Passed: $PASS_COUNT / $TOTAL"
    echo "  Failed: $FAIL_COUNT"
    echo "  Failed tests:$FAILED_TESTS"
    STATUS="failed"
fi
echo "============================================"

# Output machine-readable result line for the e2e script to parse
echo ""
echo "test result: $STATUS. $PASS_COUNT passed; $FAIL_COUNT failed; 0 ignored; 0 measured; 0 filtered out"

[ "$FAIL_COUNT" -eq 0 ]
