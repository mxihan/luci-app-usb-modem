# LuCI USB Modem Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix missing-resource and undefined-status failures, align the package with broadly compatible LuCI conventions, and publish SDK-built IPK artifacts through GitHub Actions.

**Architecture:** Keep fixed POSIX shell helpers behind `rpcd-mod-file` ACLs for compatibility, but centralize frontend result normalization so initial load, polling, and manual refresh share one safe path. Add source-level contract tests and an SDK matrix workflow that uses the OpenWrt build system rather than hand-assembling packages.

**Tech Stack:** LuCI JavaScript, POSIX shell/BusyBox, rpcd-mod-file, Node.js test runner, OpenWrt SDK, GitHub Actions.

---

## File Map

- Modify `htdocs/luci-static/resources/view/usbmodem/status.js`: safe status loading, normalization, error presentation, polling, and restart behavior.
- Modify `root/usr/share/rpcd/acl.d/luci-app-usb-modem.json`: exact fixed-helper execution permissions.
- Modify `root/usr/bin/usbmodem-status`: stable schema and portable error-safe collection.
- Modify `Makefile`: package release and compatible runtime metadata.
- Create `tests/test-status-view.js`: frontend regression tests with LuCI DOM stubs.
- Create `tests/test-package-contract.sh`: verify paths, ACL/menu JSON, shell syntax, and package metadata.
- Create `tests/test-build-ipk.sh`: exercise SDK argument validation and artifact discovery with a fake SDK.
- Modify `tests/test-status.sh`: validate JSON schema and degraded states.
- Create `scripts/build-ipk.sh`: reproducible SDK package build entrypoint used locally and in CI.
- Create `.github/workflows/build-ipk.yml`: stable/snapshot SDK matrix, artifacts, and tag release publishing.
- Modify `README.md`: compatibility, artifact installation, missing-resource diagnosis, and cache refresh instructions.

### Task 1: Reproduce the frontend crash

**Files:**
- Create: `tests/test-status-view.js`
- Test: `htdocs/luci-static/resources/view/usbmodem/status.js`

- [ ] **Step 1: Add a Node harness that loads the real LuCI view**

Create a `vm` context with stubs for `view.extend`, `_`, `E`, `L.bind`, `fs.exec`,
`ui`, `poll`, `dom`, `document`, and `window`. Capture the object returned by the
view and expose a tree walker that extracts text from stub DOM nodes.

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element(tag, attrs, children) {
	return { tag, attrs: attrs || {}, children: Array.isArray(children) ? children : [children] };
}

