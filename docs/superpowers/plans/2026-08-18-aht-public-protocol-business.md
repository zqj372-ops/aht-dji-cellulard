# AHT Public Protocol and Business Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 `aht.gateway.v1` 的公开协议契约和本地可验证业务闭环：身份/会话、权限 scope、snapshot/event、版本前置条件、命令幂等、ack/final event、审计、错误/resync，并让 Browser runtime 在 reference Gateway 上完成真实审批读回。

**Architecture:** `src/providers/protocol.ts` 是唯一 wire contract，提供双向严格 parser 和稳定错误 code；`src/providers/gateway/session.ts` 提供纯函数 session/permission/policy/idempotency 规则；`GatewayProvider` 负责传输、连接状态和业务生命周期，`reducer.ts` 只负责按 revision 投影领域状态。reference Gateway 仍是本地内存实现，但必须实现同一 session、scope、precondition、ledger 和 audit contract；真实 Auth、Codex Adapter 和持久化服务只作为未来实现方接入，不在 reference 中伪装。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、原生 WebSocket、Node `ws` reference harness；不增加 schema/transport 运行时依赖，不修改视觉/native 协作边界。

**Ownership boundary:** 本计划只修改 `src/providers/**`、`src/app/useAhtRuntime.ts`、`src/app/types.ts`（如业务状态需要）、`src/app/App.tsx`、`src/components/ApprovalPanel.tsx` 的协议状态展示、Gateway scripts、协议测试和本计划验证文档。协作任务 `01a0110f-5721-73a3-b14a-c2164cbe93a8` 保持独占 `src/screens/**`、`src/styles/**`、其余视觉组件、`native/**`、视觉测试和截图；不得清理或回滚其未提交改动。

---

### Task 1: Freeze the complete wire contract with RED tests

**Files:**
- Create: `tests/providers/public-protocol.test.ts`
- Modify: `tests/providers/protocol.test.ts`
- Modify: `tests/providers/gateway-provider.test.ts`

- [x] **Step 1: Add failing tests for both client and server messages**

Use canonical fixtures that include `message_id`, `device_id`, `client_kind`, session context, `source: 'gateway'`, `tenant_id`, `principal_id`, `sessions`, event `actor/audit`, command `precondition`, and ack `phase/retryable`.

The tests must assert these exact behaviors:

```ts
test('parses an authorized hello with a resumable session contract', () => {
  const parsed = parseGatewayClientMessage({
    protocol: 'aht.gateway.v1', type: 'hello', message_id: 'msg-hello',
    client_id: 'aht-browser', device_id: 'device-01', client_kind: 'browser',
    auth: { mode: 'reference', credential_ref: 'reference:aht' },
    resume_after: 'evt-42',
  });

  expect(parsed).toMatchObject({ type: 'hello', device_id: 'device-01', resume_after: 'evt-42' });
});

test('rejects an approval command without the snapshot precondition', () => {
  expect(parseGatewayClientMessage({
    protocol: 'aht.gateway.v1', type: 'command', message_id: 'msg-command',
    command_id: 'cmd-01', command: 'approve',
    target: { needs_you_id: 'need-01', agent_id: 'codex' },
  })).toEqual(expect.objectContaining({ type: 'protocol_error', code: 'invalid_message' }));
});

test('rejects an event with an unknown event union or incomplete audit context', () => {
  expect(parseGatewayServerMessage({
    protocol: 'aht.gateway.v1', type: 'event', message_id: 'msg-event',
    event_id: 'evt-43', revision: 43, generated_at: '2026-08-18T03:00:00.000Z',
    actor: { kind: 'system', id: 'gateway' },
    audit: { tenant_id: 'tenant-01', principal_id: 'user-01', device_id: 'device-01', session_id: 'session-01', command_id: null, source_event_id: null, source_revision: null },
    event: { type: 'unknown_event' },
  })).toEqual(expect.objectContaining({ type: 'protocol_error', code: 'invalid_event' }));
});
```

