#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if SDK_DIR="$TMP/missing" "$ROOT/scripts/build-ipk.sh" >"$TMP/missing.out" 2>&1; then
	echo 'missing SDK unexpectedly succeeded' >&2
	exit 1
fi
grep -q 'OpenWrt SDK directory not found' "$TMP/missing.out"

SDK="$TMP/sdk with space"
OUT="$TMP/output with space"
mkdir -p "$SDK"
cat > "$TMP/fake-make.sh" <<'EOF'
#!/bin/sh
set -eu
test "$1" = -C
SDK="$2"
shift 2
case "$1" in
	defconfig) ;;
	package/luci-app-usb-modem/compile)
		[ "${SKIP_ARTIFACT:-0}" = 1 ] && exit 0
		mkdir -p "$SDK/bin/packages/test/base"
		printf 'fixture' > "$SDK/bin/packages/test/base/luci-app-usb-modem_1.0.0-2_all.ipk"
		;;
	*) exit 1 ;;
esac
EOF
chmod +x "$TMP/fake-make.sh"

SDK_DIR="$SDK" OUTPUT_DIR="$OUT" MAKE_CMD="$TMP/fake-make.sh" "$ROOT/scripts/build-ipk.sh"
test -f "$OUT/luci-app-usb-modem_1.0.0-2_all.ipk"
test -f "$SDK/package/luci-app-usb-modem/Makefile"

rm -rf "$OUT"
SKIP_ARTIFACT=1 SDK_DIR="$SDK" OUTPUT_DIR="$OUT" MAKE_CMD="$TMP/fake-make.sh" \
	"$ROOT/scripts/build-ipk.sh" >"$TMP/stale.out" 2>&1 && {
	echo 'build without a new artifact unexpectedly succeeded' >&2
	exit 1
}
grep -q 'No luci-app-usb-modem IPK was produced' "$TMP/stale.out"

echo 'build IPK tests passed'
