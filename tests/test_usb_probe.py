import tempfile
import unittest
from pathlib import Path

from aht_cellulard.usb_probe import scan_usb_sysfs, snapshot_for_usb_device


def write_sysfs(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def create_ecm_device(root: Path, *, bound: bool) -> None:
    device = root / "1-1"
    write_sysfs(device / "idVendor", "2ca3\n")
    write_sysfs(device / "idProduct", "4006\n")
    write_sysfs(device / "manufacturer", "BAIWANG\n")
    write_sysfs(device / "product", "Baiwang\n")
    write_sysfs(device / "serial", "MUST-NOT-LEAK\n")

    control = root / "1-1:1.4"
    write_sysfs(control / "bInterfaceClass", "02\n")
    write_sysfs(control / "bInterfaceSubClass", "06\n")
    write_sysfs(control / "bInterfaceProtocol", "00\n")

    data = root / "1-1:1.5"
    write_sysfs(data / "bInterfaceClass", "0a\n")
    write_sysfs(data / "bInterfaceSubClass", "00\n")
    write_sysfs(data / "bInterfaceProtocol", "00\n")

    if bound:
        driver = root / "drivers" / "cdc_ether"
        driver.mkdir(parents=True)
        (control / "driver").symlink_to(driver)


class UsbProbeTests(unittest.TestCase):
    def test_scans_cdc_ecm_device_without_exposing_serial(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            create_ecm_device(root, bound=False)

            devices = scan_usb_sysfs(root)

        self.assertEqual(len(devices), 1)
        device = devices[0]
        self.assertEqual((device.vendor_id, device.product_id), (0x2CA3, 0x4006))
        self.assertEqual((device.manufacturer, device.product), ("BAIWANG", "Baiwang"))
        self.assertTrue(device.has_cdc_ecm)
        self.assertEqual(device.bound_drivers, ())
        self.assertNotIn("serial", repr(device).lower())

    def test_unbound_ecm_maps_to_degraded_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            create_ecm_device(root, bound=False)
            device = scan_usb_sysfs(root)[0]

        snapshot = snapshot_for_usb_device(device, updated_at="2026-08-17T13:30:00Z")

        self.assertEqual(snapshot.state, "degraded")
        self.assertEqual(snapshot.data.pdp, "unknown")
        self.assertEqual(snapshot.error.code, "usb_network_driver_unbound")

    def test_bound_ecm_still_requires_gateway_probe(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            create_ecm_device(root, bound=True)
            device = scan_usb_sysfs(root)[0]

        snapshot = snapshot_for_usb_device(device, updated_at="2026-08-17T13:30:00Z")

        self.assertEqual(snapshot.state, "degraded")
        self.assertEqual(snapshot.error.code, "network_probe_required")

    def test_empty_sysfs_root_returns_no_devices(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(scan_usb_sysfs(Path(directory)), [])


if __name__ == "__main__":
    unittest.main()
