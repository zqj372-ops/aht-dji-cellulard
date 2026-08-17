#!/bin/sh

set -eu

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
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
      printf '%s\n' 'Usage: verify-a133-tina-network.sh --fixture FILE | --device [--dhcp]'
      printf '%s\n' '--dhcp requires AHT_ALLOW_NETWORK_MUTATION=1 and is the only network-writing mode.'
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
if [ "$DHCP" -eq 1 ] && [ "\${AHT_ALLOW_NETWORK_MUTATION:-}" != "1" ]; then
  fail 'DHCP requires AHT_ALLOW_NETWORK_MUTATION=1'
fi

fixture_value() {
  key=$1
  sed -n "s/^$key=//p" "$FIXTURE" | head -n 1
}

emit_state() {
  interface=$1
  address=$2
  default_route=$3
  gateway_probe=$4
  reason=

  if [ -z "$interface" ]; then
    reason=cellular_interface_missing
  elif [ -z "$address" ]; then
    reason=cellular_address_missing
  elif [ -z "$default_route" ]; then
    reason=default_route_missing
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
  [ -n "$address" ] && printf 'address=%s\n' "$address"
  [ -n "$default_route" ] && printf 'default_route=%s\n' "$default_route"
  printf 'gateway_probe=%s\n' "$gateway_probe"
}

if [ "$MODE" = "fixture" ]; then
  emit_state "$(fixture_value cellular_interface)" "$(fixture_value address)" \
    "$(fixture_value default_route)" "$(fixture_value gateway_probe)"
  exit 0
fi

command -v adb >/dev/null 2>&1 || fail 'adb is required for device network verification'
DEVICE_LIST=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
DEVICE_COUNT=$(printf '%s\n' "$DEVICE_LIST" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
[ "$DEVICE_COUNT" -eq 1 ] || fail "expected exactly one ready adb device, found $DEVICE_COUNT"
DEVICE_SERIAL=$DEVICE_LIST

ROOT_UID=$(adb -s "$DEVICE_SERIAL" shell id -u 2>/dev/null | tr -d '\r\n')
[ "$ROOT_UID" = "0" ] || fail 'ADB target is not root'
KERNEL_RELEASE=$(adb -s "$DEVICE_SERIAL" shell uname -r 2>/dev/null | tr -d '\r\n')
[ "$KERNEL_RELEASE" = "4.9.191" ] || fail "device kernel release mismatch: $KERNEL_RELEASE"

if [ -n "\${AHT_CELLULAR_INTERFACE:-}" ]; then
  CELLULAR_INTERFACE=$AHT_CELLULAR_INTERFACE
else
  CELLULAR_INTERFACE=$(adb -s "$DEVICE_SERIAL" shell 'ip -o link show' 2>/dev/null | tr -d '\r' | awk -F': ' '$2 ~ /^(eth|usb|enx)/ {print $2; exit}' | awk '{print $1}')
fi

if [ -z "$CELLULAR_INTERFACE" ]; then
  emit_state '' '' '' missing
  exit 0
fi

if [ "$DHCP" -eq 1 ]; then
  adb -s "$DEVICE_SERIAL" shell "udhcpc -i '$CELLULAR_INTERFACE' -n -q"
fi

ADDRESS=$(adb -s "$DEVICE_SERIAL" shell "ip -o -4 addr show dev '$CELLULAR_INTERFACE'" 2>/dev/null | tr -d '\r' | awk '$3 == "inet" {print $4; exit}')
DEFAULT_ROUTE=$(adb -s "$DEVICE_SERIAL" shell 'ip route show default' 2>/dev/null | tr -d '\r' | awk '$1 == "default" {print $3; exit}')

GATEWAY_PROBE=missing
if [ -n "\${AHT_GATEWAY_HOST:-}" ] && [ -n "$DEFAULT_ROUTE" ]; then
  if adb -s "$DEVICE_SERIAL" shell "ping -c 1 -W 3 '$AHT_GATEWAY_HOST'" >/dev/null 2>&1; then
    GATEWAY_PROBE=pass
  else
    GATEWAY_PROBE=failed
  fi
fi

emit_state "$CELLULAR_INTERFACE" "$ADDRESS" "$DEFAULT_ROUTE" "$GATEWAY_PROBE"
