# LuCI USB Modem Compatibility Refactor Design

## Goal

Fix the status page failure, make missing backend resources and malformed status
responses visible without crashing the view, align the package with established
LuCI package conventions, and automatically build installable IPK artifacts on
GitHub Actions.

The compatibility target is OpenWrt and ImmortalWrt 23.05, 24.10, and newer
snapshots where the required LuCI and `rpcd-mod-file` packages are available.

## Root Cause and Failure Model

The reported exception occurs because `renderStatus()` receives no usable status
object and then reads `diagnosis` from it. The device also reports that the
requested resource cannot be found. The primary investigation target is therefore
the boundary between the LuCI `fs` client, rpcd file ACL, and the installed
`/usr/bin/usbmodem-status` resource.

The implementation must distinguish these failures:

- the helper is absent from the installed package;
- rpcd cannot expose or authorize the helper path;
- the helper exits unsuccessfully;
- the helper returns empty or invalid JSON;
- the returned JSON omits one or more expected fields;
- an older cached LuCI view is still served after an upgrade.

Every failure must render an actionable error message. No failure may cause an
uncaught promise rejection or property access on `undefined`.

## Architecture

### Backend

Keep the backend as small POSIX shell helpers installed under `/usr/bin`. LuCI
will execute only fixed helper paths through `rpcd-mod-file`; no command or path
will be accepted from browser input. This avoids a dependency on newer ucode rpcd
plugins and provides the widest practical version compatibility.

The status helper owns hardware discovery and emits a stable JSON document. It
must remain usable directly over SSH so backend failures can be diagnosed without
the browser. Its output contract contains `controller`, `modem`, `network`,
`drivers`, `diagnosis`, and `logs`.

The ACL must grant read execution of the status helper and write execution of the
restart helper using the syntax supported by the target releases. Package tests
will verify that every path named in the JavaScript view and ACL exists in the
package tree and matches exactly.

### LuCI View

The JavaScript view will follow the conventional LuCI `view.extend()` lifecycle:

1. `load()` requests initial status and resolves to a defined result in both
   success and failure cases.
2. One normalization boundary converts valid partial data into a complete view
   model and converts execution or parse failures into an explicit error model.
3. `render()` renders that model without assuming nested properties exist.
4. Manual and polled refreshes use the same loader and renderer.
5. Restart remains a confirmed action and reports backend errors through LuCI
   notifications.

The source will avoid JavaScript features that unnecessarily raise the browser
baseline. User-visible strings will remain wrapped for LuCI translation.

## Error Handling

When rpcd reports that the resource is not found, the page will state that the
status helper is unavailable or inaccessible and suggest verifying package
installation and rpcd reload. Raw backend detail may be appended when available,
but the page will not expose a JavaScript stack trace.

Invalid or incomplete JSON will not be silently presented as healthy. Missing
fields receive safe display defaults and the diagnosis becomes unhealthy with a
message that status data is incomplete.

After package upgrades, the package release will change so the generated LuCI
asset URL changes. Installation documentation will also include rpcd/uhttpd
restart and LuCI/browser cache refresh steps for devices retaining old assets.

## Package Layout and Metadata

Retain the standard feed package layout:

- `Makefile` for OpenWrt/LuCI package metadata;
- `htdocs/luci-static/resources/view/usbmodem/status.js` for the view;
- `root/usr/bin/usbmodem-status` and `root/usr/bin/usbmodem-restart` for helpers;
- `root/usr/share/luci/menu.d/luci-app-usb-modem.json` for navigation;
- `root/usr/share/rpcd/acl.d/luci-app-usb-modem.json` for authorization.

The Makefile will use `feeds/luci/luci.mk`, declare architecture independence,
and list runtime dependencies required by the selected backend. The package
release will be incremented for the repaired build.

## Verification

Tests will cover:

- status collection with a fake sysfs tree;
- restart success and missing-controller behavior;
- valid JSON output and expected schema fields;
- rendering inputs that are `undefined`, empty, incomplete, and explicit loader
  errors, including the reported missing `diagnosis` regression;
- exact agreement among helper paths in the view, ACL, and package tree;
- shell syntax and JSON syntax for package metadata;
- successful package build in at least one supported SDK before completion.

The frontend regression test may extract and execute the pure normalization logic
under Node.js. It will not require a full browser or router merely to prove that
missing status data cannot crash rendering.

## GitHub Actions Packaging

A workflow will build the package with downloadable OpenWrt SDKs rather than
assembling an IPK manually. The matrix will cover representative OpenWrt 23.05
and 24.10 SDKs and an ImmortalWrt 24.10 SDK when a stable downloadable SDK is
available. Snapshot entries may be allowed to fail independently because SDK
URLs and package indexes are mutable; stable entries remain required.

Each successful matrix job uploads the generated `luci-app-usb-modem_*.ipk` as a
GitHub Actions artifact. Tag builds additionally create or update the matching
GitHub Release and attach the built IPKs. Workflow permissions remain read-only
except for release publishing on tag events.

The workflow will expose target and release values as a small explicit matrix so
future supported releases can be added without rewriting build steps.

## Documentation

The README will document supported release families, artifact installation,
manual SDK builds, direct helper diagnostics, and the upgrade/cache procedure.
It will explain that a backend “resource not found” error should first be checked
against the installed helper path, rpcd ACL, and rpcd reload status.

## Non-Goals

- Supporting legacy Lua-based LuCI releases older than the JavaScript view stack.
- Maintaining parallel shell and ucode implementations.
- Accepting controller identifiers, commands, or executable paths from the UI.
- Building complete firmware images.
