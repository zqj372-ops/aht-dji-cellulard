#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$SCRIPT_DIR/aht-a133-tina-target-contract.sh"

usage() {
  cat <<'EOF'
Usage: [AHT_PACKAGE_DIR=/path/to/package] scripts/verify-a133-tina-usb-modules.sh [--static|--preflight|--load]

--static verifies hashes, metadata, ELF architecture, and kernel compatibility only.
--preflight verifies one root ADB target, the exact A133 Tina identity, the
           2ca3:4006 CDC-ECM pair, and an unloaded module state without mutation.
--load additionally pushes modules to one root ADB target and loads them temporarily;
       it requires AHT_ALLOW_DEVICE_MUTATION=1 and never changes USB mode or network state.
EOF
}

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

MODE=${1:---static}
case "$MODE" in
  --static|--preflight|--load) ;;
  *) usage >&2; exit 2 ;;
esac

PACKAGE_DIR=${AHT_PACKAGE_DIR:-}
if [ "$MODE" != "--preflight" ]; then
  [ -n "$PACKAGE_DIR" ] || fail 'AHT_PACKAGE_DIR is required'
  [ -d "$PACKAGE_DIR" ] || fail 'package directory is missing'
fi

if [ "$MODE" = "--load" ] && [ "${AHT_ALLOW_DEVICE_MUTATION:-}" != "1" ]; then
  fail 'device load requires AHT_ALLOW_DEVICE_MUTATION=1'
fi

MANIFEST="$PACKAGE_DIR/manifest.json"
if [ "$MODE" != "--preflight" ]; then
  [ -r "$MANIFEST" ] || fail 'manifest is missing'
fi

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
    command -v "$AHT_READELF" >/dev/null 2>&1 || fail 'ELF reader executable is missing'
    machine=$($AHT_READELF -h "$path" | sed -n 's/^[[:space:]]*Machine:[[:space:]]*//p' | head -n 1)
    [ "$machine" = "AArch64" ] || fail "readelf machine mismatch: $module"
  fi
}

verify_static() {
  release=$(manifest_value target_kernel_release)
  [ "$release" = "$AHT_TARGET_KERNEL_RELEASE" ] || fail 'kernel release mismatch'
  [ "$(manifest_value arch)" = "arm64" ] || fail 'manifest architecture is not arm64'
  [ "$(manifest_value target_usb_vid)" = "2ca3" ] || fail 'target USB VID mismatch'
  [ "$(manifest_value target_usb_pid)" = "4006" ] || fail 'target USB PID mismatch'
  [ "$(manifest_value config_usb_usbnet)" = "m" ] || fail 'CONFIG_USB_USBNET is not a module'
  [ "$(manifest_value config_usb_net_cdcether)" = "m" ] || fail 'CONFIG_USB_NET_CDCETHER is not a module'
  [ "$(manifest_value config_modversions)" = "n" ] || fail 'CONFIG_MODVERSIONS must be disabled'
  verify_module usbnet.ko
  verify_module cdc_ether.ko
  cdc_alias=$(manifest_value cdc_ether_alias)
  case "$cdc_alias" in
    *ic02isc06ip00in*) ;;
    *) fail 'manifest CDC-ECM alias is missing' ;;
  esac
  cdc_strings=$(strings "$PACKAGE_DIR/cdc_ether.ko" 2>/dev/null || true)
  printf '%s\n' "$cdc_strings" | grep -F "alias=$cdc_alias" >/dev/null || fail 'cdc_ether.ko CDC-ECM alias mismatch'
  printf '%s\n' "$cdc_strings" | grep '^depends=usbnet$' >/dev/null || fail 'cdc_ether.ko dependency on usbnet is missing'
  printf 'PASS: static package verification (%s)\n' "$PACKAGE_DIR"
}

if [ "$MODE" = "--static" ]; then
  verify_static
  exit 0
fi

if [ "$MODE" = "--load" ]; then
  verify_static >/dev/null
fi
command -v adb >/dev/null 2>&1 || fail 'adb is required for device load'

DEVICE_SERIAL=
REMOTE_DIR=
MUTATION_STARTED=0
ATTEMPTED_USBNET=0
ATTEMPTED_CDC_ETHER=0
KEEP_MODULES=0
CLEANUP_DONE=0
CLEANUP_FAILED=0
ROLLBACK_ATTEMPTED=0
REMOTE_MODULE_FILES_REMOVED=0

