# AHT V0.1 中文模拟器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的 AHT 中文 4:3 设计稿实现为一个可运行、可操作、可验证的浏览器模拟器，作为后续 BRICK 原生渲染层的 UI 与状态模型基准。

**Architecture:** 使用 React + Vite + TypeScript 构建一个本地 fixture 模式模拟器。模拟器以固定的 `1024×768` 逻辑视口渲染，外层只负责缩放；状态模型与 UI 组件分离，Agent 图标使用固定版本的本地 SVG；审批、导航、语音和终端操作只改变本地状态，不伪装成真实 Gateway、硬件签名或生产操作。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Testing Library、CSS variables；图标来自 `@lobehub/icons-static-svg@1.94.0` 的已下载 SVG 资源。

**Scope boundary:** 本计划只交付浏览器模拟器与可重复的 UI 状态验证，不交付 Rust/SDL2/Slint 原生客户端、Framebuffer 写入、WebSocket Gateway、真实 DeepSeek Harness 连接、语音识别、Mosh/SSH、硬件签名或生产部署。

---

### Task 1: 建立可测试的 React/Vite 工程骨架

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/package.json`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/index.html`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tsconfig.json`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tsconfig.node.json`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/vite.config.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/main.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/App.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/app.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

```tsx
import { render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('shows the Chinese AHT home screen and DeepSeek Harness entry', () => {
  render(<App />);
  expect(screen.getByText('现在需要你')).toBeInTheDocument();
  expect(screen.getByText('DeepSeek Harness')).toBeInTheDocument();
  expect(screen.getByText('1024 × 768')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and observe the intended failure**

Run: `npm test -- --run tests/app.test.tsx`

Expected: FAIL because the project files and `App` component do not exist yet.

- [ ] **Step 3: Add the minimal Vite and test configuration**

`package.json` must expose these commands and dependencies:

```json
{
  "name": "aht-browser-simulator",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest"
  },
  "dependencies": { "react": "19.2.8", "react-dom": "19.2.8" },
  "devDependencies": {
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.2",
    "@vitejs/plugin-react": "6.0.5",
    "jsdom": "29.0.0",
    "typescript": "7.0.2",
    "vite": "8.2.1",
    "vitest": "4.1.10"
  }
}
```

`vite.config.ts` must configure React and jsdom tests:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: './tests/setup.ts' },
});
```

`tests/setup.ts` imports `@testing-library/jest-dom`.

- [ ] **Step 4: Add the smallest renderable `App`**

`src/main.tsx` mounts `<App />` into `#root`; `src/app/App.tsx` renders a Chinese heading, the hardware specification text, and a DeepSeek Harness text entry. Keep the first version intentionally small so the smoke test proves the test harness is wired correctly.

- [ ] **Step 5: Run the test and confirm GREEN**

Run: `npm install && npm test -- --run tests/app.test.tsx`

Expected: PASS with one test and no unhandled warnings.

---

### Task 2: Add the typed fixture model and local Agent assets

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/types.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/fixtureState.ts`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/assets/agents/codex-color.svg`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/assets/agents/deepseek-color.svg`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/assets/agents/claudecode-color.svg`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/assets/agents/geminicli-color.svg`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/assets/agents/hermesagent.svg`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/assets/agents/openclaw-color.svg`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/assets/agents/opencode.svg`
- Test: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/fixtureState.test.ts`

- [ ] **Step 1: Write the failing fixture-model tests**

```ts
import { fixtureState, getNeedsYouCount } from '../src/app/fixtureState';

test('fixture includes the seven supported agents and four actionable items', () => {
  expect(fixtureState.agents.map((agent) => agent.id)).toEqual([
    'codex', 'deepseek-harness', 'claude-code', 'gemini-cli',
    'hermes-agent', 'openclaw', 'opencode',
  ]);
  expect(getNeedsYouCount(fixtureState)).toBe(4);
});

