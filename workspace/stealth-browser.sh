#!/bin/bash
CACHE=/tmp/cloakbrowser-env
LOG=/tmp/cloakbrowser-wrapper.log

if [ ! -s "$CACHE" ]; then
  python3 - >"$CACHE.tmp" 2>>"$LOG" <<'PY' && mv "$CACHE.tmp" "$CACHE" || rm -f "$CACHE.tmp"
from cloakbrowser.config import get_default_stealth_args
from cloakbrowser.download import ensure_binary
print(ensure_binary())
print(",".join(get_default_stealth_args()))
PY
fi

{ read -r BINARY_PATH && read -r STEALTH_ARGS; } 2>/dev/null <"$CACHE"
if [ -x "$BINARY_PATH" ]; then
  export AGENT_BROWSER_EXECUTABLE_PATH="$BINARY_PATH"
  export AGENT_BROWSER_ARGS="$STEALTH_ARGS"
else
  rm -f "$CACHE"
  echo "[agent-browser] CloakBrowser binary resolve failed, falling back to the non-stealth browser. See $LOG" >&2
fi
exec agent-browser-real "$@"
