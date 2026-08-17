# AHT V0.2 Real Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 V0.1 UI 基线的前提下，增加可切换的 Fixture/Gateway Provider、版本化 WebSocket 协议、断线重连/resume 和 Codex approval 命令闭环。

**Architecture:** `App` 只消费 Provider Runtime 输出的快照、连接状态和命令回执。`FixtureProvider` 继续维护本地确定性状态；`GatewayProvider` 通过注入的 WebSocket factory 连接 `aht.gateway.v1`，将 snapshot/event 映射成同一 UI state，并保留最近 event cursor。真实 WebSocket 行为用本地 reference Gateway harness 和可控 fake socket 双重验证。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Testing Library、原生 WebSocket、Node `ws` reference harness；不引入 Redux、Socket.IO 或真实 Agent SDK。

---

### Task 1: 先冻结协议类型和失败测试

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/providers/protocol.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/providers/types.ts`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/types.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/providers/protocol.test.ts`

- [ ] **Step 1: Write failing protocol tests**

覆盖：Gateway snapshot 必须含 `schema_version/revision/event_id/agents/needs_you/servers`；Agent 缺少可选字段时不崩；`needs_you` 六种类型和六种 maturity 可被解析。

- [ ] **Step 2: Run the focused test and observe RED**

Run: `npm test -- --run tests/providers/protocol.test.ts`

Expected: FAIL because `src/providers/protocol.ts` and the canonical provider types do not exist.

- [ ] **Step 3: Add exact protocol and provider contracts**

定义 `GatewayEnvelope`、`GatewayClientMessage`、`GatewayServerMessage`、`GatewaySnapshot`、`GatewayEvent`、`DecisionCommand`、`CommandAck`、`AhtProvider` 和 `ProviderEvent`。扩展 Agent/Needs You 类型，但保留现有 UI 所需的本地投影字段。

- [ ] **Step 4: Run focused tests GREEN**

Run: `npm test -- --run tests/providers/protocol.test.ts`

Expected: PASS with no warnings.

### Task 2: 将现有 fixture 正式迁移为 FixtureProvider

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/providers/fixture/fixtureState.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/providers/fixture/FixtureProvider.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/providers/emptyState.ts`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/fixtureState.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/providers/fixture-provider.test.ts`

- [ ] **Step 1: Write failing provider tests**

验证 `connect()` 发出 connected + snapshot，`decide()` 只改本地状态，`disconnect()` 不抛异常，并且 provider source 固定为 `fixture`。

- [ ] **Step 2: Run and observe RED**

Run: `npm test -- --run tests/providers/fixture-provider.test.ts`

Expected: FAIL because `FixtureProvider` does not exist.

- [ ] **Step 3: Move fixture authority behind the provider**

把现有 `fixtureState.ts` 的数据放到 `providers/fixture/fixtureState.ts`；`src/app/fixtureState.ts` 只保留 re-export，避免 V0.1 调用方突然失效。`FixtureProvider` 通过同一 `ProviderEvent` 输出 snapshot，决策使用纯函数 reducer。

- [ ] **Step 4: Run provider and regression tests GREEN**

Run: `npm test -- --run tests/providers/fixture-provider.test.ts tests/fixtureState.test.ts tests/needs-you.test.tsx`

Expected: PASS.

### Task 3: 实现 Gateway 协议解析、事件 reducer 和 WebSocket provider

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/providers/gateway/reducer.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/providers/gateway/GatewayProvider.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/providers/gateway-provider.test.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/providers/gateway-reducer.test.ts`

- [ ] **Step 1: Write failing reducer and fake-socket tests**

至少包含：snapshot 转 UI state；`needs_you_resolved` 更新 Codex；首次 hello 不带 cursor；重连 hello 带最近 event id；非法消息变成 error event；approve/reject command 带 `command_id`、`needs_you_id`、`agent_id`。

- [ ] **Step 2: Run and observe RED**

Run: `npm test -- --run tests/providers/gateway-provider.test.ts tests/providers/gateway-reducer.test.ts`

Expected: FAIL because Gateway reducer/provider are missing.

- [ ] **Step 3: Implement minimal protocol loop**

实现 native WebSocket adapter、`hello`、`hello_ack`、`snapshot`、`event`、`command_ack`、`resync_required`；将 `event_id` 保存为 resume cursor；使用 `250/500/1000/2000/5000ms` 退避，测试通过注入 timer 和 socket factory 控制时间。

- [ ] **Step 4: Run focused tests GREEN**

Run: `npm test -- --run tests/providers/gateway-provider.test.ts tests/providers/gateway-reducer.test.ts`

Expected: PASS and no unhandled rejection.

### Task 4: 接入 Provider Runtime 和 Fixture/Gateway 随时切换

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/useAhtRuntime.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/DataSourceControl.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/ConnectionStatus.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/App.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/DeviceFrame.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/StatusBar.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/NavigationBar.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/runtime-switch.test.tsx`

