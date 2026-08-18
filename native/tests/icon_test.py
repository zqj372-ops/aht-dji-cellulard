#!/usr/bin/env python3
"""Regression tests for the MainUI LobeHub Grok icon adapter."""

import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "make_icon.py"
VENDOR_MONO = (
    ROOT.parent
    / "vendor"
    / "lobehub-icons"
    / "es"
    / "Grok"
    / "components"
    / "Mono.js"
)
GROK_SVG = ROOT.parent / "src" / "assets" / "agents" / "grok.svg"
SPEC = importlib.util.spec_from_file_location("make_icon", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def pixel(pixels: bytes, x: int, y: int) -> tuple[int, int, int, int]:
    offset = (y * MODULE.WIDTH + x) * 4
    return tuple(pixels[offset : offset + 4])  # type: ignore[return-value]


class IconTest(unittest.TestCase):
    def test_icon_keeps_transparent_corners(self) -> None:
        pixels = MODULE.make_icon()
        self.assertEqual(pixel(pixels, 0, 0)[3], 0)
        self.assertEqual(pixel(pixels, MODULE.WIDTH - 1, 0)[3], 0)
        self.assertEqual(pixel(pixels, 0, MODULE.HEIGHT - 1)[3], 0)
        self.assertEqual(pixel(pixels, MODULE.WIDTH - 1, MODULE.HEIGHT - 1)[3], 0)

    def test_badge_stays_inside_mainui_icon_safe_area(self) -> None:
        pixels = MODULE.make_icon()
        # Official MainUI 300x300 icons keep roughly 24px transparent margins.
        self.assertEqual(pixel(pixels, 150, 20)[3], 0)
        self.assertEqual(pixel(pixels, 150, 277)[3], 0)

    def test_icon_uses_the_official_lobehub_grok_source(self) -> None:
        import re

        mono = VENDOR_MONO.read_text(encoding="utf-8")
        self.assertIn("M9.27 15.29l7.978-5.897", mono)
        match = re.search(r'd: "([^"]+)"', mono)
        self.assertIsNotNone(match)
        svg = GROK_SVG.read_text(encoding="utf-8")
        self.assertIn('<title>Grok</title>', svg)
        self.assertIn('fill="currentColor"', svg)
        self.assertIn(f'<path d="{match.group(1)}"></path>', svg)

    def test_icon_renders_grok_in_black_on_a_white_tile(self) -> None:
        pixels = MODULE.make_icon()
        white_pixels = 0
        black_pixels = 0
        for y in range(50, 251, 4):
            for x in range(50, 251, 4):
                red, green, blue, alpha = pixel(pixels, x, y)
                if alpha >= 240 and red >= 240 and green >= 240 and blue >= 240:
                    white_pixels += 1
                if alpha >= 240 and red <= 32 and green <= 32 and blue <= 32:
                    black_pixels += 1
        self.assertGreater(white_pixels, 1_000)
        self.assertGreater(black_pixels, 150)

    def test_mainui_uses_one_top_icon_asset(self) -> None:
        config = json.loads((ROOT / "app" / "AHT" / "config.json").read_text())
        self.assertEqual(config["icon"], "")
        self.assertNotIn("iconsel", config)
        self.assertEqual(config["icontop"], "icon.png")


if __name__ == "__main__":
    unittest.main()
