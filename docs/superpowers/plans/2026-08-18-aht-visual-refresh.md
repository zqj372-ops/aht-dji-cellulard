# AHT 视觉重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 将 AHT 1024×768 主屏实现为已确认的深色工业视觉稿：清晰中文排版、四张 Agent 任务卡、可识别的彩色 Agent 图标、状态栏和底部快捷键，同时保持现有 fixture/Gateway 边界与审批交互不变。

已确认视觉稿见 [docs/design/README.md](../../design/README.md)。

**Architecture:** 浏览器模拟器继续由 React/Vite 提供交互和真实 SVG Agent 资源；原生 renderer 继续使用 framebuffer/headless Surface，不引入浏览器或外部运行时。两层共享同一组内容规则：标题“现在需要你”、待处理统计、四条 Inbox 内容、状态颜色、Agent 数量和快捷键；原生端使用重新生成的内嵌 CJK bitmap 与几何 Agent mark。

**Tech Stack:** React 18 + TypeScript + Vite + Testing Library；C++17 + Zig host/ARM64 build；Python/Pillow 生成 CJK glyph atlas；现有 SVG assets 和 fixture model。

---

### Task 1: Lock the visual contract with failing tests

**Files:**
- Modify: `tests/app.test.tsx`
- Modify: `tests/device-shell.test.tsx`
- Modify: `tests/needs-you.test.tsx`
- Modify: `native/tests/renderer_test.cpp`

- [ ] **Step 1: Add browser assertions for the approved home anatomy**

Assert that the home screen exposes `data-screen="home"`, a `home-summary` region, four `inbox-card` buttons, each white `agent-icon-tile`, and the status/footer labels. Assert the first card contains `确认部署到生产环境 · 高风险` and the DeepSeek card contains `dsh 开发者预览 · 插件状态待确认`.

- [ ] **Step 2: Add native pixel-contract assertions for the new layout**

Keep the existing 1024×768 contract and assert the new card surface, white icon tile, and footer separator coordinates. Add an atlas assertion that every Chinese character used by the new home copy is present.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run tests/app.test.tsx tests/device-shell.test.tsx tests/needs-you.test.tsx
make -C native renderer-test
```

Expected result: the browser tests fail because the new data attributes/copy are absent, and the native renderer test fails at the new pixel coordinates. Do not change production code before observing these failures.

### Task 2: Implement the browser reference screen

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/components/InboxCard.tsx`
- Modify: `src/components/StatusBar.tsx`
- Modify: `src/components/NavigationBar.tsx`
- Modify: `src/components/DeviceFrame.tsx`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Add semantic summary copy without changing fixture data**

Create a local `getInboxSummary(item, agent)` mapping in `InboxCard.tsx` that renders the approved copy from existing `title`, `risk`, `kind`, and `shortName`; do not invent new server or Agent records. Keep the button accessible name and decision callback unchanged.

- [ ] **Step 2: Reshape the home screen hierarchy**

Add `data-screen="home"`, `home-summary`, and `home-summary__count` hooks. Keep the existing pending filter and empty state. Render the count as a large orange number with the `待处理` label, then the card list.

- [ ] **Step 3: Align the shell to the reference image**

Use semantic color tokens for the graphite device shell, card surface, quiet border, ink, muted text, orange accent, and green status. Increase the desktop card/icon scale, use the existing SVG assets in white tiles, and add a responsive rule that keeps the 4:3 surface readable without horizontal overflow. Keep body text at a readable minimum on small screens.

- [ ] **Step 4: Simplify status/footer chrome without removing runtime controls**

Make the status bar read as `4G · 46ms · VPN` on the left and `1024 × 768 · 60 Hz · 电量 82%` on the right. Keep connection/data-source/voice controls available in a quiet secondary row. Make the footer show Agent/server counts and icon-plus-label navigation/shortcut affordances.

- [ ] **Step 5: Run focused browser tests and verify GREEN**

Run:

```bash
npm test -- --run tests/app.test.tsx tests/device-shell.test.tsx tests/needs-you.test.tsx
```

Expected result: all focused browser tests pass, including approval opening and decision behavior.

### Task 3: Repair native typography, layout, and Agent marks

**Files:**
- Modify: `native/tools/make_cjk_font.py`
- Modify: `native/src/renderer.cpp`
- Modify: `native/include/aht/renderer.hpp`
- Regenerate: `native/include/aht/cjk_glyphs.hpp`
- Modify: `native/tests/renderer_test.cpp`

- [ ] **Step 1: Normalize CJK and Latin metrics**

Keep the device self-contained, but render the 16×16 CJK glyph atlas at half the requested text scale so body scale 2 produces approximately 16px CJK and 14px Latin glyphs. Update `textWidth` with the same metric. Use larger heading scales and explicit vertical spacing; never place a 32px glyph in a 22px line.

- [ ] **Step 2: Regenerate the atlas from the current renderer/model strings**

Run `make -C native cjk-font`, then verify the generated header contains every code point in the new home summary, card summaries, status bar, and footer. The generator remains the only writer of the generated header.

- [ ] **Step 3: Match the reference home layout**

Use a 72px status bar, a large `现在需要你` heading, a right-aligned pending count, four 90px cards with 12px gaps, and a 58px footer. Card text uses title plus summary, and the selection/decision state remains governed by the existing model/UI reducer.

- [ ] **Step 4: Replace placeholder line glyphs with distinct colored Agent marks**

Keep rendering in software primitives, but give Codex, DeepSeek Harness, Claude Code, and OpenClaw separate recognizable marks on white icon tiles. Preserve the remaining Agent IDs with their existing distinct geometric marks. Do not load a runtime font, SVG parser, or external image dependency.

- [ ] **Step 5: Run native focused tests and verify GREEN**

Run:

```bash
make -C native test
make -C native host-smoke
```

Expected result: model/UI/renderer tests pass, the headless smoke flow exits successfully, and `/tmp/aht-native-smoke.ppm` is emitted at 1024×768.

### Task 4: Full verification and rendered visual QA

**Files:**
- Modify only if visual QA identifies a concrete mismatch: the files from Tasks 2–3.
- Update: `docs/verification/aht-visual-refresh.md`

- [ ] **Step 1: Run the complete browser gate**

Run `npm test -- --run`, `npm run typecheck`, and `npm run build`.

- [ ] **Step 2: Render the browser app and inspect the actual screen**

Start the Vite app, open the home route in the in-app browser, reload after edits, and capture a screenshot at the 4:3 device surface. Check that Chinese glyphs are not clipped, four Agent icons are visible, cards do not overlap, and mobile width has no horizontal scroll.

- [ ] **Step 3: Inspect the native headless screenshot**

Open `/tmp/aht-native-home.ppm` or the smoke screenshot and compare it to the approved image: status bar, heading/count, four cards, icon tiles, footer line, and text baselines. If a mismatch is found, fix the smallest responsible rule and rerun the focused gate.

- [ ] **Step 4: Record truthful evidence**

Write the verification record with the exact commands and results. State separately that browser rendering and host headless rendering passed; do not claim a physical Brick Pro display validation unless a real device readback is available.
