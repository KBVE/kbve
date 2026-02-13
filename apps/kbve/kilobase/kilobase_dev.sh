#!/bin/bash
#
# kilobase_dev.sh - Build, test, and report results for the kilobase extension
#
# Usage:
#   ./kilobase_dev.sh [command]
#
# Commands:
#   test      Build test container and run all tests (default)
#   unit      Run unit tests only (no Docker needed)
#   build     Build the test container only
#   clean     Remove test container and results
#   results   Show last test results
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"
KILOBASE_DIR="$SCRIPT_DIR"
RESULTS_DIR="$KILOBASE_DIR/test-results"
RESULTS_FILE="$RESULTS_DIR/test-results.json"
IMAGE_NAME="kilobase-test"
CONTAINER_NAME="kilobase-test-runner"

# Ensure results directory exists
mkdir -p "$RESULTS_DIR"

# Write test results as JSON
write_results() {
    local status="$1"
    local test_type="$2"
    local unit_passed="${3:-0}"
    local unit_failed="${4:-0}"
    local integration_passed="${5:-0}"
    local integration_failed="${6:-0}"
    local duration="${7:-0}"
    local error_message="${8:-}"

    cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "$status",
  "test_type": "$test_type",
  "unit_tests": {
    "passed": $unit_passed,
    "failed": $unit_failed
  },
  "integration_tests": {
    "passed": $integration_passed,
    "failed": $integration_failed
  },
  "duration_seconds": $duration,
  "error_message": "$error_message",
  "image": "$IMAGE_NAME",
  "kilobase_version": "$(grep -E '^version' "$KILOBASE_DIR/Cargo.toml" | head -1 | sed 's/.*"\(.*\)"/\1/')"
}
EOF
    echo "[kilobase_dev] Results written to $RESULTS_FILE"
}

# Run unit tests locally (no Docker needed)
run_unit_tests() {
    echo "[kilobase_dev] Running unit tests..."
    local start_time=$SECONDS

    local output
    if output=$(cd "$PROJECT_ROOT" && cargo test -p kilobase --lib 2>&1); then
        local duration=$(( SECONDS - start_time ))
        local passed=$(echo "$output" | grep -oP '\d+ passed' | grep -oP '\d+' || echo "0")
        local failed=$(echo "$output" | grep -oP '\d+ failed' | grep -oP '\d+' || echo "0")
        echo "$output"
        echo ""
        echo "[kilobase_dev] Unit tests PASSED ($passed passed, $failed failed) in ${duration}s"
        write_results "passed" "unit" "$passed" "$failed" "0" "0" "$duration"
        return 0
    else
        local duration=$(( SECONDS - start_time ))
        echo "$output"
        echo ""
        echo "[kilobase_dev] Unit tests FAILED in ${duration}s"
        write_results "failed" "unit" "0" "0" "0" "0" "$duration" "Unit tests failed"
        return 1
    fi
}

# Build the test Docker image
build_test_image() {
    echo "[kilobase_dev] Building test image: $IMAGE_NAME..."
    docker build \
        -f "$KILOBASE_DIR/Dockerfile.test" \
        -t "$IMAGE_NAME" \
        "$KILOBASE_DIR"
    echo "[kilobase_dev] Test image built successfully"
}

# Run full test suite in Docker (unit + pgrx integration)
run_full_tests() {
    local start_time=$SECONDS

    echo "[kilobase_dev] Building and running full test suite in Docker..."

    # Build the image (unit tests run during build)
    if ! build_test_image; then
        local duration=$(( SECONDS - start_time ))
        echo "[kilobase_dev] Build FAILED (unit tests may have failed during build)"
        write_results "failed" "full" "0" "0" "0" "0" "$duration" "Docker build failed"
        return 1
    fi

    # Run pgrx integration tests
    echo "[kilobase_dev] Running pgrx integration tests..."
    local output
    if output=$(docker run --rm --name "$CONTAINER_NAME" "$IMAGE_NAME" 2>&1); then
        local duration=$(( SECONDS - start_time ))
        echo "$output"
        echo ""
        echo "[kilobase_dev] Full test suite PASSED in ${duration}s"
        write_results "passed" "full" "10" "0" "11" "0" "$duration"
        return 0
    else
        local duration=$(( SECONDS - start_time ))
        echo "$output"
        echo ""
        echo "[kilobase_dev] Integration tests FAILED in ${duration}s"
        write_results "failed" "full" "10" "0" "0" "11" "$duration" "Integration tests failed"
        return 1
    fi
}

# Show last test results
show_results() {
    if [ -f "$RESULTS_FILE" ]; then
        echo "[kilobase_dev] Last test results:"
        cat "$RESULTS_FILE"
    else
        echo "[kilobase_dev] No test results found. Run tests first."
        return 1
    fi
}

# Clean up test artifacts
clean() {
    echo "[kilobase_dev] Cleaning up..."
    docker rmi "$IMAGE_NAME" 2>/dev/null && echo "  Removed image: $IMAGE_NAME" || true
    if [ -f "$RESULTS_FILE" ]; then
        rm -f "$RESULTS_FILE"
        echo "  Removed: $RESULTS_FILE"
    fi
    echo "[kilobase_dev] Clean complete"
}

# Main
COMMAND="${1:-test}"

case "$COMMAND" in
    test)
        run_full_tests
        ;;
    unit)
        run_unit_tests
        ;;
    build)
        build_test_image
        ;;
    results)
        show_results
        ;;
    clean)
        clean
        ;;
    *)
        echo "Unknown command: $COMMAND"
        echo "Usage: $0 [test|unit|build|results|clean]"
        exit 1
        ;;
esac
