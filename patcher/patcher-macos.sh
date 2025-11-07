#!/usr/bin/env bash
set -euo pipefail
P="${1:-1}"
AWK_BIN="$(command -v gawk 2>/dev/null || command -v awk)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pbpaste | "$AWK_BIN" -f "$SCRIPT_DIR/normalize-diff.awk" | patch -p"$P"