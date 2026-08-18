# AHT Grok 桌面图标与品牌标记核验（修订版）

> 结论：桌面图标现在就是官方站点示例的真实实现——`src/components/GrokIcon.tsx` 直接执行
> `import { Grok } from '@lobehub/icons'` 并渲染 `<Grok size={30}/>`（组件默认 `size={56}` 与站点示例一致）。
> `@lobehub/icons` 是 vendored 的官方 1.94.0 MIT 包（`vendor/lobehub-icons`，`file:` 依赖，离线安装），
> 其默认导出即 LobeHub 站点展示的 Grok Mono。浏览器状态栏磁贴、favicon、`src/assets/agents/grok.svg`
> 与设备 MainUI 桌面图标全部出自同一官方 path，运行时不联网。

## 时间与范围

- 时间：2026-08-18（修订）
- 分支：`feat/aht-v0.1-browser-simulator`（当前工作区）
- 范围：浏览器桌面品牌标记、favicon、原生 MainUI 桌面图标及其共用 SVG 源

## 1. 代码级集成（用户要求的站点 import）

`src/components/GrokIcon.tsx` 不再手工复制 path，而是真实引用包：

```tsx
import { Grok } from '@lobehub/icons';

export function GrokIcon({ size = 56, className, style }: GrokIconProps) {
  return <Grok data-testid="grok-icon" size={size} className={className} style={style} />;
}
```

仓库内 `package.json` 依赖：`"@lobehub/icons": "file:vendor/lobehub-icons"`；
`node_modules/@lobehub/icons -> ../../vendor/lobehub-icons`，lockfile 已记录该 file: 链接。

## 2. 官方来源与离线 vendoring

来源包：

```text
@lobehub/icons@1.94.0
tarball sha256: edd0e6a59e33d47721821147dee9acec56a97c727b4bcca6755fa05a5cbfd0fa
默认导出:        es/Grok/index.js -> components/Mono.js（站点示例渲染的 Grok 即 Mono）
```

vendored 目录保留官方 `es/Grok/` 与 `es/types/` 原文件（MIT LICENSE 一并保留）；根入口
`vendor/lobehub-icons/index.js` 直接 re-export `es/Grok/components/Mono.js`，避免拉入官方包里
antd/@lobehub/ui 的整棵依赖树（本机/设备离线且 npm registry 不可达，无法完整安装官方包）。
`import { Grok } from '@lobehub/icons'` 解析到官方 Mono 组件本身，渲染结果与站点逐字节一致。

验证命令（path 一致性与 asset 同步）：

```bash
make -C native grok-svg         # 从 vendored Mono.js 重写 src/assets/agents/grok.svg
python3 native/tests/icon_test.py  # 断言 Mono.js 的 d= 与 grok.svg 的 <path d=.../> 相等
```

## 3. 浏览器端

- `src/components/StatusBar.tsx`：状态栏左侧白色圆角磁贴 `status-brand`（aria-label「AHT 桌面图标（Grok）」），
  内部渲染官方 `Grok` 组件（30px；组件默认 56px 与站点示例一致）。
- `public/favicon.png`（64×64，sha256 `924dafc7d518905d00598d335b802e4999b5bf018bdbf3d7775fcf65b05276dc`）：
  `make -C native favicon` 从同一官方 path 300px 栅格化后 area-average 缩放生成。
- `index.html`：`<link rel="icon">` 与 `<link rel="apple-touch-icon">` 指向 favicon；
  `npm run build` 产物 `dist/favicon.png` 与 JS（含官方 path）均已确认。
- 回归断言：`tests/device-shell.test.tsx` 检查 `status-brand` + `grok-icon`（title=Grok、
  viewBox=`0 0 24 24`、官方 path 前缀）。

```text
npm test -- --run --exclude tests/providers/reference-gateway.test.mjs --exclude tests/providers/reference-gateway-persistence.test.mjs
  Test Files  21 passed (21)
  Tests       67 passed (67)

npm run build
  tsc -b && vite build: passed（dist/favicon.png 与 status-brand 均在产物中）
```

## 4. 原生 MainUI 桌面图标

