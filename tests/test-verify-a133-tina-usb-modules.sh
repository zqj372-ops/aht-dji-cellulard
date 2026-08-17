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

PACKAGE_DIR="$SCRIPT_DIR/../artifacts/a133-tina-reference-01"
FAKE_BIN="$TEST_ROOT/bin"
FAKE_ADB_LOG="$TEST_ROOT/adb.log"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/adb" <<'EOF'
#!/bin/sh

printf '%s\n' "$*" >> "$FAKE_ADB_LOG"

if [ "${1:-}" = "devices" ]; then
  printf '%s\n' 'List of devices attached'
  printf '%s\t%s\n' 'fixture-device' 'device'
  exit 0
fi

if [ "${1:-}" = "-s" ] && [ "${3:-}" = "shell" ]; then
  command=${4:-}
  if [ "$#" -ge 5 ]; then
    command="$command $5"
  fi
  case "$command" in
    'id -u') printf '%s\n' '0' ;;
    'uname -r') printf '%s\n' '4.9.191' ;;
    'grep -E "^(usbnet|cdc_ether) " /proc/modules') exit 1 ;;
    mkdir\ -p\ * ) exit 0 ;;
    *usbnet.ko* ) exit 0 ;;
    *cdc_ether.ko* ) exit 1 ;;
    'rmmod cdc_ether'|'rmmod usbnet') exit 0 ;;
    *) exit 0 ;;
  esac
  exit 0
fi

if [ "${1:-}" = "-s" ] && [ "${3:-}" = "push" ]; then
  exit 0
fi

exit 1
EOF
chmod +x "$FAKE_BIN/adb"

if output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$FAKE_ADB_LOG" \
  AHT_PACKAGE_DIR="$PACKAGE_DIR" \
  AHT_ALLOW_DEVICE_MUTATION=1 \
  bash "$VERIFIER" --load 2>&1
); then
  printf '%s\n' 'FAIL: simulated cdc_ether load failure should fail the gate' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'rollback attempted' >/dev/null
cdc_rollback_line=$(grep -n 'rmmod cdc_ether' "$FAKE_ADB_LOG" | cut -d: -f1 | head -n 1)
usbnet_rollback_line=$(grep -n 'rmmod usbnet' "$FAKE_ADB_LOG" | cut -d: -f1 | head -n 1)
[ -n "$cdc_rollback_line" ] || { printf '%s\n' 'FAIL: cdc_ether rollback was not attempted' >&2; exit 1; }
[ -n "$usbnet_rollback_line" ] || { printf '%s\n' 'FAIL: usbnet rollback was not attempted' >&2; exit 1; }
[ "$cdc_rollback_line" -lt "$usbnet_rollback_line" ] || { printf '%s\n' 'FAIL: rollback order was not reverse dependency order' >&2; exit 1; }

printf '%s\n' 'PASS: verifier rejects unsafe and incompatible packages'
