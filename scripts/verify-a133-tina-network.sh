#!/bin/sh

set -eu

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' 'Usage: verify-a133-tina-network.sh --fixture FILE | --device [--dhcp]'
  printf '%s\n' '--dhcp requires AHT_ALLOW_NETWORK_MUTATION=1 and is the only network-writing mode.'
}

validate_interface_value() {
  value=$1
  case "$value" in
    ''|*[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-]*)
      fail 'unsafe cellular interface value'
      ;;
  esac
}

validate_gateway_value() {
  value=$1
  case "$value" in
    ''|*[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.:-]*)
      fail 'unsafe Gateway host value'
      ;;
  esac
}

FIXTURE=
MODE=
DHCP=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --fixture)
      [ "$#" -ge 2 ] || fail '--fixture requires a file'
      FIXTURE=$2
      MODE=fixture
      shift 2
      ;;
    --device)
      MODE=device
      shift
      ;;
    --dhcp)
      DHCP=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[ -n "$MODE" ] || fail 'choose --fixture or --device'
if [ "$MODE" = "fixture" ]; then
  [ "$DHCP" -eq 0 ] || fail '--dhcp is only valid with --device'
  [ -r "$FIXTURE" ] || fail "network fixture is missing: $FIXTURE"
fi

ALLOW_NETWORK_MUTATION=$(env | sed -n 's/^AHT_ALLOW_NETWORK_MUTATION=//p' | head -n 1)
if [ "$DHCP" -eq 1 ] && [ "$ALLOW_NETWORK_MUTATION" != "1" ]; then
  fail 'DHCP requires AHT_ALLOW_NETWORK_MUTATION=1'
fi

CELLULAR_ENV=$(env | sed -n 's/^AHT_CELLULAR_INTERFACE=//p' | head -n 1)
GATEWAY_ENV=$(env | sed -n 's/^AHT_GATEWAY_HOST=//p' | head -n 1)

# Validate caller-controlled values before invoking ADB so an unsafe value
# cannot reach a remote shell in the default read-only mode.
if [ -n "$CELLULAR_ENV" ]; then
  validate_interface_value "$CELLULAR_ENV"
fi
if [ -n "$GATEWAY_ENV" ]; then
  validate_gateway_value "$GATEWAY_ENV"
fi

fixture_value() {
  key=$1
  sed -n "s/^$key=//p" "$FIXTURE" | head -n 1
}

route_interface() {
  printf '%s\n' "$1" | awk '
    $1 == "default" {
      for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit }
    }'
}

emit_state() {
  interface=$1
  address=$2
  default_route=$3
  default_route_iface=$4
  dns_status=$5
  cdc_binding=$6
  gateway_probe=$7
  reason=

  if [ "$cdc_binding" != "present" ]; then
    reason=cdc_ether_binding_missing
  elif [ -z "$interface" ]; then
    reason=cellular_interface_missing
  elif [ -z "$address" ]; then
    reason=cellular_address_missing
  elif [ -z "$default_route" ]; then
    reason=default_route_missing
  elif [ -z "$default_route_iface" ] || [ "$default_route_iface" != "$interface" ]; then
    reason=default_route_mismatch
  elif [ "$dns_status" != "configured" ]; then
    reason=dns_config_missing
  elif [ "$gateway_probe" != "pass" ]; then
    reason=gateway_probe_missing_or_failed
  fi

  if [ -n "$reason" ]; then
    printf 'state=degraded\n'
    printf 'reason=%s\n' "$reason"
  else
    printf 'state=connected\n'
  fi
  [ -n "$interface" ] && printf 'interface=%s\n' "$interface"
  [ -n "$address" ] && printf 'address=present\n'
  [ -n "$default_route" ] && printf 'default_route=present\n'
  [ -n "$dns_status" ] && printf 'dns=%s\n' "$dns_status"
  printf 'cdc_ether_binding=%s\n' "$cdc_binding"
  printf 'gateway_probe=%s\n' "$gateway_probe"
}

if [ "$MODE" = "fixture" ]; then
  fixture_interface=$(fixture_value cellular_interface)
  fixture_address=$(fixture_value address)
  fixture_route=$(fixture_value default_route)
  fixture_route_iface=$(fixture_value default_route_interface)
  [ -n "$fixture_route_iface" ] || fixture_route_iface=$(route_interface "$fixture_route")
  fixture_dns=$(fixture_value dns_status)
  fixture_binding=$(fixture_value cdc_ether_binding)
  # Older fixtures predate the explicit binding field; retain their shape
  # while requiring the field for the stricter arbitrary-interface fixture.
  [ -n "$fixture_binding" ] || fixture_binding=present
  fixture_probe=$(fixture_value gateway_probe)
  emit_state "$fixture_interface" "$fixture_address" "$fixture_route" \
    "$fixture_route_iface" "$fixture_dns" "$fixture_binding" "$fixture_probe"
  exit 0
fi

command -v adb >/dev/null 2>&1 || fail 'adb is required for device network verification'

if ! ADB_DEVICES_OUTPUT=$(adb devices 2>/dev/null); then
  fail 'adb devices check failed'
