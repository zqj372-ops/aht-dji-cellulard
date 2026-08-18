#!/usr/bin/env python3
"""Render the official LobeHub Grok mark into MainUI/favicon PNGs.

The single source of truth is the vendored official package
``vendor/lobehub-icons/es/Grok/components/Mono.js`` (``@lobehub/icons@1.94.0``,
the default ``Grok`` export used by the LobeHub site example
``import { Grok } from '@lobehub/icons'; <Grok size={56} />``).
``src/assets/agents/grok.svg`` is a build-synced copy of that same path.
The native package cannot import a React component, so this small
dependency-free renderer adapts the official 24x24 path to a 300x300
transparent MainUI icon (white rounded tile + black Grok, matching the
browser ``agent-icon-tile--white`` surface) and to the 64x64 favicon.
"""

from __future__ import annotations

import math
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path


WIDTH = 300
HEIGHT = 300
SS = 4
HIGH_WIDTH = WIDTH * SS
HIGH_HEIGHT = HEIGHT * SS
VENDOR_MONO = (
    Path(__file__).resolve().parents[2]
    / "vendor"
    / "lobehub-icons"
    / "es"
    / "Grok"
    / "components"
    / "Mono.js"
)
GROK_SVG = Path(__file__).resolve().parents[2] / "src" / "assets" / "agents" / "grok.svg"
NUMBER_OR_COMMAND = re.compile(r"[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


def _number_pair(values: list[str], index: int, count: int) -> tuple[list[float], int]:
    if index + count > len(values) or any(re.fullmatch(r"[a-zA-Z]", value) for value in values[index:index + count]):
        raise ValueError("incomplete SVG path command")
    return [float(value) for value in values[index:index + count]], index + count


def _arc_values(values: list[str], index: int) -> tuple[list[float], int]:
    """Read an arc's seven values, including adjacent 0/1 flag digits."""

    parsed: list[float] = []
    while len(parsed) < 7:
        if index >= len(values) or re.fullmatch(r"[a-zA-Z]", values[index]):
            raise ValueError("incomplete SVG arc command")
        token = values[index]
        if len(parsed) == 3 and len(token) >= 2 and token[0] in "01" and token[1] in "01":
            parsed.extend([float(token[0]), float(token[1])])
            suffix = token[2:]
            if suffix:
                parsed.append(float(suffix))
            index += 1
            continue
        parsed.append(float(token))
        index += 1
    return parsed, index


def _append_line(points: list[tuple[float, float]], point: tuple[float, float]) -> None:
    if not points or points[-1] != point:
        points.append(point)


def _append_cubic(
    points: list[tuple[float, float]],
    start: tuple[float, float],
    control_one: tuple[float, float],
    control_two: tuple[float, float],
    end: tuple[float, float],
) -> None:
    # The official Grok path is compact; 20 linear segments per cubic keep the
    # 4x rasterization smooth while avoiding a runtime SVG dependency.
    for step in range(1, 21):
        t = step / 20.0
        inverse = 1.0 - t
        point = (
            inverse**3 * start[0]
            + 3 * inverse**2 * t * control_one[0]
            + 3 * inverse * t**2 * control_two[0]
            + t**3 * end[0],
            inverse**3 * start[1]
            + 3 * inverse**2 * t * control_one[1]
            + 3 * inverse * t**2 * control_two[1]
            + t**3 * end[1],
        )
        _append_line(points, point)


def _append_arc(
    points: list[tuple[float, float]],
    start: tuple[float, float],
    radius_x: float,
    radius_y: float,
    rotation: float,
    large_arc: float,
    sweep: float,
    end: tuple[float, float],
) -> None:
    """Flatten one SVG elliptical arc using the endpoint parameterization."""

    radius_x = abs(radius_x)
    radius_y = abs(radius_y)
    if radius_x == 0.0 or radius_y == 0.0 or start == end:
        _append_line(points, end)
        return

    angle = math.radians(rotation % 360.0)
    cosine = math.cos(angle)
    sine = math.sin(angle)
    half_dx = (start[0] - end[0]) / 2.0
    half_dy = (start[1] - end[1]) / 2.0
    prime_x = cosine * half_dx + sine * half_dy
    prime_y = -sine * half_dx + cosine * half_dy
    radius_scale = (prime_x * prime_x) / (radius_x * radius_x) + (prime_y * prime_y) / (radius_y * radius_y)
    if radius_scale > 1.0:
        scale = math.sqrt(radius_scale)
        radius_x *= scale
        radius_y *= scale

    numerator = radius_x * radius_x * radius_y * radius_y - radius_x * radius_x * prime_y * prime_y - radius_y * radius_y * prime_x * prime_x
    denominator = radius_x * radius_x * prime_y * prime_y + radius_y * radius_y * prime_x * prime_x
    coefficient = 0.0 if denominator == 0.0 else math.sqrt(max(0.0, numerator / denominator))
    if bool(large_arc) == bool(sweep):
        coefficient = -coefficient
    center_prime_x = coefficient * (radius_x * prime_y / radius_y)
    center_prime_y = coefficient * (-radius_y * prime_x / radius_x)
    center_x = cosine * center_prime_x - sine * center_prime_y + (start[0] + end[0]) / 2.0
    center_y = sine * center_prime_x + cosine * center_prime_y + (start[1] + end[1]) / 2.0

    unit_start_x = (prime_x - center_prime_x) / radius_x
    unit_start_y = (prime_y - center_prime_y) / radius_y
    unit_end_x = (-prime_x - center_prime_x) / radius_x
    unit_end_y = (-prime_y - center_prime_y) / radius_y
    start_angle = math.atan2(unit_start_y, unit_start_x)
    delta_angle = math.atan2(
        unit_start_x * unit_end_y - unit_start_y * unit_end_x,
        unit_start_x * unit_end_x + unit_start_y * unit_end_y,
    )
    if not bool(sweep) and delta_angle > 0.0:
        delta_angle -= 2.0 * math.pi
    if bool(sweep) and delta_angle < 0.0:
        delta_angle += 2.0 * math.pi

    steps = max(4, math.ceil(abs(delta_angle) * 20.0))
    for step in range(1, steps + 1):
        current_angle = start_angle + delta_angle * step / steps
        cosine_angle = math.cos(current_angle)
        sine_angle = math.sin(current_angle)
        _append_line(
            points,
            (
                center_x + cosine * radius_x * cosine_angle - sine * radius_y * sine_angle,
                center_y + sine * radius_x * cosine_angle + cosine * radius_y * sine_angle,
            ),
        )


def parse_path(path_data: str) -> list[list[tuple[float, float]]]:
    """Flatten the SVG commands used by the official Grok path."""

    tokens = NUMBER_OR_COMMAND.findall(path_data)
    subpaths: list[list[tuple[float, float]]] = []
    points: list[tuple[float, float]] = []
    current = (0.0, 0.0)
    subpath_start = current
    previous_control: tuple[float, float] | None = None
    command: str | None = None
    index = 0

    def flush() -> None:
        nonlocal points
        if len(points) >= 3:
            subpaths.append(points)
        points = []

    while index < len(tokens):
        if re.fullmatch(r"[a-zA-Z]", tokens[index]):
            command = tokens[index]
            index += 1
            if command.lower() == "z":
                flush()
                current = subpath_start
                previous_control = None
                command = None
                continue

        if command is None:
            raise ValueError("SVG path is missing a command")

        relative = command.islower()
        kind = command.lower()
        if kind in {"m", "l", "t"}:
            values, index = _number_pair(tokens, index, 2)
            x, y = values
            if relative:
                x += current[0]
                y += current[1]
            target = (x, y)
            if kind == "m":
                flush()
                current = target
                subpath_start = target
                points = [target]
                command = "l" if relative else "L"
            else:
                _append_line(points, target)
                current = target
            previous_control = None
            continue

        if kind in {"h", "v"}:
            values, index = _number_pair(tokens, index, 1)
            value = values[0]
            if kind == "h":
                target = (current[0] + value if relative else value, current[1])
            else:
                target = (current[0], current[1] + value if relative else value)
            _append_line(points, target)
            current = target
            previous_control = None
            continue

        if kind == "a":
            values, index = _arc_values(tokens, index)
            target = (values[5], values[6])
            if relative:
                target = (target[0] + current[0], target[1] + current[1])
            _append_arc(points, current, values[0], values[1], values[2], values[3], values[4], target)
            current = target
            previous_control = None
            continue

        if kind in {"c", "s"}:
            count = 6 if kind == "c" else 4
            values, index = _number_pair(tokens, index, count)
            if kind == "c":
                control_one = (values[0], values[1])
                control_two = (values[2], values[3])
                target = (values[4], values[5])
                if relative:
                    control_one = (control_one[0] + current[0], control_one[1] + current[1])
                    control_two = (control_two[0] + current[0], control_two[1] + current[1])
                    target = (target[0] + current[0], target[1] + current[1])
            else:
                control_one = (
                    2 * current[0] - previous_control[0],
                    2 * current[1] - previous_control[1],
                ) if previous_control is not None else current
                control_two = (values[0], values[1])
                target = (values[2], values[3])
                if relative:
                    control_two = (control_two[0] + current[0], control_two[1] + current[1])
                    target = (target[0] + current[0], target[1] + current[1])
            _append_cubic(points, current, control_one, control_two, target)
            current = target
            previous_control = control_two
            continue

        raise ValueError(f"unsupported SVG path command: {command}")

    flush()
    return subpaths


def official_grok_path() -> str:
    """Return the official Grok Mono path from the vendored package."""

    source = VENDOR_MONO.read_text(encoding="utf-8")
    match = re.search(r'd: "([^"]+)"', source)
    if match is None:
        raise ValueError(f"Vendored Mono.js has no d attribute: {VENDOR_MONO}")
    return match.group(1)


def grok_subpaths() -> list[list[tuple[float, float]]]:
    return parse_path(official_grok_path())


def scaled_subpaths() -> list[list[tuple[float, float]]]:
    # The MainUI app image keeps transparent safety margins; the Grok mark is
    # sized so it visually matches the LobeHub site icon (glyph-dominant
    # rather than a small mark inside a large empty tile). The full-bleed
    # 24x24 glyph needs a tile big enough for its rounded-corner inset.
    logo_size = 208.0
    offset = (WIDTH - logo_size) / 2.0
    scale = logo_size / 24.0
    return [
        [(offset + point[0] * scale, offset + point[1] * scale) for point in subpath]
        for subpath in grok_subpaths()
    ]


def fill_even_odd(polygons: list[list[tuple[float, float]]]) -> bytearray:
    """Rasterize closed polygons with SVG's even-odd fill rule."""

    mask = bytearray(HIGH_WIDTH * HIGH_HEIGHT)
    scaled = [[(x * SS, y * SS) for x, y in polygon] for polygon in polygons]
    for high_y in range(HIGH_HEIGHT):
        scan_y = high_y + 0.5
        intersections: list[float] = []
        for polygon in scaled:
            for index, first in enumerate(polygon):
                second = polygon[(index + 1) % len(polygon)]
                first_y = first[1]
                second_y = second[1]
                if (first_y <= scan_y < second_y) or (second_y <= scan_y < first_y):
                    ratio = (scan_y - first_y) / (second_y - first_y)
                    intersections.append(first[0] + ratio * (second[0] - first[0]))
        intersections.sort()
        row_offset = high_y * HIGH_WIDTH
        for index in range(0, len(intersections) - 1, 2):
            left = max(0, math.ceil(intersections[index] - 0.5))
            right = min(HIGH_WIDTH - 1, math.floor(intersections[index + 1] - 0.5))
            if right >= left:
                mask[row_offset + left:row_offset + right + 1] = b"\x01" * (right - left + 1)
    return mask


def tile_mask() -> bytearray:
    mask = bytearray(HIGH_WIDTH * HIGH_HEIGHT)
    x0, y0, x1, y1, radius = (24 * SS, 24 * SS, 276 * SS, 276 * SS, 52 * SS)
    for high_y in range(y0, y1):
        py = high_y + 0.5
        row_offset = high_y * HIGH_WIDTH
        for high_x in range(x0, x1):
            px = high_x + 0.5
            closest_x = max(x0 + radius, min(px, x1 - radius))
            closest_y = max(y0 + radius, min(py, y1 - radius))
            if math.hypot(px - closest_x, py - closest_y) <= radius:
                mask[row_offset + high_x] = 1
    return mask


def make_icon() -> bytes:
    tile = tile_mask()
    grok = fill_even_odd(scaled_subpaths())
    pixels = bytearray(WIDTH * HEIGHT * 4)
    sample_count = SS * SS
    for y in range(HEIGHT):
        for x in range(WIDTH):
            tile_area = 0
            grok_area = 0
            for sy in range(SS):
                row_offset = (y * SS + sy) * HIGH_WIDTH + x * SS
                tile_area += sum(tile[row_offset:row_offset + SS])
                grok_area += sum(grok[row_offset:row_offset + SS])
            if tile_area == 0:
                continue
            offset = (y * WIDTH + x) * 4
            # Black Grok over a white compatibility tile. Preserve the tile's
            # antialiased alpha at the MainUI-safe transparent boundary.
            pixels[offset] = round(255 * (tile_area - grok_area) / tile_area)
            pixels[offset + 1] = pixels[offset]
            pixels[offset + 2] = pixels[offset]
            pixels[offset + 3] = round(255 * tile_area / sample_count)
    return bytes(pixels)


def write_png(path: str, pixels: bytes, size: int = WIDTH) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + pixels[y * size * 4:(y + 1) * size * 4] for y in range(size))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as output:
        output.write(png)


