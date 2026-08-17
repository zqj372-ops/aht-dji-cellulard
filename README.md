# aht-dji-cellulard

AHT userspace driver and network manager for DJI Cellular modules.

## A133 Tina USB CDC-ECM driver

The Phase 9B evidence bundle identifies the connected reference target as Tina
Linux 4.9.191 on AArch64 with a BAIWANG `2ca3:4006` USB device exposing a
CDC-ECM control/data pair. The stock image has `CONFIG_USB_USBNET` disabled and
does not contain `usbnet.ko` or `cdc_ether.ko`.

Phase 10 now provides a host-only builder and guarded verifiers:

```text
scripts/build-a133-tina-usb-modules.sh
scripts/verify-a133-tina-usb-modules.sh
scripts/verify-a133-tina-network.sh
scripts/aht-a133-tina-target-contract.sh
scripts/accept-a133-tina-phase-10.sh
```

The builder requires explicit `AHT_KERNEL_TREE`, `AHT_TARGET_CONFIG`,
`AHT_CROSS_COMPILE`, and `AHT_OUTPUT_DIR` values. It sets
`CONFIG_USB_USBNET=m`, `CONFIG_USB_NET_CDCETHER=m`, and
`CONFIG_MODVERSIONS=n`, then emits `usbnet.ko`, `cdc_ether.ko`,
`manifest.json`, and `SHA256SUMS`. It never contacts ADB or changes a device.

The current candidate was built from the official Linux `4.9.191` stable
source archive (`ded4b87406deb67112b25a2283e8b5c89c2b47e2de14a97acda57f74cd38b7bc`)
with the sanitized Phase 9B config and Homebrew `aarch64-elf-gcc` 16.2.0.
Both modules are AArch64 ELF files with vermagic
`4.9.191 SMP preempt mod_unload aarch64`; `cdc_ether.ko` declares a dependency
on `usbnet` and a generic CDC-ECM class alias.

Phase 10 acceptance status:

| Gate | Status | Evidence |
| --- | --- | --- |
| Build | Passed | Reproducible host build with recorded source, config, and toolchain inputs |
| Package/static | Passed | SHA-256, AArch64 ELF, kernel release, vermagic, and module metadata checks |
| Device load/binding | Passed | Real ADB target; `usbnet`/`cdc_ether` loaded, CDC-ECM bound, netdev readback verified; modules retained |
| Network | Passed | DHCP assigned an address; `usb0`/default route/DNS and the DHCP default-route Gateway probe were verified |

The checked-in Phase 9B evidence was sanitized with the redaction helper. It
was not recollected from the device after that change because ADB was not ready;
the repository does not claim a fresh post-redaction capture.

This is a candidate build, not yet a claim of exact TRIMUI vendor-kernel ABI:
the matching private Tina kernel tree and original GCC 7.4.1 toolchain binary
were not found on the host. Official Brick firmware provenance now confirms the
same `a133-aw3/generic v1.0` target family, `4.9.191` vermagic, GCC 7.4.1
identity, and an option-equivalent kernel config; it still does not contain
`usbnet.ko` or `cdc_ether.ko`, and the Brick/Pro reference-target relationship
is not confirmed. The current target has now passed device-side load and binding
readback as well as the real network gate. Equivalence to a separate BRICK PRO
target remains unconfirmed. See
`docs/verification/hardware/a133-tina-reference-01/vendor-firmware-provenance.txt`.

Static package verification:

```sh
AHT_PACKAGE_DIR="$PWD/artifacts/a133-tina-reference-01" \
  AHT_READELF=/opt/homebrew/bin/aarch64-elf-readelf \
  bash scripts/verify-a133-tina-usb-modules.sh --static
```

The device gate has a separate read-only preflight that does not require the
package or a mutation flag. Both device verifiers source the same exact target
contract: Tina Linux `4.9.191` build `#913`,
`DISTRIB_ID=tina.raymanfeng.20260717.090727`,
`DISTRIB_REVISION=5C1C9C53`, and
`DISTRIB_TARGET=a133-aw3/generic v1.0`. A different kernel build, even with the
same release number, is rejected before USB or network probes continue.

```sh
sh scripts/verify-a133-tina-usb-modules.sh --preflight
```

Device loading is guarded and temporary. It requires
`AHT_ALLOW_DEVICE_MUTATION=1`, pushes only to `/tmp`, loads `usbnet` followed
by `cdc_ether`, reads back `/proc/modules` and USB driver links, and rolls back
on failure. It does not run DHCP or change routes. Network verification is
separate; DHCP requires `AHT_ALLOW_NETWORK_MUTATION=1`, and the state is only
`connected` when the cellular interface, address, default route, and an
independent Gateway probe are all present. The real run used the Gateway
provided by the device's DHCP default route; the value is intentionally not
stored in the repository.

The host test suite also exercises fake-ADB success/readback and reverse-order
rollback after a simulated `cdc_ether` load failure. These tests validate the
guard logic only and do not substitute for real target evidence.

Both device verifiers require the exact confirmed A133 Tina reference target
contract before they inspect or mutate the target. Network output is
presence-only for addresses, routes, and DNS;
the real Gateway host is never echoed. A real `connected` result still
requires target `cdc_ether` binding, a cellular address, a matching default
route, DNS configuration, and a successful independent Gateway probe.

For a single auditable real-device run, use the thin orchestration entrypoint:

```sh
sh scripts/accept-a133-tina-phase-10.sh \
  --package "$PWD/artifacts/a133-tina-reference-01" \
  --evidence-dir "/tmp/aht-phase-10-run"
```

It performs static verification and read-only preflight by default. Device
loading requires `--allow-device-mutation`; a DHCP/network attempt additionally
requires `--allow-network-mutation --dhcp --gateway-host HOST`. The entrypoint
does not accept fixtures, ignores inherited mutation grants, refuses to
overwrite a non-empty evidence directory, and writes only allowlisted status
fields. `overall_status=passed` is reserved for a real device with successful
static, preflight, module load/binding, and network gates.

Run the host checks with:

```sh
bash -n scripts/*.sh
bash tests/test-collector-redaction.sh
bash tests/test-build-a133-tina-usb-modules.sh
bash tests/test-verify-a133-tina-usb-modules.sh
bash tests/test-a133-tina-network.sh
bash tests/test-accept-a133-tina-phase-10.sh
```
