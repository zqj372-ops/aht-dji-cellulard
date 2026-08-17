#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
VERIFIER="$SCRIPT_DIR/../scripts/verify-a133-tina-usb-modules.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/aht-verifier-test.XXXXXX")
PACKAGE_DIR="$TEST_ROOT/package"
mkdir -p "$PACKAGE_DIR"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup 0 1 2 3 15

test_fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

if output=$(AHT_PACKAGE_DIR="$PACKAGE_DIR" sh "$VERIFIER" --load 2>&1); then
  test_fail 'device load was allowed without mutation flag'
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

if output=$(AHT_PACKAGE_DIR="$PACKAGE_DIR" sh "$VERIFIER" --static 2>&1); then
  test_fail 'wrong module hash was accepted'
fi
printf '%s\n' "$output" | grep 'sha256 mismatch' >/dev/null

sed 's/"4.9.191"/"5.4.0"/' "$PACKAGE_DIR/manifest.json" > "$PACKAGE_DIR/manifest.wrong-release.json"
mv "$PACKAGE_DIR/manifest.wrong-release.json" "$PACKAGE_DIR/manifest.json"
if output=$(AHT_PACKAGE_DIR="$PACKAGE_DIR" sh "$VERIFIER" --static 2>&1); then
  test_fail 'wrong kernel release was accepted'
fi
printf '%s\n' "$output" | grep 'kernel release mismatch' >/dev/null

PACKAGE_DIR="$SCRIPT_DIR/../artifacts/a133-tina-reference-01"
FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/adb" <<'EOF'
#!/bin/sh

printf '%s\n' "$*" >> "${FAKE_ADB_LOG:?}"

scenario=${FAKE_ADB_SCENARIO:-success}
state_file=${FAKE_ADB_STATE:?}

set_state() {
  printf '%s\n' "$1" > "$state_file"
}

state_value=$(cat "$state_file" 2>/dev/null || true)

if [ "${1:-}" = "devices" ]; then
  printf '%s\n' 'List of devices attached'
  printf '%s\t%s\n' 'fixture-adb-serial' 'device'
  exit 0
fi

if [ "${1:-}" = "-s" ] && [ "${3:-}" = "push" ]; then
  exit 0
fi

if [ "${1:-}" = "-s" ] && [ "${3:-}" = "shell" ]; then
  remote_command=$*
  case "$remote_command" in
    *'id -u'*)
      printf '%s\n' '0'
      ;;
    *'uname -r'*)
      printf '%s\n' '4.9.191'
      ;;
    *openwrt_release*)
      if [ "$scenario" = "wrong-release" ]; then
        printf '%s\n' "DISTRIB_TARGET='a133-aw3/generic v1.0'"
      else
        printf '%s\n' "DISTRIB_TARGET='a133-aw3/generic'"
      fi
      ;;
    *AHT_USB_IDENTITY_CHECK*)
      if [ "$scenario" = "reject" ]; then
        printf '%s\n' 'USB_IDENTITY_NOT_READY'
      else
        printf '%s\n' 'USB_IDENTITY_READY'
      fi
      ;;
    *AHT_MODULE_STATE*)
      case "$state_value" in
        '') printf '%s\n' 'MODULES_ABSENT' ;;
        usbnet) printf '%s\n' 'USBNET_ONLY' ;;
        usbnet_cdc_ether) printf '%s\n' 'MODULES_BOTH' ;;
        *) printf '%s\n' 'MODULES_UNEXPECTED' ;;
      esac
      ;;
    *AHT_BINDING_READBACK*)
      if [ "$state_value" = "usbnet_cdc_ether" ] && [ "$scenario" = "success" ]; then
        printf '%s\n' 'BINDING_READY'
      else
        printf '%s\n' 'BINDING_NOT_READY'
      fi
      ;;
    *insmod*usbnet.ko*)
      set_state usbnet
      ;;
    *insmod*cdc_ether.ko*)
      if [ "$scenario" = "load-failure" ]; then
        exit 1
      fi
      set_state usbnet_cdc_ether
      ;;
    *'rmmod cdc_ether'*)
      if [ "$state_value" = "usbnet_cdc_ether" ]; then
        set_state usbnet
      elif [ "$state_value" = "cdc_ether" ]; then
        set_state ''
      fi
      ;;
    *'rmmod usbnet'*)
      if [ "$state_value" = "usbnet_cdc_ether" ] || [ "$state_value" = "usbnet" ]; then
        set_state ''
      fi
      ;;
    *'mkdir -p'*)
      ;;
    *'rm -f'*)
      ;;
    *rmdir*)
      ;;
    *)
      exit 1
      ;;
  esac
  exit 0
fi

exit 1
EOF
chmod +x "$FAKE_BIN/adb"

REJECT_LOG="$TEST_ROOT/reject-adb.log"
REJECT_STATE="$TEST_ROOT/reject-state"
: > "$REJECT_STATE"
if output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$REJECT_LOG" \
  FAKE_ADB_STATE="$REJECT_STATE" \
  FAKE_ADB_SCENARIO=reject \
  AHT_PACKAGE_DIR="$PACKAGE_DIR" \
  AHT_ALLOW_DEVICE_MUTATION=1 \
  sh "$VERIFIER" --load 2>&1
); then
  test_fail 'wrong target USB identity was accepted'