function loadView() {
	let exported;
	const source = fs.readFileSync(path.join(__dirname,
		'../htdocs/luci-static/resources/view/usbmodem/status.js'), 'utf8');
	const context = {
		_: s => s,
		E: element,
		L: { bind: (fn, self) => fn.bind(self) },
		view: { extend: spec => (exported = spec) },
		fs: { exec: () => Promise.resolve({ code: 0, stdout: '{}' }) },
		ui: {}, poll: { add: () => {} }, dom: { content: () => {} },
		document: { getElementById: () => null },
		window: { setTimeout }, console
	};
	vm.runInNewContext(source, context, { filename: 'status.js' });
	return { view: exported, context };
}
```

- [ ] **Step 2: Add failing regression cases**

Assert that `renderStatus(undefined)`, `renderStatus({})`, and
`renderStatus({ controller: {} })` do not throw, and that an explicit
`loadError: 'Object not found'` renders that message. Also assert that
`loadStatus()` rejects a successful command response containing empty or invalid
JSON rather than reporting a healthy state.

```js
assert.doesNotThrow(() => view.renderStatus(undefined));
assert.doesNotThrow(() => view.renderStatus({}));
assert.doesNotThrow(() => view.renderStatus({ controller: {} }));
assert.match(JSON.stringify(view.renderStatus({ loadError: 'Object not found' })), /Object not found/);
```

- [ ] **Step 3: Run the regression test and verify RED**

Run: `node tests/test-status-view.js`

Expected: at least one assertion fails against the current load/render contract,
demonstrating the missing-resource or incomplete-response behavior.

- [ ] **Step 4: Commit the failing regression test**

```sh
git add tests/test-status-view.js
git commit -m "test: reproduce missing modem status resource"
```

### Task 2: Centralize safe LuCI status handling

**Files:**
- Modify: `htdocs/luci-static/resources/view/usbmodem/status.js`
- Test: `tests/test-status-view.js`

- [ ] **Step 1: Define a complete normalized view model**

Change `normalizeStatus()` to return defaults for every nested object, require a
plain object for successful status input, and mark incomplete data unhealthy.
Keep the helper private to the LuCI module and exercise it through
`renderStatus()`.

- [ ] **Step 2: Convert rpcd execution results into actionable errors**

Add a single formatter used by initial load and refresh. It must preserve rpcd
details such as `Object not found`, while prefixing them with a translated message
that `/usr/bin/usbmodem-status` is unavailable or inaccessible. Reject empty JSON
output and arrays.

```js
function commandError(res, fallback) {
	var detail = res && (res.stderr || res.stdout || res.message);
	return new Error(detail ? '%s: %s'.format(fallback, detail) : fallback);
}
```

- [ ] **Step 3: Unify initial, manual, and polled refreshes**

Make `load()` resolve the same error model rendered by refresh. Ensure refresh
always catches its promise, checks that the target still exists, and restores the
button/modal state on both success and failure. Register one poll callback from
`render()`.

- [ ] **Step 4: Run frontend tests and verify GREEN**

Run: `node tests/test-status-view.js`

Expected: all regression cases print `status view tests passed` and exit zero.

- [ ] **Step 5: Commit the frontend fix**

```sh
git add htdocs/luci-static/resources/view/usbmodem/status.js tests/test-status-view.js
git commit -m "fix: handle unavailable modem status resources"
```

### Task 3: Lock the package resource contract

**Files:**
- Create: `tests/test-package-contract.sh`
- Modify: `root/usr/share/rpcd/acl.d/luci-app-usb-modem.json`
- Modify: `Makefile`

- [ ] **Step 1: Write a failing package contract test**

The script must parse both JSON metadata files with `node`, extract each absolute
helper path referenced by `status.js` and the ACL, and assert that the
corresponding `root/...` file exists and is executable in git. It must also run
`sh -n` on both helpers, assert `LUCI_DEPENDS` contains `+rpcd-mod-file`, and
require the repaired package to have `PKG_RELEASE` of at least 2.

```sh
for helper in /usr/bin/usbmodem-status /usr/bin/usbmodem-restart; do
	test -f "$ROOT/root$helper"
	git -C "$ROOT" ls-files --stage "root$helper" | grep -q '^100755 '
	grep -Fq "\"$helper\"" "$ROOT/root/usr/share/rpcd/acl.d/luci-app-usb-modem.json"
done
node -e "JSON.parse(require('fs').readFileSync(process.argv[1]))" \
	"$ROOT/root/usr/share/rpcd/acl.d/luci-app-usb-modem.json"
grep -q 'LUCI_DEPENDS:=.*+rpcd-mod-file' "$ROOT/Makefile"
awk -F= '/^PKG_RELEASE:=/ { if ($2 + 0 < 2) exit 1; found=1 } END { exit !found }' "$ROOT/Makefile"
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `sh tests/test-package-contract.sh`

Expected: failure identifies any current ACL semantic or package metadata mismatch
instead of a JavaScript property error.

- [ ] **Step 3: Apply the minimal ACL and metadata correction**

Keep only fixed paths under the ACL `file` execution lists, retain read access for
status and write access for restart, and remove unnecessary broad permissions if
the target rpcd syntax does not require them. Increment `PKG_RELEASE` so upgraded
assets receive a new version URL.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run: `sh tests/test-package-contract.sh`

