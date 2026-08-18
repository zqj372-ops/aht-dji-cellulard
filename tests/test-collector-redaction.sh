#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
REDACTOR="$SCRIPT_DIR/../scripts/redact-a133-evidence.sh"

input=$(cat <<'EOF'
# target_serial=SECRET-DEVICE
Linux TinaLinux 4.9.191 aarch64
cmdline androidboot.serialno=SECRET-BOOT lcd=gh7003
serial=SECRET-USB
descriptor serial=SECRET-DESCRIPTOR idVendor=2ca3 bInterfaceClass=02
EOF
)

if ! output=$(printf '%s\n' "$input" | sh "$REDACTOR"); then
  printf '%s\n' 'FAIL: redaction helper is missing or failed' >&2
  exit 1
fi

if printf '%s\n' "$output" | grep -E 'SECRET-(DEVICE|BOOT|USB|DESCRIPTOR)' >/dev/null 2>&1; then
  printf '%s\n' 'FAIL: sensitive fixture value survived redaction' >&2
  exit 1
fi

printf '%s\n' "$output" | grep 'Linux TinaLinux 4.9.191 aarch64' >/dev/null
printf '%s\n' "$output" | grep 'idVendor=2ca3' >/dev/null
printf '%s\n' "$output" | grep 'bInterfaceClass=02' >/dev/null

printf '%s\n' 'PASS: collector redaction preserves non-sensitive evidence'
