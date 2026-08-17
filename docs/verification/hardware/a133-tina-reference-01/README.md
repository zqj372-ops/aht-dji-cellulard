# A133 Tina Reference Target

This directory is the Phase 9B evidence bundle for the currently connected reference device. It is intentionally separate from any BRICK PRO claim.

## Target identity

| Field | Value | Source |
| --- | --- | --- |
| Target ID | `a133-tina-reference-01` | repository target name |
| Target firmware | Tina Linux / Neptune | `/etc/openwrt_release` |
| Board target | `a133-aw3/generic v1.0` | `/etc/openwrt_release` |
| SoC family | Allwinner A133 / `sun50iw10p1` | boot cmdline and firmware target |
| Architecture | AArch64 | `uname -a` |
| Kernel | Linux `4.9.191` | `uname -a` and `/proc/version` |
| DJI USB VID:PID | `2ca3:4006` | USB sysfs |
| USB manufacturer | `BAIWANG` | USB sysfs |
| USB speed | High-Speed / 480 Mbps | USB sysfs |
| Current USB mode | CDC-ECM descriptor | interface class/subclass `02/06` |
| BRICK PRO equivalence | Unconfirmed | no cross-device ABI assumption |

## Scope and safety boundary

Phase 9B records build identity and host-driver evidence only. The collector is read-only against the device. It does not:

- load, unload, or compile a kernel module;
- send AT commands or change the module USB mode;
- change NVRAM, routes, DNS, DHCP state, or Wi-Fi state;
- claim that a network interface, signal value, operator, or Internet path is available.

The first kernel enablement target remains the standard Linux USB network path:

```text
CONFIG_USB_USBNET
CONFIG_USB_NET_CDCETHER
```

`RNDIS`, `CDC-NCM`, `MBIM`, `QMI`, and `USB_SERIAL_OPTION` are intentionally not enabled by this evidence-only phase.

## Evidence files

| File | Contents |
| --- | --- |
| `kernel-version.txt` | `uname`, `/proc/version`, `/proc/cmdline`, and firmware release identity |
| `kernel.config` | decompressed `/proc/config.gz`, or an explicit unavailable marker |
| `modules.txt` | loaded modules, module tree, loader tools, relevant Kconfig values, and driver nodes |
| `dji-2ca3-4006-lsusb.txt` | `lsusb -v` when available; otherwise an explicitly labeled sysfs descriptor fallback |
| `dji-2ca3-4006-dmesg.txt` | the last 500 kernel log lines captured after USB attachment |
| `usb-devices.txt` | USB debugfs data when mounted, plus matching sysfs, network, and device-node evidence |

## Collection

From the repository root, with exactly one ready ADB device attached:

```bash
bash scripts/collect-a133-tina-reference.sh
```

The target-specific output path can be overridden for a fresh collection:

```bash
AHT_EVIDENCE_DIR=/tmp/a133-tina-reference-01 \
  bash scripts/collect-a133-tina-reference.sh
```

The collector fails closed when ADB is missing or more than one device is ready. It preserves a command's output and exit status in each artifact so missing utilities are distinguishable from successful observations.

## Current Phase 9B interpretation

The device can enumerate the DJI module and exposes a CDC-ECM control/data interface. Before a `.ko` build, the kernel's exact build identity, module configuration, `CONFIG_MODVERSIONS`, `Module.symvers` availability, compiler, and module directory must be matched. An arbitrary Linux `4.9.191` tree or `insmod -f` is out of scope and must not be used.

The captured target currently reports:

```text
CONFIG_MODULES=y
# CONFIG_MODVERSIONS is not set
# CONFIG_USB_USBNET is not set
# CONFIG_USB_SERIAL_OPTION is not set
usbnet/cdc_ether/rndis_host/cdc_ncm/qmi_wwan/option: absent
```

The device-side `lsusb` utility is unavailable, so `dji-2ca3-4006-lsusb.txt` deliberately contains a labeled sysfs descriptor fallback. The fallback records four vendor-specific interfaces plus the CDC-ECM control/data pair; all six interfaces are currently unbound. No `ethX`, `usbX`, `/dev/ttyUSB*`, or `/dev/cdc-wdm*` path was observed in this collection.
