# AHT 底层公开协议设计

状态：按用户授权进入执行
日期：2026-08-18

## 1. 目标与完成定义

AHT 的底层公开协议是 Browser、Brick Pro Native、reference Gateway、未来生产 Gateway 和 Agent Adapter 之间唯一共享的业务边界。本阶段不再把 `aht.gateway.v1` 视为只有 snapshot/event/command 的演示协议，而是补齐能够支撑第一条业务闭环的公开契约：

```text
身份/配对 → 会话建立 → 权限确认 → snapshot 基线
→ Needs You/Agent/Session/Server 状态
→ 带版本前置条件的审批命令
→ ack（已接收）→ 最终 event（已确认）→ audit 读回
```

“协议全部做完”的退出标准是：协议类型、严格解析、客户端 provider、reference Gateway、状态 reducer、命令幂等/目标版本校验、错误/resync、业务状态机和测试可以在本地完整跑通；真实生产认证服务和真实 Codex Adapter 必须通过相同 contract 接入，不能由 fixture 冒充。

## 2. 非目标

- 不在浏览器端保存 bearer token、客户密钥或真实客户数据；协议只传递 credential reference 和服务端返回的 session metadata。
- 不把本地 reference Gateway 宣称为生产认证、租户隔离、持久化事件库或真实 Codex 连接。
- 第一业务切片只开放 Needs You 的 `approve`、`reject`、`defer`；聊天、Shell、stop/steer、批量审批和离线队列不进入协议承诺。
- Browser 和 Native 不各自定义业务对象；Native 只复用同一 wire contract 和本地渲染投影。

## 3. 权威边界

| 数据 | 权威 | 客户端行为 |
| --- | --- | --- |
| 电量、显示、输入、传输连接 | AHT 设备/客户端 | 作为本地 capability 展示，不能写入 Gateway snapshot |
| 用户、租户、设备、session、scope | Gateway/Auth | 未授权、过期或 scope 不足时 fail closed |
| Agent、Session、Needs You、Server、Network | Gateway | 只接受带 revision/event_id 的 snapshot/event |
| 审批 policy、目标状态、命令幂等 | Gateway/Policy | 客户端只做预校验，Gateway 必须再次校验 |
| 审批最终状态与审计 | Gateway event/audit | command ack 不能直接变成最终成功 |

`received_at`、`freshness` 和 `stale_reason` 是客户端对 wire snapshot 的可验证投影，不由客户端伪造为 Gateway 生成时间。`generated_at`、`revision`、`event_id`、`permission_scope` 和业务上下文由 Gateway 提供。

## 4. Wire contract

所有消息是 JSON，顶层必须包含：

```ts
interface GatewayEnvelope {
  protocol: 'aht.gateway.v1';
  type: string;
  message_id: string;
}
```

`message_id` 用于传输层追踪；审批命令的 `command_id` 是跨重连重试保持不变的幂等键。

### 4.1 身份、配对与会话

客户端 hello：

```ts
interface GatewayHelloMessage extends GatewayEnvelope {
  type: 'hello';
  client_id: string;
  device_id: string;
  client_kind: 'browser' | 'native';
  auth?: {
    mode: 'paired_session' | 'pairing_ref' | 'reference';
    credential_ref: string;
  };
  resume_after?: string;
}
```

服务端 hello ack：

```ts
interface GatewayHelloAckMessage extends GatewayEnvelope {
  type: 'hello_ack';
  connection_id: string;
  session: {
    id: string;
    principal_id: string | null;
    tenant_id: string | null;
    device_id: string;
    expires_at: string | null;
  };
  authorization: {
    status: 'authorized' | 'pairing_required' | 'unauthorized';
    permission_scope: string[];
    reason: string | null;
  };
  server_time: string;
  resume_supported: boolean;
  capabilities: string[];
}
```

配对只公开引用和结果，不传递长期 secret：`pairing_begin → pairing_challenge → pairing_confirm → pairing_result`。reference Gateway 可以使用固定的 reference credential 完成 authorized session；生产实现必须由 Auth/Pairing 服务签发 session 和 scope。

### 4.2 状态基线

```ts
interface GatewaySnapshot {
  source: 'gateway';
  schema_version: 1;
  revision: number;
  event_id: string;
  generated_at: string;
  tenant_id: string;
  principal_id: string;
  device_id: string;
  permission_scope: string[];
  agents: GatewayAgent[];
  sessions: GatewaySession[];
  needs_you: GatewayNeedsYou[];
  servers: GatewayServer[];
  network: GatewayNetwork | null;
}
```

`GatewaySession` 是 Agent 会话的公开投影，至少包含 `id`、`agent_id`、`status`、`started_at`、`updated_at` 和 `title`。Agent 上的 `session` 仍保留为兼容性的 session id 引用；不会把 session 的内部日志或 secret 推给客户端。

### 4.3 增量事件

每个事件必须有 `event_id`、单调 `revision`、`generated_at`、`actor` 和 `audit` 上下文：

