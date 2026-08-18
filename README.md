# AHT · AI 手持终端

AHT（AI Handheld Terminal）当前交付的是中文优先的 4:3 浏览器模拟器和 V0.2 Gateway 协议参考实现，用来冻结手持终端的 UI、状态模型、数据边界和人机操作闭环。逻辑屏幕固定为 `1024 × 768`，外层浏览器窗口只负责缩放；`1024 × 16384` 虚拟帧缓冲不会被当作可见布局高度。

这是一个面向社区开放的项目仓库：当前状态是可运行的本地参考实现，不是生产产品。你可以直接运行浏览器模拟器、启动 reference Gateway 完成本地业务闭环，或把原生 app 安装到 TRIMUI Brick Pro 上体验；协议、边界与验证记录都放在 `docs/` 中。

## 项目组成

- 浏览器模拟器：React + TypeScript + Vite，固定 `1024 × 768` 逻辑屏幕，冻结首页、Needs You、Agents、Servers、Terminal 五个页面
- Gateway 参考实现：`aht.gateway.v1` WebSocket 协议、事件 reducer、断线重连与 `resume_after` 游标，仅用于本地验收
- Brick Pro 原生小程序：C++17 软件渲染器 + evdev 输入 + AArch64 静态构建，可安装到 TRIMUI Brick Pro 原厂 MainUI

```text
浏览器模拟器 / Brick Pro 原生层
        ↓
FixtureProvider / GatewayProvider
        ↓
aht.gateway.v1 WebSocket 协议
        ↓
reference Gateway（仅本地验收）
```

## 真机截图

以下画面来自 TRIMUI Brick Pro 真机 framebuffer 回读；浏览器模拟器与原生层共用同一套 UI 基线和状态模型。

![AHT 中文首页](docs/verification/screens/aht-brickpro-cn-home.png)

![AHT 中文审批页](docs/verification/screens/aht-brickpro-cn-approval.png)

![AHT 中文需要你页](docs/verification/screens/aht-brickpro-cn-needs.png)

![MainUI 桌面 App 图标](docs/verification/screens/aht-brickpro-new-icon-crop.png)

## 当前能力

- 中文首页、Needs You、Agents、Servers、Terminal 五个本地页面
- Codex 蓝白图标与 DeepSeek Harness（`dsh`）Developer Preview 入口
- Fixture / Gateway 两种数据源可在页面内切换，切换到 Gateway 时不会偷偷回退到 fixture
- Codex 审批面板：Fixture 使用本地模拟状态；Gateway 使用 WebSocket command ack + event 确认状态
- Gateway 断线状态、stale 快照、自动 reconnect 和 `resume_after` 事件游标
- Codex、DeepSeek Harness、Claude Code、Gemini CLI、Hermes Agent、OpenClaw、opencode 七个 Agent 状态列表
- 所有 Agent 图标统一为白底、等尺寸、随应用发布的本地 SVG
- 服务器指标、网络、电量和显示参数使用明确标注的 fixture 数据
- Terminal 为只读本地回显，不连接真实 SSH/Mosh
- 语音按钮为本地“录音中（模拟）”状态，不申请麦克风权限
- 快捷键：`H` Home、`N` Needs You、普通页面 `A` Agents；审批面板 `A` 批准、`X` 拒绝；`S` Servers、`T` Terminal、`V` 语音、`Esc` 返回

