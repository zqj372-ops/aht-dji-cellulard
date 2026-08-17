#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
ACCEPT="$SCRIPT_DIR/../scripts/accept-a133-tina-phase-10.sh"
PACKAGE_DIR="$SCRIPT_DIR/../artifacts/a133-tina-reference-01"
TEST_ROOT=$(mktemp -d "/tmp/aht-accept-test.XXXXXX")
FAKE_BIN="$TEST_ROOT/bin"
FAKE_ADB_LOG="$TEST_ROOT/adb.log"
FAKE_SH_LOG="$TEST_ROOT/sh.log"
FAKE_ADB_STATE="$TEST_ROOT/adb-state"
ORIGINAL_PATH=$PATH

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup 0 1 2 3 15

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_line() {
  expected=$1
  file=$2
  grep -F "$expected" "$file" >/dev/null || fail "missing '$expected' in $file"
}

assert_no_line() {
  forbidden=$1
  file=$2
  if grep -F "$forbidden" "$file" >/dev/null 2>&1; then
    fail "unexpected '$forbidden' in $file"
  fi
}

assert_evidence_files() {
  evidence_dir=$1
  for name in summary.env package-static.env device-preflight.env device-load.env network.env; do
    [ -f "$evidence_dir/$name" ] || fail "missing evidence file: $name"
  done
  file_count=$(find "$evidence_dir" -mindepth 1 -maxdepth 1 -type f -print | wc -l | tr -d ' ')
  [ "$file_count" -eq 5 ] || fail "unexpected evidence file count: $file_count"
}

assert_no_sensitive_evidence() {
  evidence_dir=$1
  if grep -R -E 'fixture-adb-serial|10\.23\.0\.|gateway\.example|IMEI|IMSI|ICCID|dmesg|([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}' \
    "$evidence_dir" >/dev/null 2>&1; then
    fail "sensitive device/network evidence was persisted"
  fi
}

mkdir -p "$FAKE_BIN"

cat > "$FAKE_BIN/adb" <<'EOF'
#!/bin/sh

printf '%s\n' "$*" >> "$FAKE_ADB_LOG"
scenario=$FAKE_ADB_SCENARIO
state_file=$FAKE_ADB_STATE
state=$(cat "$state_file" 2>/dev/null || true)

if [ "$1" = "devices" ]; then
  printf '%s\n' 'List of devices attached'
  if [ "$scenario" != "no-device" ]; then
    printf '%s\t%s\n' 'fixture-adb-serial' 'device'
  fi
  exit 0
fi

[ "$scenario" != "no-device" ] || exit 1

if [ "$1" = "-s" ] && [ "$3" = "shell" ]; then
  command=$4
  if [ "$4" = "id" ] && [ "$5" = "-u" ]; then
    printf '%s\n' '0'
    exit 0
  fi
  if [ "$4" = "uname" ] && [ "$5" = "-r" ]; then
    printf '%s\n' '4.9.191'
    exit 0
  fi
  if [ "$4" = "uname" ] && [ "$5" = "-a" ]; then
    printf '%s\n' 'Linux TinaLinux 4.9.191 #913 SMP PREEMPT Fri Jul 17 09:09:00 UTC 2026 aarch64 GNU/Linux'
    exit 0
  fi
  case "$command" in
    *'/etc/openwrt_release'*)
      printf '%s\n' "DISTRIB_ID='tina.raymanfeng.20260717.090727'"
      printf '%s\n' "DISTRIB_REVISION='5C1C9C53'"
      printf '%s\n' "DISTRIB_TARGET='a133-aw3/generic v1.0'"
      ;;
    *AHT_KERNEL_COMPAT_CHECK*)
      printf '%s\n' 'KERNEL_COMPAT_READY'
      ;;
    *AHT_USB_IDENTITY_CHECK*)
      printf '%s\n' 'USB_IDENTITY_READY'
      ;;
    *AHT_MODULE_STATE*)
      case "$state" in
        '') printf '%s\n' 'MODULES_ABSENT' ;;
        usbnet) printf '%s\n' 'USBNET_ONLY' ;;
        usbnet_cdc_ether) printf '%s\n' 'MODULES_BOTH' ;;
        *) printf '%s\n' 'MODULES_UNEXPECTED' ;;
      esac
      ;;
    *)
      exit 1
      ;;
  esac
  exit 0
fi

exit 1
EOF
chmod +x "$FAKE_BIN/adb"

cat > "$FAKE_BIN/sh" <<'EOF'
#!/bin/sh

printf '%s\n' "$*" >> "$FAKE_SH_LOG"
exec /bin/sh "$@"
EOF
chmod +x "$FAKE_BIN/sh"

run_accept() {
  output_file=$1
  inherited_auth=$2
  scenario=$3
  shift 3
  : > "$FAKE_ADB_LOG"
  : > "$FAKE_SH_LOG"
  : > "$FAKE_ADB_STATE"
  if [ "$inherited_auth" -eq 1 ]; then
    if AHT_ALLOW_DEVICE_MUTATION=1 \
      AHT_ALLOW_NETWORK_MUTATION=1 \
      PATH="$FAKE_BIN:$ORIGINAL_PATH" \
      FAKE_ADB_LOG="$FAKE_ADB_LOG" \
      FAKE_ADB_STATE="$FAKE_ADB_STATE" \
      FAKE_ADB_SCENARIO="$scenario" \
      FAKE_SH_LOG="$FAKE_SH_LOG" \
      /bin/sh "$ACCEPT" "$@" > "$output_file" 2>&1; then
      return 0
    else
      return $?
    fi
  fi
  if PATH="$FAKE_BIN:$ORIGINAL_PATH" \
    FAKE_ADB_LOG="$FAKE_ADB_LOG" \
    FAKE_ADB_STATE="$FAKE_ADB_STATE" \
    FAKE_ADB_SCENARIO="$scenario" \
    FAKE_SH_LOG="$FAKE_SH_LOG" \
    /bin/sh "$ACCEPT" "$@" > "$output_file" 2>&1; then
    return 0
  else
    return $?
  fi
}

