# luci-app-usb-modem

A lightweight LuCI page for monitoring USB network modems and recovering a stuck USB host controller. The initial target is Cudy TR3000 + ZTE F50 on ImmortalWrt 24.10.

The package uses the JavaScript LuCI view stack and `rpcd-mod-file`. It is built
and tested against representative OpenWrt 23.05/24.10 and ImmortalWrt 24.10 SDKs.
Newer snapshots are expected to work but are best effort because their SDK and
package indexes change continuously.

## Features

- Shows whether `xhci-mtk` is bound to `11200000.usb`.
- Automatically detects network interfaces driven by RNDIS, CDC Ethernet/NCM/MBIM, QMI or usbnet; falls back to `eth2`.
- Displays interface state, carrier, IPv4 address and MAC address.
- Shows relevant driver modules and filtered USB/xHCI logs.
- Detects common fatal xHCI messages such as `HC died`.
- Provides a confirmed one-click controller restart using a fixed helper command.
- Refreshes status every five seconds.

## Installation without building an IPK

Copy the package files to the router while preserving paths:

```sh
scp -r htdocs/* root@ROUTER:/www/
scp -r root/* root@ROUTER:/
ssh root@ROUTER 'chmod 755 /usr/bin/usbmodem-status /usr/bin/usbmodem-restart; /etc/init.d/rpcd restart; /etc/init.d/uhttpd restart'
```

Then open **Status → USB Modem** in LuCI. A hard browser refresh may be needed after installation.

## Build an IPK

Place this directory under an OpenWrt/ImmortalWrt buildroot package feed, refresh feeds and build:

```sh
./scripts/feeds update luci
./scripts/feeds install luci-app-usb-modem
make package/luci-app-usb-modem/compile V=s
```

You can also point the repository build helper at an extracted SDK:

```sh
SDK_DIR=/path/to/openwrt-sdk ./scripts/build-ipk.sh
```

The resulting architecture-independent IPK is copied to `dist/`. Runtime
dependencies must still be available from the package feeds configured on the
router.

GitHub Actions builds IPKs with OpenWrt 23.05, OpenWrt 24.10 and ImmortalWrt
24.10 SDKs. Every workflow run exposes them as artifacts. Tags named `v*` also
publish the IPKs on the matching GitHub Release.

## Install or upgrade an IPK

Copy the selected artifact to the router and reinstall it:

```sh
opkg install --force-reinstall /tmp/luci-app-usb-modem_*.ipk
rm -f /tmp/luci-indexcache /tmp/luci-modulecache/*
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

Hard-refresh the LuCI page after both services restart. This is important when
upgrading from an older package because the browser or LuCI cache may otherwise
continue serving the previous `status.js`.

## Troubleshoot “resource not found”

The page calls two fixed helper paths through rpcd. If LuCI reports `Object not
found`, `resource not found`, or says that the status helper is unavailable,
verify the installed files and backend before changing the JavaScript:

```sh
ls -l /usr/bin/usbmodem-status /usr/bin/usbmodem-restart
ls -l /usr/share/rpcd/acl.d/luci-app-usb-modem.json
/usr/bin/usbmodem-status
opkg list-installed | grep -E '^(luci-app-usb-modem|rpcd-mod-file) '
logread -e rpcd
```

Both helpers must be executable, the status command must print one JSON object,
and `rpcd-mod-file` must be installed. After installing or correcting the ACL,
restart rpcd and hard-refresh the browser using the upgrade commands above.

## Router-side helper tests

```sh
/usr/bin/usbmodem-status
/usr/bin/usbmodem-restart
```

The restart helper executes the equivalent of:

```sh
echo 11200000.usb > /sys/bus/platform/drivers/xhci-mtk/unbind
sleep 2
echo 11200000.usb > /sys/bus/platform/drivers/xhci-mtk/bind
```

All USB devices on that controller disconnect briefly.

## Different controller

The helpers support environment overrides for manual testing:

```sh
DRIVER_DIR=/sys/bus/platform/drivers/xhci-mtk \
DEVICE_ID=11200000.usb \
/usr/bin/usbmodem-status
```

For permanent support of another platform, change the defaults in both helper scripts before packaging.

## Development tests

```sh
./tests/test-status.sh
./tests/test-restart.sh
```

## License

MIT