Also cover hello ack authorization states, snapshot authority fields, `needs_you_updated`, `session_updated`, `permission_updated`, `command_ack` phases, `resync_required.after_revision`, `error.details`, `ping/pong`, pairing messages, invalid timestamps, invalid scopes, revision zero/negative, duplicate message ids, and unknown top-level message types.

- [x] **Step 2: Run the focused RED suite**

Run:

```bash
npm test -- --run tests/providers/public-protocol.test.ts tests/providers/protocol.test.ts
```

Expected result: FAIL because the client parser, complete session/event fields, strict event unions and new ack/error contracts do not exist yet. Fix test setup errors until the failure is about the missing protocol behavior, then proceed.

### Task 2: Implement canonical types and strict bidirectional parsing

**Files:**
- Modify: `src/providers/protocol.ts`
- Modify: `src/providers/types.ts`
- Create: `src/providers/protocolValidation.ts`

- [x] **Step 1: Add the canonical domain and message types**

Define in `src/providers/protocol.ts`:

```ts
export const gatewayProtocol = 'aht.gateway.v1' as const;
export const gatewaySchemaVersion = 1 as const;

export type GatewayClientMessage = GatewayHelloMessage | GatewayCommandMessage | GatewayPairingMessage | GatewayPingMessage;
export type GatewayServerMessage = GatewayHelloAckMessage | GatewaySnapshotMessage | GatewayEventMessage | GatewayCommandAckMessage | GatewayPairingMessage | GatewayResyncRequiredMessage | GatewayErrorMessage | GatewayPongMessage;

export interface GatewayCommandMessage extends GatewayEnvelope {
  type: 'command';
  command_id: string;
  command: 'approve' | 'reject' | 'defer';
  target: { needs_you_id: string; agent_id: string };
  precondition: { event_id: string; revision: number };
}

export interface GatewaySession {
  id: string;
  agent_id: string;
  status: 'idle' | 'running' | 'waiting_input' | 'waiting_approval' | 'completed' | 'error' | 'disconnected';
  title: string;
  started_at: string;
  updated_at: string;
}

export interface GatewayEventAudit {
  tenant_id: string;
  principal_id: string;
  device_id: string;
  session_id: string;
  command_id: string | null;
  source_event_id: string | null;
  source_revision: number | null;
}
```

Keep the existing Agent/Needs You/Server objects but make the new authority/context fields required. Add the stable union types from the design spec for pairing, authorization, events, command ack, resync, errors, ping and pong. Extend `ProviderEvent` with session authorization and command lifecycle fields without removing compatibility properties already used by the UI.

- [x] **Step 2: Add reusable validators with path-aware errors**

In `src/providers/protocolValidation.ts`, implement small guards for non-empty strings, ISO timestamps, positive integers, string scopes, records, arrays, Agent, Session, Needs You, Server, Network, audit context and each event union. Return:

```ts
export interface ProtocolIssue { path: string; code: string; message: string; }
export function invalidMessage(code: ProtocolErrorCode, message: string, path?: string): ProtocolErrorMessage;
```

Unknown enum values, missing nested fields and unknown event types must be invalid; do not cast an arbitrary record to a usable union. Do not use a generic `Array.isArray` check for domain arrays without validating every element.

- [x] **Step 3: Export `parseGatewayClientMessage` and strengthen server parsing**

Both parsers must require `protocol`, non-empty `type`, non-empty `message_id`, and the complete fields for their selected union. `parseGatewayServerMessage` must return `invalid_snapshot` for an invalid baseline and `invalid_event` for an invalid event; it must preserve `details.path` so the UI/logging layer can report the exact contract failure without branching on localized text.

- [x] **Step 4: Run the protocol GREEN suite**

Run:

```bash
npm test -- --run tests/providers/public-protocol.test.ts tests/providers/protocol.test.ts
npm run build
```

