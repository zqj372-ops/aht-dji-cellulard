#!/bin/sh

set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
USB_VERIFIER="$SCRIPT_DIR/verify-a133-tina-usb-modules.sh"
NETWORK_VERIFIER="$SCRIPT_DIR/verify-a133-tina-network.sh"

PACKAGE_DIR=
EVIDENCE_DIR=
GATEWAY_HOST=
ALLOW_DEVICE_MUTATION=0
ALLOW_NETWORK_MUTATION=0
DHCP=0

usage() {
  cat <<'EOF'
Usage: accept-a133-tina-phase-10.sh --package DIR --evidence-dir DIR [options]

Default: verify the package statically, then run read-only device preflight.
Options:
  --allow-device-mutation   permit the existing verifier's --load step
  --allow-network-mutation  authorize network mutation when paired with --dhcp
  --dhcp                    run the existing network verifier with DHCP
  --gateway-host HOST       approved Gateway host for the network probe
  --help                    show this help

--fixture is not a production acceptance input.
EOF
}

parameter_error() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

take_value() {
  [ "$#" -ge 2 ] || parameter_error 'option requires a value'
  case "$2" in
    --*) parameter_error 'option value is missing' ;;
  esac
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --package)
      take_value "$@"
      PACKAGE_DIR=$2
      shift 2
      ;;
    --evidence-dir)
      take_value "$@"
      EVIDENCE_DIR=$2
      shift 2
      ;;
    --gateway-host)
      take_value "$@"
      GATEWAY_HOST=$2
      shift 2
      ;;
    --allow-device-mutation)
      ALLOW_DEVICE_MUTATION=1
      shift
      ;;
    --allow-network-mutation)
      ALLOW_NETWORK_MUTATION=1
      shift
      ;;
    --dhcp)
      DHCP=1
      shift
      ;;
    --fixture)
      parameter_error '--fixture is not supported by the production acceptance entrypoint'
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      parameter_error 'unknown option'
      ;;
  esac
done

[ -n "$PACKAGE_DIR" ] || parameter_error '--package is required'
[ -d "$PACKAGE_DIR" ] || parameter_error 'package directory is missing'
[ -n "$EVIDENCE_DIR" ] || parameter_error '--evidence-dir is required'
[ -r "$USB_VERIFIER" ] || parameter_error 'USB verifier is missing'
[ -r "$NETWORK_VERIFIER" ] || parameter_error 'network verifier is missing'

if [ "$DHCP" -eq 1 ] && [ "$ALLOW_NETWORK_MUTATION" -ne 1 ]; then
  parameter_error '--dhcp requires --allow-network-mutation'
fi
[ "$DHCP" -eq 0 ] || [ -n "$GATEWAY_HOST" ] || parameter_error '--dhcp requires --gateway-host'

if [ -e "$EVIDENCE_DIR" ]; then
  [ -d "$EVIDENCE_DIR" ] || parameter_error 'evidence directory is not a directory'
  [ ! -L "$EVIDENCE_DIR" ] || parameter_error 'evidence directory must not be a symlink'
  if find "$EVIDENCE_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    parameter_error 'evidence directory must be missing or empty'
  fi
else
  mkdir -p "$EVIDENCE_DIR" || parameter_error 'evidence directory cannot be created'
fi

# Authorization is derived only from the CLI flags below. Never inherit either
# mutation grant from the caller's environment.
unset AHT_ALLOW_DEVICE_MUTATION
unset AHT_ALLOW_NETWORK_MUTATION

contains_line() {
  expected=$1
  text=$2
  printf '%s\n' "$text" | grep -F "$expected" >/dev/null 2>&1
}

contains_regex_line() {
  expression=$1
  text=$2
  printf '%s\n' "$text" | grep -E "$expression" >/dev/null 2>&1
}

write_env() {
  target=$1
  contents=$2
  [ ! -e "$target" ] || return 1
  printf '%s\n' "$contents" > "$target"
}

STATIC_OUTPUT=
STATIC_RC=0
if STATIC_OUTPUT=$(AHT_PACKAGE_DIR="$PACKAGE_DIR" sh "$USB_VERIFIER" --static 2>&1); then
  STATIC_RC=0
  PACKAGE_STATUS=passed
  PACKAGE_REASON=verifier_passed
else
  STATIC_RC=$?
  PACKAGE_STATUS=failed
  PACKAGE_REASON=verifier_failed
fi

PREFLIGHT_OUTPUT=
PREFLIGHT_RC=0
if PREFLIGHT_OUTPUT=$(sh "$USB_VERIFIER" --preflight 2>&1); then
  PREFLIGHT_RC=0
else
  PREFLIGHT_RC=$?
fi

if [ "$PREFLIGHT_RC" -eq 0 ] && contains_line 'status=preflight_passed' "$PREFLIGHT_OUTPUT"; then
  PREFLIGHT_STATUS=ready
  PREFLIGHT_REASON=ready
elif contains_regex_line 'found 0|adb is required|adb devices check failed' "$PREFLIGHT_OUTPUT"; then
  PREFLIGHT_STATUS=blocked
  PREFLIGHT_REASON=no_ready_device
else
  PREFLIGHT_STATUS=failed
  PREFLIGHT_REASON=verifier_failed
fi

