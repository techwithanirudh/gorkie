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

token="${GORKIE_API_TOKEN:-}"
if [[ -z "$token" ]]; then
  token="$(sed -nE 's/^GORKIE_API_TOKEN=["'"'"']?([^"'"'"']*)["'"'"']?$/\1/p' .env 2>/dev/null | tail -n 1 || true)"
fi
if (( ${#token} < 32 )); then
  echo "!! set GORKIE_API_TOKEN (32+ chars) in .env or the shell before tunnelling: openssl rand -hex 32" >&2
  exit 1
fi

echo "==> starting mastra dev on :$PORT"
bun run dev &
DEV_PID=$!

ready=""
for _ in $(seq 1 120); do
  if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/health" 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "!! mastra dev exited before it began serving" >&2
    exit 1
  fi
  sleep 1
done
if [[ -z "$ready" ]]; then
  echo "!! mastra dev did not answer /health within 120s" >&2
  exit 1
fi

echo "==> opening tunnel to :$PORT"
echo "==> Slack Request URL (events and interactivity) is the tunnel host followed by:"
echo "    $WEBHOOK_PATH"
bun node_modules/untun/dist/cli.mjs tunnel "http://127.0.0.1:$PORT" &
TUNNEL_PID=$!

wait -n "$DEV_PID" "$TUNNEL_PID"
