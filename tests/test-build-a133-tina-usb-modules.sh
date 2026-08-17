#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
BUILDER="$SCRIPT_DIR/../scripts/build-a133-tina-usb-modules.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/aht-builder-test.XXXXXX")

if ! bash "$BUILDER" --help >/dev/null 2>&1; then
  printf '%s\n' 'FAIL: --help must succeed without build inputs' >&2
  exit 1
fi

if output=$(AHT_KERNEL_TREE="$TEST_ROOT/missing" bash "$BUILDER" 2>&1); then
  printf '%s\n' 'FAIL: missing kernel tree was accepted' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'kernel tree' >/dev/null

mkdir -p "$TEST_ROOT/tree" "$TEST_ROOT/toolchain"
printf '%s\n' \
  'VERSION = 4' \
  'PATCHLEVEL = 9' \
  'SUBLEVEL = 191' \
  'kernelversion:' \
  '	@printf "%s.%s.%s\\n" "$(VERSION)" "$(PATCHLEVEL)" "$(SUBLEVEL)"' \
  > "$TEST_ROOT/tree/Makefile"

if output=$(AHT_KERNEL_TREE="$TEST_ROOT/tree" bash "$BUILDER" 2>&1); then
  printf '%s\n' 'FAIL: missing target config was accepted' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'AHT_TARGET_CONFIG' >/dev/null

printf '%s\n' 'CONFIG_MODULES=y' > "$TEST_ROOT/config"
if output=$(AHT_KERNEL_TREE="$TEST_ROOT/tree" AHT_TARGET_CONFIG="$TEST_ROOT/config" bash "$BUILDER" 2>&1); then
  printf '%s\n' 'FAIL: missing cross compiler was accepted' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'cross compiler' >/dev/null

if output=$(AHT_KERNEL_TREE="$TEST_ROOT/tree" AHT_TARGET_CONFIG="$TEST_ROOT/config" AHT_CROSS_COMPILE="$TEST_ROOT/toolchain/aarch64-elf-" bash "$BUILDER" 2>&1); then
  printf '%s\n' 'FAIL: missing cross compiler executable was accepted' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'compiler executable' >/dev/null

mkdir -p "$TEST_ROOT/wrong-tree"
printf '%s\n' \
  'VERSION = 5' \
  'PATCHLEVEL = 4' \
  'SUBLEVEL = 0' \
  'kernelversion:' \
  '	@printf "%s.%s.%s\\n" "$(VERSION)" "$(PATCHLEVEL)" "$(SUBLEVEL)"' \
  > "$TEST_ROOT/wrong-tree/Makefile"
if output=$(AHT_KERNEL_TREE="$TEST_ROOT/wrong-tree" AHT_TARGET_CONFIG="$TEST_ROOT/config" bash "$BUILDER" 2>&1); then
  printf '%s\n' 'FAIL: wrong kernel release was accepted' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'expected 4.9.191' >/dev/null

printf '%s\n' '#!/bin/sh' 'printf "%s\\n" "x86_64-unknown-linux-gnu"' > "$TEST_ROOT/toolchain/aarch64-elf-gcc"
printf '%s\n' '#!/bin/sh' 'exit 0' > "$TEST_ROOT/toolchain/aarch64-elf-readelf"
chmod +x "$TEST_ROOT/toolchain/aarch64-elf-gcc" "$TEST_ROOT/toolchain/aarch64-elf-readelf"
if output=$(AHT_KERNEL_TREE="$TEST_ROOT/tree" AHT_TARGET_CONFIG="$TEST_ROOT/config" AHT_CROSS_COMPILE="$TEST_ROOT/toolchain/aarch64-elf-" AHT_OUTPUT_DIR="$TEST_ROOT/out" bash "$BUILDER" 2>&1); then
  printf '%s\n' 'FAIL: non-AArch64 compiler was accepted' >&2
  exit 1
fi
printf '%s\n' "$output" | grep 'must target AArch64' >/dev/null

printf '%s\n' 'PASS: builder preflight rejects incomplete inputs'
