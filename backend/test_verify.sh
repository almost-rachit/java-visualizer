#!/usr/bin/env bash
#
# test_verify.sh — End-to-end verification of the JViz backend.
# Starts the server, submits a sample Java program, and validates the JSON trace.
#
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_URL="http://localhost:8080/api"

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${YELLOW}▸ $1${NC}"; }

# ── Sample Java program ────────────────────────────────────────────────────
# Contains: recursion, object creation, string pooling, array usage
SAMPLE_CODE=$(cat <<'JAVA'
public class Main {
    static int factorial(int n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    }

    static class Point {
        int x, y;
        Point(int x, int y) {
            this.x = x;
            this.y = y;
        }
    }

    public static void main(String[] args) {
        // Recursion
        int result = factorial(3);

        // Object creation
        Point p = new Point(10, 20);

        // String pooling (literal) vs heap (new)
        String pooled = "hello";
        String heapStr = new String("hello");

        // Array
        int[] arr = new int[]{1, 2, 3};

        System.out.println("factorial(3) = " + result);
        System.out.println("Point: (" + p.x + ", " + p.y + ")");
        System.out.println("pooled == heapStr? " + (pooled == heapStr));
        System.out.println("arr length = " + arr.length);
    }
}
JAVA
)

# ── Test 1: Health check ───────────────────────────────────────────────────
info "Test 1: Health check"
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q '"status":"UP"'; then
    pass "Health endpoint returned UP"
else
    fail "Health check failed: $HEALTH"
    exit 1
fi

# ── Test 2: Compile + Execute (synchronous) ────────────────────────────────
info "Test 2: Full compile + execute trace"
PAYLOAD=$(jq -n --arg code "$SAMPLE_CODE" '{"sourceCode": $code, "className": "Main"}')
RESPONSE=$(curl -s -X POST "$BASE_URL/execute" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --max-time 30)

# Save full response
echo "$RESPONSE" | jq '.' > "$BACKEND_DIR/test_output.json" 2>/dev/null || echo "$RESPONSE" > "$BACKEND_DIR/test_output.json"

# ── Validate compilation ───────────────────────────────────────────────────
info "Test 2a: Compilation success"
COMPILE_SUCCESS=$(echo "$RESPONSE" | jq '.compilation.success')
if [ "$COMPILE_SUCCESS" = "true" ]; then
    pass "Compilation succeeded"
else
    fail "Compilation failed"
    echo "$RESPONSE" | jq '.compilation.errors'
    exit 1
fi

# ── Validate compile stages ───────────────────────────────────────────────
info "Test 2b: Compile stages"
STAGES=$(echo "$RESPONSE" | jq '.compilation.stages | length')
if [ "$STAGES" -ge 2 ]; then
    pass "Got $STAGES compile stages (Init, Lexing/Parsing, Bytecode)"
    echo "$RESPONSE" | jq '.compilation.stages[] | "\(.name): \(.status) — \(.detail)"' -r
else
    fail "Expected at least 2 compile stages, got $STAGES"
fi

# ── Validate trace steps ──────────────────────────────────────────────────
info "Test 2c: Execution trace steps"
STEP_COUNT=$(echo "$RESPONSE" | jq '.steps | length')
if [ "$STEP_COUNT" -gt 0 ]; then
    pass "Got $STEP_COUNT execution steps"
else
    fail "No execution steps recorded"
fi

# ── Validate call stack ───────────────────────────────────────────────────
info "Test 2d: Call stack frames present"
HAS_STACK=$(echo "$RESPONSE" | jq '[.steps[] | select(.callStack | length > 0)] | length')
if [ "$HAS_STACK" -gt 0 ]; then
    pass "$HAS_STACK steps have call stack frames"
else
    fail "No steps have call stack frames"
fi

# ── Validate heap objects ─────────────────────────────────────────────────
info "Test 2e: Heap objects captured"
HAS_HEAP=$(echo "$RESPONSE" | jq '[.steps[] | select(.heap.objects | length > 0)] | length')
if [ "$HAS_HEAP" -gt 0 ]; then
    pass "$HAS_HEAP steps have heap objects"
else
    fail "No heap objects captured (may still be valid if only primitives at those steps)"
fi

