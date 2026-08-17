# USB Sysfs Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Linux 4G 设备增加一个只读 USB sysfs 探针，识别 CDC ECM 接口、驱动绑定状态和设备身份，并在没有网络驱动证据时生成 `degraded` 而不是 `connected` 快照。

**Architecture:** `usb_probe.py` 只读取传入的 sysfs 根目录，不打开 USB endpoint、不写 sysfs、不加载内核模块。探针输出 `UsbDeviceInfo`；快照适配器把“CDC ECM 存在但驱动未绑定”转换为带非敏感错误码的 fail-closed `CellularSnapshot`。真实 BRICK 观测保存为不含设备序列号的示例数据。

**Tech Stack:** Python 3.14 标准库、`pathlib`、`dataclasses`、`unittest`；不引入 USB 第三方库。

---

### Task 1: 冻结 sysfs probe 行为

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/tests/test_usb_probe.py`

- [x] **Step 1: Write the failing tests**

用临时目录构造一个 `2ca3:4006` USB 设备，包含 CDC ECM 控制接口 `02/06` 和 data interface；验证探针识别 VID/PID、产品名、接口和“未绑定驱动”。另测绑定 `cdc_ether` 后的状态变化，以及不存在设备时返回空列表。

- [x] **Step 2: Run the focused test and observe RED**

```bash
PYTHONPATH=src python3 -m unittest tests/test_usb_probe.py -v
```

Expected: FAIL because `aht_cellulard.usb_probe` does not exist.

### Task 2: Implement read-only sysfs probe and fail-closed snapshot

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/src/aht_cellulard/usb_probe.py`
- Modify: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/src/aht_cellulard/__init__.py`

- [x] **Step 1: Implement `scan_usb_sysfs(root)`**

Read only `idVendor`, `idProduct`, `manufacturer`, `product`, interface class/subclass/protocol and optional `driver` symlinks. Do not read or emit USB serial numbers.

- [x] **Step 2: Implement `snapshot_for_usb_device(device, updated_at)`**

CDC ECM with no bound driver maps to `state=degraded`, `data.pdp=unknown`, and error code `usb_network_driver_unbound`. A bound driver still requires a separate Gateway reachability probe and must not become `connected` from USB presence alone.

- [x] **Step 3: Run focused tests GREEN**

```bash
PYTHONPATH=src python3 -m unittest tests/test_usb_probe.py -v
```

### Task 3: Record the live BRICK observation without sensitive identifiers

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/examples/brick-usb-observation.json`
- Modify: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/README.md`
- Modify: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/docs/aht-gateway-network-contract.md`

- [x] **Step 1: Add observed facts**

Record Linux `4.9.191`, USB `2ca3:4006`, manufacturer/product `BAIWANG/Baiwang`, CDC ECM interfaces, no bound USB network driver, no `wwan`/`cdc-wdm`/`ttyUSB` nodes, and `CONFIG_USB_USBNET` not set. Omit ADB serial, MAC addresses, SIM identifiers, and raw modem responses.

- [x] **Step 2: Document the kernel boundary**

State that a real network path needs a kernel build with USB network support (at minimum `CONFIG_USB_USBNET` and the matching CDC ECM driver) or an explicitly selected userspace USB stack; the current PR does neither.

### Task 4: Verify, commit, push and update Draft PR #1

- [ ] **Step 1: Run fresh tests and JSON validation**

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
python3 -m compileall -q src tests
python3 -m json.tool examples/brick-usb-observation.json >/dev/null
git diff --check
```

- [ ] **Step 2: Commit and push**

```bash
git add .gitignore README.md docs/aht-gateway-network-contract.md docs/superpowers/plans/2026-08-17-usb-sysfs-probe.md examples/brick-usb-observation.json src/aht_cellulard tests/test_usb_probe.py
git diff --cached --check
git commit -m "feat: add USB sysfs cellular probe"
git push
```

- [ ] **Step 3: Verify PR #1 remains open and Draft**

```bash
gh pr view 1 --repo zqj372-ops/aht-dji-cellulard --json state,isDraft,headRefName,baseRefName,url
```
