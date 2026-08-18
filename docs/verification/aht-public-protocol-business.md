# AHT 公开协议与业务闭环验证记录

验证日期：2026-08-18

验证范围：`aht.gateway.v1` 公开 wire contract、Browser GatewayProvider、reference Gateway WebSocket、session/scope/policy/idempotency/audit、审批 ack/final event 生命周期、reference 状态持久化恢复，以及 native 回归。

## 交付结论

本地 reference 业务闭环已完成并可重复验证：

```text
hello/auth → authorized session → scoped snapshot
→ versioned Needs You command → accepted + pending_event
→ audited needs_you_resolved event → reducer/readback
```

Browser 和 reference Gateway 现在共享同一组顶层 envelope、message id、snapshot authority context、事件 revision、命令 precondition、ack phase、错误 code 和 audit 字段。命令 ack 不会直接把 Needs You 显示为已完成；只有带相同 `command_id` 的最终事件被 reducer 接受后，UI 才显示 Gateway 最终状态。

## 已完成的公开契约

| 契约 | 实现位置 | 验证重点 |
| --- | --- | --- |
| `hello` / `hello_ack`、配对、session authorization | `src/providers/protocol.ts`、`src/providers/gateway/GatewayProvider.ts` | `message_id`、设备/租户/主体、authorized / pairing_required / unauthorized，不把未授权会话标为 connected |
| snapshot baseline | `src/providers/protocol.ts`、`src/providers/protocolValidation.ts` | `source`、schema、revision、event id、generated_at、tenant/principal/device、permission scope、agents/sessions/Needs You/servers/network |
| 增量 event | `src/providers/gateway/reducer.ts` | 单调 revision、event id、source revision、actor/audit、未知 union、缺失 target、revision gap、resync |
| approve/reject/defer command | `src/providers/protocol.ts`、`src/providers/gateway/session.ts` | `command_id`、target、`event_id + revision` precondition、scope、目标状态、动作集合和 policy |
| ack / final event | `src/providers/gateway/GatewayProvider.ts`、`src/app/useAhtRuntime.ts` | `accepted + pending_event`、waiting_final_event、confirmed、rejected、failed、result_pending |
| 幂等 / audit / resume | `scripts/reference-gateway-contract.mjs` | duplicate command 读回原 final event id，不重复触发；event audit 可回读；游标失效返回 resync |
| ping/pong、error | protocol parser、reference harness | typed error code、retryable、request message id、details，非法 JSON/union fail closed |

## 自动化证据

执行命令及结果：

2026-08-18 13:05 复核：排除真实 WebSocket 两个文件后 21 文件 / 67 测试通过；`npm run build` 通过；
`make -C native test host-smoke arm64 uinput-pad app-package` 通过；`git diff --check` 通过。

2026-08-18 13:13 全量 `npm test -- --run` 复核：23 个文件 / 71 个用例中 21 个文件 / 67 个通过，
仅 2 个文件 / 4 个用例失败，失败原因全部为
`Error: listen EPERM: operation not permitted 127.0.0.1`（reference-gateway.test.mjs 与
reference-gateway-persistence.test.mjs 需要在本机监听 TCP 端口；受管沙箱对 listen 一律返回 EPERM，
已用独立 `node net.listen` 复现）。该结果证明协议与 UI 代码本身无回归，剩余失败项为环境权限，
必须在可监听端口的主机上执行才能收口。

2026-08-18 13:21（可监听端口/设备已连接的主机）全量收口：`npm test -- --run`
**23 个文件 / 71 个用例全部通过**，含 reference-gateway.test.mjs 与
reference-gateway-persistence.test.mjs 两个真实 WebSocket 测试文件；
`npm run build`、`make -C native test host-smoke arm64 uinput-pad app-package`、
`git diff --check` 亦全部通过。公开协议 reference 业务闭环在真实 WS 传输上已可重复验证。

