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

printf '%s\n' 'PASS: network verifier fails closed without independent connectivity facts'
