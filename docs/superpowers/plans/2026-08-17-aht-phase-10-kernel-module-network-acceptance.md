# AHT Phase 10 Kernel Module and Network Acceptance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build, package, and verify the USB CDC-ECM driver path for the A133 Tina reference target, then prove device binding and network reachability without overstating an unconfirmed vendor kernel ABI.

**Architecture:** The host-side build consumes the Phase 9B runtime config and an explicitly recorded Linux 4.9.191 source/toolchain pair. It produces usbnet.ko, cdc_ether.ko, a compatibility manifest, and checksums. A guarded device verifier separates static package checks from device mutation; only an explicitly enabled load step may push and insmod modules, and only an explicitly enabled network step may run DHCP or alter routes.

**Tech Stack:** Linux kernel 4.9.191, AArch64 cross compiler, POSIX shell, ADB, readelf, SHA-256, Tina Linux 4.9.191 with CONFIG_MODULES=y and CONFIG_MODVERSIONS disabled.

---

### Task 1: Remove sensitive identifiers from the Phase 9B evidence path

**Files:**
- Modify: scripts/collect-a133-tina-reference.sh
- Modify: docs/verification/hardware/a133-tina-reference-01/kernel-version.txt
- Modify: docs/verification/hardware/a133-tina-reference-01/dji-2ca3-4006-lsusb.txt
- Modify: docs/verification/hardware/a133-tina-reference-01/usb-devices.txt
- Test: tests/test-collector-redaction.sh

- [ ] Step 1: Write the failing redaction test.

Create a fixture-based shell test that feeds representative target_serial=, androidboot.serialno=, and USB serial lines through the collector redaction helper and asserts that none of those values survive while kernel, VID:PID, and interface-class evidence remains.

- [ ] Step 2: Run the test to verify it fails.

Run:

~~~sh
bash tests/test-collector-redaction.sh
~~~

Expected: FAIL because the current collector emits the device serial and does not expose a redaction helper.

- [ ] Step 3: Implement minimal redaction.

Make the collector omit the target_serial header, redact androidboot.serialno values in /proc/cmdline, and ignore USB serial attributes. Keep the collector read-only against the device and preserve all non-sensitive build and interface facts.

- [ ] Step 4: Run the test and refresh the checked-in artifacts.

Run the fixture test, bash -n scripts/collect-a133-tina-reference.sh, and a fresh read-only collection with exactly one ready ADB device. Verify with rg that no device serial remains.

- [ ] Step 5: Commit the redaction boundary.

~~~sh
git add scripts/collect-a133-tina-reference.sh tests/test-collector-redaction.sh docs/verification/hardware/a133-tina-reference-01/
git commit -m "fix: redact A133 device identifiers from evidence"
~~~

### Task 2: Add a reproducible host-side USB module builder

**Files:**
- Create: scripts/build-a133-tina-usb-modules.sh
- Test: tests/test-build-a133-tina-usb-modules.sh
- Modify: README.md

- [ ] Step 1: Write failing preflight tests.

Test that the builder rejects a missing kernel tree, a missing .config, a missing cross compiler, a non-AArch64 compiler, or a kernel tree whose reported release is not 4.9.191. Test that --help is side-effect free.

- [ ] Step 2: Run the preflight tests to verify they fail.

~~~sh
bash tests/test-build-a133-tina-usb-modules.sh
~~~

Expected: FAIL because the builder does not exist.

- [ ] Step 3: Implement the builder.

The script must accept AHT_KERNEL_TREE, AHT_TARGET_CONFIG, AHT_CROSS_COMPILE, and AHT_OUTPUT_DIR; require explicit values instead of guessing. It must copy the target config into an isolated O= build directory, set CONFIG_USB_USBNET=m and CONFIG_USB_NET_CDCETHER=m, keep CONFIG_MODVERSIONS disabled to match target evidence, run olddefconfig, modules_prepare, and M=drivers/net/usb modules, copy only usbnet.ko and cdc_ether.ko into the output package, and record source, KERNELRELEASE, config hash, toolchain version, architecture, vermagic, and module hashes.

The script must not contact ADB, push files, run insmod, run DHCP, or change routes. It must fail if either module is absent or if generated metadata does not report AArch64 and 4.9.191.

- [ ] Step 4: Run preflight tests and build the candidate package.

Run the shell tests, then run the builder with the official linux-4.9.191 source archive, the Phase 9B kernel.config, Homebrew aarch64-elf- toolchain, and a fresh output directory. Verify that exactly usbnet.ko, cdc_ether.ko, manifest.json, and checksums are emitted.

- [ ] Step 5: Commit the builder and package contract.

~~~sh
git add scripts/build-a133-tina-usb-modules.sh tests/test-build-a133-tina-usb-modules.sh README.md
git commit -m "feat: build and package A133 USB network modules"
~~~

### Task 3: Add static package verification and guarded device loading

**Files:**
- Create: scripts/verify-a133-tina-usb-modules.sh
- Test: tests/test-verify-a133-tina-usb-modules.sh
- Modify: README.md

- [ ] Step 1: Write failing guard and metadata tests.

Test that verification is read-only by default, rejects a package with a wrong hash or wrong kernel release, and refuses device push/load unless AHT_ALLOW_DEVICE_MUTATION=1 is present. Test that a failed load attempts rollback with rmmod cdc_ether followed by rmmod usbnet.

