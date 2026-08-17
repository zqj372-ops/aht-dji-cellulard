import copy
import unittest

from aht_cellulard.snapshot import CellularSnapshot, SnapshotValidationError, to_gateway_network


def connected_payload() -> dict[str, object]:
    return {
        "schema_version": 1,
        "modem_id": "dji-cellular-0",
        "state": "connected",
        "transport": "usb",
        "rat": "4g",
        "operator": "example-carrier",
        "sim": "ready",
        "signal": {"dbm": -78, "level": 4},
        "data": {
            "pdp": "active",
            "interface": "wwan0",
            "ipv4": True,
            "ipv6": False,
        },
        "rtt_ms": 38,
        "updated_at": "2026-08-17T12:00:00Z",
        "error": None,
    }


class CellularSnapshotTests(unittest.TestCase):
    def test_valid_snapshot_round_trips_without_losing_contract_fields(self) -> None:
        payload = connected_payload()

        snapshot = CellularSnapshot.from_dict(payload)

        self.assertEqual(snapshot.to_dict(), payload)

    def test_rejects_wrong_schema_version_and_empty_modem_id(self) -> None:
        wrong_version = connected_payload()
        wrong_version["schema_version"] = 2
        float_version = connected_payload()
        float_version["schema_version"] = 1.0
        empty_id = connected_payload()
        empty_id["modem_id"] = "  "

        with self.assertRaises(SnapshotValidationError):
            CellularSnapshot.from_dict(wrong_version)
        with self.assertRaises(SnapshotValidationError):
            CellularSnapshot.from_dict(float_version)
        with self.assertRaises(SnapshotValidationError):
            CellularSnapshot.from_dict(empty_id)

    def test_connected_snapshot_requires_active_pdp(self) -> None:
        payload = connected_payload()
        data = copy.deepcopy(payload["data"])
        assert isinstance(data, dict)
        data["pdp"] = "inactive"
        payload["data"] = data

        with self.assertRaises(SnapshotValidationError):
            CellularSnapshot.from_dict(payload)

    def test_rejects_invalid_signal_level_and_negative_driver_rtt(self) -> None:
        invalid_signal = connected_payload()
        invalid_signal["signal"] = {"dbm": -78, "level": 5}
        negative_rtt = connected_payload()
        negative_rtt["rtt_ms"] = -1

        with self.assertRaises(SnapshotValidationError):
            CellularSnapshot.from_dict(invalid_signal)
        with self.assertRaises(SnapshotValidationError):
            CellularSnapshot.from_dict(negative_rtt)

    def test_gateway_mapping_is_4g_only_with_active_probe(self) -> None:
        snapshot = CellularSnapshot.from_dict(connected_payload())

        self.assertEqual(
            to_gateway_network(snapshot, gateway_rtt_ms=38, vpn=True),
            {"link": "4G", "rtt_ms": 38, "vpn": True},
        )
        self.assertEqual(
            to_gateway_network(snapshot, gateway_rtt_ms=None, vpn=False),
            {"link": "offline", "rtt_ms": None, "vpn": False},
        )

        registered_payload = connected_payload()
        registered_payload["state"] = "registered"
        registered_payload["data"] = {**registered_payload["data"], "pdp": "inactive"}
        registered = CellularSnapshot.from_dict(registered_payload)
        self.assertEqual(
            to_gateway_network(registered, gateway_rtt_ms=38, vpn=True),
            {"link": "offline", "rtt_ms": None, "vpn": True},
        )


if __name__ == "__main__":
    unittest.main()