图标资源固定来自 [LobeHub Icons](https://lobehub.com/zh/icons) 的 `@lobehub/icons@1.94.0`（仓库内 vendored 官方 MIT 包，`file:` 依赖离线安装）。浏览器状态栏桌面品牌标记直接执行站点示例的 `import { Grok } from '@lobehub/icons'; <Grok size={56} />`，favicon 与设备 MainUI 桌面图标共用同一官方 path；设备端构建时离线栅格化为 PNG，不在设备上运行 React（证据见 [AHT Grok 桌面图标与品牌标记核验](docs/verification/aht-grok-desktop-icon.md)）。DeepSeek Harness 的产品边界参考 [DeepSeek 官方仓库](https://github.com/deepseek-ai/deepseek-harness)；本版本只提供统一协议映射和本地展示，不建立真实 dsh 生产连接。

## 运行

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

浏览器打开 <http://127.0.0.1:4173/>。

## V0.2 Real Gateway 本地验收

V0.2 自带一个仅用于本地浏览器验收的 reference Gateway harness。它不是生产 Gateway，不包含生产认证、租户隔离或真实 Agent Adapter；现在支持通过可选的本地 JSON store 持久化 reference snapshot、event history、command ledger 和 audit 回读，但这不改变其 reference 级别。

终端一启动 reference Gateway：

```bash
npm run gateway:dev
```

终端二启动前端（默认仍从 Fixture 启动，也可以在页面底部切换）：

```bash
VITE_AHT_GATEWAY_URL=ws://127.0.0.1:8787 \
  npm run dev -- --host 127.0.0.1 --port 4173
```

如果希望打开页面后直接进入 Gateway：

```bash
VITE_AHT_DATA_SOURCE=gateway \
VITE_AHT_GATEWAY_URL=ws://127.0.0.1:8787 \
  npm run dev -- --host 127.0.0.1 --port 4173
```

Gateway 断线/重连验收可以让 reference harness 主动关闭客户端连接；默认进程内的 snapshot 和事件历史会保留。若指定本地 store，则可继续验证进程重启后的 reference 状态恢复：

```bash
AHT_GATEWAY_DROP_AFTER_MS=4000 npm run gateway:dev
```

```bash
AHT_GATEWAY_STORE_PATH=/tmp/aht-gateway-state.json npm run gateway:dev
```

该文件只保存 reference 状态和审计事件，不保存 bearer token 或长期密钥；生产认证、持久化、高可用和真实 Agent Adapter 仍未交付。

### 一键本地业务闭环

在能正常监听端口的机器上，单条命令即可启动 reference Gateway 并让浏览器直接以 Gateway 数据源打开：

```bash
npm run demo
```

脚本会启动 `ws://127.0.0.1:8787` 的 reference Gateway、以 `VITE_AHT_DATA_SOURCE=gateway` 启动 Vite，并在 1.5 秒后自动打开 <http://127.0.0.1:4173/>。页面应显示 Gateway 已连接、快照新鲜，可对 Codex 生产审批按 A/X 走完 ack → final event → 状态翻转。Ctrl+C 会同时停止两个进程。该脚本只做本地编排，不部署、不转发公网、不接触生产服务。

协议和 Provider 边界位于：

- `src/providers/protocol.ts`：`aht.gateway.v1` 的统一 Agent、Needs You、Server、Snapshot 与消息解析
- `src/providers/types.ts`：`FixtureProvider` / `GatewayProvider` 共用的 Provider Runtime 接口
- `src/providers/fixture/`：无网络、可重复的本地数据源
- `src/providers/gateway/`：WebSocket、事件 reducer、断线重连与 resume
- `scripts/reference-gateway-store.mjs`：可选的本地原子 JSON store（仅 reference 验证）
- `scripts/dev-gateway.mjs`：本地 reference Gateway

## 项目结构

- `src/`：浏览器模拟器 UI、Provider 状态模型与 `aht.gateway.v1` 协议实现
- `native/`：Brick Pro 原生 ARM64 小程序源码、测试与构建工具
- `scripts/`：reference Gateway、一键 demo、设备推送等开发脚本
- `docs/`：设计稿、产品/协议设计与验证记录
- `vendor/lobehub-icons/`：仓库内 vendored 的 LobeHub Icons 官方 MIT 包，离线安装依赖

硬件侧的 DJI 蜂窝模块用户态驱动与网络管理在独立仓库
[`aht-dji-cellulard`](https://github.com/zqj372-ops/aht-dji-cellulard)；
本仓库只负责 AHT 客户端 UI、状态模型和 Gateway 协议边界，不重复实现设备驱动。

## 验证

```bash
npm test -- --run
npm run build
```

最近一次验收记录见 [AHT V0.1 浏览器模拟器验证记录](docs/verification/aht-v0-1-browser-simulator.md)。
V0.2 验收记录见 [AHT V0.2 Real Gateway 验证记录](docs/verification/aht-v0-2-gateway.md)。
`aht.gateway.v1` 公开协议业务闭环与 reference 可恢复状态见 [AHT 公开协议与业务闭环验证记录](docs/verification/aht-public-protocol-business.md)。

## Brick Pro 原生小程序（第一阶段）

当前仓库新增了一个与浏览器模拟器并行的原生 ARM64 bring-up 层：它使用 C++17 软件渲染器写 Linux framebuffer，通过 evdev 读取按键，主机上可用内存画布和 PPM 截图回归。第一阶段只移植当前 fixture 的状态模型和五个页面，不把本地 fixture 冒充成 Gateway、SSH/Mosh、4G、麦克风或生产 Agent 连接。

```bash
make -C native test
make -C native host-smoke
make -C native arm64
make -C native package
make -C native app-package
```

中文显示与图标：

- 原生层内嵌 180 个 CJK 字形（16×16 单色 bitmap），首页/需要你/审批等标题、状态枚举和 Agent 内容直接以中文渲染，不依赖设备字体文件；`make -C native cjk-font` 可在新增中文后重新扫描并生成 `native/include/aht/cjk_glyphs.hpp`（生成时使用本机 CJK 字体，产物内嵌进二进制）。
- AHT LOGO 绘制在状态栏；Inbox/Agent 卡片按 agentId 显示 7 个几何 Agent 图标；MainUI 桌面 App 图标 `native/dist-app/AHT/icon.png` 由 `make -C native icon` 从 `src/assets/agents/grok.svg` 重新生成（官方黑色 Grok path + 白色圆角磁贴，4x 超采样抗锯齿）。
- 未收录字形显示方框占位；Latin 字符沿用 5×7 表。

构建产物为：

- `native/build/aht-native`：主机验证程序
- `native/build/aht-native-arm64`：静态 AArch64 Linux ELF
- `native/dist-native/aht.pak/`：包含 `launch.sh`、ARM64 可执行文件和说明的 tool pak
- `native/dist-app/AHT/`：可直接安装到 Brick Pro 原厂 MainUI 的 app 包（`config.json` + `launch.sh` + `icon.png` + ARM64 可执行文件）

主机无设备时可运行：

```bash
./native/build/aht-native --headless \
  --actions 'n,enter,x,b,s,t,h,quit' \
  --screenshot /tmp/aht-native-smoke.ppm
```

在 Brick Pro 上安装 MainUI 应用：把 `native/dist-app/AHT/` 整个目录复制到 SD 卡的 `/mnt/SDCARD/Apps/AHT`，重启 MainUI（或直接重启设备）后，Apps 标签页会出现 AHT 图标，按 A 启动；START 退出并返回桌面。有 ADB 的机器上可一键推送并回读哈希校验：`npm run device:push`（受管沙箱无法启动 ADB，需在本机终端执行）。默认输入为物理 `TRIMUI Player1`（A/X/B、十字键），也可以通过 `AHT_FRAMEBUFFER` 和 `AHT_INPUT_DEVICE` 覆盖节点。该 app 不是官方固件、恢复镜像或 bootloader，不应写入 eMMC，也不会执行格式化、`dd`、刷机或修改系统目录。

详细证据见 [AHT Brick Pro 原生小程序验证记录](docs/verification/aht-native-brickpro.md)，设计边界见 [原生移植设计](docs/superpowers/specs/2026-08-18-aht-native-brickpro-design.md)。

## 开源边界

本仓库公开的是 UI 与协议参考实现、本地验收脚本和真机验证证据，不包含生产凭证、真实 Agent 连接、SSH/Mosh、4G 拨号或设备固件。服务器指标、网络、电量和显示参数在 Fixture 数据源中明确标注为模拟值；reference Gateway 不承担生产认证、租户隔离、持久化或高可用责任。

## 硬件边界

浏览器模拟器和 reference Gateway 仍不是 TRIMUI BRICK PRO 的原生运行时；原生 app 已在真实 Brick Pro 上通过 MainUI 桌面启动并完成按键流程验证（见验证记录），但它只在 SD 卡用户目录运行，不刷固件、不写 eMMC。它会在设备上读取 framebuffer 参数，不对 `gh7003` 面板时序或 stride 做未经 ioctl readback 的假设。V0.2 的 WebSocket 只连接本地 reference Gateway；原生第一阶段也不会连接生产 Gateway、执行生产部署或进行硬件签名。下表是现有浏览器 fixture 中的状态模型，不是设备 ioctl readback：

| 参数 | 值 |
| --- | --- |
| 实际显示 | `1024 × 768` |
| 刷新率 | `60 Hz` |
| 旋转 | `0°` |
| 色深 | `32 bit` |
| 帧缓冲步长 | `4096 bytes`（浏览器 fixture；原生层运行时读取实际值） |
| 虚拟帧缓冲 | `1024 × 16384`，仅用于多缓冲，不参与 UI 布局 |
| 面板配置标识 | `gh7003` |