Expected: `package contract tests passed`.

- [ ] **Step 5: Commit the resource contract fix**

```sh
git add Makefile root/usr/share/rpcd/acl.d/luci-app-usb-modem.json tests/test-package-contract.sh
git commit -m "fix: align rpcd helper resource contract"
```

### Task 4: Harden backend schema behavior

**Files:**
- Modify: `tests/test-status.sh`
- Modify: `root/usr/bin/usbmodem-status`

- [ ] **Step 1: Add failing degraded-state and schema tests**

Use an empty fake sysfs root and assert that the command still exits zero with a
JSON object containing all six top-level fields and an unhealthy diagnosis. Also
make the fake log contain a literal tab and carriage return; JSON parsing must
succeed and preserve them as escaped content. The control-character case fails
with the current `json_escape()` implementation. Parse the output with Node rather
than matching JSON fragments only.

```sh
printf '%s' "$OUT" | node -e '
let s=""; process.stdin.on("data", c => s += c).on("end", () => {
  const v = JSON.parse(s);
  for (const k of ["controller","modem","network","drivers","diagnosis","logs"])
    if (!(k in v)) throw new Error(`missing ${k}`);
  if (typeof v.diagnosis.healthy !== "boolean") throw new Error("invalid diagnosis");
});'
```

- [ ] **Step 2: Run status tests and verify RED**

Run: `sh tests/test-status.sh`

Expected: the new assertion fails only if the current helper violates the stable
schema or degraded-state contract.

- [ ] **Step 3: Make the smallest portable helper changes**

Preserve POSIX shell and BusyBox compatibility. Ensure failed optional commands,
missing directories, empty logs, and absent interfaces still produce one valid
JSON document. Do not accept executable paths or device identifiers from browser
input.

- [ ] **Step 4: Run helper tests and verify GREEN**

Run:

```sh
sh tests/test-status.sh
sh tests/test-restart.sh
```

Expected: both scripts exit zero.

- [ ] **Step 5: Commit backend hardening**

```sh
git add root/usr/bin/usbmodem-status tests/test-status.sh
git commit -m "fix: stabilize modem status schema"
```

### Task 5: Add a reproducible OpenWrt SDK build script

**Files:**
- Create: `scripts/build-ipk.sh`
- Create: `tests/test-build-ipk.sh`

- [ ] **Step 1: Write failing build-script tests**

Test that a missing `SDK_DIR` fails with `OpenWrt SDK directory not found`. Create
a fake SDK `Makefile` whose package compile target writes a fixture IPK, then test
that the script copies that artifact into an isolated output directory. The test
must fail initially because `scripts/build-ipk.sh` does not exist.

- [ ] **Step 2: Verify the missing-SDK case fails cleanly**

Run: `sh tests/test-build-ipk.sh`

Expected: failure because the build script is missing.

- [ ] **Step 3: Implement SDK feed staging and compilation**

Symlink or copy the repository into
`$SDK_DIR/package/luci-app-usb-modem`, run `make defconfig`, then run:

```sh
make package/luci-app-usb-modem/compile V=s
find bin/packages bin/targets -type f -name 'luci-app-usb-modem_*.ipk' -exec cp '{}' "$OUTPUT_DIR/" ';'
```

Fail when no IPK is produced and print the copied artifact paths on success.
Require `SDK_DIR`, accept `PACKAGE_DIR` and `OUTPUT_DIR` overrides, and refuse to
remove or overwrite directories outside the SDK package staging path.

- [ ] **Step 4: Run build-script tests and verify GREEN**

Run: `sh tests/test-build-ipk.sh`

Expected: `build IPK tests passed`.

- [ ] **Step 5: Exercise the script with one downloaded stable SDK**

Use the exact release/target selected while implementing the workflow. Expected:
one architecture-independent `luci-app-usb-modem_*.ipk` under `dist/`.

- [ ] **Step 6: Commit the SDK build entrypoint**