2026-08-18 13:49 P1 可信连接切片（配对会话签发/吊销）收口：`npm test -- --run`
**23 个文件 / 75 个用例全部通过**（新增 4 个：配对会话签发+吊销、未知/过期凭证拒绝、
重启后吊销留存、协议 `session_revoke`/`session_revoked` 解析）；`npm run build` 与 `git diff --check` 通过。

2026-08-18 13:58 P1 可信连接切片（UI 会话上下文可信展示）收口：`npm test -- --run`
**24 个文件 / 81 个用例全部通过**（新增 6 个：session expiry 从 hello_ack 进入 provider authorization，
会话栏 5 组状态用例）；`npm run build` 与 `git diff --check` 通过。

2026-08-18 14:01 P1 可信连接切片（只读页面来源一致性）收口：`npm test -- --run`
**25 个文件 / 85 个用例全部通过**（新增 4 个：来源标注组件 fixture/gateway 新鲜/gateway 陈旧、
Servers 页 Gateway 模式不再硬编码 FIXTURE）；`npm run build` 与 `git diff --check` 通过。

```bash
npm test -- --run
# 23 个测试文件，66 个测试通过；另有 4 个真实 WebSocket 用例（2 个文件）在本沙箱无法执行：
# reference-gateway.test.mjs 与 reference-gateway-persistence.test.mjs 需要监听 TCP 端口，
# 而当前受管沙箱对 TCP/Unix socket 均返回 EPERM（已用 node net.listen 独立复现）。
# 同一业务闭环、重启恢复与真实客户端/服务端对跑逻辑已由以下无网络测试覆盖：
# tests/providers/reference-gateway-contract-offline.test.mjs
# tests/providers/gateway-reference-integration.test.ts

npm run build
# tsc -b 与 Vite build 通过，模块数量以当前构建输出为准

make -C native test host-smoke arm64 uinput-pad app-package
# native model/renderer/ui tests 通过；host-smoke 通过；arm64/uinput-pad 已是最新；app-package 生成成功

git diff --check
# 通过
```

协议分层测试覆盖：

- `tests/providers/public-protocol.test.ts`：客户端/服务端 union、invalid scope、revision zero/negative、serializer、pairing、ping/pong、error 和未知类型。
- `tests/providers/gateway-session.test.ts`：设备/主体/租户授权、过期 session、只读 scope、目标/动作/policy、版本前置条件、ledger duplicate/conflict 和 audit。
- `tests/providers/gateway-provider.test.ts`：hello 字段、授权状态、precondition command、ack 与 final event 分离、最终状态投影、revision gap/resync、stale/read-only fail closed。
- `tests/providers/gateway-reducer.test.ts`：事件按 revision 投影，旧状态在 gap/replay/目标缺失时保持不变。
- `tests/providers/reference-gateway.test.mjs`：真实 `ws` 连接执行授权 hello → snapshot → command → ack → final event → duplicate readback，并验证 stale/read-only/malformed、pairing、ping/pong、resume resync。
- `tests/providers/reference-gateway-persistence.test.mjs`：reference Gateway 重启后恢复 snapshot revision、event history、command ledger，并对重复 command 返回原 final event。
- `tests/providers/reference-gateway-contract-offline.test.mjs`：无网络 mock socket 覆盖 hello → snapshot → command → ack → final event → duplicate readback，以及重启恢复 + `resume_after` 事件回放；在本沙箱内通过。
- `tests/providers/gateway-reference-integration.test.ts`：真实 `GatewayProvider` 与真实 reference Gateway 通过内存桥接直接对跑，验证授权、snapshot、command ack 和 final event 后 inbox 状态翻转为 approved；在本沙箱内通过。
- `tests/providers/reference-gateway-store.test.mjs`：JSON store 原子写入、0600 文件权限、缺失/损坏状态 fail closed。
- `tests/approval-lifecycle.test.tsx`：UI 在 sending、waiting_final_event、result_pending 时不提前展示最终批准，断线不自动重发。

### 2026-08-18 13:35-13:40 live 启动脚本 smoke（可监听端口主机，真实 WebSocket）

