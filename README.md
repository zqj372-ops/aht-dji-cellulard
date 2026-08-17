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
