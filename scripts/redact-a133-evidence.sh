#!/bin/sh

set -eu

sed -E \
  -e '/^[[:space:]]*#?[[:space:]]*target_serial=[^[:space:]]+[[:space:]]*$/d' \
  -e 's/(^|[[:space:]])target_serial=[^[:space:]]+/\1target_serial=<redacted>/g' \
  -e 's/(^|[[:space:]])androidboot\.serialno=[^[:space:]]+/\1androidboot.serialno=<redacted>/g' \
  -e 's/(^|[[:space:]])serial=[^[:space:]]+/\1serial=<redacted>/g' \
  -e 's/(^|[[:space:]])([Ii][Ss]erial|[Ss]erial[Nn]umber)=[^[:space:]]+/\1\2=<redacted>/g' \
  -e 's/([Mm][Aa][Cc]=)([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/\1<redacted-mac>/g' \
  -e 's/([[:space:]]|^)([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}([[:space:]]|$)/\1<redacted-mac>\3/g' \
  -e 's/(^|[[:space:]])(IMEI|IMSI|ICCID|ESN|MEID)=[^[:space:]]+/\1\2=<redacted>/Ig' \
  -e 's/TRIMUIDEV@[^ )]+/TRIMUIDEV@<redacted>/g'
