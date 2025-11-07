#!/usr/bin/env bash
# patcher.sh — normalize a diff and apply with patch
# Usage:
#   ./patcher.sh [-p N]              # read from clipboard (pbpaste|wl-paste|xclip|/dev/clipboard)
#   ./patcher.sh [-p N] -f file.diff # read from file
#   cat diff.patch | ./patcher.sh    # read from stdin
set -euo pipefail
P=1
INPUT_MODE=clipboard
FILE=""

# Prefer gawk if available (but POSIX awk works with this script)
if command -v gawk >/dev/null 2>&1; then
  AWK_BIN="$(command -v gawk)"
else
  AWK_BIN="$(command -v awk)"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p) P="$2"; shift 2;;
    -f|--file) INPUT_MODE=file; FILE="$2"; shift 2;;
    -h|--help)
      cat <<EOF
patcher.sh — normalize a unified diff and apply it.

Examples:
  ./patcher.sh -p 1                  # read diff from clipboard
  ./patcher.sh -f changes.patch -p1  # read from file
  cat diff.patch | ./patcher.sh -p1  # read from stdin
EOF
      exit 0;;
    *) echo "Unknown arg: $1" >&2; exit 2;;
  esac
done

src() {
  case "$INPUT_MODE" in
    file) cat "$FILE" ;;
    clipboard)
      if command -v pbpaste >/dev/null 2>&1; then pbpaste
      elif command -v wl-paste >/dev/null 2>&1; then wl-paste
      elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard -o
      elif [[ -e /dev/clipboard ]]; then cat /dev/clipboard
      else
        echo "No clipboard tool found. Pipe diff on stdin or use -f file.diff" >&2; exit 3
      fi
      ;;
    *) cat ;;
  esac
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src | "$AWK_BIN" -f "$SCRIPT_DIR/normalize-diff.awk" | patch -p"$P"