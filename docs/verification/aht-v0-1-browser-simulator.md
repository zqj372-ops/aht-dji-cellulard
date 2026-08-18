# AHT V0.1 浏览器模拟器验证记录

验证日期：2026-08-17
验证范围：中文 4:3 浏览器模拟器、固定显示契约、Agent 图标与本地 fixture 交互
验证环境：Vite dev server，`http://127.0.0.1:4173/`，Browser in-app browser

## 自动化检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Vitest | 通过 | 6 个测试文件，9 个测试全部通过 |
| TypeScript + Vite build | 通过 | `tsc -b && vite build` 成功，37 个模块完成构建 |
| jsdom 运行时 | 通过 | 固定为 `29.0.0`，兼容当前 Node `24.14.0` |
| Browser console | 通过 | 验收标签页 error/warn 日志为空 |

## 浏览器交互验收

1. 首页渲染：看到 `现在需要你`、4 个待处理事项、`1024 × 768 · 60 Hz`、面板 `gh7003`。
2. 图标资源：Codex、DeepSeek Harness、Claude Code、OpenClaw 首页卡片加载正常；Agents 页七个 Agent 图标均可见，图标容器统一白底和尺寸。
3. Codex 审批：打开 `确认部署到生产环境`，点击 `批准` 后显示 `已批准（模拟）`，待处理数量从 4 变为 3。
4. Servers：返回列表后进入 Servers，看到 `TOKYO-01`、`42ms`、CPU/RAM/Disk/Load、Docker 和 `FIXTURE` 标识。
5. Terminal：进入 Terminal，输入 `echo hello`，看到 `模拟回显：echo hello`；页面明确标记为 `Local Echo · 只读模拟连接`。
6. 语音：点击语音按钮，状态变为 `录音中（模拟）`，不申请麦克风权限。
7. DeepSeek Harness：Agents 页显示 `dsh Web UI` 与 `Developer Preview`；Needs You 页显示 `dsh 开发者预览`。

## 设计对照

已用浏览器分别查看已确认的视觉稿和实现页面。实现保留了视觉稿的深色玻璃设备框、4:3 屏幕比例、橙色待处理计数、白底 Agent 图标卡片、底部导航和中文状态提示；实现页面额外把所有状态明确标记为本地模拟或 `FIXTURE`。

## 尚未交付

- TRIMUI BRICK PRO 原生渲染层、SDL2/Slint、FrameBuffer 写入和真实面板适配
- `gh7003` 面板驱动、旋转/色深/stride 的硬件实测
- WebSocket Gateway、真实 Agent 会话同步、DeepSeek Harness 真实连接
- 真实语音识别、SSH/Mosh、生产审批、硬件签名和部署
