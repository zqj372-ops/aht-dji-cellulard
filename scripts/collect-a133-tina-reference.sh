#!/bin/sh

set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
TARGET_DIR=${AHT_EVIDENCE_DIR:-"$REPO_ROOT/docs/verification/hardware/a133-tina-reference-01"}

if ! command -v adb >/dev/null 2>&1; then
  printf '%s\n' 'error: adb is required' >&2
  exit 1
fi

DEVICE_LIST=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
DEVICE_COUNT=$(printf '%s\n' "$DEVICE_LIST" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')

if [ "$DEVICE_COUNT" -ne 1 ]; then
  printf 'error: expected exactly one ready adb device, found %s\n' "$DEVICE_COUNT" >&2
  adb devices >&2 || true
  exit 1
fi

DEVICE_SERIAL=$DEVICE_LIST
mkdir -p "$TARGET_DIR"

normalize_file() {
  output=$1
  if command -v perl >/dev/null 2>&1; then
    perl -0pi -e 's/\r//g; s/\e\[[0-9;]*m//g; s/[ \t]+(?=\n)//g' "$output"
  else
    temporary="$output.tmp.$$"
    tr -d '\r' < "$output" | sed 's/[[:space:]]\+$//' > "$temporary" && mv "$temporary" "$output"
  fi
}

capture_shell() {
  output=$1
  label=$2
  command_text=$3
  {
    printf '# target_serial=%s\n# %s\n' "$DEVICE_SERIAL" "$label"
    adb -s "$DEVICE_SERIAL" shell "$command_text"
    status=$?
    printf '\n# adb_exit=%s\n' "$status"
  } > "$output" 2>&1 || true
  normalize_file "$output"
}

capture_config() {
  output=$1
  {
    printf '# target_serial=%s\n# source=/proc/config.gz, decompressed with zcat\n' "$DEVICE_SERIAL"
    adb -s "$DEVICE_SERIAL" shell 'if [ -r /proc/config.gz ]; then zcat /proc/config.gz; else echo CONFIG_UNAVAILABLE; exit 2; fi'
    status=$?
    printf '\n# adb_exit=%s\n' "$status"
  } > "$output" 2>&1 || true
  normalize_file "$output"
}

capture_shell "$TARGET_DIR/kernel-version.txt" "kernel identity" \
  'uname -a; echo "--- /proc/version ---"; cat /proc/version; echo "--- /proc/cmdline ---"; cat /proc/cmdline; echo "--- /etc/openwrt_release ---"; cat /etc/openwrt_release 2>/dev/null || true'

capture_config "$TARGET_DIR/kernel.config"

capture_shell "$TARGET_DIR/modules.txt" "module and kernel driver environment" \
  'echo "--- /proc/modules ---"; cat /proc/modules; echo "--- /lib/modules ---"; ls -la /lib/modules 2>/dev/null || true; find /lib/modules -maxdepth 3 -type f 2>/dev/null | sort | head -n 200; echo "--- loader tools ---"; for p in insmod modprobe depmod; do printf "%s=" "$p"; command -v "$p" 2>/dev/null || true; done; echo "--- relevant config ---"; if [ -r /proc/config.gz ]; then zcat /proc/config.gz 2>/dev/null | grep -E "CONFIG_(MODULES|MODVERSIONS|LOCALVERSION|USB_USBNET|USB_NET_|USB_SERIAL_OPTION)" || true; else echo CONFIG_UNAVAILABLE; fi; echo "--- relevant driver nodes ---"; for d in /sys/bus/usb/drivers/usbnet /sys/bus/usb/drivers/cdc_ether /sys/bus/usb/drivers/cdc_ncm /sys/bus/usb/drivers/rndis_host /sys/bus/usb/drivers/qmi_wwan /sys/bus/usb-serial/drivers/option1; do if [ -d "$d" ]; then echo PRESENT:$d; else echo MISSING:$d; fi; done'

capture_shell "$TARGET_DIR/dji-2ca3-4006-lsusb.txt" "DJI USB descriptor evidence" \
  'if command -v lsusb >/dev/null 2>&1; then lsusb -v -d 2ca3:4006; else echo "LSUSB_UNAVAILABLE: device has no lsusb"; echo "SYSFS_DESCRIPTOR_FALLBACK"; for d in /sys/bus/usb/devices/*; do [ -f "$d/idVendor" ] || continue; [ "$(cat "$d/idVendor" 2>/dev/null)" = "2ca3" ] || continue; [ "$(cat "$d/idProduct" 2>/dev/null)" = "4006" ] || continue; echo "[$d]"; for f in idVendor idProduct manufacturer product serial speed busnum devnum bDeviceClass bDeviceSubClass bDeviceProtocol; do [ -f "$d/$f" ] && printf "%s=" "$f" && cat "$d/$f"; done; for i in "$d":*; do [ -d "$i" ] || continue; echo "[$i]"; for f in bInterfaceClass bInterfaceSubClass bInterfaceProtocol interface modalias; do [ -f "$i/$f" ] && printf "%s=" "$f" && cat "$i/$f"; done; if [ -L "$i/driver" ]; then echo "driver=$(readlink "$i/driver")"; else echo driver=UNBOUND; fi; done; done; fi'

capture_shell "$TARGET_DIR/dji-2ca3-4006-dmesg.txt" "recent kernel log after DJI USB attach" \
  'dmesg | tail -n 500'

capture_shell "$TARGET_DIR/usb-devices.txt" "USB debugfs and sysfs evidence" \
  'if [ -r /sys/kernel/debug/usb/devices ]; then cat /sys/kernel/debug/usb/devices; else echo "DEBUGFS_USB_DEVICES_UNAVAILABLE"; fi; echo "--- matching sysfs device ---"; for d in /sys/bus/usb/devices/*; do [ -f "$d/idVendor" ] || continue; [ "$(cat "$d/idVendor" 2>/dev/null)" = "2ca3" ] || continue; [ "$(cat "$d/idProduct" 2>/dev/null)" = "4006" ] || continue; echo "[$d]"; find "$d" -maxdepth 2 -type f \( -name idVendor -o -name idProduct -o -name manufacturer -o -name product -o -name speed -o -name bDeviceClass -o -name bDeviceSubClass -o -name bDeviceProtocol -o -name bInterfaceClass -o -name bInterfaceSubClass -o -name bInterfaceProtocol -o -name interface -o -name modalias \) -print -exec sh -c "printf \"%s=\" \"\$1\"; cat \"\$1\"" _ {} \;; find "$d" -maxdepth 2 -type l -name driver -print -exec readlink {} \;; done; echo "--- network and device nodes ---"; cat /proc/net/dev; ls -l /dev/ttyUSB* /dev/ttyACM* /dev/cdc-wdm* /dev/wwan* 2>/dev/null || true'

printf 'evidence written to %s\n' "$TARGET_DIR"
