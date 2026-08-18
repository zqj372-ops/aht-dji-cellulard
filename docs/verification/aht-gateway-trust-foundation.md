# AHT Gateway Trust Foundation 验证记录

日期：2026-08-18

本记录对应产品设计规划中的第一条可执行生产化切片：让远程 Gateway 状态具备可检查的来源时间、权限范围和决策前置闸门，并与浏览器/原生视觉任务保持文件边界分离。

## 已交付的行为

- `aht.gateway.v1` snapshot 现在必须携带 `generated_at` 与 `permission_scope`；event 也必须携带 `generated_at`。
- Gateway provider 将快照信任状态明确为 `fresh`、`stale` 或 `unknown`，保留 event id、revision、生成时间、接收时间、过期原因和权限 scope。
- 远程审批只有在 Gateway 已连接、快照新鲜且包含 `needs_you:write` 时才允许发送；断线、错误、协议异常、陈旧快照和只读 scope 都 fail closed。
- provider 在发送前重新检查快照年龄，并校验目标 item、agent 和允许的 action；被拒绝时不会调用 WebSocket `send()`。
- React runtime、审批按钮和硬件快捷键共用同一 `decisionGate`；fixture 明确标记为开发模拟来源，不会冒充 Gateway 权威。
- reference Gateway 已携带同一组 authority metadata，并在 command ack 后发出带时间戳的 resolved event。

## 自动化验证

### 浏览器与 provider

```text
npm test -- --run
Test Files  15 passed (15)
Tests       35 passed (35)
```

覆盖 trust 纯函数、协议字段校验、snapshot/event 信任传播、断线/Socket error、快照过期、决策时再次计算年龄、只读权限、目标/action 校验、fixture 行为和审批 UI 闸门。

```text
npm run build
tsc -b && vite build
✓ 47 modules transformed.
✓ built successfully
```

### 原生视觉协作切片

```text
make -C native test host-smoke arm64 uinput-pad app-package
native model tests passed
native renderer tests passed
native ui tests passed
screen=home pending=4
screen=home pending=3 decision=已拒绝
make: Nothing to be done for `arm64'.
make: Nothing to be done for `uinput-pad'.
dist-app/AHT packaged successfully
```

原生 smoke 生成 `/tmp/aht-native-smoke.ppm`，并已做实际渲染检查；视觉任务另行负责字体、卡片、图标和布局调整，未修改 provider/runtime 文件。

### Reference Gateway WebSocket 冒烟

启动 `npm run gateway:dev` 后，独立 `ws` 客户端完成了以下闭环：

```text
hello_ack
snapshot: revision=1, permission_scope=[needs_you:read, needs_you:write], generated_at=<present>
command_ack: accepted
event: revision=2, generated_at=<present>, type=needs_you_resolved
```

这证明本地 reference contract 能够传递 authority metadata，并在 command ack 后产生状态事件；它不是生产 Gateway，也不证明真实 Codex Adapter 或生产认证已接通。

## 明确未完成的生产边界

本切片没有声称以下能力已经上线：Gateway 身份认证与授权服务、持久化 event log、真实 Codex Adapter、真实生产 Needs You API、跨设备会话恢复的持久化保证、生产部署或客户数据接入。下一阶段必须在这些边界完成真实 contract、secret reference、可审计 release/snapshot 证据后，才能把 reference harness 替换为生产连接。

## 工作区与协作边界

本切片只应提交 provider/runtime/trust、审批 gate 测试、reference Gateway、计划和本记录。协作任务 `01a0110f-5721-73a3-b14a-c2164cbe93a8` 负责 `src/screens/**`、`src/styles/**`、`native/**`、视觉测试和截图；其改动以及原有 native 资料不能被本切片的提交一并带入。
