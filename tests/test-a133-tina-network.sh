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
  'cellular_interface=eth2' \
  'address=10.23.0.2/24' \
  'default_route=10.23.0.1' \
  'gateway_probe=pass' \
  > "$TEST_ROOT/connected.fixture"
if ! output=$(bash "$VERIFIER" --fixture "$TEST_ROOT/connected.fixture" 2>&1); then
  printf '%s\n' 'FAIL: connected fixture should be a valid read-only observation' >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=connected$' >/dev/null
printf '%s\n' "$output" | grep '^interface=eth2$' >/dev/null

printf '%s\n' \
  'cellular_interface=eth2' \
  'address=10.23.0.2/24' \
  'default_route=' \
  'gateway_probe=pass' \
  > "$TEST_ROOT/usb-only.fixture"
if ! output=$(bash "$VERIFIER" --fixture "$TEST_ROOT/usb-only.fixture" 2>&1); then
  printf '%s\n' 'FAIL: USB-only fixture should remain degraded, not error' >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=degraded$' >/dev/null

if output=$(bash "$VERIFIER" --device --dhcp 2>&1); then
  printf '%s\n' 'FAIL: DHCP was allowed without network mutation flag' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'AHT_ALLOW_NETWORK_MUTATION=1' >/dev/null

FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/adb" <<'EOF'
#!/bin/sh

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
    'udhcpc -i '\''usb9'\'' -n -q') exit 0 ;;
    'ip -o -4 addr show dev '\''usb9'\''' ) printf '%s\n' '5: usb9    inet 10.23.0.2/24 brd 10.23.0.255 scope global usb9' ;;
    'ip route show default') printf '%s\n' 'default via 10.23.0.1 dev usb9' ;;
    'ping -c 1 -W 3 '\''gateway.example'\''' ) exit 0 ;;
    *) exit 1 ;;
  esac
  exit 0
fi

exit 1
EOF
chmod +x "$FAKE_BIN/adb"

if ! output=$(
  PATH="$FAKE_BIN:$PATH" \
  AHT_ALLOW_NETWORK_MUTATION=1 \
  AHT_CELLULAR_INTERFACE=usb9 \
  AHT_GATEWAY_HOST=gateway.example \
  bash "$VERIFIER" --device --dhcp 2>&1
); then
  printf '%s\n' 'FAIL: authorized device fixture should complete without a mutation-flag error' >&2
  printf '%s\n' "$output" >&2
  exit 1
fi
printf '%s\n' "$output" | grep '^state=connected$' >/dev/null
printf '%s\n' "$output" | grep '^interface=usb9$' >/dev/null

printf '%s\n' 'PASS: network verifier fails closed without independent connectivity facts'
