# luci-app-usb-modem

A lightweight LuCI page for monitoring USB network modems and recovering a stuck USB host controller. The initial target is Cudy TR3000 + ZTE F50 on ImmortalWrt 24.10.

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