Expected result: all protocol tests pass and TypeScript builds before provider behavior is changed.

### Task 3: Implement session, permission, policy and command ledger rules

**Files:**
- Create: `src/providers/gateway/session.ts`
- Create: `tests/providers/gateway-session.test.ts`
- Modify: `src/providers/trust.ts`

- [x] **Step 1: Write failing pure-rule tests**

Test these cases without WebSocket or React:

```ts
test('reference session is authorized only for its declared tenant/device scope', () => {
  const session = createReferenceSession({ clientId: 'aht-browser', deviceId: 'device-01' });
  expect(authorizeSession(session, 'device-01').status).toBe('authorized');
  expect(authorizeSession(session, 'other-device').status).toBe('unauthorized');
});

test('command precondition rejects a changed snapshot before policy execution', () => {
  const result = evaluateDecisionCommand(command, session, snapshotAtRevision(8));
  expect(result).toMatchObject({ allowed: false, reason: 'stale_target' });
});

test('same command id returns the original result and does not execute twice', () => {
  const ledger = new CommandLedger();
  const first = ledger.recordAccepted(command, 'evt-09');
  const duplicate = ledger.lookup(command.command_id);
  expect(duplicate).toEqual(first);
});
```

Also cover unauthorized session, expired session, read-only scope, missing target, agent mismatch, resolved target, disallowed action, policy denial, and a valid command producing an audit context with `tenant_id`, `principal_id`, `device_id`, `session_id`, `command_id`, source event id and revision.

- [x] **Step 2: Run the pure-rule RED suite**

Run: `npm test -- --run tests/providers/gateway-session.test.ts`

Expected result: FAIL because `session.ts` and the complete decision evaluation contract do not exist.

- [x] **Step 3: Implement the minimal pure session/policy/ledger module**

Export:

```ts
export type AuthorizationState = 'authorized' | 'pairing_required' | 'unauthorized';
export interface GatewaySessionContext { id: string; clientId: string; deviceId: string; principalId: string | null; tenantId: string | null; permissionScope: string[]; expiresAt: string | null; }
export interface DecisionEvaluation { allowed: boolean; reason: string | null; retryable: boolean; audit: GatewayEventAudit | null; }
export function createReferenceSession(input: { clientId: string; deviceId: string }): GatewaySessionContext;
export function authorizeSession(session: GatewaySessionContext, deviceId: string, nowMs?: number): { status: AuthorizationState; reason: string | null };
export function evaluateDecisionCommand(command: GatewayCommandMessage, session: GatewaySessionContext, snapshot: GatewaySnapshot): DecisionEvaluation;
export class CommandLedger { lookup(commandId: string): CommandRecord | null; recordAccepted(command: GatewayCommandMessage, finalEventId: string | null): CommandRecord; recordRejected(command: GatewayCommandMessage, reason: string): CommandRecord; }
```

The ledger is in-memory for reference use, keyed by command id and storing the complete ack/final event identity. It must reject a reused command id whose target/precondition differs instead of treating it as a harmless duplicate. Update `getDecisionGate` so session authorization and effective scope cannot be widened by a snapshot.

- [x] **Step 4: Run pure rules GREEN**

Run: `npm test -- --run tests/providers/gateway-session.test.ts tests/providers/trust.test.ts`

### Task 4: Make GatewayProvider speak the complete lifecycle

**Files:**
- Modify: `src/providers/gateway/GatewayProvider.ts`
- Modify: `src/providers/gateway/reducer.ts`
- Modify: `src/providers/types.ts`
- Modify: `tests/providers/gateway-provider.test.ts`
- Modify: `tests/providers/gateway-reducer.test.ts`

- [x] **Step 1: Add failing provider tests for hello/session and preconditioned commands**

Extend the fake socket tests to assert:

