# A133 Tina Phase 9B Kernel Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a reproducible, read-only kernel and USB evidence bundle for the `A133 Tina Reference Target` before any kernel module build or modem mode change.

**Architecture:** The new repository records the target identity and raw observations separately from future driver code. A host-side collector invokes only read-only ADB commands, stores the decompressed kernel config and USB evidence under a target-specific verification directory, and marks unavailable tools or fields explicitly instead of inferring them. The bundle is scoped to the currently connected A133 device and does not claim BRICK PRO equivalence.

**Tech Stack:** POSIX shell, ADB, Tina Linux 4.9.191 sysfs/procfs, Markdown, Git.

---

### Task 1: Define the evidence contract

**Files:**
- Create: `docs/verification/hardware/a133-tina-reference-01/README.md`
- Create: `docs/superpowers/plans/2026-08-17-aht-phase-9b-kernel-evidence.md`

- [x] **Step 1: Document the target identity and scope**

Create a target README that records `a133-tina-reference-01`, `a133-aw3/generic`, Allwinner A133, AArch64, Linux 4.9.191, DJI VID:PID `2ca3:4006`, current `CDC-ECM` mode, and `BRICK PRO equivalence: unconfirmed`. State that the bundle is read-only evidence and that no `.ko`, AT command, USB mode switch, DHCP, or route result is implied.

- [x] **Step 2: Document artifact provenance**

List each required artifact and the exact ADB/procfs/sysfs source used to produce it. For unavailable tools such as device-side `lsusb`, write an explicit unavailable marker and preserve the sysfs descriptor fallback; never substitute an inferred `lsusb -v` transcript.

### Task 2: Add a reproducible evidence collector

**Files:**
- Create: `scripts/collect-a133-tina-reference.sh`

- [x] **Step 1: Implement the read-only collector**

The script must require `adb`, select the attached device deterministically when exactly one device is present, create the target evidence directory, and collect:

```text
kernel-version.txt
kernel.config
modules.txt
dji-2ca3-4006-lsusb.txt
dji-2ca3-4006-dmesg.txt
usb-devices.txt
```

Use `adb shell`/`adb exec-out` only for `uname`, `/proc/version`, `/proc/cmdline`, `/proc/config.gz`, `/lib/modules`, `/proc/modules`, `which`, `/sys/bus/usb/devices`, `/sys/bus/usb/drivers`, `/proc/net/dev`, and `dmesg`. Capture command status and unavailable conditions in the corresponding artifact. The script must not call `insmod`, `modprobe`, `rmmod`, `ip link set`, `udhcpc`, AT commands, or write to the device.

- [x] **Step 2: Make the script shell-checkable**

Run `bash -n scripts/collect-a133-tina-reference.sh` and make the script fail on missing `adb` or an ambiguous device list while leaving already collected local artifacts intact.

### Task 3: Capture and review the current target

**Files:**
- Modify: `docs/verification/hardware/a133-tina-reference-01/kernel-version.txt`
- Modify: `docs/verification/hardware/a133-tina-reference-01/kernel.config`
- Modify: `docs/verification/hardware/a133-tina-reference-01/modules.txt`
- Modify: `docs/verification/hardware/a133-tina-reference-01/dji-2ca3-4006-lsusb.txt`
- Modify: `docs/verification/hardware/a133-tina-reference-01/dji-2ca3-4006-dmesg.txt`
- Modify: `docs/verification/hardware/a133-tina-reference-01/usb-devices.txt`

- [x] **Step 1: Run the collector against the attached device**

Run the collector with the ADB-connected A133 target and retain the output under the target directory. The expected baseline includes Linux 4.9.191, `a133-aw3/generic`, USB device `2ca3:4006`, CDC-ECM interfaces, and absent `usbnet`/`cdc_ether`/`rndis_host`/`option` driver nodes.

- [x] **Step 2: Review evidence for false claims**

Check that every target identity value is sourced from the device, unavailable `lsusb` is labeled as unavailable, no BRICK PRO equivalence is asserted, and no network interface or radio metrics are reported as available before driver binding.

### Task 4: Verify and publish the Phase 9B PR

**Files:**
- Modify: `docs/verification/hardware/a133-tina-reference-01/README.md`

- [x] **Step 1: Run repository checks**

Run:

```bash
bash -n scripts/collect-a133-tina-reference.sh
test -s docs/verification/hardware/a133-tina-reference-01/kernel-version.txt
test -s docs/verification/hardware/a133-tina-reference-01/kernel.config
test -s docs/verification/hardware/a133-tina-reference-01/modules.txt
test -s docs/verification/hardware/a133-tina-reference-01/dji-2ca3-4006-lsusb.txt
test -s docs/verification/hardware/a133-tina-reference-01/dji-2ca3-4006-dmesg.txt
test -s docs/verification/hardware/a133-tina-reference-01/usb-devices.txt
git diff --check
```

Expected result: all commands exit 0 and `git diff --check` emits no whitespace errors.

- [x] **Step 2: Inspect the exact diff and commit only Phase 9B files**

Use explicit paths; do not stage files outside `scripts/collect-a133-tina-reference.sh`, `docs/verification/hardware/a133-tina-reference-01/`, and this plan. Commit with `docs: capture A133 Tina kernel evidence`.

- [x] **Step 3: Push and open a draft PR**

Push `agent/a133-tina-phase-9b` to `zqj372-ops/aht-dji-cellulard` and open a draft PR targeting `main`. The PR body must state that Phase 9A is complete, Phase 9B captures identity only, the current kernel lacks `usbnet`/`cdc_ether`, and no device mutation was performed.