fi
DEVICE_LIST=$(printf '%s\n' "$ADB_DEVICES_OUTPUT" | tr -d '\r' | awk 'NR > 1 && $2 == "device" { print $1 }')
DEVICE_COUNT=$(printf '%s\n' "$DEVICE_LIST" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
[ "$DEVICE_COUNT" -eq 1 ] || fail "expected exactly one ready adb device, found $DEVICE_COUNT"
DEVICE_SERIAL=$DEVICE_LIST

ROOT_UID=$(adb -s "$DEVICE_SERIAL" shell id -u 2>/dev/null | tr -d '\r\n')
[ "$ROOT_UID" = "0" ] || fail 'ADB target is not root'
KERNEL_RELEASE=$(adb -s "$DEVICE_SERIAL" shell uname -r 2>/dev/null | tr -d '\r\n')
[ "$KERNEL_RELEASE" = "4.9.191" ] || fail 'device kernel release mismatch'

OPENWRT_RELEASE=$(adb -s "$DEVICE_SERIAL" shell 'cat /etc/openwrt_release' 2>/dev/null | tr -d '\r')
if ! printf '%s\n' "$OPENWRT_RELEASE" | awk -F= '
  BEGIN { single = sprintf("%c", 39); double = sprintf("%c", 34) }
  $1 == "DISTRIB_TARGET" {
    value = $2
    if (substr(value, 1, 1) == single || substr(value, 1, 1) == double) value = substr(value, 2)
    if (substr(value, length(value), 1) == single || substr(value, length(value), 1) == double) value = substr(value, 1, length(value) - 1)
    if (value == "a133-aw3/generic" || value == "a133-aw3/generic v1.0") found = 1
  }
  END { exit(found ? 0 : 1) }
'; then
  fail 'OpenWrt target identity mismatch'
fi

TARGET_NETDEV_PROBE='
# AHT_TARGET_CDC_NETDEV_PROBE
target_count=0
binding_count=0
netdev_count=0
target_netdev=
for device in /sys/bus/usb/devices/*; do
  [ -f "$device/idVendor" ] || continue
  [ -f "$device/idProduct" ] || continue
  [ "$(cat "$device/idVendor" 2>/dev/null)" = "2ca3" ] || continue
  [ "$(cat "$device/idProduct" 2>/dev/null)" = "4006" ] || continue
  target_count=$((target_count + 1))
  for interface in "$device":*; do
    [ -d "$interface" ] || continue
    [ "$(cat "$interface/bInterfaceClass" 2>/dev/null)" = "02" ] || continue
    [ "$(cat "$interface/bInterfaceSubClass" 2>/dev/null)" = "06" ] || continue
    [ -L "$interface/driver" ] || continue
    driver=$(readlink "$interface/driver" 2>/dev/null || true)
    case "$driver" in cdc_ether|*/cdc_ether) ;; *) continue ;; esac
    binding_count=$((binding_count + 1))
    for netdev in "$interface"/net/*; do
      [ -d "$netdev" ] || continue
      netdev_count=$((netdev_count + 1))
      target_netdev=$(basename "$netdev")
    done
  done
done
if [ "$target_count" -eq 1 ] && [ "$binding_count" -eq 1 ] && [ "$netdev_count" -eq 1 ]; then
  printf "%s\\n" "TARGET_CDC_NETDEV=$target_netdev"
else
  printf "%s\\n" TARGET_CDC_NETDEV_NOT_READY
fi
'

if ! TARGET_NETDEV_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell "$TARGET_NETDEV_PROBE" 2>/dev/null); then
  fail 'target CDC-ECM netdev probe failed'
fi
TARGET_NETDEV=$(printf '%s\n' "$TARGET_NETDEV_OUTPUT" | tr -d '\r' | sed -n 's/^TARGET_CDC_NETDEV=//p' | head -n 1)
if [ -z "$TARGET_NETDEV" ]; then
  emit_state '' '' '' '' '' absent missing
  exit 0
fi
validate_interface_value "$TARGET_NETDEV"

if [ -n "$CELLULAR_ENV" ]; then
  CELLULAR_INTERFACE=$CELLULAR_ENV
  [ "$CELLULAR_INTERFACE" = "$TARGET_NETDEV" ] || fail 'target CDC-ECM netdev does not match AHT_CELLULAR_INTERFACE'
else
  CELLULAR_INTERFACE=$TARGET_NETDEV
fi

if [ "$DHCP" -eq 1 ]; then
  if ! adb -s "$DEVICE_SERIAL" shell "udhcpc -i $CELLULAR_INTERFACE -n -q" >/dev/null 2>&1; then
    emit_state "$CELLULAR_INTERFACE" '' '' '' '' present failed
    exit 0
  fi
fi

ADDRESS=$(adb -s "$DEVICE_SERIAL" shell "ip -o -4 addr show dev $CELLULAR_INTERFACE" 2>/dev/null | tr -d '\r' | awk '$3 == "inet" { print $4; exit }')
DEFAULT_ROUTE=$(adb -s "$DEVICE_SERIAL" shell 'ip -o route show default' 2>/dev/null | tr -d '\r' | awk '$1 == "default" { print; exit }')
DEFAULT_ROUTE_INTERFACE=$(route_interface "$DEFAULT_ROUTE")
DNS_OUTPUT=$(adb -s "$DEVICE_SERIAL" shell 'cat /etc/resolv.conf 2>/dev/null' 2>/dev/null | tr -d '\r')
DNS_STATUS=missing
if printf '%s\n' "$DNS_OUTPUT" | grep -Eq '(^|[[:space:]])nameserver[[:space:]]+'; then
  DNS_STATUS=configured
fi

GATEWAY_PROBE=missing
if [ -n "$GATEWAY_ENV" ] && [ "$DEFAULT_ROUTE_INTERFACE" = "$CELLULAR_INTERFACE" ]; then
  if adb -s "$DEVICE_SERIAL" shell "ping -I $CELLULAR_INTERFACE -c 1 -W 3 $GATEWAY_ENV" >/dev/null 2>&1; then
    GATEWAY_PROBE=pass
  else
    GATEWAY_PROBE=failed
  fi
fi

emit_state "$CELLULAR_INTERFACE" "$ADDRESS" "$DEFAULT_ROUTE" \
  "$DEFAULT_ROUTE_INTERFACE" "$DNS_STATUS" present "$GATEWAY_PROBE"
