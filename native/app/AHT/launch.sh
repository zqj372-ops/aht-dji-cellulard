#!/bin/sh
echo "$0" "$*"
PROGDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROGDIR"
export LD_LIBRARY_PATH="$LD_LIBRARY_PATH:$PROGDIR"
export AHT_FRAMEBUFFER="${AHT_FRAMEBUFFER:-/dev/fb0}"
export AHT_INPUT_DEVICE="${AHT_INPUT_DEVICE:-}"

if [ ! -e "$AHT_FRAMEBUFFER" ]; then
    echo "AHT native framebuffer unavailable: $AHT_FRAMEBUFFER" >&2
    exit 1
fi

echo 1 > /tmp/stay_awake
"./aht-native-arm64" "$@"
RESULT=$?
rm -f /tmp/stay_awake
exit "$RESULT"