- [ ] **Step 1: Write failing runtime switch tests**

渲染 App 后验证默认 Fixture；点击 Gateway 后显示 Gateway connecting/unavailable，不能继续显示 fixture 卡片；点击 Fixture 后恢复 Codex fixture 卡片；Gateway 断线时仍可导航且不显示 React error。

- [ ] **Step 2: Run and observe RED**

Run: `npm test -- --run tests/runtime-switch.test.tsx`

Expected: FAIL because App has no Provider Runtime or source control.

- [ ] **Step 3: Add runtime hook and truthful status UI**

Runtime 根据 `VITE_AHT_DATA_SOURCE` 设定初始 source，默认 `fixture`；Gateway URL 使用 `VITE_AHT_GATEWAY_URL`，缺失时显示 unavailable。切换时先 disconnect 旧 provider、清空 Gateway 数据、再 connect 新 provider；保留 device display/battery，但不以 fixture agents/servers 填充 Gateway。

- [ ] **Step 4: Run runtime and existing tests GREEN**

Run: `npm test -- --run tests/runtime-switch.test.tsx tests/app.test.tsx tests/navigation.test.tsx tests/needs-you.test.tsx`

Expected: PASS.

### Task 5: 接入 A/X 审批命令和 reference Gateway harness

**Files:**
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/useHardwareShortcuts.ts`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/App.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/ApprovalPanel.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/approval-gateway.test.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/scripts/gateway-fixture.mjs`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/scripts/dev-gateway.mjs`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/package.json`

- [ ] **Step 1: Write failing A/X and harness tests**

审批面板下按 `A` 调用 approve、按 `X` 调用 reject；非审批页面按 `A` 仍进入 Agents。reference Gateway 接收 command 后返回 ack 和 `needs_you_resolved` event。

- [ ] **Step 2: Run and observe RED**

Run: `npm test -- --run tests/approval-gateway.test.tsx`

Expected: FAIL because A/X callbacks and reference harness do not exist.

- [ ] **Step 3: Implement context-aware shortcuts and local reference server**

保持按钮点击、快捷键和 Provider `decide()` 共用同一命令路径。使用 `ws` 启动 `127.0.0.1:8787` reference server；它只返回固定协议 snapshot，并在合法 approve/reject command 后回传 ack + event，明确标记为 local reference harness。

- [ ] **Step 4: Run focused tests GREEN**

Run: `npm test -- --run tests/approval-gateway.test.tsx`

Expected: PASS.

### Task 6: 浏览器真实 WebSocket 验收、文档和 V0.2 commit

**Files:**
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/README.md`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/docs/verification/aht-v0-2-gateway.md`

- [ ] **Step 1: Run full automated checks**

Run: `npm test -- --run` and `npm run build`.

- [ ] **Step 2: Start both local services**

Run Vite at `http://127.0.0.1:4173/` and reference Gateway at `ws://127.0.0.1:8787`.

- [ ] **Step 3: Use Browser for the target flow**

The flow under test is: Fixture Home → Gateway source → WebSocket snapshot → open Codex approval → A approve → gateway ack/event → close/reconnect → switch back Fixture.

Capture URL/title, DOM snapshot, screenshot, console logs, connection status, and visible approved state.

- [ ] **Step 4: Write the verification record**

Record which checks prove connection, no-crash disconnect, resume cursor, command ack/event, and source switching. Mark real production Gateway/auth/Agent adapters as remaining scope.

- [ ] **Step 5: Commit the V0.2 slice**

```bash
git add .
git diff --cached --check
git commit -m "feat: add AHT v0.2 gateway provider"
```