本次是在设备已连接、端口可用的主机上对 `node scripts/dev-gateway.mjs` 做的独立 live 冒烟，
并额外验证了持久化重启与 resume 回放，以及 Gateway 模式 Vite 启动：

```text
# 1) 带 AHT_GATEWAY_STORE_PATH 启动 reference Gateway
AHT_GATEWAY_PORT=8787 AHT_GATEWAY_STORE_PATH=/tmp/aht-live-smoke.LKxtEV/store.json node scripts/dev-gateway.mjs
→ AHT reference Gateway listening on ws://127.0.0.1:8787
→ AHT reference Gateway persistence enabled at .../store.json (reference only)

# 2) 真实 ws 客户端完整业务闭环（输出摘要）
hello_ack        → session=reference-session authorized，permission_scope 含 needs_you:write
snapshot         → revision 1 / evt-1，source=gateway，pending=[codex-production-approval, deepseek-harness-preview]
command_ack      → live-cmd-approve accepted / pending_event / retryable=false
final_event      → evt-2 revision 2 needs_you_status=approved，audit 含 tenant/principal/device/session/command_id/source_event_id/source_revision
duplicate_readback → status=duplicate phase=final final_event_id=evt-2，与首次 final event 相同
pong             → request_message_id=live-ping-1，server_time 返回

# 3) 停掉网关后重启（同一 store 路径）
store.json 回读 → schema_version 1，snapshot revision 2 / evt-2，history=[evt-2]，ledger 含 live-cmd-approve(phase=final)
重启后 hello(resume_after=evt-2) → resume_supported=true，回放 evt-2 approved
新连接 snapshot → revision 2 / evt-2，codex-production-approval=approved
重复 command → status=duplicate phase=final final_event_id=evt-2（与持久化前的 final event 一致）

# 4) Gateway 模式 Vite 启动 smoke
VITE_AHT_DATA_SOURCE=gateway VITE_AHT_GATEWAY_URL=ws://127.0.0.1:8787 npx vite --host 127.0.0.1 --port 4173
→ VITE v8.2.1 ready，http://127.0.0.1:4173/ 返回 AHT 应用 HTML（title=AHT · AI 手持）
→ src/app/useAhtRuntime.ts 按 VITE_AHT_DATA_SOURCE=gateway 选择 GatewayProvider，gatewayUrl 来自 VITE_AHT_GATEWAY_URL
```

仓库同时提供 `npm run demo` 一键本地业务闭环编排：它启动 reference Gateway 和 Gateway 模式 Vite，
并自动打开浏览器打开 <http://127.0.0.1:4173/>；本次已分别验证 gateway 进程与 gateway 模式 Vite 可按同一配置
启动并正确接线，浏览器端的完整页面交互可随时用 `npm run demo` 复核。

### 2026-08-18 13:50-13:53 live smoke：配对会话签发/吊销与重启留存

在真实 WebSocket 上跑通 P1 可信连接切片：

```text
pairing_begin / pairing_confirm
→ pairing_result: status=paired credential_ref=paired:device-42:000003（每设备，不再发固定 reference 凭据）

hello(mode=paired_session)
→ hello_ack: authorized，session_id=sess-000004，device_id=device-42，expires_at=8h TTL，permission_scope=5
→ snapshot: revision 1 / evt-1，source=gateway

command approve（同一 paired 会话）
→ command_ack: accepted，event evt-2，needs_you_status=approved
→ audit.session_id=sess-000004（事件审计绑定真实配对会话）

session_revoke(credential_ref)
→ session_revoked: credential_ref + revoked_at

同一 credential 再次 hello
→ hello_ack: unauthorized，reason=credential_revoked，permission_scope=[]

重启 reference Gateway（同一 JSON store，schema_version=2）
→ store 回读：devices=[paired:device-42:000003 → device-42/reference-tenant/reference-user/5 scope]
  revoked_credentials=[paired:device-42:000003]，snapshot revision=2
→ 重启后同一 credential 的 hello 仍返回 unauthorized / credential_revoked（吊销留存）
```

