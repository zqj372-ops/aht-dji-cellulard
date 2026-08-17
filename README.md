# AHT · AI 手持终端

AHT（AI Handheld Terminal）当前交付的是中文优先的 4:3 浏览器模拟器和 V0.2 Gateway 协议参考实现，用来冻结手持终端的 UI、状态模型、数据边界和人机操作闭环。逻辑屏幕固定为 `1024 × 768`，外层浏览器窗口只负责缩放；`1024 × 16384` 虚拟帧缓冲不会被当作可见布局高度。

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

图标资源固定来自 [LobeHub Icons](https://lobehub.com/zh/icons) 的 `@lobehub/icons-static-svg@1.94.0`，运行时不依赖联网。DeepSeek Harness 的产品边界参考 [DeepSeek 官方仓库](https://github.com/deepseek-ai/deepseek-harness)；本版本只提供统一协议映射和本地展示，不建立真实 dsh 生产连接。

## 运行

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

浏览器打开 <http://127.0.0.1:4173/>。

## V0.2 Real Gateway 本地验收

V0.2 自带一个仅用于本地浏览器验收的 reference Gateway harness。它不是生产 Gateway，不包含认证、租户权限、持久化事件存储或真实 Agent Adapter。

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

Gateway 断线/重连验收可以让 reference harness 主动关闭客户端连接；进程内的 snapshot 和事件历史会保留：

```bash
AHT_GATEWAY_DROP_AFTER_MS=4000 npm run gateway:dev
```

协议和 Provider 边界位于：

- `src/providers/protocol.ts`：`aht.gateway.v1` 的统一 Agent、Needs You、Server、Snapshot 与消息解析
- `src/providers/types.ts`：`FixtureProvider` / `GatewayProvider` 共用的 Provider Runtime 接口
- `src/providers/fixture/`：无网络、可重复的本地数据源
- `src/providers/gateway/`：WebSocket、事件 reducer、断线重连与 resume
- `scripts/dev-gateway.mjs`：本地 reference Gateway

## 验证

```bash
npm test -- --run
npm run build
```

最近一次验收记录见 [AHT V0.1 浏览器模拟器验证记录](docs/verification/aht-v0-1-browser-simulator.md)。
V0.2 验收记录见 [AHT V0.2 Real Gateway 验证记录](docs/verification/aht-v0-2-gateway.md)。

## 硬件边界

当前代码不是 TRIMUI BRICK PRO 的原生客户端，也没有写入 Framebuffer、处理 `gh7003` 面板时序、连接生产 Gateway、执行生产部署或进行硬件签名。V0.2 的 WebSocket 只连接本地 reference Gateway。已进入 UI 状态模型的显示参数为：

| 参数 | 值 |
| --- | --- |
| 实际显示 | `1024 × 768` |
| 刷新率 | `60 Hz` |
| 旋转 | `0°` |
| 色深 | `32 bit` |
| 帧缓冲步长 | `4096 bytes`，预留给后续渲染适配层 |
| 虚拟帧缓冲 | `1024 × 16384`，仅用于多缓冲，不参与 UI 布局 |
| 面板配置标识 | `gh7003` |