expect_exit() {
  expected=$1
  output_file=$2
  shift 2
  if run_accept "$output_file" "$@"; then
    actual=0
  else
    actual=$?
  fi
  [ "$actual" -eq "$expected" ] || {
    printf '%s\n' "--- $output_file ---" >&2
    sed -n '1,160p' "$output_file" >&2 || true
    fail "expected exit $expected, got $actual"
  }
}

NO_DEVICE_EVIDENCE="$TEST_ROOT/no-device-evidence"
NO_DEVICE_OUTPUT="$TEST_ROOT/no-device.out"
expect_exit 10 "$NO_DEVICE_OUTPUT" 0 no-device \
  --package "$PACKAGE_DIR" --evidence-dir "$NO_DEVICE_EVIDENCE"
assert_evidence_files "$NO_DEVICE_EVIDENCE"
assert_line 'package_static_status=passed' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'device_preflight_status=blocked' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'device_load_status=blocked' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'network_status=not_evaluated' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'overall_status=blocked' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'device_source=device' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'fixture_used=no' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'evidence_complete=yes' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'device_mutation_authorized=no' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'network_mutation_authorized=no' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'dhcp_attempted=no' "$NO_DEVICE_EVIDENCE/summary.env"
assert_line 'status=blocked' "$NO_DEVICE_EVIDENCE/device-preflight.env"
assert_line 'status=blocked' "$NO_DEVICE_EVIDENCE/device-load.env"
assert_line 'status=not_evaluated' "$NO_DEVICE_EVIDENCE/network.env"
assert_no_sensitive_evidence "$NO_DEVICE_EVIDENCE"
if grep -E 'push|mkdir|insmod|rmmod|udhcpc' "$FAKE_ADB_LOG" >/dev/null 2>&1; then
  fail 'no-device default run attempted a device or network mutation'
fi

INHERITED_EVIDENCE="$TEST_ROOT/inherited-auth-evidence"
INHERITED_OUTPUT="$TEST_ROOT/inherited-auth.out"
expect_exit 10 "$INHERITED_OUTPUT" 1 ready \
  --package "$PACKAGE_DIR" --evidence-dir "$INHERITED_EVIDENCE"
assert_evidence_files "$INHERITED_EVIDENCE"
assert_line 'device_preflight_status=ready' "$INHERITED_EVIDENCE/summary.env"
assert_line 'device_load_status=blocked' "$INHERITED_EVIDENCE/summary.env"
assert_line 'network_status=not_evaluated' "$INHERITED_EVIDENCE/summary.env"
assert_line 'overall_status=blocked' "$INHERITED_EVIDENCE/summary.env"
assert_line 'verify-a133-tina-usb-modules.sh --static' "$FAKE_SH_LOG"
assert_line 'verify-a133-tina-usb-modules.sh --preflight' "$FAKE_SH_LOG"
assert_no_line 'verify-a133-tina-usb-modules.sh --load' "$FAKE_SH_LOG"
assert_no_line 'verify-a133-tina-network.sh' "$FAKE_SH_LOG"
assert_no_sensitive_evidence "$INHERITED_EVIDENCE"

NONEMPTY_EVIDENCE="$TEST_ROOT/nonempty-evidence"
mkdir -p "$NONEMPTY_EVIDENCE"
printf '%s\n' 'sentinel=keep' > "$NONEMPTY_EVIDENCE/sentinel.env"
NONEMPTY_OUTPUT="$TEST_ROOT/nonempty.out"
expect_exit 2 "$NONEMPTY_OUTPUT" 0 no-device \
  --package "$PACKAGE_DIR" --evidence-dir "$NONEMPTY_EVIDENCE"
assert_line 'sentinel=keep' "$NONEMPTY_EVIDENCE/sentinel.env"
assert_no_line 'overall_status=' "$NONEMPTY_EVIDENCE/sentinel.env"
if [ -e "$NONEMPTY_EVIDENCE/summary.env" ]; then
  fail 'non-empty evidence directory was overwritten'
fi

FIXTURE_OUTPUT="$TEST_ROOT/fixture.out"
expect_exit 2 "$FIXTURE_OUTPUT" 0 no-device \
  --package "$PACKAGE_DIR" --evidence-dir "$TEST_ROOT/fixture-evidence" \
  --fixture "$TEST_ROOT/ignored.fixture"
if [ -e "$TEST_ROOT/fixture-evidence" ]; then
  fail '--fixture created a production evidence directory'
fi

MISSING_GATEWAY_OUTPUT="$TEST_ROOT/missing-gateway.out"
expect_exit 2 "$MISSING_GATEWAY_OUTPUT" 0 no-device \
  --package "$PACKAGE_DIR" --evidence-dir "$TEST_ROOT/missing-gateway-evidence" \
  --allow-network-mutation --dhcp
[ ! -e "$TEST_ROOT/missing-gateway-evidence" ] || fail 'missing Gateway host created evidence before parameter rejection'

printf '%s\n' 'PASS: acceptance orchestration gates, status mapping, and evidence redaction'
