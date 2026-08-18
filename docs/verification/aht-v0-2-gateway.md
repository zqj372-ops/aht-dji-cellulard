# AHT V0.2 Real Gateway 验证记录

验证日期：2026-08-17

验证范围：Fixture/Gateway Provider、`aht.gateway.v1` WebSocket、Codex approval command/event、断线重连/resume、数据源切换

验证环境：Vite dev server `http://127.0.0.1:4173/`、本地 reference Gateway `ws://127.0.0.1:8787`、Codex in-app Browser

## 自动化检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Vitest | 通过 | 13 个测试文件，21 个测试全部通过 |
| TypeScript + Vite build | 通过 | `tsc -b && vite build` 成功，46 个模块完成构建 |
| npm audit | 通过 | `npm audit --omit=optional`：0 vulnerabilities |
| Browser console | 通过 | 最终验收标签页 error/warn 日志为 `[]` |

## 浏览器真实 WebSocket 验收

1. 初始 Fixture：页面显示 `Fixture · 本地`、7 个 Agent、4 项待处理和 `1024 × 768 · 60 Hz`。
2. 切换 Gateway：页面显示 `Gateway · 已连接`、2 个 Agent、1 台服务器、2 项待处理和 Gateway 网络 `38ms`；没有继续显示 Fixture 的 7 个 Agent。
3. Gateway snapshot：打开 Codex 审批后，详情显示 `该审批来自本地 reference Gateway。`，证明审批内容来自本地 WebSocket harness。
4. Gateway approve：在审批面板按 `A`，页面收到 Gateway command ack/event 后显示 `已批准（Gateway）`，待处理数量从 2 变为 1。
5. Gateway reject：重启本地 reference Gateway 后，在同一审批面板按 `X`，页面显示 `已拒绝（Gateway）`，待处理数量从 2 变为 1。
6. 断线与恢复：使用 `AHT_GATEWAY_DROP_AFTER_MS=5000 npm run gateway:dev` 主动关闭客户端。页面保持可渲染，自动连接恢复后仍显示 `Gateway · 已连接`，且上一轮 `已拒绝（Gateway）` 状态没有被 Fixture 覆盖。
7. 数据源切换：断线恢复后点击 `切换到 Fixture 数据源`，页面恢复 `Fixture · 本地`、7 个 Agent、4 项待处理和本地审批文案；Gateway 状态没有泄漏到 Fixture。

浏览器验收截图：`/tmp/aht-v02-gateway.png`（Gateway connected + Codex approved 状态）。

## 六项 V0.2 验收目标

| 目标 | 结果 | 证据边界 |
| --- | --- | --- |
| Gateway WebSocket 真连接 | 通过 | 浏览器连接 `ws://127.0.0.1:8787`，收到 `hello_ack` 和 snapshot，UI 显示 `Gateway · 已连接` |
| Gateway 断开后 UI 不崩 | 通过 | reference Gateway 主动 close 后页面仍有完整 DOM，Browser console 无 error/warn |
| 自动 reconnect + resume | 通过 | `GatewayProvider` 保存 `event_id` 并在重连 hello 携带 `resume_after`；reference Gateway 进程保留状态，重连后状态 readback 一致 |
| Codex Approval 来自 Gateway | 通过 | Gateway snapshot 提供 Codex approval，Fixture 不参与该页面状态填充 |
| A / X 发送真实 approve/reject | 通过 | 浏览器分别读回 `已批准（Gateway）` 与 `已拒绝（Gateway）`；command 使用目标 `needs_you_id + agent_id` |
| Fixture / Real Gateway 随时切换 | 通过 | Gateway → Fixture 切换后 readback 为本地 7 Agent、4 Needs You；Gateway 不可用时不回退 fixture |

## 协议与代码边界

- `src/providers/protocol.ts` 定义 `aht.gateway.v1` 的 Agent、Needs You、Server、Snapshot、hello、snapshot、event、command ack、resync 和 error 消息。
- `src/providers/types.ts` 定义两个数据源共用的 `AhtProvider`、连接状态、命令和事件接口。
- `src/providers/fixture/` 保留无网络、可重复的本地数据源。
- `src/providers/gateway/` 负责 WebSocket、快照投影、事件 reducer、command ack、重连退避和 `resume_after`。
- `scripts/dev-gateway.mjs` 只作为本地 reference harness；它不代表生产 Gateway，也不提供生产认证、权限、持久化或真实 Agent Adapter。

## 尚未交付

- BRICK Framebuffer、SDL2/Slint、`gh7003` 面板驱动、4G 驱动和硬件签名
- 生产 Gateway 认证、租户权限、持久化事件存储和高可用部署
- Codex、DeepSeek Harness、Hermes、OpenClaw 等 Agent 的生产 Adapter
- 真实 SSH/Mosh、Terminal 会话、麦克风采集和 Voice STT