test('DeepSeek Harness keeps its developer-preview label', () => {
  const agent = fixtureState.agents.find((item) => item.id === 'deepseek-harness');
  expect(agent?.displayName).toBe('DeepSeek Harness');
  expect(agent?.shortName).toBe('dsh');
  expect(agent?.availability).toBe('developer_preview');
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm test -- --run tests/fixtureState.test.ts`

Expected: FAIL because the typed model and fixture state are not defined.

- [ ] **Step 3: Define the smallest shared types**

`types.ts` must define `AgentStatus`, `Availability`, `InboxKind`, `RiskLevel`, `Agent`, `InboxItem`, `ServerSnapshot`, `Screen`, and `FixtureState`. All statuses must be explicit string unions; do not use `any` or untyped agent-specific payloads.

- [ ] **Step 4: Implement deterministic fixture data**

`fixtureState.ts` must export `fixtureState`, `getNeedsYouCount(state)`, and `decideInboxItem(state, itemId, decision)`. Initial data must include Codex, DeepSeek Harness (`dsh`, `developer_preview`), Claude Code, Gemini CLI, Hermes Agent, OpenClaw, and opencode. Every icon path must point to a local imported SVG, and every fixture card must label itself as simulated/local state in the UI rather than implying live connectivity.

- [ ] **Step 5: Vendor the pinned SVG resources**

Copy the already verified LobeHub SVG contents into the seven `src/assets/agents/` files with `apply_patch`. Keep the package version in `src/app/fixtureState.ts` as `icons-static-svg@1.94.0`; do not use CDN URLs or `latest` in runtime imports.

- [ ] **Step 6: Run the tests and confirm GREEN**

Run: `npm test -- --run tests/fixtureState.test.ts`

Expected: PASS with both fixture tests green.

---

### Task 3: Implement the fixed 1024×768 device shell and shared icon treatment

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/styles/tokens.css`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/styles/app.css`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/DeviceFrame.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/StatusBar.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/AgentIcon.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/NavigationBar.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/App.tsx`
- Test: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/device-shell.test.tsx`

- [ ] **Step 1: Write the failing shell and icon test**

```tsx
import { render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('uses the hardware viewport contract and equal white icon tiles', () => {
  render(<App />);
  expect(screen.getByTestId('device-viewport')).toHaveAttribute('data-logical-size', '1024x768');
  expect(screen.getAllByTestId('agent-icon-tile')).not.toHaveLength(0);
  expect(screen.getAllByTestId('agent-icon-tile').every((node) => node.classList.contains('agent-icon-tile--white'))).toBe(true);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/device-shell.test.tsx`

Expected: FAIL because the shell and icon component do not exist.

- [ ] **Step 3: Define design tokens from the accepted concept**

`tokens.css` must define `--device-width: 1024px`, `--device-height: 768px`, `--page-bg: #080a0f`, the dark glass surfaces, green/orange/red/blue state colors, spacing scale, and the shared icon tile size `24px`. The actual screen layout must never use `1024×16384` as visible height.

- [ ] **Step 4: Implement the shell and icon primitive**

`DeviceFrame` renders a scalable outer frame with an inner element fixed at `width: 1024px; height: 768px`; use CSS transform or aspect-ratio scaling only outside the logical viewport. `AgentIcon` renders a `37px` screen tile or `30px` list tile with a white background, centered `24×24` SVG, `object-fit: contain`, and accessible `alt` text. Monochrome Hermes/opencode SVGs must remain visible on white using a deterministic black filter; branded color SVGs must not be recolored.

- [ ] **Step 5: Implement the status and navigation chrome**

`StatusBar` shows fixture labels `4G`, `46ms`, `VPN`, battery `82%`, and the display contract. It must not claim live network authority. `NavigationBar` exposes Home, Needs You, Agents, Servers, and Terminal as local screen buttons and displays the existing Agent/Server counts.

- [ ] **Step 6: Run the test and confirm GREEN**

Run: `npm test -- --run tests/device-shell.test.tsx`

Expected: PASS with all icon tiles marked white and the logical viewport attribute equal to `1024x768`.

---

### Task 4: Implement Home / Needs You and the approval interaction

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/screens/HomeScreen.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/screens/NeedsYouScreen.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/InboxCard.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/ApprovalPanel.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/App.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/fixtureState.ts`
- Test: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/needs-you.test.tsx`

- [ ] **Step 1: Write the failing interaction tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('approval requires opening the item before the local decision is applied', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Codex/ }));
  expect(screen.getByText('确认部署到生产环境')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '批准' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '拒绝' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '批准' }));
  expect(screen.getByText('已批准（模拟）')).toBeInTheDocument();
});

