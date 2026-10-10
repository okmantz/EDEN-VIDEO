#!/usr/bin/env bash
# macOS: double-click this file in Finder to install (first run) and start Eden.
# If macOS says it cannot be opened, right-click it, choose Open, then Open again.
cd "$(dirname "$0")" || exit 1
bash start.sh "$@"
status=$?
if [ $status -ne 0 ]; then
  echo
  read -r -p "  Press Return to close this window. " _
fi
exit $status
