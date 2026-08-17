# AHT Gateway Network Contract for DJI Cellular

状态：V0 contract proposal

范围：DJI Cellular userspace driver → Gateway → AHT client

## 目标

把 DJI Cellular 模块的硬件和 modem-specific 细节隔离在本仓库内。Gateway 接收一个稳定、与厂商无关的网络快照，再通过现有 `aht.gateway.v1` 协议提供给 AHT。

```text
DJI Cellular
  ↓ USB / serial / modem transport
DJI userspace driver
  ↓ CellularSnapshot
Gateway network adapter
  ↓ GatewayNetwork
AHT
```

AHT 不直接访问 `/dev` 设备节点、不发送 AT 指令、不读取 SIM 凭据，也不根据 UI 上看到的 `4G` 文案推断网络已经可用。

## Driver → Gateway 快照

驱动实现可以使用 Rust、Go、Python 或其他语言；跨进程边界使用 JSON 语义，不把具体语言类型当成协议。

```json
{
  "schema_version": 1,
  "modem_id": "dji-cellular-0",
  "state": "connected",
  "transport": "usb",
  "rat": "4g",
  "operator": "example-carrier",
  "sim": "ready",
  "signal": {
    "dbm": -78,
    "level": 4
  },
  "data": {
    "pdp": "active",
    "interface": "wwan0",
    "ipv4": true,
    "ipv6": false
  },
  "rtt_ms": 38,
  "updated_at": "2026-08-17T12:00:00Z",
  "error": null
}
```

### 字段语义

| 字段 | 取值/要求 |
| --- | --- |
| `schema_version` | 当前为 `1`；不兼容变更必须增加版本 |
| `modem_id` | 本机稳定标识，不放入 SIM、IMSI、ICCID 或认证凭据 |
| `state` | `absent`、`initializing`、`sim_locked`、`registered`、`connected`、`degraded`、`disconnected`、`error` |
| `transport` | `usb`、`serial`、`unknown` |
| `rat` | `4g`、`5g`、`unknown` |
| `sim` | `ready`、`locked`、`missing`、`error`、`unknown` |
| `signal.dbm` | 原始信号值，不可用时为 `null` |
| `signal.level` | 显示等级 `0..4`，不可用时为 `null` |
| `data.pdp` | `active`、`inactive`、`unknown` |
| `data.interface` | 系统数据接口名；不可用时为 `null` |
| `rtt_ms` | Gateway 探测值；没有独立探测证据时为 `null` |
| `error` | 非敏感错误代码和摘要；不可写入 token、手机号或完整 modem 原始响应 |

`registered` 只代表已注册网络，不代表 AHT 已经可以访问 Gateway。只有数据会话 active 且 Gateway 网络探测成功时，Gateway 才可以把链路标记为可用。

## Gateway → AHT 映射

当前 AHT V0.2 的公共网络对象是：

```ts
interface GatewayNetwork {
  link: 'Wi-Fi' | '4G' | 'offline';
  rtt_ms: number | null;
  vpn: boolean;
}
```

最小映射规则：

| CellularSnapshot | GatewayNetwork |
| --- | --- |
| `state=connected` 且 Gateway 探测成功 | `link='4G'`，`rtt_ms` 使用探测值 |
| `registered`、`initializing`、`degraded` 或探测失败 | 不得伪报可用；按 Gateway 策略显示 `offline` 或扩展状态 |
| `absent`、`sim_locked`、`sim missing`、`disconnected`、`error` | `link='offline'`，`rtt_ms=null` |
| `vpn` | 由 Gateway/Tailscale 等独立事实决定，不由 modem 驱动猜测 |

后续如需在 AHT 显示信号、SIM 或 modem 状态，应对 `aht.gateway.v1` 增加明确的可选字段，例如 `signal_dbm`、`signal_level`、`modem_state`；不得把 DJI 原始字段直接暴露给 UI。

## 事件与刷新

Gateway 应把快照变化转换为带版本和事件游标的 Gateway event。驱动可以内部轮询或订阅 modem 事件，但对 Gateway 只需保证：

- 初次连接能提供完整 snapshot。
- 状态变化能产生可比较的更新时间或 revision。
- 模块拔出、SIM 锁定、PDP 断开和网络恢复都能被观察到。
- driver 重启不会让 Gateway 把旧的 `connected` 状态当成当前事实。
- 缺少证据时使用 `unknown`、`null` 或 `offline`，不猜测运营商、信号和 RTT。

## 当前 BRICK 现场观测

2026-08-17 通过 ADB 对已连接 BRICK 做了只读检查，观察到：

- Linux `4.9.191`，架构 `aarch64`。
- USB `VID:PID 2ca3:4006`，设备自报 `BAIWANG/Baiwang`。
- 接口 `1-1:1.4` 为 CDC ECM control，`1-1:1.5` 为 CDC ECM data。
- 没有绑定 `cdc_ether`/`usbnet`，也没有 `wwan`、`cdc-wdm`、`ttyUSB` 或 `ttyACM` 节点。
- 内核 `CONFIG_USB_NET_DRIVERS=y`，但 `CONFIG_USB_USBNET` 未启用。

因此当前设备快照必须是 `degraded`，不能标记为 `connected` 或 `4G`。`BAIWANG` 与 DJI Cellular 的产品关联仍需由硬件会话和模块资料确认；本仓库不根据厂商字符串猜测身份。

要建立真实网络通路，后续需要提供启用了对应 USB network/CDC ECM 支持的 BRICK 内核，或明确选择用户态 USB 网络栈；这两者都不属于当前 Python 参考核心，也不会在没有确认的情况下写入设备。

## 本 PR 的边界

本 PR 只提交仓库说明和跨进程集成契约，不宣称已经完成：

- DJI Cellular 硬件探测或真实 AT/USB/serial 驱动
- SIM/PDP 实机验证
- 生产 Gateway、认证、持久化和高可用
- 4G 状态直接写入 AHT UI

后续驱动 PR 应分别覆盖模块存在、SIM 状态、注册但无数据、数据连接、主动断开、自动恢复和错误状态，并附上不含敏感数据的日志或测试证据。
