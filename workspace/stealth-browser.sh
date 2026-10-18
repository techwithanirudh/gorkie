#!/bin/bash
SESSION="$AGENT_BROWSER_SESSION"
ARGS=("$@")
for ((i = 0; i < ${#ARGS[@]}; i++)); do
  if [ "${ARGS[$i]}" = "--session" ]; then
    SESSION="${ARGS[$((i + 1))]}"
    break
  fi
done
SESSION="${SESSION:-default}"
STEALTH_CACHE="/tmp/cloakbrowser-${SESSION}"

if BINARY_PATH=$(python3 -c "from cloakbrowser.download import ensure_binary; print(ensure_binary())" 2>/tmp/cloakbrowser-wrapper.log) \
  && [ -x "$BINARY_PATH" ]; then
  if [ ! -f "$STEALTH_CACHE" ]; then
    python3 -c "from cloakbrowser.config import get_default_stealth_args; print(','.join(get_default_stealth_args()))" \
      >"$STEALTH_CACHE" 2>>/tmp/cloakbrowser-wrapper.log
  fi
  export AGENT_BROWSER_EXECUTABLE_PATH="$BINARY_PATH"
  export AGENT_BROWSER_ARGS="$(cat "$STEALTH_CACHE")"
else
  echo "[agent-browser] CloakBrowser binary resolve failed, falling back to the non-stealth browser. See /tmp/cloakbrowser-wrapper.log" >&2
fi
exec agent-browser-real "$@"
