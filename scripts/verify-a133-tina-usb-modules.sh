#!/bin/sh

set -eu

usage() {
  cat <<'EOF'
Usage: AHT_PACKAGE_DIR=/path/to/package scripts/verify-a133-tina-usb-modules.sh [--static|--load]

--static verifies hashes, metadata, ELF architecture, and kernel compatibility only.
--load additionally pushes modules to one root ADB target and loads them temporarily;
       it requires AHT_ALLOW_DEVICE_MUTATION=1 and never changes USB mode or network state.
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

MODE=${1:---static}
case "$MODE" in
  --static|--load) ;;
  *) usage >&2; exit 2 ;;
esac

PACKAGE_DIR=${AHT_PACKAGE_DIR:-}
[ -n "$PACKAGE_DIR" ] || fail 'AHT_PACKAGE_DIR is required'
[ -d "$PACKAGE_DIR" ] || fail "package directory is missing: $PACKAGE_DIR"

if [ "$MODE" = "--load" ] && [ "${AHT_ALLOW_DEVICE_MUTATION:-}" != "1" ]; then
  fail 'device load requires AHT_ALLOW_DEVICE_MUTATION=1'
fi

MANIFEST="$PACKAGE_DIR/manifest.json"
[ -r "$MANIFEST" ] || fail "manifest is missing: $MANIFEST"

manifest_value() {
  key=$1
  sed -n "s/.*\"$key\": \"\([^\"]*\)\".*/\1/p" "$MANIFEST" | head -n 1
}

manifest_module_hash() {
  module=$1
  sed -n "s/.*\"$module\".*\"sha256\": \"\([0-9a-f]\{64\}\)\".*/\1/p" "$MANIFEST" | head -n 1
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

verify_module() {
  module=$1
  path="$PACKAGE_DIR/$module"
  [ -r "$path" ] || fail "module is missing: $module"

  expected=$(manifest_module_hash "$module")
  [ -n "$expected" ] || fail "manifest hash is missing: $module"
  actual=$(hash_file "$path")
  [ "$actual" = "$expected" ] || fail "sha256 mismatch: $module"

  file_output=$(file "$path" 2>/dev/null || true)
  printf '%s\n' "$file_output" | grep -E 'AArch64|ARM aarch64' >/dev/null || fail "ELF architecture mismatch: $module"
  strings_output=$(strings "$path" 2>/dev/null || true)
  printf '%s\n' "$strings_output" | grep '^vermagic=4\.9\.191 SMP preempt mod_unload aarch64$' >/dev/null || fail "vermagic mismatch: $module"

  if [ -n "${AHT_READELF:-}" ]; then
    command -v "$AHT_READELF" >/dev/null 2>&1 || fail "ELF reader executable is missing: $AHT_READELF"
    machine=$($AHT_READELF -h "$path" | sed -n 's/^[[:space:]]*Machine:[[:space:]]*//p' | head -n 1)
    [ "$machine" = "AArch64" ] || fail "readelf machine mismatch: $module ($machine)"
  fi
}

verify_static() {
  release=$(manifest_value target_kernel_release)
  [ "$release" = "4.9.191" ] || fail "kernel release mismatch: $release"
  [ "$(manifest_value arch)" = "arm64" ] || fail 'manifest architecture is not arm64'
  [ "$(manifest_value config_usb_usbnet)" = "m" ] || fail 'CONFIG_USB_USBNET is not a module'
  [ "$(manifest_value config_usb_net_cdcether)" = "m" ] || fail 'CONFIG_USB_NET_CDCETHER is not a module'
  [ "$(manifest_value config_modversions)" = "n" ] || fail 'CONFIG_MODVERSIONS must be disabled'
  verify_module usbnet.ko
  verify_module cdc_ether.ko
  printf 'PASS: static package verification (%s)\n' "$PACKAGE_DIR"
}

if [ "$MODE" = "--static" ]; then
  verify_static
  exit 0
fi

verify_static >/dev/null
command -v adb >/dev/null 2>&1 || fail 'adb is required for device load'
DEVICE_LIST=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
DEVICE_COUNT=$(printf '%s\n' "$DEVICE_LIST" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
[ "$DEVICE_COUNT" -eq 1 ] || fail "expected exactly one ready adb device, found $DEVICE_COUNT"
DEVICE_SERIAL=$DEVICE_LIST

ROOT_UID=$(adb -s "$DEVICE_SERIAL" shell id -u 2>/dev/null | tr -d '\r\n')
[ "$ROOT_UID" = "0" ] || fail 'ADB target is not root'
KERNEL_RELEASE=$(adb -s "$DEVICE_SERIAL" shell uname -r 2>/dev/null | tr -d '\r\n')
[ "$KERNEL_RELEASE" = "4.9.191" ] || fail "device kernel release mismatch: $KERNEL_RELEASE"
if adb -s "$DEVICE_SERIAL" shell 'grep -E "^(usbnet|cdc_ether) " /proc/modules' 2>/dev/null | grep . >/dev/null; then
  fail 'usbnet or cdc_ether is already loaded; refusing to disturb existing state'
fi

REMOTE_DIR="/tmp/aht-dji-cellulard-driver.$$"
adb -s "$DEVICE_SERIAL" shell "mkdir -p '$REMOTE_DIR'"
adb -s "$DEVICE_SERIAL" push "$PACKAGE_DIR/usbnet.ko" "$REMOTE_DIR/usbnet.ko" >/dev/null
adb -s "$DEVICE_SERIAL" push "$PACKAGE_DIR/cdc_ether.ko" "$REMOTE_DIR/cdc_ether.ko" >/dev/null

attempted_usbnet=0
attempted_cdc_ether=0
rollback() {
  if [ "$attempted_cdc_ether" -eq 1 ]; then
    adb -s "$DEVICE_SERIAL" shell 'rmmod cdc_ether' >/dev/null 2>&1 || true
  fi
  if [ "$attempted_usbnet" -eq 1 ]; then
    adb -s "$DEVICE_SERIAL" shell 'rmmod usbnet' >/dev/null 2>&1 || true
  fi
}

attempted_usbnet=1
if ! adb -s "$DEVICE_SERIAL" shell "insmod '$REMOTE_DIR/usbnet.ko'"; then
  rollback
  fail 'insmod usbnet.ko failed; rollback attempted'
fi
attempted_cdc_ether=1
if ! adb -s "$DEVICE_SERIAL" shell "insmod '$REMOTE_DIR/cdc_ether.ko'"; then
  rollback
  fail 'insmod cdc_ether.ko failed; rollback attempted'
fi

if ! adb -s "$DEVICE_SERIAL" shell 'grep -q "^usbnet " /proc/modules && grep -q "^cdc_ether " /proc/modules'; then
  rollback
  fail 'module load readback failed; rollback attempted'
fi

if ! adb -s "$DEVICE_SERIAL" shell 'found=1; for d in /sys/bus/usb/devices/*:*; do [ -L "$d/driver" ] || continue; readlink "$d/driver" | grep -q cdc_ether && found=0; done; exit "$found"'; then
  rollback
  fail 'CDC-ECM interface did not bind cdc_ether; rollback attempted'
fi

adb -s "$DEVICE_SERIAL" shell 'cat /proc/net/dev; echo "--- usb driver links ---"; for d in /sys/bus/usb/devices/*:*; do [ -L "$d/driver" ] && printf "%s=" "$d" && readlink "$d/driver"; done; echo "--- dmesg tail ---"; dmesg | tail -n 80'
printf 'PASS: modules loaded and CDC-ECM binding read back; network configuration was not changed\n'
