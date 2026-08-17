#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
VERIFIER="$SCRIPT_DIR/../scripts/verify-a133-tina-network.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/aht-network-test.XXXXXX")

printf '%s\n' \
  'cellular_interface=' \
  'address=' \
  'default_route=' \
  'gateway_probe=missing' \
  > "$TEST_ROOT/degraded.fixture"
if ! output=$(bash "$VERIFIER" --fixture "$TEST_ROOT/degraded.fixture" 2>&1); then
  printf '%s\n' 'FAIL: degraded fixture should be a valid read-only observation' >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=degraded$' >/dev/null

printf '%s\n' \
  'cellular_interface=cdc-ecm0' \
  'address=10.23.0.2/24' \
  'default_route=default via 10.23.0.1 dev cdc-ecm0' \
  'default_route_interface=cdc-ecm0' \
  'cdc_ether_binding=present' \
  'dns_status=configured' \
  'gateway_probe=pass' \
  > "$TEST_ROOT/connected.fixture"
if ! output=$(sh "$VERIFIER" --fixture "$TEST_ROOT/connected.fixture" 2>&1); then
  printf '%s\n' 'FAIL: connected fixture should be a valid read-only observation' >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=connected$' >/dev/null
printf '%s\n' "$output" | grep '^interface=cdc-ecm0$' >/dev/null
printf '%s\n' "$output" | grep '^address=present$' >/dev/null
printf '%s\n' "$output" | grep '^default_route=present$' >/dev/null
printf '%s\n' "$output" | grep '^dns=configured$' >/dev/null
if printf '%s\n' "$output" | grep '10\.23\.0\.2\|10\.23\.0\.1' >/dev/null; then
  printf '%s\n' 'FAIL: address and route details must not be emitted' >&2
  exit 1
fi

printf '%s\n' \
  'cellular_interface=cdc-ecm0' \
  'address=10.23.0.2/24' \
  'default_route=default via 10.23.0.1 dev wlan0' \
  'default_route_interface=wlan0' \
  'cdc_ether_binding=present' \
  'dns_status=configured' \
  'gateway_probe=pass' \
  > "$TEST_ROOT/wrong-route.fixture"
if ! output=$(sh "$VERIFIER" --fixture "$TEST_ROOT/wrong-route.fixture" 2>&1); then
  printf '%s\n' 'FAIL: wrong-route fixture should remain degraded, not error' >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=degraded$' >/dev/null
printf '%s\n' "$output" | grep '^reason=default_route_mismatch$' >/dev/null

printf '%s\n' \
  'cellular_interface=wlan0' \
  'address=10.23.0.2/24' \
  'default_route=default via 10.23.0.1 dev wlan0' \
  'default_route_interface=wlan0' \
  'cdc_ether_binding=absent' \
  'dns_status=configured' \
  'gateway_probe=pass' \
  > "$TEST_ROOT/arbitrary-interface.fixture"
if ! output=$(sh "$VERIFIER" --fixture "$TEST_ROOT/arbitrary-interface.fixture" 2>&1); then
  printf '%s\n' 'FAIL: arbitrary-interface fixture should be rejected as degraded' >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=degraded$' >/dev/null
printf '%s\n' "$output" | grep '^reason=cdc_ether_binding_missing$' >/dev/null

if output=$(sh "$VERIFIER" --device --dhcp 2>&1); then
  printf '%s\n' 'FAIL: DHCP was allowed without network mutation flag' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'AHT_ALLOW_NETWORK_MUTATION=1' >/dev/null

FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/adb" <<'EOF'
#!/bin/sh

if [ -n "${FAKE_ADB_LOG:-}" ]; then
  printf 'argv=%s\n' "$*" >> "$FAKE_ADB_LOG"
fi

if [ "${1:-}" = "devices" ]; then
  printf '%s\n' 'List of devices attached'
  printf '%s\t%s\n' 'fixture-device' 'device'
  exit 0
fi

if [ "${1:-}" = "-s" ] && [ "${3:-}" = "shell" ]; then
  shift 3
  command=$*
  case "$command" in
    'id -u') printf '%s\n' '0' ;;
    'uname -r') printf '%s\n' '4.9.191' ;;
    *'/etc/openwrt_release'*) printf '%s\n' "DISTRIB_TARGET='a133-aw3/generic v1.0'" ;;
    *'/sys/bus/usb/devices/'*)
      if [ "${FAKE_TARGET_MODE:-ready}" = "not-ready" ]; then
        printf '%s\n' 'TARGET_CDC_NETDEV_NOT_READY'
      else
        printf '%s\n' 'TARGET_CDC_NETDEV=cdc0'
      fi
      ;;
    *'udhcpc -i cdc0 -n -q'*) exit 0 ;;
    *'ip -o -4 addr show dev cdc0'*) printf '%s\n' '5: cdc0    inet 10.23.0.2/24 brd 10.23.0.255 scope global cdc0' ;;
    *'ip -o route show default'*)
      if [ "${FAKE_ROUTE_MODE:-ok}" = "wrong" ]; then
        printf '%s\n' 'default via 10.23.0.1 dev wlan0'
      else
        printf '%s\n' 'default via 10.23.0.1 dev cdc0'
      fi
      ;;
    *'resolv.conf'*) printf '%s\n' 'nameserver 10.23.0.1' ;;
    *'ping -I cdc0 -c 1 -W 3 gateway.example'*) exit 0 ;;
    *) exit 1 ;;
  esac
  exit 0
