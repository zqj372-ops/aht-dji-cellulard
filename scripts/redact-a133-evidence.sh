#!/bin/sh

set -eu

sed -E \
  -e '/^[[:space:]]*#?[[:space:]]*target_serial=[^[:space:]]+[[:space:]]*$/d' \
  -e 's/(^|[[:space:]])target_serial=[^[:space:]]+/\1target_serial=<redacted>/g' \
  -e 's/(^|[[:space:]])androidboot\.serialno=[^[:space:]]+/\1androidboot.serialno=<redacted>/g' \
  -e 's/(^|[[:space:]])serial=[^[:space:]]+/\1serial=<redacted>/g'