USB_IDENTITY_PROBE='
# AHT_USB_IDENTITY_CHECK
target_count=0
pair_count=0
for device in /sys/bus/usb/devices/*; do
  [ -f "$device/idVendor" ] || continue
  [ -f "$device/idProduct" ] || continue
  [ "$(cat "$device/idVendor" 2>/dev/null)" = "2ca3" ] || continue
  [ "$(cat "$device/idProduct" 2>/dev/null)" = "4006" ] || continue
  target_count=$((target_count + 1))
  control_count=0
  data_count=0
  for interface in "$device":*; do
    [ -d "$interface" ] || continue
    interface_class=$(cat "$interface/bInterfaceClass" 2>/dev/null || true)
    interface_subclass=$(cat "$interface/bInterfaceSubClass" 2>/dev/null || true)
    interface_protocol=$(cat "$interface/bInterfaceProtocol" 2>/dev/null || true)
    if [ "$interface_class" = "02" ] && [ "$interface_subclass" = "06" ] && [ "$interface_protocol" = "00" ]; then
      control_count=$((control_count + 1))
    fi
    if [ "$interface_class" = "0a" ] && [ "$interface_subclass" = "00" ] && [ "$interface_protocol" = "00" ]; then
      data_count=$((data_count + 1))
    fi
  done
  if [ "$control_count" -eq 1 ] && [ "$data_count" -eq 1 ]; then
    pair_count=$((pair_count + 1))
  fi
done
if [ "$target_count" -eq 1 ] && [ "$pair_count" -eq 1 ]; then
  printf "%s\\n" USB_IDENTITY_READY
else
  printf "%s\\n" USB_IDENTITY_NOT_READY
fi
'

KERNEL_COMPAT_PROBE='
# AHT_KERNEL_COMPAT_CHECK
case "$(uname -m 2>/dev/null)" in
  aarch64|arm64) ;;
  *) printf "%s\\n" KERNEL_COMPAT_NOT_READY; exit 0 ;;
esac
[ "$(uname -r 2>/dev/null)" = "4.9.191" ] || { printf "%s\\n" KERNEL_COMPAT_NOT_READY; exit 0; }
[ -r /proc/config.gz ] || { printf "%s\\n" KERNEL_COMPAT_NOT_READY; exit 0; }
if ! zcat /proc/config.gz 2>/dev/null | grep -q "^CONFIG_MODULES=y$"; then
  printf "%s\\n" KERNEL_COMPAT_NOT_READY
  exit 0
fi
if zcat /proc/config.gz 2>/dev/null | grep -q "^CONFIG_MODVERSIONS=y$"; then
  printf "%s\\n" KERNEL_COMPAT_NOT_READY
  exit 0
fi
if zcat /proc/config.gz 2>/dev/null | grep -Eq "^CONFIG_USB_USBNET=[ym]$|^CONFIG_USB_NET_CDCETHER=[ym]$"; then
  printf "%s\\n" KERNEL_COMPAT_NOT_READY
  exit 0
fi
if ! zcat /proc/config.gz 2>/dev/null | grep -q "^CONFIG_MODULES_USE_ELF_RELA=y$"; then
  printf "%s\\n" KERNEL_COMPAT_NOT_READY
  exit 0
fi
printf "%s\\n" KERNEL_COMPAT_READY
'

MODULE_STATE_PROBE='
# AHT_MODULE_STATE
[ -r /proc/modules ] || exit 1
usbnet_loaded=0
cdc_ether_loaded=0
if grep -q "^usbnet " /proc/modules; then usbnet_loaded=1; fi
if grep -q "^cdc_ether " /proc/modules; then cdc_ether_loaded=1; fi
if [ -d /sys/module/usbnet ] || [ -d /sys/bus/usb/drivers/usbnet ]; then usbnet_loaded=1; fi
if [ -d /sys/module/cdc_ether ] || [ -d /sys/bus/usb/drivers/cdc_ether ]; then cdc_ether_loaded=1; fi
if [ "$usbnet_loaded" -eq 0 ] && [ "$cdc_ether_loaded" -eq 0 ]; then
  printf "%s\\n" MODULES_ABSENT
elif [ "$usbnet_loaded" -eq 1 ] && [ "$cdc_ether_loaded" -eq 0 ]; then
  printf "%s\\n" USBNET_ONLY
elif [ "$usbnet_loaded" -eq 1 ] && [ "$cdc_ether_loaded" -eq 1 ]; then
  printf "%s\\n" MODULES_BOTH
else
  printf "%s\\n" CDC_ETHER_ONLY
fi
'

BINDING_READBACK_PROBE='
# AHT_BINDING_READBACK
target_count=0
control_count=0
bound_count=0
netdev_count=0
for device in /sys/bus/usb/devices/*; do
  [ -f "$device/idVendor" ] || continue
  [ -f "$device/idProduct" ] || continue
  [ "$(cat "$device/idVendor" 2>/dev/null)" = "2ca3" ] || continue
  [ "$(cat "$device/idProduct" 2>/dev/null)" = "4006" ] || continue
  target_count=$((target_count + 1))
  for interface in "$device":*; do
    [ -d "$interface" ] || continue
    interface_class=$(cat "$interface/bInterfaceClass" 2>/dev/null || true)
    interface_subclass=$(cat "$interface/bInterfaceSubClass" 2>/dev/null || true)
    [ "$interface_class" = "02" ] || continue
    [ "$interface_subclass" = "06" ] || continue
    control_count=$((control_count + 1))
    [ -L "$interface/driver" ] || continue
    driver=$(readlink "$interface/driver" 2>/dev/null || true)
    case "$driver" in
      cdc_ether|*/cdc_ether) ;;
      *) continue ;;
    esac
    bound_count=$((bound_count + 1))
    for netdev in "$interface"/net/*; do
      [ -d "$netdev" ] || continue
      netdev_count=$((netdev_count + 1))
    done
  done
done
if [ "$target_count" -eq 1 ] && [ "$control_count" -eq 1 ] && [ "$bound_count" -eq 1 ] && [ "$netdev_count" -ge 1 ]; then
  printf "%s\\n" BINDING_READY
else
  printf "%s\\n" BINDING_NOT_READY
fi
'

resolve_ready_adb() {
  if ! ADB_DEVICES_OUTPUT=$(adb devices 2>/dev/null); then
    fail 'adb devices check failed'
  fi
  DEVICE_LIST=$(printf '%s\n' "$ADB_DEVICES_OUTPUT" | tr -d '\r' | awk 'NR > 1 && $2 == "device" { print $1 }')
  DEVICE_COUNT=$(printf '%s\n' "$DEVICE_LIST" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
  [ "$DEVICE_COUNT" -eq 1 ] || fail "expected exactly one ready adb device, found $DEVICE_COUNT"
  candidate_serial=$DEVICE_LIST
  if [ -n "$DEVICE_SERIAL" ] && [ "$candidate_serial" != "$DEVICE_SERIAL" ]; then
    fail 'ready adb target changed during verification'
  fi
  DEVICE_SERIAL=$candidate_serial
}

read_module_state() {
  if ! MODULE_STATE_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell "$MODULE_STATE_PROBE" 2>/dev/null); then
    return 1
  fi
  MODULE_STATE=$(printf '%s\n' "$MODULE_STATE_OUTPUT" | tr -d '\r\n')
  case "$MODULE_STATE" in
    MODULES_ABSENT|USBNET_ONLY|MODULES_BOTH|CDC_ETHER_ONLY) return 0 ;;
    *) return 1 ;;
  esac
}

require_module_state() {
  expected_state=$1
  if ! read_module_state; then
    fail 'module state readback failed'
  fi
  [ "$MODULE_STATE" = "$expected_state" ] || fail 'unexpected USB module state'
}

validate_device_gate() {
  resolve_ready_adb

  if ! ROOT_UID_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell id -u 2>/dev/null); then
    fail 'ADB root identity check failed'
  fi
  ROOT_UID=$(printf '%s\n' "$ROOT_UID_OUTPUT" | tr -d '\r\n')
  [ "$ROOT_UID" = "0" ] || fail 'ADB target is not root'

  if ! KERNEL_RELEASE_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell uname -r 2>/dev/null); then
    fail 'device kernel release check failed'
  fi
  KERNEL_RELEASE=$(printf '%s\n' "$KERNEL_RELEASE_OUTPUT" | tr -d '\r\n')

  if ! KERNEL_UNAME_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell uname -a 2>/dev/null); then
    fail 'device kernel build identity check failed'
  fi
  KERNEL_UNAME=$(printf '%s\n' "$KERNEL_UNAME_OUTPUT" | tr -d '\r\n')
  if ! aht_validate_kernel_identity "$KERNEL_RELEASE" "$KERNEL_UNAME"; then
    fail 'kernel build identity mismatch'
  fi

  if ! OPENWRT_RELEASE_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell 'cat /etc/openwrt_release' 2>/dev/null); then
    fail 'OpenWrt release identity check failed'
  fi
  OPENWRT_RELEASE=$(printf '%s\n' "$OPENWRT_RELEASE_OUTPUT" | tr -d '\r')
  if ! aht_validate_openwrt_identity "$OPENWRT_RELEASE"; then
    fail 'OpenWrt target identity mismatch'
  fi

  if ! KERNEL_COMPAT_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell "$KERNEL_COMPAT_PROBE" 2>/dev/null); then
    fail 'target kernel compatibility probe failed'
  fi
  KERNEL_COMPAT=$(printf '%s\n' "$KERNEL_COMPAT_OUTPUT" | tr -d '\r\n')
  [ "$KERNEL_COMPAT" = "KERNEL_COMPAT_READY" ] || fail 'target kernel architecture or module configuration mismatch'

  if ! USB_IDENTITY_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell "$USB_IDENTITY_PROBE" 2>/dev/null); then
    fail 'target USB identity probe failed'
  fi
  USB_IDENTITY=$(printf '%s\n' "$USB_IDENTITY_OUTPUT" | tr -d '\r\n')
  [ "$USB_IDENTITY" = "USB_IDENTITY_READY" ] || fail 'target USB identity or CDC-ECM interface pair validation failed'
}

rollback_modules() {
  ROLLBACK_ATTEMPTED=1
  rollback_failed=0
  if [ "$ATTEMPTED_CDC_ETHER" -eq 1 ]; then
    if ! adb -s "$DEVICE_SERIAL" shell 'rmmod cdc_ether' >/dev/null 2>&1; then
      rollback_failed=1
    fi
  fi
  if [ "$ATTEMPTED_USBNET" -eq 1 ]; then
    if ! adb -s "$DEVICE_SERIAL" shell 'rmmod usbnet' >/dev/null 2>&1; then
      rollback_failed=1
    fi
  fi
  if [ "$ATTEMPTED_CDC_ETHER" -eq 1 ] || [ "$ATTEMPTED_USBNET" -eq 1 ]; then
    if ! read_module_state || [ "$MODULE_STATE" != "MODULES_ABSENT" ]; then
      rollback_failed=1
    fi
  fi
  [ "$rollback_failed" -eq 0 ]
}

remove_remote_module_files() {
  [ -n "$REMOTE_DIR" ] || return 0
  if ! adb -s "$DEVICE_SERIAL" shell "rm -f '$REMOTE_DIR/usbnet.ko' '$REMOTE_DIR/cdc_ether.ko'" >/dev/null 2>&1; then
    return 1
  fi
  if ! adb -s "$DEVICE_SERIAL" shell "rmdir '$REMOTE_DIR'" >/dev/null 2>&1; then
    return 1
  fi
  REMOTE_MODULE_FILES_REMOVED=1
  REMOTE_DIR=
  return 0
}

cleanup() {
  cleanup_status=$1
  [ "$CLEANUP_DONE" -eq 0 ] || return 0
  CLEANUP_DONE=1
  cleanup_failed=0

  if [ "$KEEP_MODULES" -eq 0 ] && { [ "$ATTEMPTED_CDC_ETHER" -eq 1 ] || [ "$ATTEMPTED_USBNET" -eq 1 ]; }; then
    if ! rollback_modules; then
      cleanup_failed=1
    fi
  fi

  if [ -n "$REMOTE_DIR" ]; then
    if ! remove_remote_module_files; then
      cleanup_failed=1
    fi
  fi

  if [ "$MUTATION_STARTED" -eq 1 ] && [ "$cleanup_status" -ne 0 ]; then
    if [ "$cleanup_failed" -eq 0 ]; then
      printf '%s\n' 'status=rollback_complete' >&2
    else
      printf '%s\n' 'status=rollback_failed' >&2
    fi
    if [ "$REMOTE_MODULE_FILES_REMOVED" -eq 1 ]; then
      printf '%s\n' 'remote_module_files=removed' >&2
    else
      printf '%s\n' 'remote_module_files=not_removed' >&2
    fi
  fi
  if [ "$cleanup_failed" -ne 0 ]; then
    CLEANUP_FAILED=1
  fi
}

on_exit() {
  exit_status=$?
  cleanup "$exit_status"
  trap - 0 1 2 3 15
  if [ "$exit_status" -eq 0 ] && [ "$CLEANUP_FAILED" -ne 0 ]; then
    exit_status=1
  fi
  exit "$exit_status"
}

on_signal() {
  signal_status=$1
  cleanup "$signal_status"
  trap - 0 1 2 3 15
  exit "$signal_status"
}

trap 'on_exit' 0
trap 'on_signal 129' 1
trap 'on_signal 130' 2
trap 'on_signal 131' 3
trap 'on_signal 143' 15

validate_device_gate
require_module_state MODULES_ABSENT

if [ "$MODE" = "--preflight" ]; then
  printf '%s\n' 'PASS: read-only A133 Tina device preflight'
  printf '%s\n' 'status=preflight_passed'
  printf '%s\n' 'module_state=absent'
  printf '%s\n' 'device_mutation=unchanged'
  exit 0
fi

REMOTE_DIR=
REMOTE_DIR_CANDIDATE="/tmp/aht-dji-cellulard-driver.$$"
if ! adb -s "$DEVICE_SERIAL" shell "mkdir '$REMOTE_DIR_CANDIDATE'" >/dev/null 2>&1; then
  fail 'remote temporary directory creation failed'
fi
REMOTE_DIR="$REMOTE_DIR_CANDIDATE"
MUTATION_STARTED=1

validate_device_gate
require_module_state MODULES_ABSENT
if ! adb -s "$DEVICE_SERIAL" push "$PACKAGE_DIR/usbnet.ko" "$REMOTE_DIR/usbnet.ko" >/dev/null 2>&1; then
  fail 'usbnet.ko push failed'
fi
if ! adb -s "$DEVICE_SERIAL" push "$PACKAGE_DIR/cdc_ether.ko" "$REMOTE_DIR/cdc_ether.ko" >/dev/null 2>&1; then
  fail 'cdc_ether.ko push failed'
fi

validate_device_gate
require_module_state MODULES_ABSENT
ATTEMPTED_USBNET=1
if ! adb -s "$DEVICE_SERIAL" shell "insmod '$REMOTE_DIR/usbnet.ko'" >/dev/null 2>&1; then
  fail 'insmod usbnet.ko failed; rollback attempted'
fi

validate_device_gate
require_module_state USBNET_ONLY
ATTEMPTED_CDC_ETHER=1
if ! adb -s "$DEVICE_SERIAL" shell "insmod '$REMOTE_DIR/cdc_ether.ko'" >/dev/null 2>&1; then
  fail 'insmod cdc_ether.ko failed; rollback attempted'
fi

validate_device_gate
require_module_state MODULES_BOTH
if ! BINDING_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell "$BINDING_READBACK_PROBE" 2>/dev/null); then
  fail 'CDC-ECM binding readback failed; rollback attempted'
fi
BINDING_STATE=$(printf '%s\n' "$BINDING_OUTPUT" | tr -d '\r\n')
[ "$BINDING_STATE" = "BINDING_READY" ] || fail 'target CDC-ECM binding or netdev readback failed; rollback attempted'

if ! remove_remote_module_files; then
  fail 'remote temporary module cleanup failed; rollback attempted'
fi

printf '%s\n' 'PASS: target identity, CDC-ECM binding, and netdev readback verified'
printf '%s\n' 'status=modules_retained'
printf '%s\n' 'remote_module_files=removed'
printf '%s\n' 'network_configuration=unchanged'
KEEP_MODULES=1
exit 0