fi

exit 1
EOF
chmod +x "$FAKE_BIN/adb"

FAKE_LOG="$TEST_ROOT/adb.log"
: > "$FAKE_LOG"
if ! output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$FAKE_LOG" \
  AHT_ALLOW_NETWORK_MUTATION=1 \
  AHT_CELLULAR_INTERFACE=cdc0 \
  AHT_GATEWAY_HOST=gateway.example \
  sh "$VERIFIER" --device 2>&1
); then
  printf '%s\n' 'FAIL: read-only device verification should succeed without a mutation-flag error' >&2
  printf '%s\n' "$output" >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=connected$' >/dev/null
printf '%s\n' "$output" | grep '^interface=cdc0$' >/dev/null
printf '%s\n' "$output" | grep '^cdc_ether_binding=present$' >/dev/null
printf '%s\n' "$output" | grep '^dns=configured$' >/dev/null
if grep 'udhcpc' "$FAKE_LOG" >/dev/null; then
  printf '%s\n' 'FAIL: default device mode must not run DHCP' >&2
  exit 1
fi
if printf '%s\n' "$output" | grep '10\.23\.0\.2\|10\.23\.0\.1\|gateway\.example' >/dev/null; then
  printf '%s\n' 'FAIL: device output must not expose address, route, or gateway host' >&2
  exit 1
fi

: > "$FAKE_LOG"
if ! output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$FAKE_LOG" \
  FAKE_TARGET_MODE=not-ready \
  AHT_CELLULAR_INTERFACE=cdc0 \
  AHT_GATEWAY_HOST=gateway.example \
  sh "$VERIFIER" --device 2>&1
); then
  printf '%s\n' 'FAIL: missing target binding should be an observed degraded state' >&2
  printf '%s\n' "$output" >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=degraded$' >/dev/null
printf '%s\n' "$output" | grep '^reason=cdc_ether_binding_missing$' >/dev/null
if grep -E 'ip -o|ping -I|udhcpc' "$FAKE_LOG" >/dev/null; then
  printf '%s\n' 'FAIL: missing target binding must stop before network probes' >&2
  exit 1
fi

: > "$FAKE_LOG"
if ! output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$FAKE_LOG" \
  AHT_ALLOW_NETWORK_MUTATION=1 \
  AHT_CELLULAR_INTERFACE=cdc0 \
  AHT_GATEWAY_HOST=gateway.example \
  sh "$VERIFIER" --device --dhcp 2>&1
); then
  printf '%s\n' 'FAIL: authorized DHCP device fixture should complete' >&2
  printf '%s\n' "$output" >&2
  exit 1
fi
grep 'udhcpc -i cdc0 -n -q' "$FAKE_LOG" >/dev/null
grep 'ping -I cdc0' "$FAKE_LOG" >/dev/null

: > "$FAKE_LOG"
if output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$FAKE_LOG" \
  AHT_CELLULAR_INTERFACE='cdc0;id' \
  AHT_GATEWAY_HOST=gateway.example \
  sh "$VERIFIER" --device 2>&1
); then
  printf '%s\n' 'FAIL: unsafe interface input should be rejected' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'unsafe' >/dev/null
[ ! -s "$FAKE_LOG" ]

if output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$FAKE_LOG" \
  AHT_CELLULAR_INTERFACE=cdc0 \
  AHT_GATEWAY_HOST='gateway.example;id' \
  sh "$VERIFIER" --device 2>&1
); then
  printf '%s\n' 'FAIL: unsafe gateway input should be rejected' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'unsafe' >/dev/null
[ ! -s "$FAKE_LOG" ]

if output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$FAKE_LOG" \
  AHT_CELLULAR_INTERFACE=wlan0 \
  AHT_GATEWAY_HOST=gateway.example \
  sh "$VERIFIER" --device 2>&1
); then
  printf '%s\n' 'FAIL: arbitrary Wi-Fi interface should be rejected' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'target CDC-ECM netdev' >/dev/null

: > "$FAKE_LOG"
if ! output=$(
  PATH="$FAKE_BIN:$PATH" \
  FAKE_ADB_LOG="$FAKE_LOG" \
  FAKE_ROUTE_MODE=wrong \
  AHT_CELLULAR_INTERFACE=cdc0 \
  AHT_GATEWAY_HOST=gateway.example \
  sh "$VERIFIER" --device 2>&1
); then
  printf '%s\n' 'FAIL: wrong route should be an observed degraded state' >&2
  printf '%s\n' "$output" >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=degraded$' >/dev/null
printf '%s\n' "$output" | grep '^reason=default_route_mismatch$' >/dev/null
if grep 'ping -I' "$FAKE_LOG" >/dev/null; then
  printf '%s\n' 'FAIL: Gateway ping must not run when the default route uses another interface' >&2
  exit 1
fi

printf '%s\n' 'PASS: network verifier fails closed without independent connectivity facts'