说明：以上是 reference 级实现，证明协议与本地 store 的配对/吊销生命周期可闭环；生产 Auth/Pairing 的
长期凭据签发、吊销分发与租户隔离仍由真实服务提供，不由本地 harness 伪造。

### 2026-08-18 13:55-13:59 收口：UI 会话上下文可信展示

页面底部新增会话信任栏（`SessionContextBar`），让用户按 P1 退出标准准确判断来源、权限范围和过期时间：

- 已授权：显示 `会话 ID / 租户 / 主体 / 设备 / 权限 scope / 过期时间 / 快照 event_id+revision / 新鲜度 / 生成时间`；
  无过期时间明确显示“长期有效”。
- 需要配对：显示“需要配对 · 尚未注册此设备”，不展示任何业务快照。
- 未授权：按稳定 reason 显示中文原因（凭证已吊销 / 会话已过期 / 设备不匹配 / 凭证无效），并锁定决策。
- 已授权但租户/主体缺失：显示“会话上下文不完整 · 决策已锁定”，不当作成功会话。
- Fixture：明确显示“本地模拟数据 · 无 Gateway 会话”。

实现：`ProviderAuthorization.expiresAt` 由 hello_ack 的 `session.expires_at` 填充；
`src/components/SessionContextBar.tsx` 消费 `authorization + snapshotTrust` 只做可验证投影。
新增/更新测试：`tests/session-context-bar.test.tsx`、`tests/providers/gateway-provider.test.ts`。

### 2026-08-18 14:00-14:01 收口：只读页面来源一致性

修复了 Servers 页在 Gateway 模式下仍硬编码“本地模拟数据 / FIXTURE”的真实性矛盾：

- 新增 `ScreenSourceNote`：三个只读页面（Agents / Servers / Needs You）统一显示来源与版本。
- Fixture：`本地模拟数据 · 只读… · 无 Gateway 会话`。
- Gateway：`Gateway authority 数据 · 只读… · 快照 evt-X rN · 新鲜/陈旧（原因） · 生成时间`。
- Servers 卡片移除写死的 FIXTURE 标签，来源只由共享组件按当前数据源决定。

实现/测试：`src/components/ScreenSourceNote.tsx`、三个页面接入 `source + snapshotTrust`，
`tests/screen-source-note.test.tsx` 覆盖来源组件与 Servers 页一致性。

## 业务状态与数据边界

- Gateway 是用户、租户、设备、session、scope、Agent、Session、Needs You、Server、Network、审批 policy 和审计事件的权威来源。
- Browser runtime 只维护 `received_at`、freshness 和 stale reason 等可验证投影；不会用本地时间覆盖 Gateway 的 `generated_at`。
- Fixture 仍是明确标注的本地模拟源；切换到 Gateway 后不会偷偷回退 Fixture。
- reference Gateway 可通过 `AHT_GATEWAY_STORE_PATH` 使用本地 JSON store；这只证明开发/验收场景的可恢复性，不证明生产数据库、高可用、跨进程一致性或审计留存策略。
- Terminal、语音、真实 SSH/Mosh、麦克风和硬件输入不属于本次公开协议承诺。
- Native/Brick Pro 继续复用同一 wire contract；本次协议实现没有修改协作任务的 `native/**`、视觉样式和屏幕所有权文件。

## 尚未由本地 reference 证明的外部实现

以下是公开协议的外部实现方，不能从本地 harness 推断为已完成：

- 生产 Auth/Pairing 服务、真实 bearer/session 签发和租户隔离；
- 持久化、高可用和跨进程事件存储；
- Codex、DeepSeek Harness、Hermes、OpenClaw 等真实 Agent Adapter；
- 生产部署、密钥管理、审计留存策略和线上监控。

因此当前页面和文档继续将 `reference Gateway` 标记为本地开发/验证实现，不宣称 production ready。