```ts
expect(JSON.parse(socket.sent[0] ?? '{}')).toMatchObject({
  type: 'hello', device_id: 'device-01', client_kind: 'browser',
  auth: { mode: 'reference', credential_ref: 'reference:aht' },
});

expect(command).toMatchObject({
  command_id: expect.any(String),
  precondition: { event_id: 'evt-01', revision: 1 },
});
```

Add tests for authorized/pairing-required/unauthorized hello ack, accepted ack phase `pending_event`, final event matching the command id, duplicate ack readback, stale revision rejection without send, revision gap resync, and invalid event error. Do not weaken existing fail-closed tests.

- [x] **Step 2: Run provider RED**

Run: `npm test -- --run tests/providers/gateway-provider.test.ts tests/providers/gateway-reducer.test.ts`

Expected result: FAIL on the new message fields and lifecycle assertions.

- [x] **Step 3: Implement provider session and lifecycle state**

Add `deviceId`, `clientKind`, `auth`, and deterministic `messageId` generation to `GatewayProviderOptions`. On hello ack, store session/authorization and emit a typed authorization event; only authorized sessions can become connected. On snapshot, intersect snapshot scope with session scope. On `decide()`, include the current snapshot `event_id/revision` precondition and do not send if the local gate or precondition is unavailable.

Track command phases as `sending`, `gateway_accepted`, `waiting_final_event`, `confirmed`, `rejected`, `failed`, or `result_pending`. An ack never mutates item status. Only a matching final event with the same `command_id` can resolve the pending command and update the snapshot. On connection loss while waiting, emit `result_pending` and preserve the command id without auto-resubmitting.

Make reducer application require an expected next revision and set `event_id`/`generated_at` from the event envelope. Revision gaps or duplicate event ids with different revisions must emit a resync/error event and leave the last trusted state unchanged.

- [x] **Step 4: Run provider GREEN**

Run:

```bash
npm test -- --run tests/providers/gateway-provider.test.ts tests/providers/gateway-reducer.test.ts tests/providers/gateway-session.test.ts
```

### Task 5: Upgrade reference Gateway to implement the public contract

**Files:**
- Modify: `scripts/gateway-fixture.mjs`
- Modify: `scripts/dev-gateway.mjs`
- Create: `scripts/reference-gateway-contract.mjs`
- Create: `tests/providers/reference-gateway.test.mjs`

- [x] **Step 1: Add a failing Node contract test**

Start the reference server on an ephemeral port and use `ws` to verify:

1. reference hello returns authorized session, tenant/device identity, scope, server time and capabilities;
2. snapshot contains source/context/sessions and a monotonic revision/event id;
3. valid command receives `accepted + pending_event`, then a final event with matching command id and audit context;
4. repeating the same command id returns duplicate/original result without a second event;
5. changed precondition, read-only credential and unknown target return structured rejection;
6. unknown resume cursor returns `resync_required`, then a fresh snapshot;
7. ping returns pong and malformed client messages return structured errors.

- [x] **Step 2: Run the reference RED test**

Run: `npm test -- --run tests/providers/reference-gateway.test.ts`

Expected result: FAIL because the server does not yet implement session/ledger/audit contract.

- [x] **Step 3: Implement the reference contract without production claims**

Move canonical snapshot/event construction into `scripts/reference-gateway-contract.mjs`. Keep one in-memory session registry, command ledger and bounded event history per server process. Validate every received message with the same protocol rules; never accept a command before authorization, scope, target, action and precondition checks. Use `message_id` on every outbound message, `command_id` for idempotency, and a deterministic reference tenant/principal/device identity.

For an accepted decision: write the ledger record, send `command_ack` with `phase: 'pending_event'`, update the snapshot, append one event with `actor` and `audit`, broadcast it, and allow a duplicate retry to read back the original ack/final event identity. If the event history cannot satisfy `resume_after`, send `resync_required` and a complete snapshot on the next hello.

