# AHT Brick Pro Native Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-light ARM64 native AHT client that can boot on Brick Pro, render the current fixture UI, and accept hardware-style navigation without writing firmware.

**Architecture:** Port the stable TypeScript fixture domain into a small C++17 model and reducer. Render into Linux framebuffer memory with a software renderer and read keys through evdev; use an in-memory/PPM surface and stdin actions for host tests. Build with Zig so the repository can produce both a host binary and a statically linked AArch64 Linux binary without requiring SDL2 or a system cross compiler.

**Tech Stack:** C++17, POSIX/Linux framebuffer and evdev APIs, Zig C++ driver, CTest-style shell test runner, existing TypeScript/Vitest tests unchanged.

---

### Task 1: Add the native model contract and failing tests

**Files:**
- Create: `native/include/aht/model.hpp`
- Create: `native/tests/model_test.cpp`
- Create: `native/Makefile`

- [ ] **Step 1: Define the smallest model API in the test**

Create `native/tests/model_test.cpp` with assertions for `makeFixtureState()`, `pendingCount()`, page changes, and `decideInboxItem()`. The test must compile against declarations in `native/include/aht/model.hpp` but fail at link time because implementation is absent.

- [ ] **Step 2: Run the model test and verify the expected failure**

Run:

```bash
make -C native model-test
```

Expected result: compilation reaches the link step and fails with missing `makeFixtureState`, `pendingCount`, or `decideInboxItem` symbols. A compiler syntax error is not an acceptable RED result.

- [ ] **Step 3: Implement the minimal model**

Add `native/src/model.cpp` with:

```cpp
namespace aht {
enum class Screen { Home, Needs, Agents, Servers, Terminal, Approval };
enum class Decision { Approve, Reject, Defer };
struct FixtureState { std::vector<Agent> agents; std::vector<InboxItem> inbox; ServerSnapshot server; DeviceState device; };
FixtureState makeFixtureState();
std::size_t pendingCount(const FixtureState&);
void decideInboxItem(FixtureState&, const std::string&, Decision);
}
```

Populate the exact seven Agent IDs, four Inbox IDs, TOKYO-01 metrics, 4G/46ms/VPN, 82% battery, and 1024×768/60 Hz/gh7003 values from `src/providers/fixture/fixtureState.ts`.

- [ ] **Step 4: Run the focused model test**

Run `make -C native model-test`. Expected result: all model assertions pass with no warning output.

- [ ] **Step 5: Run the existing TypeScript suite**

Run `npm test -- --run`. Expected result: the existing browser suite remains green because the native model is additive.

### Task 2: Add a host framebuffer surface and renderer tests

**Files:**
- Create: `native/include/aht/framebuffer.hpp`
- Create: `native/src/framebuffer.cpp`
- Create: `native/include/aht/renderer.hpp`
- Create: `native/src/renderer.cpp`
- Create: `native/tests/renderer_test.cpp`
- Modify: `native/Makefile`

- [ ] **Step 1: Write the failing headless render test**

The test constructs a `MemorySurface(1024, 768)`, renders `Home` with fixture state, writes a PPM buffer, and asserts that the surface has the expected screen background, orange pending count, and at least one non-background card pixel. Add a second test for `Approval` after an `Approve` decision.

- [ ] **Step 2: Run the renderer test and verify RED**

Run `make -C native renderer-test`. Expected result: link failure for `MemorySurface` or `NativeRenderer` because no implementation exists.

- [ ] **Step 3: Implement pixel surfaces**

Implement `Surface` with `MemorySurface` and `LinuxFramebufferSurface`:

- `MemorySurface` stores RGBA pixels and exposes `pixel(x,y)` for tests.
- `LinuxFramebufferSurface::open()` reads `FBIOGET_VSCREENINFO`/`FBIOGET_FSCREENINFO`, maps `smem_len`, and converts RGBA to supported 32-bit or RGB565 formats.
- All drawing clips to the reported logical bounds.

- [ ] **Step 4: Implement deterministic primitive drawing**

Add `fillRect`, `strokeRect`, `line`, `circle`, `drawText`, and `drawBadge`. Use the CSS token values from `src/styles/tokens.css` translated to opaque RGB values. The first text backend contains a built-in 5×7 Latin glyph table and renders unsupported Unicode code points as an outlined square; the API accepts an optional generated glyph atlas path for CJK.

- [ ] **Step 5: Implement the five screens and approval panel**

`NativeRenderer::render(const UiState&)` must draw:

- top status bar and bottom navigation on every page;
- Home and Needs You cards with agent tile, title, kind, time, and arrow;
- Agents rows with status/maturity badges;
- Servers metric card and service row;
- Terminal fixture transcript and unavailable input marker;
- Approval title, risk badge, detail, three actions, or decision result.

Use screen coordinates derived from the fixed 1024×768 contract rather than device-dependent CSS scaling.

- [ ] **Step 6: Run renderer tests and inspect a host screenshot**

Run `make -C native renderer-test` and open the generated `/tmp/aht-native-home.ppm` using the image viewer. Expected result: 1024×768 dark UI with card and status color pixels; unsupported glyph squares are allowed in the first bring-up, and are recorded in the verification document.

### Task 3: Add input and UI state transitions

**Files:**
- Create: `native/include/aht/input.hpp`
- Create: `native/src/input.cpp`
- Create: `native/include/aht/ui.hpp`
- Create: `native/src/ui.cpp`
- Create: `native/tests/ui_test.cpp`
- Modify: `native/Makefile`

- [ ] **Step 1: Write failing action reducer tests**

Cover these exact transitions:

