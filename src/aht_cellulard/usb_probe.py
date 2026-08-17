from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .snapshot import CellularSnapshot, DataSession, Signal, SnapshotError


def _read_text(path: Path) -> str | None:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError):
        return None
    return value or None


def _read_hex(path: Path) -> int | None:
    value = _read_text(path)
    if value is None:
        return None
    try:
        return int(value, 16)
    except ValueError:
        return None


def _driver_name(path: Path) -> str | None:
    if not path.is_symlink():
        return None
    try:
        return path.resolve(strict=False).name
    except OSError:
        return None


@dataclass(frozen=True)
class UsbInterfaceInfo:
    sysfs_name: str
    interface_class: int
    interface_subclass: int
    interface_protocol: int
    driver: str | None

    @property
    def is_cdc_ecm_control(self) -> bool:
        return self.interface_class == 0x02 and self.interface_subclass == 0x06


@dataclass(frozen=True)
class UsbDeviceInfo:
    sysfs_name: str
    vendor_id: int
    product_id: int
    manufacturer: str | None
    product: str | None
    interfaces: tuple[UsbInterfaceInfo, ...]

    @property
    def has_cdc_ecm(self) -> bool:
        return any(interface.is_cdc_ecm_control for interface in self.interfaces)

    @property
    def ecm_driver(self) -> str | None:
        for interface in self.interfaces:
            if interface.is_cdc_ecm_control:
                return interface.driver
        return None

    @property
    def bound_drivers(self) -> tuple[str, ...]:
        return tuple(sorted({interface.driver for interface in self.interfaces if interface.driver}))


def _scan_interfaces(root: Path, device_name: str) -> tuple[UsbInterfaceInfo, ...]:
    interfaces: list[UsbInterfaceInfo] = []
    for path in sorted(root.glob(f"{device_name}:*")):
        if not path.is_dir():
            continue
        interface_class = _read_hex(path / "bInterfaceClass")
        interface_subclass = _read_hex(path / "bInterfaceSubClass")
        interface_protocol = _read_hex(path / "bInterfaceProtocol")
        if interface_class is None or interface_subclass is None or interface_protocol is None:
            continue
        interfaces.append(
            UsbInterfaceInfo(
                sysfs_name=path.name,
                interface_class=interface_class,
                interface_subclass=interface_subclass,
                interface_protocol=interface_protocol,
                driver=_driver_name(path / "driver"),
            )
        )
    return tuple(interfaces)


def scan_usb_sysfs(root: Path = Path("/sys/bus/usb/devices")) -> list[UsbDeviceInfo]:
    """Read USB identity/interface facts from Linux sysfs without side effects."""

    if not root.is_dir():
        return []

    devices: list[UsbDeviceInfo] = []
    for path in sorted(root.iterdir()):
        if not path.is_dir():
            continue
        vendor_id = _read_hex(path / "idVendor")
        product_id = _read_hex(path / "idProduct")
        if vendor_id is None or product_id is None:
            continue
        devices.append(
            UsbDeviceInfo(
                sysfs_name=path.name,
                vendor_id=vendor_id,
                product_id=product_id,
                manufacturer=_read_text(path / "manufacturer"),
                product=_read_text(path / "product"),
                interfaces=_scan_interfaces(root, path.name),
            )
        )
    return devices


def snapshot_for_usb_device(device: UsbDeviceInfo, *, updated_at: str) -> CellularSnapshot:
    """Create a conservative snapshot from USB facts only.

    USB presence is never sufficient evidence for a live data session. Even a
    bound CDC ECM driver stays degraded until a separate network/Gateway probe
    proves reachability.
    """

    if not device.has_cdc_ecm:
        error_code = "unsupported_usb_profile"
        error_message = "USB device has no CDC ECM control interface"
    elif device.ecm_driver is None:
        error_code = "usb_network_driver_unbound"
        error_message = "CDC ECM interface is present but no USB network driver is bound"
    else:
        error_code = "network_probe_required"
        error_message = "USB network driver is bound; Gateway reachability probe is still required"

    return CellularSnapshot(
        schema_version=1,
        modem_id=f"usb-{device.vendor_id:04x}:{device.product_id:04x}-{device.sysfs_name}",
        state="degraded",
        transport="usb",
        rat="unknown",
        operator=None,
        sim="unknown",
        signal=Signal(dbm=None, level=None),
        data=DataSession(pdp="unknown", interface=None, ipv4=False, ipv6=False),
        rtt_ms=None,
        updated_at=updated_at,
        error=SnapshotError(code=error_code, message=error_message),
    )
