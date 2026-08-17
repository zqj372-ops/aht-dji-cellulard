#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
REDACTOR="$SCRIPT_DIR/../scripts/redact-a133-evidence.sh"

input=$(cat <<'EOF'
# target_serial=SECRET-DEVICE
Linux TinaLinux 4.9.191 aarch64
cmdline androidboot.serialno=SECRET-BOOT lcd=gh7003
serial=SECRET-USB
SerialNumber=SECRET-DESCRIPTOR iSerial=SECRET-I-SERIAL
descriptor serial=SECRET-DESCRIPTOR idVendor=2ca3 bInterfaceClass=02
mac=00:11:22:33:44:55 IMEI=SECRET-IMEI TRIMUIDEV@NUC
EOF
)

if ! output=$(printf '%s\n' "$input" | sh "$REDACTOR"); then
  printf '%s\n' 'FAIL: redaction helper is missing or failed' >&2
  exit 1
fi

if printf '%s\n' "$output" | grep -E 'SECRET-(DEVICE|BOOT|USB|DESCRIPTOR|I-SERIAL|IMEI)' >/dev/null 2>&1; then
  printf '%s\n' 'FAIL: sensitive fixture value survived redaction' >&2
  exit 1
fi

printf '%s\n' "$output" | grep 'Linux TinaLinux 4.9.191 aarch64' >/dev/null
printf '%s\n' "$output" | grep 'idVendor=2ca3' >/dev/null
printf '%s\n' "$output" | grep 'bInterfaceClass=02' >/dev/null
printf '%s\n' "$output" | grep 'redacted-mac' >/dev/null
printf '%s\n' "$output" | grep 'TRIMUIDEV@<redacted>' >/dev/null

FAKE_BIN=$(mktemp -d "${TMPDIR:-/tmp}/aht-collector-test.XXXXXX")
cat > "$FAKE_BIN/adb" <<'EOF'
#!/bin/sh
if [ "${1:-}" = "devices" ]; then
  printf '%s\n' 'List of devices attached'
  printf '%s\t%s\n' 'LEAK-SERIAL-ONE' 'device'
  printf '%s\t%s\n' 'LEAK-SERIAL-TWO' 'device'
  exit 0
fi
exit 1
EOF
chmod +x "$FAKE_BIN/adb"
EVIDENCE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/aht-collector-evidence.XXXXXX")
if output=$(PATH="$FAKE_BIN:$PATH" AHT_EVIDENCE_DIR="$EVIDENCE_DIR" sh "$SCRIPT_DIR/../scripts/collect-a133-tina-reference.sh" 2>&1); then
  printf '%s\n' 'FAIL: collector accepted ambiguous ADB state' >&2
  exit 1
fi
if printf '%s\n' "$output" | grep -E 'LEAK-SERIAL-(ONE|TWO)' >/dev/null 2>&1; then
  printf '%s\n' 'FAIL: collector leaked serials on ADB ambiguity' >&2
  exit 1
fi

printf '%s\n' 'PASS: collector redaction preserves non-sensitive evidence'
