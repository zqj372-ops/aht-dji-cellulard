# AHT Gateway Trust Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `aht.gateway.v1` reference provider 上建立可验证的远程状态信任边界：快照必须携带来源时间和权限范围，陈旧/断线/权限不足时远程决策 fail closed，审批 UI 只允许在 Gateway 快照新鲜且具备写权限时提交。

**Architecture:** Gateway 协议负责传递 Gateway 生成时间和权限 scope；`src/providers/trust.ts` 负责纯函数计算快照新鲜度和决策 gate；`GatewayProvider` 在发送命令前再次执行 gate 和目标校验；React runtime 将 gate 传给审批面板，避免只依赖按钮或快捷键层面的限制。FixtureProvider 也提供显式的开发 trust metadata，但不会被 Gateway provider 静默使用。

**Tech Stack:** React 19、TypeScript、Vitest、原生 WebSocket、Node `ws` reference harness。此切片不引入认证服务、数据库、真实 Codex SDK 或生产部署。

**Ownership boundary:** 协作任务 `01a0110f-5721-73a3-b14a-c2164cbe93a8` 独占视觉刷新相关的 `src/screens/**`、`src/components/**`、`src/styles/**`（`ApprovalPanel.tsx` 的可信操作状态除外）、`native/**`、视觉测试和截图。本计划只修改 provider/runtime、审批可信状态、新增 provider 测试和 Gateway reference harness。

---

### Task 1: Freeze trust types with failing tests

**Files:**
- Create: `tests/providers/trust.test.ts`
- Modify: `tests/providers/protocol.test.ts`
- Modify: `tests/providers/gateway-provider.test.ts`

- [x] **Step 1: Write failing tests for freshness, permission and decision gating**

Add tests for these exact behaviors:

```ts
test('marks a recent Gateway snapshot fresh only with needs_you:write scope', () => {
  const trust = deriveGatewaySnapshotTrust(snapshot, 100_000, 100_000, 30_000);
  expect(trust.freshness).toBe('fresh');
  expect(getDecisionGate('gateway', 'connected', trust)).toEqual({ allowed: true, reason: null });
});

test('blocks a stale Gateway snapshot before sending a command', () => {
  const trust = deriveGatewaySnapshotTrust(snapshot, 100_000, 140_001, 30_000);
  expect(trust.freshness).toBe('stale');
  expect(getDecisionGate('gateway', 'connected', trust).reason).toBe('gateway_snapshot_stale');
});

test('blocks a connected Gateway snapshot without write permission', () => {
  const trust = deriveGatewaySnapshotTrust(
    { ...snapshot, permission_scope: ['needs_you:read'] },
    100_000,
    100_000,
    30_000,
  );
  expect(getDecisionGate('gateway', 'connected', trust)).toEqual({
    allowed: false,
    reason: 'permission_denied',
  });
});
```

The test fixture must include:

```ts
generated_at: '1970-01-01T00:01:40.000Z',
permission_scope: ['needs_you:read', 'needs_you:write'],
```

Also extend the protocol test so a snapshot missing `generated_at` or `permission_scope` returns `invalid_snapshot`.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run tests/providers/trust.test.ts tests/providers/protocol.test.ts tests/providers/gateway-provider.test.ts
```

Expected result: the new trust test fails because `src/providers/trust.ts` and the trust types do not exist, and existing Gateway fixtures require the new protocol authority fields. Do not add implementation before observing this failure.

### Task 2: Add explicit provider trust contracts

**Files:**
- Create: `src/providers/trust.ts`
- Modify: `src/providers/types.ts`
- Modify: `src/providers/protocol.ts`

- [x] **Step 1: Add the canonical trust types**

In `src/providers/types.ts`, add:

```ts
export type SnapshotFreshness = 'fresh' | 'stale' | 'unknown';

export interface SnapshotTrust {
  source: DataSource;
  eventId: string | null;
  revision: number | null;
  generatedAt: string | null;
  receivedAt: string | null;
  freshness: SnapshotFreshness;
  staleReason: string | null;
  permissionScope: string[];
}

export type DecisionGateReason =
  | 'gateway_not_connected'
  | 'gateway_snapshot_unavailable'
  | 'gateway_snapshot_stale'
  | 'permission_denied';

export interface DecisionGate {
  allowed: boolean;
  reason: DecisionGateReason | null;
}

export type ProviderEvent =
  | { type: 'connection'; state: ConnectionState; reason?: string }
  | { type: 'snapshot'; snapshot: FixtureState; snapshotTrust: SnapshotTrust; eventId?: string; stale?: boolean }
  | { type: 'command_ack'; ack: CommandAck }
  | { type: 'error'; code: string; message: string; retryable: boolean };
