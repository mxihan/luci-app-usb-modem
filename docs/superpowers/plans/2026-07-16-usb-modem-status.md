# USB Modem Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight LuCI status page for USB RNDIS modems with diagnostics and a safe one-click xHCI controller restart.

**Architecture:** Two fixed shell helpers expose status and restart operations. A LuCI JavaScript view calls them through rpcd-mod-file, renders status cards and filtered logs, and never accepts arbitrary shell input. An ACL limits execution to the two fixed helpers.

**Tech Stack:** POSIX shell/BusyBox, LuCI JavaScript, rpcd-mod-file, OpenWrt package Makefile.

## Global Constraints

- Target ImmortalWrt 24.10-SNAPSHOT and modern LuCI JavaScript views.
- Default controller driver path: `/sys/bus/platform/drivers/xhci-mtk`.
- Default controller device: `11200000.usb`.
- Prefer an interface bound to `rndis_host`, `cdc_ether`, `cdc_ncm`, `cdc_mbim`, or `qmi_wwan`; fall back to `eth2`.
- Restart action must use a fixed helper and must not accept browser-provided commands.

---

### Task 1: Status collector

**Files:**
- Create: `tests/test-status.sh`
- Create: `root/usr/bin/usbmodem-status`

**Interfaces:**
- Produces: JSON object with `controller`, `modem`, `network`, `drivers`, `diagnosis`, and `logs` fields.

- [x] Write a failing shell test using a fake sysfs tree.
- [x] Run it and confirm failure because `usbmodem-status` is missing.
- [x] Implement the POSIX shell collector.
- [x] Run the test and confirm it passes.

### Task 2: Safe controller restart

**Files:**
- Create: `tests/test-restart.sh`
- Create: `root/usr/bin/usbmodem-restart`

**Interfaces:**
- Produces: JSON `{ "ok": boolean, "message": string }`.

- [x] Write tests for missing controller and successful unbind/bind writes.
- [x] Confirm tests fail before implementation.
- [x] Implement fixed-path restart logic with environment overrides for tests.
- [x] Confirm tests pass.

### Task 3: LuCI page and authorization

**Files:**
- Create: `htdocs/luci-static/resources/view/usbmodem/status.js`
- Create: `root/usr/share/luci/menu.d/luci-app-usb-modem.json`
- Create: `root/usr/share/rpcd/acl.d/luci-app-usb-modem.json`

**Interfaces:**
- Consumes: `/usr/bin/usbmodem-status`, `/usr/bin/usbmodem-restart`.

- [x] Render controller, modem, network, drivers, diagnosis, and recent logs.
- [x] Add refresh and confirmed restart buttons.
- [x] Restrict rpcd file execution to the fixed helpers.

### Task 4: Packaging and documentation

**Files:**
- Create: `Makefile`
- Create: `README.md`

- [x] Add OpenWrt package metadata and dependencies.
- [x] Document installation, controller defaults, and direct helper testing.
- [x] Run syntax and fixture tests.
