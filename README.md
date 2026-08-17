# aht-dji-cellulard

AHT userspace driver and network manager for DJI Cellular modules.

## Scope

This repository owns the DJI Cellular device boundary: module discovery, transport, SIM/registration state, PDP/data connectivity, signal metrics, and reconnect behavior. It is intentionally independent from the AHT handheld UI repository.

The current integration contract is documented in [AHT Gateway Network Contract](docs/aht-gateway-network-contract.md).

The driver must not make the handheld client speak AT commands or depend on DJI-specific device nodes. The intended flow is:

```text
DJI Cellular module
        ↓
userspace driver / network manager
        ↓ normalized CellularSnapshot
Gateway
        ↓ aht.gateway.v1
AHT client
```

The repository currently includes a dependency-free Python reference core for snapshot validation and Gateway mapping. It is not the hardware driver: USB/serial probing, AT commands, SIM/PDP control, and modem-specific behavior will be added only after the module interface is verified.

## Reference core

The reference core accepts the JSON shape in [examples/connected-snapshot.json](examples/connected-snapshot.json), rejects invalid or contradictory states, and maps only independently-probed Gateway reachability to `link: "4G"`.

Run the tests with the standard library only:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

The implementation lives in `src/aht_cellulard/snapshot.py`. It does not open hardware devices, send modem commands, persist credentials, or claim that the sample represents a live module.

## Current BRICK observation

On 2026-08-17, a read-only ADB inspection of the connected BRICK found a USB device with `VID:PID 2ca3:4006`, manufacturer/product `BAIWANG/Baiwang`, and CDC ECM control/data interfaces. No `cdc_ether`/`usbnet` driver was bound, and the device exposed no `wwan`, `cdc-wdm`, `ttyUSB`, or `ttyACM` node. The non-sensitive observation is recorded in [examples/brick-usb-observation.json](examples/brick-usb-observation.json).

The BRICK kernel reports `CONFIG_USB_NET_DRIVERS=y` but `CONFIG_USB_USBNET` is not set. Therefore the current evidence is `degraded`, not live `4G`. A real network path needs a kernel build with the matching USB network support, or an explicitly selected userspace USB stack; this repository does not change the kernel or the connected device.
