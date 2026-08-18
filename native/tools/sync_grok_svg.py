#!/usr/bin/env python3
"""Regenerate src/assets/agents/grok.svg from the vendored @lobehub/icons.

The single source of truth for the Grok mark is
``vendor/lobehub-icons/es/Grok/components/Mono.js`` (the exact module behind
the site example ``import { Grok } from '@lobehub/icons'``). This script
rewrites the checked-in SVG asset from that same path so the browser mockups,
docs, and any <img> consumers stay byte-identical to the package.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = Path(__file__).resolve().parent / "make_icon.py"
OUTPUT = ROOT / "src" / "assets" / "agents" / "grok.svg"


def main() -> int:
    spec = importlib.util.spec_from_file_location("make_icon", MODULE_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    d = module.official_grok_path()
    svg = (
        '<svg fill="currentColor" fill-rule="evenodd" height="1em" '
        'style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" '
        'xmlns="http://www.w3.org/2000/svg"><title>Grok</title>'
        f'<path d="{d}"></path></svg>\n'
    )
    OUTPUT.write_text(svg, encoding="utf-8")
    print(f"wrote {OUTPUT} ({len(d)}-byte path)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
