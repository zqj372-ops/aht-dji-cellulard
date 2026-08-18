# AHT V0.2 Real Gateway 设计

状态：设计确认，进入实现

## 目标

V0.2 保持 AHT V0.1 的中文 UI 和 `1024 × 768` Reference Display Profile 不变，把数据边界从单一 fixture 状态升级为可切换的 Provider 模型：

```text
AHT UI
  ↓
Provider Runtime
  ├── FixtureProvider
  └── GatewayProvider
        ↓
    WebSocket Gateway
```

本阶段验证一条完整闭环：

```text
Agent Event → AHT → Human Action → Gateway Command → Agent Event
```

## 范围

本阶段交付：

- `FixtureProvider` 继续提供无网络、可重复的本地 UI 数据。
- `GatewayProvider` 使用原生 WebSocket 连接版本化 Gateway 协议。
- Gateway 断线不崩溃，保留最近一份 Gateway snapshot 并显示 stale/reconnecting 状态。
- 连接恢复后携带 `resume_after`，支持事件续传；无法续传时执行 snapshot resync。
- Gateway 产生的 Codex approval 出现在 Needs You，审批命令通过 WebSocket 发送，状态只由 Gateway event 确认。
- UI 可以在 Fixture 和 Gateway 之间随时切换；切换到 Gateway 不会偷偷显示 fixture 数据。
- 提供一个仅用于本地浏览器验收的 reference Gateway harness，不宣称生产 Gateway。

本阶段不交付：

- BRICK Framebuffer、SDL2/Slint、4G 驱动或真实麦克风。
- SSH/Mosh、Terminal 真实连接和 Voice STT。
- Codex、DeepSeek Harness 或其他 Agent 的生产 Adapter 实现。
- 生产认证、租户权限、持久化事件存储和高可用 Gateway。

## 统一领域对象

### Agent

Agent 的协议对象使用稳定字段，不要求前端理解底层 Agent Adapter：

```ts
type AgentStatus =
  | 'idle'
  | 'running'
  | 'waiting_input'
  | 'waiting_approval'
  | 'completed'
  | 'error'
  | 'disconnected';

type AgentMaturity =
  | 'stable'
  | 'beta'
  | 'developer_preview'
  | 'generic'
  | 'unavailable'
  | 'planned';

interface GatewayAgent {
  id: string;
  type: string;
  name: string;
  model: string | null;
  server: string | null;
  workspace: string | null;
  session: string | null;
  status: AgentStatus;
  current_task: string | null;
  elapsed_seconds: number | null;
  needs_user: boolean;
  maturity: AgentMaturity;
  capabilities: Record<string, boolean>;
}
```

当前 UI 使用的 `displayName`、`shortName`、图标资源和中文摘要由客户端适配层从 `GatewayAgent` 生成；Gateway 不发送 CDN URL。`type` 用于客户端选择本地白底图标和成熟度展示，未知类型使用 `generic`/`unavailable`，不得导致页面崩溃。

### Needs You

```ts
type NeedsYouType =
  | 'approval'
  | 'question'
  | 'error'
  | 'completed'
  | 'security'
  | 'server_alert';

interface GatewayNeedsYou {
  id: string;
  agent_id: string;
  type: NeedsYouType;
  title: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  created_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'deferred';
  actions: Array<'approve' | 'reject' | 'defer'>;
}
```

前端仍可把它投影为现有 `inbox` 卡片，因此 Home/Needs You 不需要知道 Codex、Hermes、OpenClaw 或 dsh 的底层协议。

### Gateway Snapshot

```ts
interface GatewaySnapshot {
  schema_version: 1;
  revision: number;
  event_id: string;
  agents: GatewayAgent[];
  needs_you: GatewayNeedsYou[];
  servers: GatewayServer[];
  network: GatewayNetwork | null;
}

interface GatewayServer {
  id: string;
  name: string;
  online: boolean;
  rtt_ms: number | null;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  services: Record<string, 'healthy' | 'degraded' | 'offline' | 'unknown'>;
  agents: number;
}

interface GatewayNetwork {
  link: 'Wi-Fi' | '4G' | 'offline';
  rtt_ms: number | null;
  vpn: boolean;
}
```

Battery/display 属于 AHT 设备本地状态；Servers、Agents 和 Needs You 属于 Gateway authority。Gateway 缺少网络或服务器字段时，客户端显示 unavailable，不使用旧 fixture 值填充。

## Provider 接口

UI 只依赖 Provider Runtime，不直接 import WebSocket：

