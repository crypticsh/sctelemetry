#!/usr/bin/env bash
# macOS / Linux launcher. Pass --sim for demo data.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Install Node.js 22.13+ from https://nodejs.org"; exit 1; }
exec node scripts/launch.cjs "$@"
