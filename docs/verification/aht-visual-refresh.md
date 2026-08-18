# AHT 视觉刷新验证记录

日期：2026-08-18
范围：浏览器 Home/Needs You 主屏、原生 1024×768 渲染器、中文字库、Agent 图标，以及本轮视觉回归测试。

设计稿归档：[docs/design/README.md](../design/README.md)

## 视觉核验

- 浏览器开发服务器：`http://localhost:5173/`
- 浏览器实际截图确认：浅色外层、深色圆角设备壳、`现在需要你` 标题、4 条 Inbox 卡片、白色图标底、Codex/DeepSeek Harness/Claude Code/OpenClaw 彩色图标、右侧数量和底部状态栏均可见。
- 原生截图：`/tmp/aht-native-home.ppm`（通过 `sips` 转为 PNG 后人工检查）。
- 原生实际渲染包含：圆角卡片、白色 Agent 图标磁贴、四种 Agent 标记、正常大小写的英文 Agent 名称、嵌入式比例字体和顶部设备状态。
- 原生字体截图复核：中文与英文均来自高分辨率抗锯齿字形 atlas；英文保留真实字宽和字距，`Codex`、`DeepSeek Harness`、`Claude Code`、`OpenClaw` 不再粘连或呈点阵块状。
- 顶部右侧显示规格与电量文本按实际字宽动态排布，`1024 × 768 · 60 Hz` 与 `电量 82%` 之间保留明确间距；`host-smoke` 截图复核无重叠。
- 主机截图不等于真机验收；本轮已通过 ADB 在真实 Brick Pro 上补做 framebuffer、字体、Home/Approval 截图和按键退出流程验证。

## 字体与图标实现

- `native/tools/make_cjk_font.py` 使用本机 `Hiragino Sans GB.ttc` 生成 48×48 灰度比例字形 atlas；以完整 em cell 缩放，保留真实 cap height、x-height、side bearing 和 proportional advance，避免裁剪拉伸或 5×7 点阵。
- `native/include/aht/cjk_glyphs.hpp` 为生成产物，当前包含 261 个 UI 字形；渲染器按目标字号做面积平均和前景/背景混合，中文、英文和数字都使用同一套抗锯齿字体覆盖率。
- 原生 Inbox 卡片使用圆角矩形和白色图标底；Codex、DeepSeek Harness、Claude Code、OpenClaw 使用独立彩色标记。
- 浏览器复用 `src/assets/agents/*.svg`，不以占位几何图形替代 Agent 图标。

## 回归命令

```text
npm test -- --run tests/typed-statuses.test.tsx tests/app.test.tsx tests/device-shell.test.tsx tests/needs-you.test.tsx
  4 files / 7 tests passed

npm test -- --run
  19 files / 64 tests passed

npx tsc -b --pretty false
  passed

npm run build
  passed

make -C native test
  model, renderer, ui tests passed

make -C native host-smoke
  passed; screen=home pending=4; screen=home pending=3 decision=已拒绝

make -C native app-package
  passed; packaged native app bundle uses the regenerated proportional atlas

make -C native arm64
  passed; native/build/aht-native-arm64 is ELF 64-bit AArch64

git diff --check
  passed for tracked changes
```

`npm run typecheck` 不是当前 `package.json` 中定义的 script；类型检查已由 `npx tsc -b --pretty false` 和 `npm run build` 实际执行并通过。

并行主任务随后复跑了 `make -C native test host-smoke` 并重新查看 `/tmp/aht-native-smoke.ppm`：model/renderer/ui/smoke 全部通过，右上角 `1024 × 768 · 60 Hz` 与 `电量 82%` 信息组已分开，无拥挤或重叠。

## 后续协议切片复跑

主任务开始 public Gateway protocol 切片时曾出现中间阻断，本轮重新执行：

```text
npm test -- --run tests/app.test.tsx tests/device-shell.test.tsx tests/needs-you.test.tsx tests/typed-statuses.test.tsx
  4 files / 7 tests passed

make -C native test && make -C native host-smoke
  model, renderer, ui, smoke passed

npm test -- --run
  14 files passed, 2 provider files failed; 34/44 tests passed, 10 failed

npm run build
  blocked by current provider protocol/type errors in src/providers/gateway/reducer.ts and tests/providers/**
```

这些中间失败位于主任务负责的 Gateway/provider 协议边界，不是本视觉/native 切片的修改；本轮未修改协议文件。

协议业务闭环完成后再次复跑：

```text
npm test -- --run && npm run build
  19 files / 64 tests passed; Vite build passed

make -C native test && make -C native host-smoke
  model, renderer, ui, smoke passed

make -B -C native arm64
  passed; native/build/aht-native-arm64 is ELF 64-bit AArch64

make -C native app-package
  passed
```

最终 native 截图：`/tmp/aht-native-home-closeout.png`、`/tmp/aht-native-smoke-closeout.png`；中文、英文和数字均为 48×48 高分辨率 atlas 经面积平均后的抗锯齿比例字形，四个 Agent 名称字距正常。

## 真实 Brick Pro 复核

设备通过 ADB 识别：`5c000c28344588823dd`，状态为 `device`。只读 framebuffer 信息为：

```text
resolution: 1024x768
virtual resolution: 1024x16384
yoffset: 768
bits_per_pixel: 32
line_length: 4096 bytes
```

设备原有 ARM64 包哈希为 `1d182214…`；本轮先拉取留存，再将本地高分辨率字体包推送到 `/mnt/SDCARD/Apps/AHT`，page-offset 修正版哈希为 `25a42d7351a004499460872030b00efda86ea05346a236d929bab0b22532e637`，设备端与本地一致。未写固件、eMMC 或系统目录。

本轮修正 `native/src/framebuffer.cpp`：Linux framebuffer 现在按 `FBIOGET_VSCREENINFO` 返回的 `yoffset` 计算 active display page，避免设备显示 page 1 时仍写入 page 0。

真机截图与输入流程：

- Home：`/tmp/aht-native-brickpro-home-final2.png`，中文标题、4 个 Inbox 卡片、四种 Agent 图标和英文名称均正常。
- Approval：`/tmp/aht-native-brickpro-approval-final2.png`，审批标题、风险、详情和 A/X/B 操作提示均正常。
- 输入：A 打开审批，X 拒绝，B 返回 Needs，START 退出；设备日志为 `screen=needs pending=3 decision=已拒绝`。
- 测试结束后 AHT 进程退出，MainUI 进程恢复；临时 uinput helper 仅位于设备 `/tmp`。

## 工作区边界

本轮视觉改动未修改 `src/providers/**`、Gateway、trust/auth 或 runtime 文件。工作区中这些路径若有并行任务的修改，应由主任务继续保留和复核；本记录不清理、不回滚其他未提交改动。
