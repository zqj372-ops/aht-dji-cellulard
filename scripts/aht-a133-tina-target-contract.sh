#!/bin/sh

# Shared, fail-closed identity contract for the confirmed A133 Tina reference
# target. This file is sourced by the device verifiers; it is not executed on
# the target and must not be treated as a replacement for a kernel ABI proof.

AHT_TARGET_KERNEL_RELEASE=4.9.191
AHT_TARGET_KERNEL_BUILD_ID=913
AHT_TARGET_DISTRIB_ID=tina.raymanfeng.20260717.090727
AHT_TARGET_DISTRIB_REVISION=5C1C9C53
AHT_TARGET_DISTRIB_TARGET='a133-aw3/generic v1.0'
AHT_TARGET_RUNTIME_CONFIG_SHA256=f3458be0acf7070ae0c454bfccdf21484543ab479ca764adb84e20529832fb288
AHT_TARGET_USB_VID=2ca3
AHT_TARGET_USB_PID=4006

aht_openwrt_value() {
  key=$1
  release_text=$2
  printf '%s\n' "$release_text" | awk -F= -v wanted="$key" '
    BEGIN { single = sprintf("%c", 39); double = sprintf("%c", 34) }
    $1 == wanted {
      value = $0
      sub(/^[^=]*=/, "", value)
      if (substr(value, 1, 1) == single || substr(value, 1, 1) == double) value = substr(value, 2)
      if (substr(value, length(value), 1) == single || substr(value, length(value), 1) == double) value = substr(value, 1, length(value) - 1)
      print value
      exit
    }
  '
}

aht_validate_kernel_identity() {
  kernel_release=$1
  kernel_uname=$2
  [ "$kernel_release" = "$AHT_TARGET_KERNEL_RELEASE" ] || return 1
  printf '%s\n' "$kernel_uname" | grep -Eq "(^|[[:space:]])#$AHT_TARGET_KERNEL_BUILD_ID([[:space:]]|$)"
}

aht_validate_openwrt_identity() {
  release_text=$1
  [ "$(aht_openwrt_value DISTRIB_ID "$release_text")" = "$AHT_TARGET_DISTRIB_ID" ] || return 1
  [ "$(aht_openwrt_value DISTRIB_REVISION "$release_text")" = "$AHT_TARGET_DISTRIB_REVISION" ] || return 1
  [ "$(aht_openwrt_value DISTRIB_TARGET "$release_text")" = "$AHT_TARGET_DISTRIB_TARGET" ] || return 1
}
