#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/driver"
: > "$TMP/driver/bind"; : > "$TMP/driver/unbind"; mkdir -p "$TMP/device"; ln -s "$TMP/device" "$TMP/driver/11200000.usb"
OUT="$(DRIVER_DIR="$TMP/driver" DEVICE_ID=11200000.usb SLEEP_CMD=true "$ROOT/root/usr/bin/usbmodem-restart")"
echo "$OUT" | grep -q '"ok":true'
grep -q '11200000.usb' "$TMP/driver/unbind"
grep -q '11200000.usb' "$TMP/driver/bind"
