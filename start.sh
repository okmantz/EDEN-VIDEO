#!/usr/bin/env bash
# Install (first run only) and start Eden. Works on macOS and Linux.
#   bash start.sh            normal start
#   bash start.sh --lite     skip the speech engine
#   bash start.sh --lan      let phones / other computers on your network use it
cd "$(dirname "$0")" || exit 1

for py in python3 python; do
  if command -v "$py" >/dev/null 2>&1 && "$py" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then
    exec "$py" scripts/bootstrap.py "$@"
  fi
done

echo
echo "  Eden needs Python 3.10 or newer, and it was not found."
case "$(uname -s)" in
  Darwin) echo "  Install it with:  brew install python    (or from https://www.python.org/downloads/)" ;;
  *)      echo "  Ubuntu / Debian:  sudo apt install -y python3 python3-venv python3-pip"
          echo "  Fedora:           sudo dnf install -y python3"
          echo "  Arch:             sudo pacman -S python" ;;
esac
echo
exit 1
