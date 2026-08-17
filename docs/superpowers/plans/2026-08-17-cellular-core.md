# DJI Cellular Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不依赖 DJI 硬件命令、USB/serial 驱动或第三方依赖的前提下，交付一个可执行的 `CellularSnapshot` 参考核心，统一校验设备状态并确定性映射到 AHT `GatewayNetwork`。

**Architecture:** `aht_cellulard.snapshot` 只处理跨进程数据契约、输入校验和 Gateway 映射；它不打开设备、不发送 AT 指令、不拨号，也不保存凭据。真实硬件适配层以后只需要把采集结果转换为 `CellularSnapshot`，不会把 modem-specific 状态直接暴露给 AHT。

**Tech Stack:** Python 3.14 标准库、`dataclasses`、`typing`、`unittest`；不引入外部依赖，不要求当前环境安装 Rust/Go。

---

### Task 1: 冻结 Python 参考核心的输入输出行为

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/tests/test_snapshot.py`

- [x] **Step 1: Write the failing tests**

覆盖四个行为：合法 JSON 字典能转成快照并 round-trip；缺少版本或 modem id 被拒绝；`connected` 必须有 active PDP；只有 connected + active PDP + Gateway RTT 探测成功时才映射成 `4G`。

- [x] **Step 2: Run the focused test and observe RED**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests/test_snapshot.py -v
```

Expected: FAIL because `aht_cellulard.snapshot` does not exist.

### Task 2: Implement snapshot validation and Gateway mapping

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/src/aht_cellulard/__init__.py`
- Create: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/src/aht_cellulard/snapshot.py`

- [x] **Step 1: Add typed dataclasses and validation**

Implement `CellularSnapshot.from_dict()` / `to_dict()` with the contract states from `docs/aht-gateway-network-contract.md`: `absent`, `initializing`, `sim_locked`, `registered`, `connected`, `degraded`, `disconnected`, `error`. Reject unknown enum values, invalid signal levels, negative RTT, wrong schema version, empty ids, and `connected` snapshots whose PDP is not active.

- [x] **Step 2: Add fail-closed Gateway mapping**

Implement `to_gateway_network(snapshot, gateway_rtt_ms, vpn)` with this rule:

```python
if snapshot.state == "connected" and snapshot.data.pdp == "active" and gateway_rtt_ms is not None:
    link = "4G"
else:
    link = "offline"
```

The mapper must never reuse a driver-provided RTT as proof of Gateway reachability and must preserve `vpn` as an independent fact.

- [x] **Step 3: Run focused tests GREEN**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests/test_snapshot.py -v
```

Expected: all focused tests pass.

### Task 3: Add reproducible sample and developer commands

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/examples/connected-snapshot.json`
- Modify: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/README.md`

- [x] **Step 1: Add a non-sensitive connected sample**

Use the contract sample with an example carrier, `wwan0`, no SIM identifiers, and no raw modem response.

- [x] **Step 2: Document the reference-core commands and boundary**

Document the focused test command, the full test command, and explicitly state that the Python core is a protocol reference rather than the DJI hardware driver.

- [x] **Step 3: Run the full test suite and inspect the sample**

Run:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
python3 -m json.tool examples/connected-snapshot.json
git diff --check
```

Expected: all tests pass, sample JSON parses, and `git diff --check` is clean.

### Task 4: Verify and update the existing Draft PR

**Files:**
- Modify: `/Users/autumn/Documents/ChatGPT/aht-dji-cellulard/docs/superpowers/plans/2026-08-17-cellular-core.md`

- [x] **Step 1: Mark completed plan steps after fresh verification**

Update only after the commands in Tasks 1–3 have passed.

- [x] **Step 2: Commit the implementation slice**

```bash
git add README.md docs/aht-gateway-network-contract.md docs/superpowers/plans/2026-08-17-cellular-core.md examples/connected-snapshot.json src/aht_cellulard tests/test_snapshot.py
git diff --cached --check
git commit -m "feat: add cellular snapshot reference core"
```

- [x] **Step 3: Push the existing PR branch and verify PR #1**

```bash
git push
gh pr view 1 --repo zqj372-ops/aht-dji-cellulard --json state,isDraft,headRefName,baseRefName,url
```

Expected: branch is up to date, PR #1 remains open and Draft, and the local worktree is clean.