```ts
type DataSource = 'fixture' | 'gateway';
type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

interface DecisionCommand {
  itemId: string;
  agentId: string;
  decision: 'approve' | 'reject' | 'defer';
}

interface AhtProvider {
  readonly source: DataSource;
  subscribe(listener: (event: ProviderEvent) => void): () => void;
  connect(): void;
  disconnect(): void;
  decide(command: DecisionCommand): Promise<CommandAck>;
}

interface CommandAck {
  commandId: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  reason?: string;
}

type ProviderEvent =
  | { type: 'connection'; state: ConnectionState; reason?: string }
  | { type: 'snapshot'; snapshot: FixtureState; eventId?: string; stale?: boolean }
  | { type: 'command_ack'; ack: CommandAck }
  | { type: 'error'; code: string; message: string; retryable: boolean };
```

`FixtureProvider` 在 `connect()` 时同步产生 connected + snapshot；决策直接通过纯本地 reducer 更新 snapshot。`GatewayProvider` 的决策必须等待 command ack，最终的 approved/rejected/deferred 状态必须来自 Gateway event。

## WebSocket 协议 `aht.gateway.v1`

所有消息均为 JSON，顶层至少包含：

```ts
interface GatewayEnvelope {
  protocol: 'aht.gateway.v1';
  type: string;
}
```

### Client → Gateway

首次连接和重连都发送 hello：

```json
{
  "protocol": "aht.gateway.v1",
  "type": "hello",
  "client_id": "aht-browser",
  "resume_after": "evt-42"
}
```

审批命令使用幂等 `command_id` 和显式目标：

```json
{
  "protocol": "aht.gateway.v1",
  "type": "command",
  "command_id": "cmd-0001",
  "command": "approve",
  "target": {
    "needs_you_id": "codex-production-approval",
    "agent_id": "codex"
  }
}
```

### Gateway → Client

连接确认：

```json
{
  "protocol": "aht.gateway.v1",
  "type": "hello_ack",
  "connection_id": "conn-1",
  "resume_supported": true
}
```

首次 snapshot 或 resync：

```json
{
  "protocol": "aht.gateway.v1",
  "type": "snapshot",
  "event_id": "evt-42",
  "snapshot": { "schema_version": 1, "revision": 42, "event_id": "evt-42" }
}
```

增量事件：

```json
{
  "protocol": "aht.gateway.v1",
  "type": "event",
  "event_id": "evt-43",
  "revision": 43,
  "event": {
    "type": "needs_you_resolved",
    "needs_you_id": "codex-production-approval",
    "status": "approved"
  }
}
```

命令回执和无法续传：

```json
{
  "protocol": "aht.gateway.v1",
  "type": "command_ack",
  "command_id": "cmd-0001",
  "status": "accepted"
}
```

```json
{
  "protocol": "aht.gateway.v1",
  "type": "resync_required",
  "reason": "event_retention_exceeded"
}
```

`resync_required` 会清空 resume cursor 并等待新的 snapshot；不会把 fixture 数据注入 Gateway 状态。

## 断线、重连和错误边界

- WebSocket 建立后先进入 `connecting`，收到 `hello_ack` 后进入 `connected`。
- close/error 后进入 `reconnecting`，使用确定性的指数退避 `250ms → 500ms → 1s → 2s → 5s`。
- 断线期间保留最后一个 Gateway snapshot，但所有卡片、Server 指标和连接徽标标记 stale/unavailable；不能显示为实时在线。
- 重连 hello 携带最近一次 `event_id`；服务端可 replay，也可以回复 `resync_required`。
- 非法 JSON、未知 message type、未知 event type 和缺失字段只产生可见错误状态，不得抛出到 React render。
- Gateway 没有 URL 或浏览器不支持 WebSocket 时，状态为 `error/unavailable`，页面继续可导航；切回 Fixture 立即恢复本地状态。

## A/X 与 UI 行为

- 审批面板上下文：`A` → `approve`，`X` → `reject`；按钮点击复用同一 `decide()`。
- 非审批上下文：`A` 保留 Agents 导航；`X` 无操作。
- Gateway 下点击或按键后按钮进入发送中状态；只有 `needs_you_resolved` event 才把卡片改成 approved/rejected。
- Fixture 下保持 V0.1 的本地即时决策体验。

## 验收标准

1. Browser 连接本地 reference Gateway 的 WebSocket 并收到 snapshot。
2. Gateway 主动断开后 UI 不白屏、不抛 React overlay，显示 reconnecting/stale。
3. Gateway 恢复后 hello 携带 `resume_after`，客户端可继续接收事件；resync 也能恢复。
4. Codex approval 只由 Gateway snapshot/event 产生，不从 fixture fallback 产生。
5. A/X 和批准/拒绝按钮发送带 `command_id` 的真实 WebSocket command，并能看到 command ack/event。
6. Fixture/Gateway 可在同一页面多次切换，切换过程中 UI 可导航且数据源标签始终真实。
