#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PACKAGE_DIR="${PACKAGE_DIR:-$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)}"
SDK_DIR="${SDK_DIR:-}"
OUTPUT_DIR="${OUTPUT_DIR:-$PACKAGE_DIR/dist}"
MAKE_CMD="${MAKE_CMD:-make}"

if [ -z "$SDK_DIR" ] || [ ! -d "$SDK_DIR" ]; then
	echo "OpenWrt SDK directory not found: ${SDK_DIR:-<unset>}" >&2
	exit 1
fi

SDK_DIR="$(CDPATH= cd -- "$SDK_DIR" && pwd)"
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(CDPATH= cd -- "$OUTPUT_DIR" && pwd)"
STAGE="$SDK_DIR/package/luci-app-usb-modem"

case "$STAGE" in
	"$SDK_DIR"/package/luci-app-usb-modem) ;;
	*)
		echo "Refusing unsafe package staging path: $STAGE" >&2
		exit 1
		;;
esac

rm -rf -- "$STAGE"
mkdir -p "$STAGE"
cp "$PACKAGE_DIR/Makefile" "$PACKAGE_DIR/LICENSE" "$STAGE/"
cp -R "$PACKAGE_DIR/htdocs" "$PACKAGE_DIR/root" "$STAGE/"

"$MAKE_CMD" -C "$SDK_DIR" defconfig
"$MAKE_CMD" -C "$SDK_DIR" package/luci-app-usb-modem/compile V=s

FOUND=0
for search_dir in "$SDK_DIR/bin/packages" "$SDK_DIR/bin/targets"; do
	[ -d "$search_dir" ] || continue
	for artifact in $(find "$search_dir" -type f -name 'luci-app-usb-modem_*.ipk'); do
		cp "$artifact" "$OUTPUT_DIR/"
		echo "$OUTPUT_DIR/${artifact##*/}"
		FOUND=1
	done
done

if [ "$FOUND" -ne 1 ]; then
	echo 'No luci-app-usb-modem IPK was produced' >&2
	exit 1
fi