```text
native/dist-app/AHT/icon.png（300×300）
sha256: 5b55369f6f54e993c321ee1baafe8314e0ea08f2c3c850e1cace6578582ec95b
```

生成链：`make -C native icon` → `native/tools/make_icon.py` → 读取 vendored
`es/Grok/components/Mono.js` 的官方 path → 4× 超采样离线栅格化。构图按站点 `<Grok size={56}/>`
的视觉调整：官方 24×24 mark 缩放至 208px、白色圆角磁贴 252px（半径 52px），
标志占比由原来的 132px/200px 提升到 glyph-dominant，不再是小标志卡在大白块里。
`make -C native grok-svg favicon` 保证 SVG/favicon/桌面图标同源。

本轮复核：

```text
make -C native test
  model / renderer / ui / icon(5) 全部通过
python3 native/tools/make_icon.py /tmp/aht-icon-regen.png
  sha256 与 native/dist-app/AHT/icon.png 一致：5b55369f6f54e993c321ee1baafe8314e0ea08f2c3c850e1cace6578582ec95b
```

设备安装包已刷新：`native/dist-app/AHT/` 含新 `icon.png` 与新构建的 arm64 二进制
（sha256 `25a42d7351a004499460872030b00efda86ea05346a236d929bab0b22532e637`）。
设备侧已于 2026-08-18 13:21 完成推送与真机回读：`npm run device:push` 推送 5 个文件并拉回
SHA-256 逐文件比对全部一致（设备 `icon.png` = `5b55369f...`）。真机证据见
[AHT Brick Pro 原生小程序验证记录](aht-native-brickpro.md) 的“2026-08-18 更新”节：
重启 MainUI 后 framebuffer 回读显示新版 glyph-dominant 图标（黑色 Grok 图形占磁贴
0.813 × 0.777，与本地新图标一致；旧版为 0.66）。可复现命令：

```bash
npm run device:push
# 或：bash scripts/device-push.sh；多设备时先设置 ADB_SERIAL=序列号
```

等价的手动命令（仅限可启动 ADB 的机器）：

```bash
adb push native/dist-app/AHT /mnt/SDCARD/Apps/AHT   # 或在 Mac 上把该目录复制到 SD 卡 Apps/AHT
```

2026-08-18 13:05 主机复核：`npm test`（排除真实 WebSocket 两个文件）21 文件 / 67 测试通过；`npm run build` 通过；
`make -C native test host-smoke arm64 uinput-pad app-package` 通过；`git diff --check` 通过。
2026-08-18 13:21 全量复核：`npm test -- --run` 23 文件 / 71 用例全部通过（含真实 WebSocket）。

## 5. 像素级核验与桌面效果预览

2026-08-18 深夜复核（纯标准库解码当前 `native/app/AHT/icon.png`，300×300 RGBA）：

```text
四角 alpha              0（透明安全边距，圆角不破边）
白色磁贴 bbox           24..275 / 24..275（252×252，圆角半径 52）
黑色 Grok 图形 bbox     48..250 / 54..247（203×194）
图形中心偏差            约 (-1.0, +0.5) px，居中稳定
图形占磁贴比例          0.81 × 0.77（glyph-dominant，符合站点黑标视觉）
图形像素覆盖            9574 px（黑色面积约占磁贴 15%）
```

站点样式与设备桌面效果对照预览（左=官方 Grok 黑标白底，右=真实 MainUI 深色底
`rgb(10,15,22)` 上的白色磁贴与对焦环，非真机回读）：

```text
docs/verification/screens/aht-grok-icon-preview.png
sha256 690347c3b6dfe0fe828d85e5f3b3c1ff6af8333fcf663ae1bcbf47af968dc61f
```

## 6. 边界与说明

- 运行时无网络依赖；`@lobehub/icons` 解析为本地 vendored 官方包，不与 npm registry 交互。
- 只使用站点示例同款默认导出（Grok Mono）；官方包的 Avatar/Combine/Text 复合变体未引入。
- 本记录只证明图标标记来源与渲染链路，不涉及生产 Gateway、认证或部署状态。
