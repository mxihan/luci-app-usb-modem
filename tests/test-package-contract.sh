#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ACL="$ROOT/root/usr/share/rpcd/acl.d/luci-app-usb-modem.json"
MENU="$ROOT/root/usr/share/luci/menu.d/luci-app-usb-modem.json"
VIEW="$ROOT/htdocs/luci-static/resources/view/usbmodem/status.js"
WORKFLOW="$ROOT/.github/workflows/build-ipk.yml"

node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$ACL"
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$MENU"

for helper in /usr/bin/usbmodem-status /usr/bin/usbmodem-restart; do
	test -f "$ROOT/root$helper"
	git -C "$ROOT" ls-files --stage "root$helper" | grep -q '^100755 '
	grep -Fq "'$helper'" "$VIEW"
	grep -Fq "\"$helper\"" "$ACL"
	sh -n "$ROOT/root$helper"
done

grep -q '^LUCI_DEPENDS:=.*+rpcd-mod-file' "$ROOT/Makefile"
grep -Fq './scripts/feeds update -a' "$WORKFLOW"
grep -Fq './scripts/feeds install -a' "$WORKFLOW"
awk -F= '
	/^PKG_RELEASE:=/ {
		found = 1
		if ($2 + 0 < 2)
			exit 1
	}
	END { if (!found) exit 1 }
' "$ROOT/Makefile"

echo 'package contract tests passed'