test('DeepSeek Harness is visible as a developer-preview inbox item', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: /DeepSeek Harness/ })).toBeInTheDocument();
  expect(screen.getByText(/dsh 开发者预览/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/needs-you.test.tsx`

Expected: FAIL because the Home/Needs You screens and decision panel do not exist.

- [ ] **Step 3: Implement the Home screen exactly from the accepted concept**

Render the title `现在需要你`, count `4`, four initial cards in this order: Codex, DeepSeek Harness, Claude Code, OpenClaw. Keep the Chinese copy, white equal-size icon tiles, dark cinematic glass surfaces, and bottom control hint. Do not add unrelated cards or fake live metrics.

- [ ] **Step 4: Implement the local approval state transition**

Opening a card shows `ApprovalPanel` with the item title, agent name, risk label, and two explicit buttons `批准` / `拒绝`. A decision updates only local fixture state, records `已批准（模拟）` or `已拒绝（模拟）`, removes the item from the pending count, and returns to the list. The UI must not send a network request or imply a real production deploy.

- [ ] **Step 5: Implement Needs You filtering**

The Needs You screen lists pending `approval`, `question`, `completed`, and `error` items using the same card primitive. Selecting a question shows `回复` and `稍后处理`; selecting completed/error shows a read-only detail. Keep item status mapping generic and independent from Agent-specific internals.

- [ ] **Step 6: Run the tests and confirm GREEN**

Run: `npm test -- --run tests/needs-you.test.tsx`

Expected: PASS with the approval transition and DeepSeek Harness developer-preview item covered.

---

### Task 5: Implement Agents, Servers, Terminal, and global Voice fixture controls

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/screens/AgentsScreen.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/screens/ServersScreen.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/screens/TerminalScreen.tsx`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/VoiceControl.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/App.tsx`
- Test: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/navigation.test.tsx`

- [ ] **Step 1: Write the failing navigation tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('navigates to servers and shows fixture metrics', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Servers' }));
  expect(screen.getByText('SERVER · TOKYO-01')).toBeInTheDocument();
  expect(screen.getByText('Agent Gateway')).toBeInTheDocument();
});

test('terminal is a separate screen and voice control has local recording state', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
  expect(screen.getByText('Mosh Terminal')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '语音' }));
  expect(screen.getByText('录音中（模拟）')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/navigation.test.tsx`

Expected: FAIL because the secondary screens and voice control do not exist.

- [ ] **Step 3: Implement the Agents screen**

Show all seven fixture agents with uniform white icon tiles, status, project/session summary, capability labels, and the explicit `developer preview` state for DeepSeek Harness. The screen must be a list, not a new unrelated dashboard.

- [ ] **Step 4: Implement the Servers screen**

Render `SERVER · TOKYO-01` with fixture values for online state, RTT, CPU, RAM, Disk, Load, Docker, Agents, Agent Gateway, Tailscale, and SSH. Label the whole panel `本地模拟数据`; do not present fixture values as a live server readback.

- [ ] **Step 5: Implement the Terminal screen**

Render a read-only local terminal transcript with `Mosh Terminal` title, connection mode `fixture`, command input, and a local `发送` action that appends a simulated echo line. Do not invoke a shell, SSH, Mosh process, or user-provided credentials.

- [ ] **Step 6: Implement global Voice fixture state**

`VoiceControl` toggles `idle → recording → transcribing → done` locally, displays Chinese labels, and respects `prefers-reduced-motion`. It must not access microphone permissions or upload audio in this phase.

- [ ] **Step 7: Run the tests and confirm GREEN**

Run: `npm test -- --run tests/navigation.test.tsx`

Expected: PASS with server, terminal, and voice interactions covered.

---

### Task 6: Add responsive simulator framing, keyboard controls, and accessibility

**Files:**
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/DeviceFrame.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/components/NavigationBar.tsx`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/styles/app.css`
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/src/app/useHardwareShortcuts.ts`
- Test: `/Users/autumn/Documents/ChatGPT/手持Ai终端/tests/shortcuts.test.tsx`

- [ ] **Step 1: Write the failing shortcut test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('keyboard shortcuts mirror the hardware hints without changing the logical viewport', () => {
  render(<App />);
  fireEvent.keyDown(window, { key: 's' });
  expect(screen.getByText('SERVER · TOKYO-01')).toBeInTheDocument();
  expect(screen.getByTestId('device-viewport')).toHaveAttribute('data-logical-size', '1024x768');
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/shortcuts.test.tsx`

Expected: FAIL because keyboard shortcuts are not wired.

- [ ] **Step 3: Implement safe local shortcuts**

Map `h` Home, `n` Needs You, `a` Agents, `s` Servers, `t` Terminal, `v` Voice, `Escape` back. Ignore key events while a text input is focused. Use buttons with visible labels as the primary accessible action; shortcuts are an additive simulator feature.

- [ ] **Step 4: Implement stable scaling and mobile overflow protection**

The logical screen remains exactly `1024×768`; the outer stage uses `max-width: 100%`, `aspect-ratio: 4 / 3`, and `overflow: auto`. At no viewport size may the browser create horizontal page overflow or make the primary card unreadable.

- [ ] **Step 5: Add accessibility assertions and confirm GREEN**

Every icon has alt text, every action is a real button, the active screen has `aria-current`, and approval buttons expose risk text. Run: `npm test -- --run tests/shortcuts.test.tsx`.

Expected: PASS.

---

### Task 7: Run build, browser verification, and fidelity review

**Files:**
- Create: `/Users/autumn/Documents/ChatGPT/手持Ai终端/docs/verification/aht-v0-1-browser-simulator.md`
- Modify: `/Users/autumn/Documents/ChatGPT/手持Ai终端/README.md`

- [ ] **Step 1: Run the complete automated checks**

Run:

```bash
npm test -- --run
npm run build
```

Expected: all tests pass; Vite build exits 0; no TypeScript errors.

- [ ] **Step 2: Start the simulator locally**

Run: `npm run dev -- --host 127.0.0.1 --port 4173`

Expected: Vite serves the simulator at `http://127.0.0.1:4173/`.

- [ ] **Step 3: Verify in the built-in Browser first**

Open the local URL with the Browser/IAB skill. Verify the Home viewport at the native logical ratio, click Codex approval, approve locally, visit Agents, Servers, Terminal, and toggle Voice. Capture a screenshot at the available browser viewport and inspect it with `view_image`; also inspect the accepted visual companion screenshot from `/Users/autumn/Documents/ChatGPT/手持Ai终端/.superpowers/brainstorm/1786964938-aht-ui/content/任务清单-LobeHub-统一Agent图标-v5.html` via the browser screenshot or a rendered local capture.

- [ ] **Step 4: Check the five fidelity points**

Record evidence for: (1) fixed 4:3 logical viewport and hardware labels, (2) dark cinematic glass palette, (3) Chinese copy and information hierarchy, (4) all white equal-size Agent tiles including DeepSeek Harness, and (5) card spacing, navigation and approval flow. Any mismatch that is visible must be fixed before handoff.

- [ ] **Step 5: Write the verification record**

`docs/verification/aht-v0-1-browser-simulator.md` must record commands, browser URL, screenshot method, native-size limitation if any, the five comparison points, the above-the-fold copy result, and the explicit fact that all data is local fixture state.

- [ ] **Step 6: Document the run command and boundary**

`README.md` must state:

```md
# AHT Browser Simulator

## Run
npm install
npm run dev

This is a local UI/state simulator for the AHT 1024×768 design. It does not connect to a Gateway, DeepSeek Harness, server, microphone, SSH/Mosh, or production system.
```

- [ ] **Step 7: Final verification before completion claim**

Run the full test/build commands again after any fidelity fixes and confirm the worktree contains only the intended simulator, plan, verification, and local asset files. Do not claim BRICK hardware readiness or real Agent connectivity from this browser simulator.

---

## Self-review checklist

- Hardware constraints are covered by Tasks 3 and 6; virtual framebuffer height is explicitly excluded from visible layout.
- All seven requested/identified Agent entries are covered, including DeepSeek Harness with `dsh` developer-preview status and local LobeHub icon.
- Home, Needs You, Agents, Servers, Terminal, Voice, approval, keyboard shortcuts, and fixture/server correlation are covered.
- No real credentials, network authority, production deployment, microphone, SSH/Mosh, Gateway, or hardware write path is introduced.
- Every implementation task starts with a failing test and ends with an explicit command and expected result.
- The browser fidelity check compares against the accepted visual companion and records remaining intentional deviations.
