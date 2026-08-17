#!/bin/sh

set -eu

usage() {
  cat <<'EOF'
Usage: AHT_KERNEL_TREE=/path/to/linux-4.9.191 \
       AHT_TARGET_CONFIG=/path/to/kernel.config \
       AHT_CROSS_COMPILE=/path/to/aarch64-elf- \
       AHT_OUTPUT_DIR=/path/to/package \
       scripts/build-a133-tina-usb-modules.sh

The builder is host-only. It never contacts ADB or changes a device.
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

KERNEL_TREE=${AHT_KERNEL_TREE:-}
TARGET_CONFIG=${AHT_TARGET_CONFIG:-}
CROSS_COMPILE=${AHT_CROSS_COMPILE:-}
OUTPUT_DIR=${AHT_OUTPUT_DIR:-}

[ -n "$KERNEL_TREE" ] || fail 'AHT_KERNEL_TREE is required'
[ -d "$KERNEL_TREE" ] && [ -f "$KERNEL_TREE/Makefile" ] || fail "kernel tree is missing or invalid: $KERNEL_TREE"

KERNEL_RELEASE=$(make -s -C "$KERNEL_TREE" kernelversion 2>/dev/null || true)
[ "$KERNEL_RELEASE" = "4.9.191" ] || fail "kernel tree reports $KERNEL_RELEASE; expected 4.9.191"

[ -n "$TARGET_CONFIG" ] || fail 'AHT_TARGET_CONFIG is required'
[ -r "$TARGET_CONFIG" ] || fail "target config is missing or unreadable: $TARGET_CONFIG"

[ -n "$CROSS_COMPILE" ] || fail 'AHT_CROSS_COMPILE must name a cross compiler prefix'
CC="${CROSS_COMPILE}gcc"
READELF="${AHT_READELF:-${CROSS_COMPILE}readelf}"
command -v "$CC" >/dev/null 2>&1 || fail "cross compiler executable is missing: $CC"
command -v "$READELF" >/dev/null 2>&1 || fail "ELF reader executable is missing: $READELF"

COMPILER_MACHINE=$($CC -dumpmachine 2>/dev/null || true)
case "$COMPILER_MACHINE" in
  aarch64*) ;;
  *) fail "cross compiler must target AArch64; got $COMPILER_MACHINE" ;;
esac

[ -n "$OUTPUT_DIR" ] || fail 'AHT_OUTPUT_DIR is required'
if [ -e "$OUTPUT_DIR" ]; then
  [ -d "$OUTPUT_DIR" ] || fail "output path is not a directory: $OUTPUT_DIR"
  [ -z "$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ] || fail "output directory must be empty: $OUTPUT_DIR"
else
  mkdir -p "$OUTPUT_DIR"
fi

BUILD_DIR=${AHT_BUILD_DIR:-"$OUTPUT_DIR.kernel-build"}
if [ -e "$BUILD_DIR" ]; then
  [ -d "$BUILD_DIR" ] || fail "build path is not a directory: $BUILD_DIR"
  [ -z "$(find "$BUILD_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ] || fail "build directory must be empty: $BUILD_DIR"
else
  mkdir -p "$BUILD_DIR"
fi

HOST_CFLAGS=${AHT_HOST_CFLAGS:-}
kernel_make() {
  if [ -n "$HOST_CFLAGS" ]; then
    make -C "$KERNEL_TREE" O="$BUILD_DIR" ARCH=arm64 CROSS_COMPILE="$CROSS_COMPILE" HOSTCFLAGS="$HOST_CFLAGS" "$@"
  else
    make -C "$KERNEL_TREE" O="$BUILD_DIR" ARCH=arm64 CROSS_COMPILE="$CROSS_COMPILE" "$@"
  fi
}

cp "$TARGET_CONFIG" "$BUILD_DIR/.config"
bash "$KERNEL_TREE/scripts/config" --file "$BUILD_DIR/.config" \
  --module USB_USBNET \
  --module USB_NET_CDCETHER \
  --disable MODVERSIONS

kernel_make olddefconfig
kernel_make modules_prepare
kernel_make drivers/net/usb/usbnet.ko drivers/net/usb/cdc_ether.ko

find_module() {
  name=$1
  find "$BUILD_DIR" -type f -name "$name" -print -quit
}

USBNET_MODULE=$(find_module usbnet.ko)
CDC_ETHER_MODULE=$(find_module cdc_ether.ko)
[ -n "$USBNET_MODULE" ] || fail 'build did not produce usbnet.ko'
[ -n "$CDC_ETHER_MODULE" ] || fail 'build did not produce cdc_ether.ko'

case "$($READELF -h "$USBNET_MODULE")" in
  *AArch64*) ;;
  *) fail 'usbnet.ko is not an AArch64 ELF module' ;;