def downscale(src_pixels: bytes, dst_size: int) -> bytes:
    """Area-average 300x300 RGBA to dst_size x dst_size (premultiplied)."""

    scale = WIDTH / dst_size
    dst = bytearray(dst_size * dst_size * 4)
    for y in range(dst_size):
        y0 = int(y * scale)
        y1 = min(WIDTH, int((y + 1) * scale) + 1)
        for x in range(dst_size):
            x0 = int(x * scale)
            x1 = min(WIDTH, int((x + 1) * scale) + 1)
            sum_r = sum_g = sum_b = sum_a = 0
            count = 0
            for sy in range(y0, y1):
                row = sy * WIDTH * 4
                for sx in range(x0, x1):
                    offset = row + sx * 4
                    alpha = src_pixels[offset + 3]
                    sum_r += src_pixels[offset] * alpha
                    sum_g += src_pixels[offset + 1] * alpha
                    sum_b += src_pixels[offset + 2] * alpha
                    sum_a += alpha
                    count += 1
            if count == 0 or sum_a == 0:
                continue
            dst_offset = (y * dst_size + x) * 4
            dst[dst_offset] = round(sum_r / sum_a)
            dst[dst_offset + 1] = round(sum_g / sum_a)
            dst[dst_offset + 2] = round(sum_b / sum_a)
            dst[dst_offset + 3] = round(sum_a / count)
    return bytes(dst)


def main() -> int:
    if len(sys.argv) not in {2, 3}:
        print("usage: make_icon.py <output.png> [--favicon]", file=sys.stderr)
        return 2
    favicon = len(sys.argv) == 3 and sys.argv[2] == "--favicon"
    if len(sys.argv) == 3 and not favicon:
        print("usage: make_icon.py <output.png> [--favicon]", file=sys.stderr)
        return 2
    if favicon:
        write_png(sys.argv[1], downscale(make_icon(), 64), 64)
    else:
        write_png(sys.argv[1], make_icon())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
