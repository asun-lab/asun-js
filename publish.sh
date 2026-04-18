#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== @athanx/asun publish ==="

# 1. Clean
rm -rf dist

# 2. Test
echo "▸ Running tests..."
npm test

# 3. Build
echo "▸ Building..."
npm run build

# 4. Dry-run check
echo "▸ Pack dry-run:"
npm pack --dry-run

# 5. Confirm
read -rp "Publish to npm? [y/N] " ans
if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

# 6. Publish
npm login
npm publish --access public
echo "✅ Published @athanx/asun to npm"