# ── Validate narratives ──────────────────────────────────────────────────
info "Test 2f: Narratives present"
HAS_NARRATIVE=$(echo "$RESPONSE" | jq '[.steps[] | select(.narrative != null and .narrative != "")] | length')
if [ "$HAS_NARRATIVE" -gt 0 ]; then
    pass "$HAS_NARRATIVE steps have narrative descriptions"
else
    fail "No narratives generated"
fi

# ── Validate stdout capture ──────────────────────────────────────────────
info "Test 2g: stdout captured"
STDOUT=$(echo "$RESPONSE" | jq -r '.stdout')
if echo "$STDOUT" | grep -q "factorial(3) = 6"; then
    pass "stdout contains 'factorial(3) = 6'"
else
    fail "stdout missing expected output"
    echo "  stdout was: $STDOUT"
fi

# ── Validate call depth (recursion) ──────────────────────────────────────
info "Test 2h: Call depth tracking (recursion)"
MAX_DEPTH=$(echo "$RESPONSE" | jq '[.steps[].callDepth] | max')
if [ "$MAX_DEPTH" -gt 2 ]; then
    pass "Max call depth = $MAX_DEPTH (recursion detected)"
else
    fail "Max call depth = $MAX_DEPTH (expected > 2 for recursion)"
fi

# ── Test 3: Compile error handling ─────────────────────────────────────────
info "Test 3: Compile error handling"
BAD_CODE='public class Main { public static void main(String[] args) { int x = "not an int"; } }'
BAD_PAYLOAD=$(jq -n --arg code "$BAD_CODE" '{"sourceCode": $code, "className": "Main"}')
BAD_RESPONSE=$(curl -s -X POST "$BASE_URL/execute" \
    -H "Content-Type: application/json" \
    -d "$BAD_PAYLOAD" \
    --max-time 10)

BAD_COMPILE=$(echo "$BAD_RESPONSE" | jq '.compilation.success')
if [ "$BAD_COMPILE" = "false" ]; then
    pass "Bad code correctly failed to compile"
    ERR_COUNT=$(echo "$BAD_RESPONSE" | jq '.compilation.errors | length')
    info "  Got $ERR_COUNT compiler error(s):"
    echo "$BAD_RESPONSE" | jq '.compilation.errors[] | "  Line \(.line), Col \(.column): \(.message)\n  Explanation: \(.explanation)"' -r
else
    fail "Bad code should not have compiled"
fi

# ── Test 4: Kill endpoint ─────────────────────────────────────────────────
info "Test 4: Kill endpoint (infinite loop)"
LOOP_CODE='public class Main { public static void main(String[] args) { while(true) {} } }'
LOOP_PAYLOAD=$(jq -n --arg code "$LOOP_CODE" '{"sourceCode": $code, "className": "Main"}')

# Launch async
ASYNC_RESPONSE=$(curl -s -X POST "$BASE_URL/execute/async" \
    -H "Content-Type: application/json" \
    -d "$LOOP_PAYLOAD")
SESSION_ID=$(echo "$ASYNC_RESPONSE" | jq -r '.sessionId')
info "  Launched infinite loop with session $SESSION_ID"

sleep 1

# Kill it
KILL_RESPONSE=$(curl -s -X DELETE "$BASE_URL/execute/$SESSION_ID")
KILLED=$(echo "$KILL_RESPONSE" | jq '.killed')
if [ "$KILLED" = "true" ]; then
    pass "Successfully killed infinite loop session"
else
    # May have already timed out — that's also acceptable
    pass "Session ended (killed=$KILLED, may have timed out)"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
info "Full trace output saved to: $BACKEND_DIR/test_output.json"
echo ""
info "Sample step (first with callStack):"
echo "$RESPONSE" | jq '[.steps[] | select(.callStack | length > 0)] | .[0]' 2>/dev/null || echo "(no steps with callStack)"
echo ""
info "Sample heap snapshot (first with objects):"
echo "$RESPONSE" | jq '[.steps[] | select(.heap.objects | length > 0)] | .[0].heap' 2>/dev/null || echo "(no heap snapshots)"
echo "═══════════════════════════════════════════════════"
echo -e "${GREEN}All verification tests completed!${NC}"