fi
printf '%s\n' "$output" | grep 'target USB identity' >/dev/null
if grep -E '(^| )push( |$)|shell.*mkdir -p|shell.*insmod' "$REJECT_LOG" >/dev/null 2>&1; then
  test_fail 'target identity rejection touched the device'
fi
if printf '%s\n' "$output" | grep -F 'fixture-adb-serial' >/dev/null 2>&1; then
  test_fail 'ADB serial was printed on target rejection'
fi

RELEASE_LOG="$TEST_ROOT/release-adb.log"
RELEASE_STATE="$TEST_ROOT/release-state"
: > "$RELEASE_STATE"
if output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$RELEASE_LOG" \
  FAKE_ADB_STATE="$RELEASE_STATE" \
  FAKE_ADB_SCENARIO=wrong-release \
  AHT_PACKAGE_DIR="$PACKAGE_DIR" \
  AHT_ALLOW_DEVICE_MUTATION=1 \
  sh "$VERIFIER" --load 2>&1
); then
  test_fail 'non-exact OpenWrt target was accepted'
fi
printf '%s\n' "$output" | grep 'OpenWrt target identity mismatch' >/dev/null
if grep -E '(^| )push( |$)|shell.*mkdir -p|shell.*insmod' "$RELEASE_LOG" >/dev/null 2>&1; then
  test_fail 'wrong OpenWrt target touched the device'
fi

SUCCESS_LOG="$TEST_ROOT/success-adb.log"
SUCCESS_STATE="$TEST_ROOT/success-state"
: > "$SUCCESS_STATE"
if ! output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$SUCCESS_LOG" \
  FAKE_ADB_STATE="$SUCCESS_STATE" \
  FAKE_ADB_SCENARIO=success \
  AHT_PACKAGE_DIR="$PACKAGE_DIR" \
  AHT_ALLOW_DEVICE_MUTATION=1 \
  sh "$VERIFIER" --load 2>&1
); then
  printf '%s\n' "$output" >&2
  test_fail 'simulated successful module load failed'
fi
printf '%s\n' "$output" | grep 'status=modules_retained' >/dev/null
printf '%s\n' "$output" | grep 'remote_module_files=removed' >/dev/null
printf '%s\n' "$output" | grep 'network_configuration=unchanged' >/dev/null
if printf '%s\n' "$output" | grep -E 'fixture-adb-serial|dmesg|[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}|IMEI|IMSI|ICCID' >/dev/null 2>&1; then
  test_fail 'success output exposed a forbidden identifier or raw dmesg'
fi
grep 'rm -f' "$SUCCESS_LOG" >/dev/null
if grep 'rmmod ' "$SUCCESS_LOG" >/dev/null 2>&1; then
  test_fail 'successful module load unexpectedly attempted rollback'
fi
[ "$(cat "$SUCCESS_STATE")" = 'usbnet_cdc_ether' ] || test_fail 'successful load did not retain both modules'

FAIL_LOG="$TEST_ROOT/failure-adb.log"
FAIL_STATE="$TEST_ROOT/failure-state"
: > "$FAIL_STATE"
if output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$FAIL_LOG" \
  FAKE_ADB_STATE="$FAIL_STATE" \
  FAKE_ADB_SCENARIO=load-failure \
  AHT_PACKAGE_DIR="$PACKAGE_DIR" \
  AHT_ALLOW_DEVICE_MUTATION=1 \
  sh "$VERIFIER" --load 2>&1
); then
  test_fail 'simulated cdc_ether load failure was accepted'
fi
printf '%s\n' "$output" | grep 'rollback attempted' >/dev/null
printf '%s\n' "$output" | grep 'status=rollback_complete' >/dev/null
printf '%s\n' "$output" | grep 'remote_module_files=removed' >/dev/null
cdc_rollback_line=$(grep -n 'shell rmmod cdc_ether' "$FAIL_LOG" | cut -d: -f1 | head -n 1)
usbnet_rollback_line=$(grep -n 'shell rmmod usbnet' "$FAIL_LOG" | cut -d: -f1 | head -n 1)
[ -n "$cdc_rollback_line" ] || test_fail 'cdc_ether rollback was not attempted'
[ -n "$usbnet_rollback_line" ] || test_fail 'usbnet rollback was not attempted'
[ "$cdc_rollback_line" -lt "$usbnet_rollback_line" ] || test_fail 'rollback order was not reverse dependency order'
[ -z "$(cat "$FAIL_STATE")" ] || test_fail 'rollback unload readback left a module loaded'
if grep dmesg "$FAIL_LOG" >/dev/null 2>&1; then
  test_fail 'failure path requested raw dmesg'
fi
if printf '%s\n' "$output" | grep -F 'fixture-adb-serial' >/dev/null 2>&1; then
  test_fail 'ADB serial was printed on failure'
fi

printf '%s\n' 'PASS: verifier enforces target identity, guarded load, readback, cleanup, and rollback'