```

Keep `stale` and `eventId` on the event for compatibility with current consumers, but make `snapshotTrust` the authority for new behavior.

- [x] **Step 2: Add pure trust evaluation functions**

In `src/providers/trust.ts`, implement only these functions:

```ts
export const DEFAULT_GATEWAY_SNAPSHOT_MAX_AGE_MS = 30_000;
export const GATEWAY_WRITE_SCOPE = 'needs_you:write';

export function deriveGatewaySnapshotTrust(
  snapshot: GatewaySnapshot,
  receivedAtMs: number,
  nowMs: number,
  maxAgeMs: number = DEFAULT_GATEWAY_SNAPSHOT_MAX_AGE_MS,
): SnapshotTrust;

export function createFixtureSnapshotTrust(now: Date): SnapshotTrust;
export function createUnknownGatewaySnapshotTrust(reason?: string): SnapshotTrust;
export function markSnapshotTrustStale(trust: SnapshotTrust, reason: string): SnapshotTrust;
export function getDecisionGate(
  source: DataSource,
  connection: ConnectionState,
  trust: SnapshotTrust,
): DecisionGate;
export function decisionGateMessage(reason: DecisionGateReason): string;
```

Rules:

- Invalid or future `generated_at` produces `freshness: 'unknown'`.
- Age greater than `maxAgeMs` produces `freshness: 'stale'` and `staleReason: 'snapshot_expired'`.
- A gateway decision requires `connection === 'connected'`, `freshness === 'fresh'`, and `needs_you:write` in `permissionScope`.
- Fixture is allowed only because it is explicitly `source: 'fixture'`; it is never used to fill a Gateway trust object.

- [x] **Step 3: Extend the protocol authority fields and parser validation**

In `src/providers/protocol.ts`, extend `GatewaySnapshot` with:

```ts
generated_at: string;
permission_scope: string[];
```

Extend `GatewayEventMessage` with `generated_at: string`. `isSnapshot()` must validate a non-empty `generated_at` and an array containing only strings. Event parsing must validate `generated_at` as a non-empty string. Missing authority fields must produce `invalid_snapshot` or `invalid_message`, never a casted usable message.

- [x] **Step 4: Run trust and protocol tests GREEN**

Run:

```bash
npm test -- --run tests/providers/trust.test.ts tests/providers/protocol.test.ts
```

Expected result: trust derivation, permission gating and parser rejection all pass.

### Task 3: Make GatewayProvider fail closed before command send

**Files:**
- Modify: `src/providers/gateway/GatewayProvider.ts`
- Modify: `tests/providers/gateway-provider.test.ts`

- [x] **Step 1: Add deterministic clock and trust state to GatewayProvider**

Extend `GatewayProviderOptions` with:

```ts
nowFn?: () => number;
maxSnapshotAgeMs?: number;
```

Track `connectionState` and the latest `SnapshotTrust`. Initialize the provider as Gateway `unknown` with no permission scope. On a valid snapshot, derive trust using `nowFn()` and emit it with the snapshot event. On a valid event, update the Gateway snapshot revision/event id and derive a new trust from the event timestamp. On close or protocol error, keep the last state for display but mark trust stale/unknown so future commands cannot pass.

- [x] **Step 2: Guard `decide()` before opening a pending command**

The method must return a rejected `CommandAck` without calling `socket.send()` when:

```text
socket is absent or not OPEN          → gateway_not_connected
no Gateway snapshot exists             → gateway_snapshot_unavailable
trust freshness is stale or unknown    → gateway_snapshot_stale or gateway_snapshot_unavailable
needs_you:write is absent              → permission_denied
target item is missing                 → invalid_target
target agent does not match            → invalid_target
decision is not in target.actions      → action_not_allowed
```

Use the generated command id in every rejected ack. Add the two target-specific rejection reasons to `CommandAck.reason` as string values without widening the typed `DecisionGateReason` union.

- [x] **Step 3: Add failing-then-green provider tests**

Add tests that open a fake socket, send a snapshot with each trust state, call `decide()`, and assert the fake socket `sent` array contains no command for stale, unknown, read-only, invalid-target, and disallowed-action cases. Keep the existing accepted-command/ack test and assert it now requires a fresh snapshot with `needs_you:write`.

- [x] **Step 4: Run the Gateway provider tests**

Run:

```bash
npm test -- --run tests/providers/gateway-provider.test.ts tests/providers/gateway-reducer.test.ts
```

Expected result: all provider tests pass, including the existing resume and command ack behavior.

### Task 4: Integrate trust metadata into FixtureProvider and React runtime

**Files:**
- Modify: `src/providers/fixture/FixtureProvider.ts`
- Modify: `src/app/useAhtRuntime.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/components/ApprovalPanel.tsx`
- Create: `tests/approval-gate.test.tsx`

- [x] **Step 1: Make FixtureProvider emit explicit development trust metadata**

Fixture `connect()` and local decisions must emit `createFixtureSnapshotTrust(new Date())`. The UI can continue to show local fixture decisions immediately, but the event must now say explicitly that its source is fixture and its permission scope is development-only.

- [x] **Step 2: Expose the decision gate from `useAhtRuntime()`**

Add `snapshotTrust` and `decisionGate` to `AhtRuntime`. On Gateway connection states other than `connected`, mark the current Gateway trust stale with the connection reason. On source switches, initialize Fixture or unknown Gateway trust without carrying the previous source metadata across. Compute `decisionGate` with `getDecisionGate(runtime.source, runtime.connection, runtime.snapshotTrust)`.

- [x] **Step 3: Wire the gate to keyboard and button decisions**

In `App.tsx`, only register `onApprove` and `onReject` hardware callbacks when `runtime.decisionGate.allowed` is true. Pass the gate into `ApprovalPanel`.

In `ApprovalPanel.tsx`:

- Disable remote decision buttons when the gate is blocked.
- Keep the current fixture behavior.
- Render `decisionGateMessage(reason)` in a `role="status"` element when blocked.
- Do not claim a decision result until the provider snapshot/event changes the item status.

Do not change the visual layout or CSS tokens in this task; the visual-refresh task owns that surface.

- [x] **Step 4: Test the React fail-closed behavior**

Create `tests/approval-gate.test.tsx` with a small harness around `ApprovalPanel` and tests for:

1. Fixture gate allows the three existing decision buttons.
2. Gateway stale gate disables all remote decision buttons and exposes a recovery message.
3. Gateway read-only gate disables all remote decision buttons.

Run:

```bash
npm test -- --run tests/approval-gate.test.tsx tests/app.test.tsx
```

### Task 5: Upgrade the local reference Gateway to carry authority metadata

**Files:**
- Modify: `scripts/gateway-fixture.mjs`
- Modify: `scripts/dev-gateway.mjs`
- Modify: `tests/providers/gateway-provider.test.ts`
- Modify: `tests/providers/gateway-reducer.test.ts`

- [x] **Step 1: Add generated time and write scope to the reference snapshot**

`createGatewaySnapshot()` must set `generated_at: new Date().toISOString()` and `permission_scope: ['needs_you:read', 'needs_you:write']`. The reference harness remains clearly local-only; these fields model the production contract but do not add authentication.

- [x] **Step 2: Add generated time to reference events**

When a command updates the snapshot, update `snapshot.generated_at` and send the same timestamp as `event.generated_at`. Preserve `revision`, `event_id`, and the existing event history behavior.

- [x] **Step 3: Run the real local WebSocket loop**

Run the reference Gateway and browser in separate terminals:

```bash
npm run gateway:dev
VITE_AHT_DATA_SOURCE=gateway VITE_AHT_GATEWAY_URL=ws://127.0.0.1:8787 npm run dev -- --host 127.0.0.1 --port 4173
```

Verify that the browser receives a fresh Gateway snapshot, a Codex approval command can be sent, and the UI changes only after the reference event. Stop the processes after the check; do not treat this harness as production deployment.

### Task 6: Full verification and bounded evidence

**Files:**
- Create: `docs/verification/aht-gateway-trust-foundation.md`
- Modify only if required by verification: the files in Tasks 1–5.

- [x] **Step 1: Run the focused and full automated gates**

Run:

```bash
npm test -- --run tests/providers tests/approval-gate.test.tsx
npm test -- --run
npm run build
git diff --check
```

Expected result: all tests pass, the build exits 0, and `git diff --check` is clean.

- [x] **Step 2: Record exact trust evidence**

Write the verification record with:

- Fresh snapshot with `generated_at`, revision, event id and write scope.
- Stale snapshot rejection with no command sent.
- Read-only permission rejection with no command sent.
- Target/action validation rejection with no command sent.
- Command ack followed by event-confirmed result.
- Explicit statement that authentication, persistence, real Codex Adapter and production deployment remain unimplemented.

- [x] **Step 3: Commit only the owned execution slice**

Stage only the provider/runtime/trust files, their tests, reference harness changes, this plan and its verification record. Do not use `git add -A`; do not include the visual task’s files or the pre-existing untracked native artifacts.

```bash
git diff --check
git add \
  src/providers src/app/useAhtRuntime.ts src/app/App.tsx src/components/ApprovalPanel.tsx \
  tests/providers tests/approval-gate.test.tsx scripts/gateway-fixture.mjs scripts/dev-gateway.mjs \
  docs/superpowers/plans/2026-08-18-aht-gateway-trust-foundation.md \
  docs/verification/aht-gateway-trust-foundation.md
git diff --cached --check
git commit -m "feat: enforce gateway trust before approval"
```

The commit must not contain `native/**`, `tests/app.test.tsx`, `tests/device-shell.test.tsx`, `tests/needs-you.test.tsx`, or visual-refresh-only files owned by the collaborating task.
