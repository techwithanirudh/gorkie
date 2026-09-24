#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4111}"
WEBHOOK_PATH="/api/agents/orchestrator/channels/slack/webhook"
DEV_PID=""
TUNNEL_PID=""

cleanup() {
  trap - EXIT INT TERM
  for pid in "$TUNNEL_PID" "$DEV_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

# TODO(slopradar): review: correctness | only .env is checked, so a token exported in the shell (which env.ts accepts via process.env) is refused, and a quoted value counts its quotes toward the 32 | check `${GORKIE_API_TOKEN:-}` first and fall back to .env
if ! grep -Eq '^GORKIE_API_TOKEN=.{32,}' .env 2>/dev/null; then
  echo "!! set GORKIE_API_TOKEN (32+ chars) in .env before tunnelling: openssl rand -hex 32" >&2
  exit 1
fi

echo "==> starting mastra dev on :$PORT"
bun run dev &
DEV_PID=$!

# TODO(slopradar): review: correctness | if /health never answers within 120s the loop just ends and the script opens the tunnel to a server that is not serving | after the loop, fail when the last probe did not succeed (e.g. set a `ready` flag in the break branch and `exit 1` without it)
for _ in $(seq 1 120); do
  if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/health" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "!! mastra dev exited before it began serving" >&2
    exit 1
  fi
  sleep 1
done

echo "==> opening tunnel to :$PORT"
echo "==> Slack Request URL (events and interactivity) is the tunnel host followed by:"
echo "    $WEBHOOK_PATH"
bun node_modules/untun/dist/cli.mjs tunnel "http://127.0.0.1:$PORT" &
TUNNEL_PID=$!

wait -n "$DEV_PID" "$TUNNEL_PID"
