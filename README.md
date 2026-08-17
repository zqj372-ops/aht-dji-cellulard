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
| Device load/binding | Blocked | The latest read-only ADB check found zero ready targets; no `insmod` was attempted |
| Network | Blocked | Depends on successful device binding; no DHCP, route, or Gateway mutation was attempted |

The checked-in Phase 9B evidence was sanitized with the redaction helper. It
was not recollected from the device after that change because ADB was not ready;
the repository does not claim a fresh post-redaction capture.

This is a candidate build, not yet a claim of exact TRIMUI vendor-kernel ABI:
the matching private Tina kernel tree and original GCC 7.4.1 toolchain path
were not found on the host. The package must pass device-side load and binding
readback before it is treated as accepted.

Static package verification:

```sh
AHT_PACKAGE_DIR="$PWD/artifacts/a133-tina-reference-01" \
  AHT_READELF=/opt/homebrew/bin/aarch64-elf-readelf \
  bash scripts/verify-a133-tina-usb-modules.sh --static
```

Device loading is guarded and temporary. It requires
`AHT_ALLOW_DEVICE_MUTATION=1`, pushes only to `/tmp`, loads `usbnet` followed
by `cdc_ether`, reads back `/proc/modules` and USB driver links, and rolls back
on failure. It does not run DHCP or change routes. Network verification is
separate; DHCP requires `AHT_ALLOW_NETWORK_MUTATION=1`, and the state is only
`connected` when the cellular interface, address, default route, and an
independent Gateway probe are all present.

Run the host checks with:

```sh
bash -n scripts/*.sh
bash tests/test-collector-redaction.sh
bash tests/test-build-a133-tina-usb-modules.sh
bash tests/test-verify-a133-tina-usb-modules.sh
bash tests/test-a133-tina-network.sh
```
