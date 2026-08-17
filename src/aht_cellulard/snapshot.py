from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any, Literal, Mapping, TypeAlias


Number: TypeAlias = int | float
SnapshotState: TypeAlias = Literal[
    "absent",
    "initializing",
    "sim_locked",
    "registered",
    "connected",
    "degraded",
    "disconnected",
    "error",
]
Transport: TypeAlias = Literal["usb", "serial", "unknown"]
RadioAccessTechnology: TypeAlias = Literal["4g", "5g", "unknown"]
SimState: TypeAlias = Literal["ready", "locked", "missing", "error", "unknown"]
PdpState: TypeAlias = Literal["active", "inactive", "unknown"]

_SNAPSHOT_STATES = {
    "absent",
    "initializing",
    "sim_locked",
    "registered",
    "connected",
    "degraded",
    "disconnected",
    "error",
}
_TRANSPORTS = {"usb", "serial", "unknown"}
_RAT_VALUES = {"4g", "5g", "unknown"}
_SIM_STATES = {"ready", "locked", "missing", "error", "unknown"}
_PDP_STATES = {"active", "inactive", "unknown"}


class SnapshotValidationError(ValueError):
    """Raised when a driver snapshot violates the public contract."""


def _mapping(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise SnapshotValidationError(f"{field} must be an object")
    return dict(value)


def _required_string(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotValidationError(f"{field} must be a non-empty string")
    return value


def _optional_string(value: object, field: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise SnapshotValidationError(f"{field} must be a string or null")
    return value


def _number(
    value: object,
    field: str,
    *,
    allow_none: bool,
    non_negative: bool = False,
) -> Number | None:
    if value is None and allow_none:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SnapshotValidationError(f"{field} must be a number or null")
    if not isfinite(float(value)):
        raise SnapshotValidationError(f"{field} must be finite")
    if non_negative and value < 0:
        raise SnapshotValidationError(f"{field} must not be negative")
    return value


def _enum(value: object, field: str, allowed: set[str]) -> str:
    if not isinstance(value, str) or value not in allowed:
        expected = ", ".join(sorted(allowed))
        raise SnapshotValidationError(f"{field} must be one of: {expected}")
    return value


@dataclass(frozen=True)
class Signal:
    dbm: Number | None
    level: int | None

    @classmethod
    def from_dict(cls, value: object) -> "Signal":
        payload = _mapping(value, "signal")
        dbm = _number(payload.get("dbm"), "signal.dbm", allow_none=True)
        level = payload.get("level")
        if level is not None and (isinstance(level, bool) or not isinstance(level, int) or not 0 <= level <= 4):
            raise SnapshotValidationError("signal.level must be an integer from 0 to 4 or null")
        return cls(dbm=dbm, level=level)

    def to_dict(self) -> dict[str, Number | None]:
        return {"dbm": self.dbm, "level": self.level}


@dataclass(frozen=True)
class DataSession:
    pdp: PdpState
    interface: str | None
    ipv4: bool
    ipv6: bool

    @classmethod
    def from_dict(cls, value: object) -> "DataSession":
        payload = _mapping(value, "data")
        pdp = _enum(payload.get("pdp"), "data.pdp", _PDP_STATES)
        interface = _optional_string(payload.get("interface"), "data.interface")
        ipv4 = payload.get("ipv4")
        ipv6 = payload.get("ipv6")
        if not isinstance(ipv4, bool) or not isinstance(ipv6, bool):
            raise SnapshotValidationError("data.ipv4 and data.ipv6 must be boolean")
        return cls(pdp=pdp, interface=interface, ipv4=ipv4, ipv6=ipv6)

    def to_dict(self) -> dict[str, object]:
        return {
            "pdp": self.pdp,
            "interface": self.interface,
            "ipv4": self.ipv4,
            "ipv6": self.ipv6,
        }


@dataclass(frozen=True)
class SnapshotError:
    code: str
    message: str

    @classmethod
    def from_dict(cls, value: object) -> "SnapshotError | None":
        if value is None:
            return None
        payload = _mapping(value, "error")
        return cls(
            code=_required_string(payload.get("code"), "error.code"),
            message=_required_string(payload.get("message"), "error.message"),
        )

    def to_dict(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


@dataclass(frozen=True)
class CellularSnapshot:
    schema_version: int
    modem_id: str
    state: SnapshotState
    transport: Transport
    rat: RadioAccessTechnology
    operator: str | None
    sim: SimState
    signal: Signal
    data: DataSession
    rtt_ms: Number | None
    updated_at: str
    error: SnapshotError | None

    @classmethod
    def from_dict(cls, value: Mapping[str, object]) -> "CellularSnapshot":
        payload = _mapping(value, "snapshot")
        schema_version = payload.get("schema_version")
        if isinstance(schema_version, bool) or not isinstance(schema_version, int) or schema_version != 1:
            raise SnapshotValidationError("schema_version must be 1")

        snapshot = cls(
            schema_version=schema_version,
            modem_id=_required_string(payload.get("modem_id"), "modem_id"),
            state=_enum(payload.get("state"), "state", _SNAPSHOT_STATES),  # type: ignore[arg-type]
            transport=_enum(payload.get("transport"), "transport", _TRANSPORTS),  # type: ignore[arg-type]
            rat=_enum(payload.get("rat"), "rat", _RAT_VALUES),  # type: ignore[arg-type]
            operator=_optional_string(payload.get("operator"), "operator"),
            sim=_enum(payload.get("sim"), "sim", _SIM_STATES),  # type: ignore[arg-type]
            signal=Signal.from_dict(payload.get("signal")),
            data=DataSession.from_dict(payload.get("data")),
            rtt_ms=_number(payload.get("rtt_ms"), "rtt_ms", allow_none=True, non_negative=True),
            updated_at=_required_string(payload.get("updated_at"), "updated_at"),
            error=SnapshotError.from_dict(payload.get("error")),
        )
        if snapshot.state == "connected" and snapshot.data.pdp != "active":
            raise SnapshotValidationError("connected snapshots require data.pdp=active")
        return snapshot

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "modem_id": self.modem_id,
            "state": self.state,
            "transport": self.transport,
            "rat": self.rat,
            "operator": self.operator,
            "sim": self.sim,
            "signal": self.signal.to_dict(),
            "data": self.data.to_dict(),
            "rtt_ms": self.rtt_ms,
            "updated_at": self.updated_at,
            "error": self.error.to_dict() if self.error else None,
        }


def to_gateway_network(
    snapshot: CellularSnapshot,
    *,
    gateway_rtt_ms: Number | None,
    vpn: bool,
) -> dict[str, object]:
    """Map a validated modem snapshot to the minimal AHT network object.

    The RTT argument must come from a Gateway reachability probe. The driver's
    own `rtt_ms` is deliberately not used as evidence that the Gateway is
    reachable.
    """

    probe_rtt = _number(gateway_rtt_ms, "gateway_rtt_ms", allow_none=True, non_negative=True)
    usable = snapshot.state == "connected" and snapshot.data.pdp == "active" and probe_rtt is not None
    return {
        "link": "4G" if usable else "offline",
        "rtt_ms": probe_rtt if usable else None,
        "vpn": vpn,
    }