esac
case "$($READELF -h "$CDC_ETHER_MODULE")" in
  *AArch64*) ;;
  *) fail 'cdc_ether.ko is not an AArch64 ELF module' ;;
esac

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

USB_NET_HASH=$(hash_file "$USBNET_MODULE")
CDC_ETHER_HASH=$(hash_file "$CDC_ETHER_MODULE")
CONFIG_HASH=$(hash_file "$BUILD_DIR/.config")
TOOLCHAIN_VERSION=$($CC --version | head -n 1)
SOURCE_ID=${AHT_KERNEL_SOURCE_ID:-"linux-$KERNEL_RELEASE"}
SOURCE_ARCHIVE_SHA256=${AHT_KERNEL_SOURCE_SHA256:-unrecorded}
USBNET_VERMAGIC=$($READELF -p .modinfo "$USBNET_MODULE" | sed -n 's/.*vermagic=//p' | head -n 1)
CDC_ETHER_VERMAGIC=$($READELF -p .modinfo "$CDC_ETHER_MODULE" | sed -n 's/.*vermagic=//p' | head -n 1)
CDC_ETHER_ALIAS=$(strings "$CDC_ETHER_MODULE" | sed -n 's/^alias=//p' | grep 'ic02isc06ip00in' | head -n 1)
case "$CDC_ETHER_ALIAS" in
  *ic02isc06ip00in*) ;;
  *) fail 'cdc_ether.ko has no generic CDC-ECM control-interface alias' ;;
esac

cp "$USBNET_MODULE" "$OUTPUT_DIR/usbnet.ko"
cp "$CDC_ETHER_MODULE" "$OUTPUT_DIR/cdc_ether.ko"

{
  printf '{\n'
  printf '  "schema_version": 1,\n'
  printf '  "target_kernel_release": "%s",\n' "$KERNEL_RELEASE"
  printf '  "arch": "arm64",\n'
  printf '  "source_id": "%s",\n' "$(json_escape "$SOURCE_ID")"
  printf '  "source_archive_sha256": "%s",\n' "$(json_escape "$SOURCE_ARCHIVE_SHA256")"
  printf '  "config_sha256": "%s",\n' "$CONFIG_HASH"
  printf '  "compiler_machine": "%s",\n' "$COMPILER_MACHINE"
  printf '  "toolchain_version": "%s",\n' "$(json_escape "$TOOLCHAIN_VERSION")"
  printf '  "host_cflags": "%s",\n' "$(json_escape "$HOST_CFLAGS")"
  printf '  "target_usb_vid": "2ca3",\n'
  printf '  "target_usb_pid": "4006",\n'
  printf '  "cdc_ether_alias": "%s",\n' "$(json_escape "$CDC_ETHER_ALIAS")"
  printf '  "config_usb_usbnet": "m",\n'
  printf '  "config_usb_net_cdcether": "m",\n'
  printf '  "config_modversions": "n",\n'
  printf '  "modules": {\n'
  printf '    "usbnet.ko": {"sha256": "%s", "vermagic": "%s"},\n' "$USB_NET_HASH" "$(json_escape "$USBNET_VERMAGIC")"
  printf '    "cdc_ether.ko": {"sha256": "%s", "vermagic": "%s"}\n' "$CDC_ETHER_HASH" "$(json_escape "$CDC_ETHER_VERMAGIC")"
  printf '  }\n'
  printf '}\n'
} > "$OUTPUT_DIR/manifest.json"

(
  cd "$OUTPUT_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum usbnet.ko cdc_ether.ko manifest.json > SHA256SUMS
  else
    shasum -a 256 usbnet.ko cdc_ether.ko manifest.json > SHA256SUMS
  fi
)

printf 'package written to %s\n' "$OUTPUT_DIR"