- [x] **Step 4: Run reference GREEN and real WebSocket loop**

Run:

```bash
npm test -- --run tests/providers/reference-gateway.test.mjs
npm run gateway:dev
```

Use a bounded `ws` client to perform hello → snapshot → command → ack → event → duplicate → ping/pong → reconnect/resync. Stop the server after the check.

### Task 6: Expose the business lifecycle in runtime/UI without changing visual ownership

**Files:**
- Modify: `src/app/types.ts`
- Modify: `src/app/useAhtRuntime.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/components/ApprovalPanel.tsx`
- Create: `tests/approval-lifecycle.test.tsx`

- [x] **Step 1: Add failing lifecycle UI tests**

Use a controllable provider harness to assert that a Gateway approval moves through `发送中 → Gateway 已接收 → 等待最终事件` and does not show `已批准（Gateway）` until the matching `needs_you_resolved` event arrives. Assert a disconnect while waiting shows `结果待确认` and the decision button does not auto-send again. Assert fixture behavior remains immediate.

- [x] **Step 2: Run lifecycle RED**

Run: `npm test -- --run tests/approval-lifecycle.test.tsx`

Expected result: FAIL because runtime currently exposes no command phase and the panel only renders item status.

- [x] **Step 3: Implement runtime command state and truthful UI status**

Add a serializable `DecisionLifecycle` to runtime state keyed by item id, with `commandId`, `phase`, `reason`, `sourceEventId`, and `finalEventId`. Reset it on source switch. The `decide()` callback sets `sending`, provider ack sets `gateway_accepted`/`waiting_final_event`, matching event sets `confirmed`, and disconnect/error sets `result_pending` or `failed`. `ApprovalPanel` disables duplicate actions during a non-terminal phase and renders status text from phase; it must never infer final status from an ack.

- [x] **Step 4: Run UI lifecycle GREEN and regression tests**

Run:

```bash
npm test -- --run tests/approval-lifecycle.test.tsx tests/approval-gate.test.tsx tests/approval-gateway.test.tsx tests/runtime-switch.test.tsx
```

### Task 7: Complete protocol documentation, verification and scoped commit

**Files:**
- Create: `docs/verification/aht-public-protocol-business.md`
- Modify: `README.md` only for truthful protocol commands/limitations
- Modify: `docs/superpowers/plans/2026-08-18-aht-public-protocol-business.md`

- [x] **Step 1: Run all automated gates**

Run:

```bash
npm test -- --run
npm run build
make -C native test host-smoke arm64 uinput-pad app-package
git diff --check
```

Record exact counts and any native visual verification without staging the collaboration task.

- [x] **Step 2: Record public protocol evidence**

The verification record must distinguish:

- contract complete and exercised locally;
- reference session/policy/ledger/audit behavior;
- Browser runtime ack/final-event behavior;
- remaining external implementation boundaries: production Auth/Pairing, persistent event store, real Codex Adapter and deployment.

- [x] **Step 3: Commit only this protocol/business slice**

Stage explicitly, never `git add -A`:

```bash
git add src/providers src/app/types.ts src/app/useAhtRuntime.ts src/app/App.tsx src/components/ApprovalPanel.tsx src/components/ConnectionStatus.tsx \
  scripts/gateway-fixture.mjs scripts/dev-gateway.mjs scripts/reference-gateway-contract.mjs \
  tests/providers tests/approval-lifecycle.test.tsx \
  docs/superpowers/plans/2026-08-18-aht-public-protocol-business.md \
  docs/verification/aht-public-protocol-business.md
git diff --cached --check
git commit -m "feat: complete AHT public protocol business loop"
```

The commit must not contain `native/**`, visual-only tests/components/styles, screenshots, `.gitignore`, `a.o`, `README.md` collaborator changes, or unrelated existing docs. README remains outside this scoped commit because the concurrent visual/native task owns its current modifications.
