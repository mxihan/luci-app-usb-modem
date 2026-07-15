#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/sys/bus/platform/drivers/xhci-mtk" \
         "$TMP/sys/class/net/eth9/device/driver" \
         "$TMP/sys/class/net/eth9" \
         "$TMP/sys/module/rndis_host" "$TMP/sys/module/usbnet"
mkdir -p "$TMP/device"
ln -s "$TMP/device" "$TMP/sys/bus/platform/drivers/xhci-mtk/11200000.usb"
rm -rf "$TMP/sys/class/net/eth9/device/driver"
mkdir -p "$TMP/sys/bus/usb/drivers/rndis_host"
ln -s "$TMP/sys/bus/usb/drivers/rndis_host" "$TMP/sys/class/net/eth9/device/driver"
echo up > "$TMP/sys/class/net/eth9/operstate"
echo 1 > "$TMP/sys/class/net/eth9/carrier"
echo '10:3c:59:eb:fa:03' > "$TMP/sys/class/net/eth9/address"
echo 1234 > "$TMP/sys/class/net/eth9/statistics_rx_bytes" 2>/dev/null || true
OUT="$(SYS_ROOT="$TMP/sys" IP_CMD="$ROOT/tests/fake-ip.sh" LOG_CMD="$ROOT/tests/fake-log.sh" "$ROOT/root/usr/bin/usbmodem-status")"
echo "$OUT" | grep -q '"bound":true'
echo "$OUT" | grep -q '"interface":"eth9"'
echo "$OUT" | grep -q '"healthy":true'
