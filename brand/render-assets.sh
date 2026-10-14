#!/usr/bin/env bash
# Renders the brand mark into every icon the clients ship. Run after changing
# brand/assets/mark.svg or the brand color, then commit brand/assets/generated.
# Needs rsvg-convert (librsvg) and python3 with Pillow.
set -euo pipefail
cd "$(dirname "$0")"
OUT=assets/generated
rm -rf "$OUT" && mkdir -p "$OUT/browser" "$OUT/web"

COLOR=$(python3 -c "import json; print(json.load(open('brand.json'))['color'])")
PATH_D=$(sed -E 's/.* d="([^"]+)".*/\1/' assets/mark.svg)

# The mark is 26x32. Pad it into a square so icons render centered.
square() { # fill
  printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 0 32 32"><path fill="%s" fill-rule="evenodd" d="%s"/></svg>' "$1" "$PATH_D"
}
render() { # fill size out
  square "$1" | rsvg-convert -w "$2" -h "$2" -o "$3"
}

for s in 16 19 32 38 48 96 128; do
  render "$COLOR" "$s" "$OUT/browser/icon$s.png"
  render "#8A8A8A" "$s" "$OUT/browser/icon${s}_gray.png"
done
for s in 19 38; do
  render "#6F9A8F" "$s" "$OUT/browser/icon${s}_locked.png"
done
# Safari toolbar icons are template images: black on transparent.
render "#000000" 18 "$OUT/browser/icon18_safari.png"
render "#000000" 36 "$OUT/browser/icon18_safari@2x.png"
render "#00000080" 18 "$OUT/browser/icon18_safari_locked.png"
render "#00000080" 36 "$OUT/browser/icon18_safari_locked@2x.png"

render "$COLOR" 180 "$OUT/web/apple-touch-icon.png"
render "$COLOR" 16 "$OUT/web/favicon-16x16.png"
render "$COLOR" 32 "$OUT/web/favicon-32x32.png"
render "$COLOR" 192 "$OUT/web/android-chrome-192x192.png"
render "$COLOR" 512 "$OUT/web/android-chrome-512x512.png"
render "$COLOR" 150 "$OUT/web/mstile-150x150.png"
square "#000000" > "$OUT/web/safari-pinned-tab.svg"

# Wordmark: the mark plus the product name, 284x43 (568x86 at 2x, like upstream).
NAME=$(python3 -c "import json; print(json.load(open('brand.json'))['name'])")
wordmark() { # fill [class]
  local cls=""; [ -n "${2:-}" ] && cls=" class=\"$2\""
  printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 284 43"><title>%s</title><path%s fill="%s" fill-rule="evenodd" transform="translate(2 3.5) scale(1.125)" d="%s"/><text%s fill="%s" x="42" y="32" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="30" font-weight="700">%s</text></svg>' \
    "$NAME" "$cls" "$1" "$PATH_D" "$cls" "$1" "$NAME"
}
wordmark "$COLOR" > "$OUT/web/logo.svg"
wordmark "#FFFFFF" > "$OUT/web/logo-white.svg"
wordmark "$COLOR" | rsvg-convert -w 568 -h 86 -o "$OUT/web/logo-primary@2x.png"
wordmark "#1B1B1B" | rsvg-convert -w 568 -h 86 -o "$OUT/web/logo-dark@2x.png"
wordmark "#FFFFFF" | rsvg-convert -w 568 -h 86 -o "$OUT/web/logo-white@2x.png"
# For the shared logo component, colored by the app theme through CSS classes.
wordmark "currentColor" "tw-fill-marketing-logo" > "$OUT/wordmark-themed.svg"
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 32" fill="none"><path class="tw-fill-fg-nav" fill-rule="evenodd" d="%s"/></svg>' "$PATH_D" > "$OUT/mark-themed.svg"
python3 - "$OUT/web" <<'PY'
import sys
from PIL import Image
d = sys.argv[1]
Image.open(f"{d}/favicon-32x32.png").save(f"{d}/favicon.ico", sizes=[(16, 16), (32, 32)])
PY

echo "rendered $(find "$OUT" -type f | wc -l | tr -d ' ') files into $OUT"