LOAD_STATUS=blocked
LOAD_REASON=preflight_not_ready
LOAD_MUTATION=not_attempted
LOAD_OUTPUT=
if [ "$PACKAGE_STATUS" = "passed" ] && [ "$PREFLIGHT_STATUS" = "ready" ]; then
  if [ "$ALLOW_DEVICE_MUTATION" -eq 1 ]; then
    LOAD_MUTATION=attempted
    if LOAD_OUTPUT=$(AHT_ALLOW_DEVICE_MUTATION=1 \
      AHT_PACKAGE_DIR="$PACKAGE_DIR" sh "$USB_VERIFIER" --load 2>&1); then
      if contains_line 'status=modules_retained' "$LOAD_OUTPUT"; then
        LOAD_STATUS=passed
        LOAD_REASON=verifier_passed
      else
        LOAD_STATUS=failed
        LOAD_REASON=verifier_failed
      fi
    else
      LOAD_STATUS=failed
      LOAD_REASON=verifier_failed
    fi
  else
    LOAD_REASON=authorization_missing
  fi
elif [ "$PACKAGE_STATUS" != "passed" ]; then
  LOAD_REASON=static_not_passed
fi

NETWORK_STATUS=not_evaluated
NETWORK_REASON=dhcp_not_requested
NETWORK_MUTATION=not_attempted
NETWORK_OUTPUT=
if [ "$DHCP" -eq 1 ]; then
  NETWORK_REASON=device_load_not_passed
  if [ "$LOAD_STATUS" = "passed" ]; then
    NETWORK_MUTATION=requested
    if NETWORK_OUTPUT=$(AHT_ALLOW_NETWORK_MUTATION=1 \
      AHT_GATEWAY_HOST="$GATEWAY_HOST" \
      sh "$NETWORK_VERIFIER" --device --dhcp 2>&1); then
      if contains_line 'state=connected' "$NETWORK_OUTPUT"; then
        NETWORK_STATUS=passed
        NETWORK_REASON=connected
      elif contains_line 'state=degraded' "$NETWORK_OUTPUT"; then
        NETWORK_STATUS=degraded
        NETWORK_REASON=degraded
      else
        NETWORK_STATUS=failed
        NETWORK_REASON=verifier_failed
      fi
    else
      NETWORK_STATUS=failed
      NETWORK_REASON=verifier_failed
    fi
  fi
fi

OVERALL_STATUS=blocked
OVERALL_EXIT=10
if [ "$PACKAGE_STATUS" = "failed" ] || \
  [ "$PREFLIGHT_STATUS" = "failed" ] || \
  [ "$LOAD_STATUS" = "failed" ] || \
  [ "$NETWORK_STATUS" = "failed" ]; then
  OVERALL_STATUS=failed
  OVERALL_EXIT=12
elif [ "$NETWORK_STATUS" = "degraded" ]; then
  OVERALL_STATUS=degraded
  OVERALL_EXIT=11
elif [ "$PACKAGE_STATUS" = "passed" ] && \
  [ "$PREFLIGHT_STATUS" = "ready" ] && \
  [ "$LOAD_STATUS" = "passed" ] && \
  [ "$NETWORK_STATUS" = "passed" ]; then
  OVERALL_STATUS=passed
  OVERALL_EXIT=0
fi

write_env "$EVIDENCE_DIR/package-static.env" \
  "schema_version=1
status=$PACKAGE_STATUS
reason=$PACKAGE_REASON
exit_code=$STATIC_RC" || exit 12

write_env "$EVIDENCE_DIR/device-preflight.env" \
  "schema_version=1
status=$PREFLIGHT_STATUS
reason=$PREFLIGHT_REASON
mutation=unchanged
exit_code=$PREFLIGHT_RC" || exit 12

write_env "$EVIDENCE_DIR/device-load.env" \
  "schema_version=1
status=$LOAD_STATUS
reason=$LOAD_REASON
mutation=$LOAD_MUTATION" || exit 12

write_env "$EVIDENCE_DIR/network.env" \
  "schema_version=1
status=$NETWORK_STATUS
reason=$NETWORK_REASON
dhcp=$([ "$DHCP" -eq 1 ] && printf requested || printf not_requested)
mutation=$NETWORK_MUTATION" || exit 12

if [ "$ALLOW_DEVICE_MUTATION" -eq 1 ]; then
  DEVICE_MUTATION_AUTHORIZED=yes
else
  DEVICE_MUTATION_AUTHORIZED=no
fi
if [ "$ALLOW_NETWORK_MUTATION" -eq 1 ]; then
  NETWORK_MUTATION_AUTHORIZED=yes
else
  NETWORK_MUTATION_AUTHORIZED=no
fi
if [ "$NETWORK_MUTATION" = "requested" ]; then
  DHCP_ATTEMPTED=yes
else
  DHCP_ATTEMPTED=no
fi

write_env "$EVIDENCE_DIR/summary.env" \
  "schema_version=1
phase=10
device_source=device
fixture_used=no
evidence_complete=yes
package_static_status=$PACKAGE_STATUS
device_preflight_status=$PREFLIGHT_STATUS
device_load_status=$LOAD_STATUS
network_status=$NETWORK_STATUS
overall_status=$OVERALL_STATUS
device_mutation_authorized=$DEVICE_MUTATION_AUTHORIZED
network_mutation_authorized=$NETWORK_MUTATION_AUTHORIZED
dhcp_attempted=$DHCP_ATTEMPTED
exit_code=$OVERALL_EXIT" || exit 12

printf 'overall_status=%s\n' "$OVERALL_STATUS"
printf 'exit_code=%s\n' "$OVERALL_EXIT"
exit "$OVERALL_EXIT"
