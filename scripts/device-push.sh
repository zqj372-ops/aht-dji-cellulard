#!/usr/bin/env bash
# AHT Brick Pro 设备部署助手
#
# 作用：把 native/dist-app/AHT 推到 Brick Pro 的 /mnt/SDCARD/Apps/AHT，
#       再拉回关键文件并与本地 SHA-256 比对，防止“以为推了但实际没生效”。
#
# 用法：
#   bash scripts/device-push.sh                      # 当前唯一 ADB 设备
#   ADB_SERIAL=5c000c28344588823dd bash scripts/device-push.sh
#
# 需要在能启动 ADB 的机器上执行（Codex 受管沙箱无法监听 tcp:5037，会失败）。
# 推送后按 START 退出当前应用回桌面触发 MainUI 重扫；若已在桌面则重启 MainUI 后再核对图标。
set -euo pipefail

PKG_SRC="native/dist-app/AHT"
TARGET="/mnt/SDCARD/Apps/AHT"
FILES="config.json launch.sh icon.png README.txt aht-native-arm64"
SERIAL="${ADB_SERIAL:-}"

fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ -f "$PKG_SRC/config.json" ] || fail "缺少 $PKG_SRC，先执行: make -C native app-package"
command -v adb >/dev/null 2>&1 || fail "找不到 adb，请先安装 Android platform-tools"

DVLINES=$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}' || true)
COUNT=$(printf '%s\n' "$DVLINES" | grep -c . || true)

DEV=()
if [ -n "$SERIAL" ]; then
  DEV=(-s "$SERIAL")
elif [ "$COUNT" -eq 0 ]; then
  fail "未发现可用 ADB 设备：请确认设备已连接并授权，且当前环境可以启动 adb（受管沙箱会因 tcp:5037 权限被拒而失败）"
elif [ "$COUNT" -ne 1 ]; then
  fail "发现 $COUNT 台 ADB 设备：请设置 ADB_SERIAL=序列号"
else
  SERIAL=$(printf '%s\n' "$DVLINES" | sed -n '1p')
  DEV=(-s "$SERIAL")
fi

TMP_RB=$(mktemp -d)
trap 'rm -rf "$TMP_RB"' EXIT

printf '设备: %s\n目标: %s\n' "$SERIAL" "$TARGET"
adb "${DEV[@]}" shell mkdir -p "$TARGET" >/dev/null
for f in $FILES; do
  printf '推送 %s ... ' "$f"
  adb "${DEV[@]}" push "$PKG_SRC/$f" "$TARGET/$f" >/dev/null && echo ok
done

FAILED=0
for f in $FILES; do
  adb "${DEV[@]}" pull "$TARGET/$f" "$TMP_RB/$f" >/dev/null 2>&1 || { echo "pull 失败: $f"; FAILED=1; continue; }
  LOCAL=$(shasum -a 256 "$PKG_SRC/$f" | awk '{print $1}')
  REMOTE=$(shasum -a 256 "$TMP_RB/$f" | awk '{print $1}')
  if [ "$LOCAL" = "$REMOTE" ]; then
    printf '一致   %-20s %s\n' "$f" "$REMOTE"
  else
    printf '不一致 %-20s local=%s remote=%s\n' "$f" "$LOCAL" "$REMOTE"
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  fail "设备文件与本地不一致，请重试或检查 SD 卡空间/挂载"
fi

printf '\nOK：icon.png 与 aht-native-arm64 已在设备上核对一致。\n'
printf '下一步：按 START 退出应用回桌面触发 MainUI 重扫；若已在桌面，重启 MainUI 后核对 Apps 2/2 的 AHT 图标。\n'
