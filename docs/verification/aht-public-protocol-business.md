# AHT 公开协议与业务闭环验证记录

验证日期：2026-08-18

验证范围：`aht.gateway.v1` 公开 wire contract、Browser GatewayProvider、reference Gateway WebSocket、session/scope/policy/idempotency/audit、审批 ack/final event 生命周期，以及 native 回归。

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

```bash
npm test -- --run
# 19 个测试文件，64 个测试通过

npm run build
# tsc -b 与 Vite build 通过，48 个模块完成构建

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
- `tests/approval-lifecycle.test.tsx`：UI 在 sending、waiting_final_event、result_pending 时不提前展示最终批准，断线不自动重发。

另做了一次真实启动脚本 smoke：

```text
node scripts/dev-gateway.mjs
hello_ack → snapshot → command_ack:accepted → event:needs_you_resolved
```

## 业务状态与数据边界

- Gateway 是用户、租户、设备、session、scope、Agent、Session、Needs You、Server、Network、审批 policy 和审计事件的权威来源。
- Browser runtime 只维护 `received_at`、freshness 和 stale reason 等可验证投影；不会用本地时间覆盖 Gateway 的 `generated_at`。
- Fixture 仍是明确标注的本地模拟源；切换到 Gateway 后不会偷偷回退 Fixture。
- Terminal、语音、真实 SSH/Mosh、麦克风和硬件输入不属于本次公开协议承诺。
- Native/Brick Pro 继续复用同一 wire contract；本次协议实现没有修改协作任务的 `native/**`、视觉样式和屏幕所有权文件。

## 尚未由本地 reference 证明的外部实现

以下是公开协议的外部实现方，不能从本地 harness 推断为已完成：

- 生产 Auth/Pairing 服务、真实 bearer/session 签发和租户隔离；
- 持久化、高可用和跨进程事件存储；
- Codex、DeepSeek Harness、Hermes、OpenClaw 等真实 Agent Adapter；
- 生产部署、密钥管理、审计留存策略和线上监控。

因此当前页面和文档继续将 `reference Gateway` 标记为本地开发/验证实现，不宣称 production ready。
