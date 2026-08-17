#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
VERIFIER="$SCRIPT_DIR/../scripts/verify-a133-tina-usb-modules.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/aht-verifier-test.XXXXXX")
PACKAGE_DIR="$TEST_ROOT/package"
mkdir -p "$PACKAGE_DIR"

if output=$(AHT_PACKAGE_DIR="$PACKAGE_DIR" bash "$VERIFIER" --load 2>&1); then
  printf '%s\n' 'FAIL: device load was allowed without mutation flag' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'AHT_ALLOW_DEVICE_MUTATION=1' >/dev/null

printf '%s\n' 'fixture-usbnet' > "$PACKAGE_DIR/usbnet.ko"
printf '%s\n' 'fixture-cdc-ether' > "$PACKAGE_DIR/cdc_ether.ko"
cat > "$PACKAGE_DIR/manifest.json" <<'EOF'
{
  "schema_version": 1,
  "target_kernel_release": "4.9.191",
  "arch": "arm64",
  "config_usb_usbnet": "m",
  "config_usb_net_cdcether": "m",
  "config_modversions": "n",
  "modules": {
    "usbnet.ko": {"sha256": "0000000000000000000000000000000000000000000000000000000000000000"},
    "cdc_ether.ko": {"sha256": "0000000000000000000000000000000000000000000000000000000000000000"}
  }
}
EOF

if output=$(AHT_PACKAGE_DIR="$PACKAGE_DIR" bash "$VERIFIER" --static 2>&1); then
  printf '%s\n' 'FAIL: wrong module hash was accepted' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'sha256 mismatch' >/dev/null

sed 's/"4.9.191"/"5.4.0"/' "$PACKAGE_DIR/manifest.json" > "$PACKAGE_DIR/manifest.wrong-release.json"
mv "$PACKAGE_DIR/manifest.wrong-release.json" "$PACKAGE_DIR/manifest.json"
if output=$(AHT_PACKAGE_DIR="$PACKAGE_DIR" bash "$VERIFIER" --static 2>&1); then
  printf '%s\n' 'FAIL: wrong kernel release was accepted' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'kernel release mismatch' >/dev/null

printf '%s\n' 'PASS: verifier rejects unsafe and incompatible packages'