```ts
interface GatewayEventMessage extends GatewayEnvelope {
  type: 'event';
  event_id: string;
  revision: number;
  generated_at: string;
  actor: { kind: 'user' | 'agent' | 'system'; id: string };
  audit: {
    tenant_id: string;
    principal_id: string;
    device_id: string;
    session_id: string;
    command_id: string | null;
    source_event_id: string | null;
    source_revision: number | null;
  };
  event: GatewayEvent;
}
```

公开事件集合：

```text
needs_you_created
needs_you_updated
needs_you_resolved
agent_updated
session_updated
server_updated
permission_updated
```

事件不能跨越 snapshot 基线直接应用；revision 不连续、event_id 重复但内容不同、目标不存在或事件类型结构无效时，客户端进入 resync/error，不猜测状态。

### 4.4 命令、幂等和最终结果

第一阶段命令固定为：

```ts
interface GatewayCommandMessage extends GatewayEnvelope {
  type: 'command';
  command_id: string;
  command: 'approve' | 'reject' | 'defer';
  target: { needs_you_id: string; agent_id: string };
  precondition: { event_id: string; revision: number };
}
```

Gateway 必须依次校验：session authorization、`needs_you:write`、command_id 幂等记录、target agent、target status、target action、precondition event/revision 和 policy。命令回执：

```ts
interface GatewayCommandAckMessage extends GatewayEnvelope {
  type: 'command_ack';
  command_id: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  phase: 'pending_event' | 'final' | 'not_applicable';
  reason: string | null;
  final_event_id: string | null;
  retryable: boolean;
}
```

`accepted + pending_event` 只表示 Gateway 已接收；只有含同一 `command_id` 的 `needs_you_resolved` event 才能把 UI 变成最终 approved/rejected/deferred。相同 command_id 重试必须返回同一逻辑结果，不能再次触发 Agent 动作。

### 4.5 错误、resync 和心跳

- `error` 采用稳定 code、`retryable`、`request_message_id`、`details`；客户端不得依赖中文 message 做分支。
- `resync_required` 携带 reason 和 `after_revision`；客户端清空 cursor 但保留最后一份 stale 展示，随后只接受新的 snapshot。
- `ping/pong` 只维护传输活性，不改变业务 freshness；freshness 仍由 snapshot/event 的 `generated_at` 判断。
- parser 对未知消息、缺字段、错误 union、非法时间、无效 scope、事件 revision 回退和 command target 缺失都返回 typed protocol error，不抛到 React render。

稳定错误 code 至少包括：`invalid_message`、`invalid_protocol`、`unknown_type`、`invalid_snapshot`、`invalid_event`、`unauthorized`、`pairing_required`、`permission_denied`、`stale_target`、`invalid_target`、`action_not_allowed`、`duplicate_command`、`policy_denied`、`resync_required`、`server_unavailable`。

## 5. 客户端业务状态机

### 5.1 连接与授权

```text
idle → connecting → hello_ack/authorized → connected
                    ├→ pairing_required
                    └→ unauthorized/error
connected → reconnecting → connected | resyncing | error
```

`hello_ack` 未授权时不能展示为已连接；snapshot 的 scope 不能覆盖 session authorization 的更窄范围。

### 5.2 审批

```text
available
  → sending
  → gateway_accepted
  → waiting_final_event
  → confirmed(approved|rejected|deferred)

sending → rejected/failed
waiting_final_event → result_pending（断线/超时）
```

结果待确认时不自动重发；用户可以刷新/resync 或稍后处理。浏览器和 Native 只消费同一状态，不各自定义成功条件。

## 6. Reference Gateway 与真实 Adapter 边界

reference Gateway 实现内存版 session/permission/policy/idempotency/audit/event log，支持：

1. authorized reference hello；
2. snapshot 携带完整 context；
3. 版本前置条件校验；
4. accepted ack 后生成带 audit 的最终 event；
5. duplicate command 读回原结果；
6. stale target、只读 scope、未授权和 resync；
7. resume cursor 和受控事件重放。

真实 Gateway 只需实现同一 wire contract；真实 Codex Adapter 负责把 Codex 的人工决策请求映射为 `needs_you_created`，把 command 映射为 Codex action，并用最终 Adapter 结果发出 `needs_you_resolved`。在该 Adapter 接入前，页面必须继续显示 reference/developer preview，不得显示 production ready。

## 7. 验收与文档

必须有自动化测试证明：

- client/server 双向 parser 对合法/非法 union 严格收敛；
- hello/session authorization、scope 和 pairing-required 状态不被误报为 connected；
- snapshot/event revision、cursor、resync 和未知事件 fail closed；
- command precondition、idempotency、duplicate readback、policy/permission rejection 正确；
- ack 与最终 event 分离，审计 context 可读回；
- Browser runtime 在 `accepted`、`waiting_final_event`、`result_pending` 时不提前显示最终结果；
- reference WebSocket 能从连接到最终业务结果完整跑通；
- 全量前端、构建、native 回归和协议验证记录通过。

真实生产认证、持久化、Codex Adapter 和部署是该公开协议的外部实现方，不在本地 reference 证据中被伪造为已完成。