```sh
git add scripts/build-ipk.sh tests/test-build-ipk.sh
git commit -m "build: add reproducible SDK package build"
```

### Task 6: Add GitHub Actions IPK packaging

**Files:**
- Create: `.github/workflows/build-ipk.yml`

- [ ] **Step 1: Define the compatibility matrix**

Add explicit stable OpenWrt 23.05 and 24.10 entries and an ImmortalWrt 24.10
entry using verified x86_64 SDK download URLs or URL components. Include a
snapshot entry only with `continue-on-error: true`; stable jobs must be required.

- [ ] **Step 2: Download and verify each SDK archive**

Use `curl --fail --location --retry 3`, extract into a job-local directory, and
print the SDK version. Do not use floating third-party build actions for package
assembly.

- [ ] **Step 3: Install feeds and build through the shared script**

Update/install the LuCI feed if the SDK requires it, invoke
`scripts/build-ipk.sh`, and place each matrix output in a uniquely named artifact
directory.

- [ ] **Step 4: Upload IPKs and publish tag releases**

Use `actions/upload-artifact` for every successful matrix job. Add a release job
that runs only for `refs/tags/*`, downloads all IPK artifacts, and attaches them
to the matching GitHub Release with `contents: write`; all build jobs retain
`contents: read`.

- [ ] **Step 5: Validate workflow syntax and paths**

Parse YAML with an available YAML parser, inspect every referenced script path,
and run the stable SDK build command locally for at least one matrix entry.

- [ ] **Step 6: Commit CI packaging**

```sh
git add .github/workflows/build-ipk.yml
git commit -m "ci: build IPK packages with OpenWrt SDKs"
```

### Task 7: Document installation and missing-resource recovery

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document supported release families and artifacts**

Explain that stable SDK artifacts are preferred, IPKs are architecture
independent but dependencies must exist in the firmware feeds, and snapshot
compatibility is best effort.

- [ ] **Step 2: Add exact upgrade and cache commands**

Document package installation plus rpcd/uhttpd reload and cache cleanup:

```sh
opkg install --force-reinstall /tmp/luci-app-usb-modem_*.ipk
rm -f /tmp/luci-indexcache /tmp/luci-modulecache/*
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

Tell the user to hard-refresh the browser after the service restart.

- [ ] **Step 3: Add resource-not-found diagnostics**

Include checks for `/usr/bin/usbmodem-status`, executable mode, direct JSON output,
ACL installation, and rpcd reload:

```sh
ls -l /usr/bin/usbmodem-status /usr/share/rpcd/acl.d/luci-app-usb-modem.json
/usr/bin/usbmodem-status
logread -e rpcd
```

- [ ] **Step 4: Commit documentation**

```sh
git add README.md
git commit -m "docs: add IPK and rpcd troubleshooting guide"
```

### Task 8: Full verification and release readiness

**Files:**
- Test: all changed files

- [ ] **Step 1: Run all local regression tests**

```sh
sh tests/test-status.sh
sh tests/test-restart.sh
sh tests/test-package-contract.sh
sh tests/test-build-ipk.sh
node tests/test-status-view.js
```

Expected: all commands exit zero without warnings or uncaught rejections.

- [ ] **Step 2: Run static checks**

```sh
sh -n root/usr/bin/usbmodem-status
sh -n root/usr/bin/usbmodem-restart
sh -n scripts/build-ipk.sh
git diff --check
```

Expected: no output and zero exit status.

- [ ] **Step 3: Build and inspect a real IPK**

Run the shared build script against one stable SDK. Extract the resulting IPK and
verify it contains the view, both executable helpers, menu JSON, and ACL JSON at
their expected install paths.

- [ ] **Step 4: Review repository state**

Run `git status -sb` and `git log --oneline --decorate -10`. Confirm only intended
changes exist and every implementation slice has its verification evidence.

- [ ] **Step 5: Commit any verification-only corrections**

If verification required changes, stage only those exact files and commit them
with a message describing the correction. Do not amend unrelated user work.