```text
Home --N--> Needs
Needs --A/Enter--> Approval(first pending)
Approval --X--> inbox[0].status = Rejected
Approval --B/Esc--> Needs
Agents --S--> Servers
Servers --T--> Terminal
Terminal --H--> Home
```

The test also verifies that a decision changes only the addressed Inbox item and pending count.

- [ ] **Step 2: Run UI tests and verify RED**

Run `make -C native ui-test`. Expected result: link failure for the absent action reducer.

- [ ] **Step 3: Implement `UiState` and reducer**

Implement `UiState { FixtureState data; Screen screen; std::optional<std::string> selectedInbox; bool inputAvailable; }` and `apply(Action)`. The reducer must ignore approval actions when no pending item is selected and must never perform filesystem/network writes.

- [ ] **Step 4: Implement evdev and stdin input**

Implement:

- `EvdevInput::open(path)` and `poll()` for Linux `struct input_event`;
- standard Linux key mappings for arrows, Enter, Space, Escape, A, B, X and H/N/A/S/T/V;
- `StdinInput` for host commands `h`, `n`, `a`, `s`, `t`, `x`, `b`, `enter`, `up`, `down`, `left`, `right`, `quit`;
- `AHT_INPUT_DEVICE` override and non-fatal unavailable state.

- [ ] **Step 5: Run all native tests**

Run `make -C native test`. Expected result: model, renderer, and UI tests pass.

### Task 4: Add the native executable and Brick Pro pak

**Files:**
- Create: `native/src/main.cpp`
- Create: `native/pack/aht.pak/launch.sh`
- Create: `native/pack/aht.pak/README.txt`
- Modify: `native/Makefile`
- Modify: `.gitignore`

- [ ] **Step 1: Write the executable smoke test command**

Add a `host-smoke` target that runs:

```bash
./build/aht-native --headless --actions 'n,enter,x,b,s,t,h,quit' --screenshot /tmp/aht-native-smoke.ppm
```

The command must exit 0 and print `AHT native fixture`, `screen=home`, and `decision=rejected` in its deterministic log.

- [ ] **Step 2: Implement the main loop**

`main.cpp` parses `--headless`, `--actions`, `--screenshot`, `--framebuffer`, and `--input`. It initializes fixture/UI state, renders once before input, consumes actions, renders after state changes, and exits on `quit` or SIGTERM. Device mode uses a bounded frame loop with 30 FPS redraw only when state changes or a status tick is needed.

- [ ] **Step 3: Implement the pak launcher**

`launch.sh` must:

```sh
#!/bin/sh
set -eu
PAK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export AHT_FRAMEBUFFER="${AHT_FRAMEBUFFER:-/dev/fb0}"
exec "$PAK_DIR/aht-native-arm64" "$@"
```

It must not use `sudo`, `dd`, `mkfs`, `mount`, `adb`, `fastboot`, or write outside the pak directory.

- [ ] **Step 4: Build and run the host smoke test**

Run `make -C native host-smoke`. Expected result: exit 0 and a readable PPM at `/tmp/aht-native-smoke.ppm`.

### Task 5: Add Zig host/ARM64 builds and package validation

**Files:**
- Modify: `native/Makefile`
- Create: `native/build.zig.zon` only if the Zig driver requires an explicit package manifest
- Modify: `README.md`
- Create: `docs/verification/aht-native-brickpro.md`

- [ ] **Step 1: Add reproducible Zig compile commands**

Use the following commands in `native/Makefile`:

```make
ZIG ?= zig
CXXFLAGS := -std=c++17 -O2 -Wall -Wextra -Wpedantic
$(ZIG) c++ $(CXXFLAGS) $(SOURCES) -Iinclude -o build/aht-native
$(ZIG) c++ $(CXXFLAGS) -target aarch64-linux-musl -static $(SOURCES) -Iinclude -o build/aht-native-arm64
```

Keep `build/`, `dist-native/`, and generated screenshots ignored.

- [ ] **Step 2: Validate both ELF outputs**

Run:

```bash
make -C native host arm64
file native/build/aht-native native/build/aht-native-arm64
```

Expected result: host binary matches the Mac host architecture and ARM binary reports `ELF 64-bit LSB pie executable, ARM aarch64`; neither result may be described as device-tested.

- [ ] **Step 3: Assemble and validate the pak**

Run `make -C native package`. Validate that the package contains exactly `launch.sh`, `README.txt`, `aht-native-arm64`, and any declared glyph atlas; `launch.sh` is executable and `shellcheck`-style quoting is safe by running it with `AHT_FRAMEBUFFER=/missing` and checking it fails without changing the repository.

- [ ] **Step 4: Update run instructions and evidence**

Document host build, SD/pak copy instructions, required bottom Type-C/TF setup, framebuffer/input environment overrides, and the explicit device-side verification gap in `README.md` and `docs/verification/aht-native-brickpro.md`.

### Task 6: Full verification and handoff

**Files:**
- Modify: `docs/verification/aht-native-brickpro.md`

- [ ] **Step 1: Run the native test/build matrix**

Run:

```bash
make -C native test
make -C native host
make -C native host-smoke
make -C native arm64
make -C native package
npm test -- --run
npm run build
git diff --check
git status --short --branch
```

- [ ] **Step 2: Record exact evidence**

Record command exit codes, test counts, output paths, ELF architecture, package contents, and the fact that no hardware write was attempted. Do not claim Brick Pro launch until the device reads back framebuffer/input logs and the five-page flow is manually verified.

- [ ] **Step 3: Review scope and hand off the next safe step**

Report native host/ARM64/package status separately from real-device status. If the device is still not enumerated, hand off only the SD/pak copy and read-only launch check; do not suggest flashing a full system image.
