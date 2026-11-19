#!/usr/bin/env bash
set -euo pipefail

blender=${BLENDER:-blender}
root=$(cd "$(dirname "$0")/../.." && pwd)
assets="$root/src/web/components/avatar/assets"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cd "$root"
npx tsx -e "import { ITEMS } from './src/shared/avatar.ts'; console.log(JSON.stringify(ITEMS))" > "$work/items.json"
mkdir -p "$assets"
run() {
  "$blender" -b --python-exit-code 1 --python "$root/tools/avatar/build.py" -- items "$work/items.json" "$@"
}
run body female glb "$assets/female.glb"
run body male glb "$assets/male.glb" icons "$work"
cp "$work/icons.png" "$assets/icons.png"
ls -l "$assets"