- [ ] Step 2: Run tests to verify they fail.

~~~sh
bash tests/test-verify-a133-tina-usb-modules.sh
~~~

Expected: FAIL because no verifier exists.

- [ ] Step 3: Implement static verification and guarded load.

Static mode must validate manifest, hashes, ELF machine, module names, and target kernel release. Device mode must require exactly one ready ADB target, root, uname -r=4.9.191, and an explicit mutation flag before pushing to a temporary directory and running insmod usbnet.ko then insmod cdc_ether.ko. After each action it must read back /proc/modules, USB driver bindings, and dmesg; on any failure it must unload in reverse order and report load_failed.

- [ ] Step 4: Run static verification against the candidate package.

Run without the mutation flag and confirm no ADB write command is attempted. Record the exact package manifest and static result in the output directory.

- [ ] Step 5: Commit the verifier.

~~~sh
git add scripts/verify-a133-tina-usb-modules.sh tests/test-verify-a133-tina-usb-modules.sh README.md
git commit -m "feat: verify and guard A133 USB module loading"
~~~

### Task 4: Execute the device binding gate after explicit authorization

**Files:**
- Modify: docs/superpowers/plans/2026-08-17-aht-phase-10-kernel-module-network-acceptance.md
- Create: docs/verification/hardware/a133-tina-reference-01/phase-10-load.txt

- [ ] Step 1: Reconfirm the device preflight.

Read back ADB readiness, root identity, uname -a, /proc/modules, /sys/bus/usb/devices/1-1, and current network interfaces. Do not change the device during this step.

- [ ] Step 2: Load candidate modules only after explicit authorization.

Use the guarded verifier with AHT_ALLOW_DEVICE_MUTATION=1. Do not use insmod -f, do not change USB mode, and do not send AT commands. Capture exit codes, /proc/modules, bound cdc_ether/usbnet nodes, and the kernel log.

- [ ] Step 3: Confirm or roll back the binding.

Pass only if cdc_ether and usbnet are loaded, the CDC-ECM interface is bound, and a cellular network interface appears. Otherwise unload both modules and record the exact failure without calling the device connected.

- [ ] Step 4: Commit load evidence or failure evidence.

~~~sh
git add docs/verification/hardware/a133-tina-reference-01/phase-10-load.txt docs/superpowers/plans/2026-08-17-aht-phase-10-kernel-module-network-acceptance.md
git commit -m "docs: record A133 USB module load result"
~~~

### Task 5: Execute the network gate after binding

**Files:**
- Create: scripts/verify-a133-tina-network.sh
- Test: tests/test-a133-tina-network.sh
- Create: docs/verification/hardware/a133-tina-reference-01/phase-10-network.txt

- [ ] Step 1: Write failing network-state tests.

Test that the network verifier returns degraded when no cellular interface or default route exists, and returns connected only when an identified USB network interface has an address, a default route, and an independent Gateway probe result.

- [ ] Step 2: Run tests to verify they fail.

~~~sh
bash tests/test-a133-tina-network.sh
~~~

Expected: FAIL because no network verifier exists.

- [ ] Step 3: Implement guarded network verification.

The default mode must only read ip, /proc/net/route, DNS configuration, and an independently supplied Gateway endpoint. DHCP and route changes must require AHT_ALLOW_NETWORK_MUTATION=1; the verifier must never infer 4G from USB presence alone and must emit degraded/offline when any independent fact is missing.

- [ ] Step 4: Run the network gate and record the result.

If DHCP succeeds, record interface/address/route and Gateway RTT without storing credentials or SIM identifiers. If it fails, keep the state degraded and preserve the failure evidence.

- [ ] Step 5: Commit network evidence.

~~~sh
git add scripts/verify-a133-tina-network.sh tests/test-a133-tina-network.sh docs/verification/hardware/a133-tina-reference-01/phase-10-network.txt
git commit -m "feat: verify A133 cellular network state"
~~~

### Task 6: Full verification and Draft PR

**Files:**
- Modify: README.md
- Modify: docs/superpowers/plans/2026-08-17-aht-phase-10-kernel-module-network-acceptance.md

- [ ] Step 1: Run complete host verification.

~~~sh
bash -n scripts/*.sh
bash tests/test-collector-redaction.sh
bash tests/test-build-a133-tina-usb-modules.sh
bash tests/test-verify-a133-tina-usb-modules.sh
bash tests/test-a133-tina-network.sh
git diff --check
~~~

- [ ] Step 2: Audit every acceptance gate.

Confirm that the repository contains source/toolchain/config provenance, package checksums, static ELF/vermagic results, load readback, and network readback. If a gate is not proven, mark it blocked or degraded instead of claiming the driver is complete.

- [ ] Step 3: Commit only Phase 10 files and push a Draft PR.

~~~sh
git status --short --branch
git diff --stat agent/a133-tina-phase-9b...HEAD
git add README.md scripts/ tests/ docs/superpowers/plans/2026-08-17-aht-phase-10-kernel-module-network-acceptance.md docs/verification/hardware/a133-tina-reference-01/
git commit -m "feat: add A133 Tina USB cellular driver validation"
git push -u origin agent/a133-tina-phase-10-driver
~~~

Create or update a Draft PR targeting main, explicitly linking Phase 9B evidence and stating whether Build, Package, Load, and Network are each passed, degraded, or blocked.
