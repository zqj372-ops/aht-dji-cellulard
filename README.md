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

The repository is currently at the contract/scaffolding stage. Driver implementation, hardware probing, and modem-specific command handling will be added in subsequent pull requests.
