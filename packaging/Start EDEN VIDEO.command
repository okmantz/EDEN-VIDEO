#!/usr/bin/env bash
# macOS: right-click this file -> Open (first time only). It allows Eden to run, then starts it.
cd "$(dirname "$0")" || exit 1
xattr -dr com.apple.quarantine . 2>/dev/null
chmod +x ./eden-video 2>/dev/null
./eden-video "$@"
status=$?
if [ $status -ne 0 ]; then
  echo
  read -r -p "  Press Return to close this window. " _
fi
exit $status
