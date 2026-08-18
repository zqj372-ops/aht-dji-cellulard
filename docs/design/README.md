# AHT 设计稿归档

状态：2026-08-18 已整理入库；浏览器模拟器 V0.1 视觉基线已冻结。

## 最终设计稿

[mockups/2026-08-18-lobehub-agent-icons-v5.html](mockups/2026-08-18-lobehub-agent-icons-v5.html)
是当前已确认的视觉稿，浏览器模拟器和 Brick Pro 原生层均以它为 UI 基准。

已锁定设计决策：

| 项 | 结论 |
| --- | --- |
| 语言 | 中文优先，英文保留 fallback |
| 参考显示 | `1024 × 768` · `60 Hz` · `0°` · `32 bit` |
| 帧缓冲 | stride `4096 bytes`；虚拟 `1024 × 16384` 仅多缓冲，不作布局 |
| 面板配置标识 | `gh7003`（运行时以 ioctl readback 为准） |
| 图标来源 | LobeHub Icons `@lobehub/icons@1.94.0`（vendored 官方 MIT 包，`import { Grok } from '@lobehub/icons'`）；品牌标记/桌面图标为官方 `Grok` Mono |
| 图标底色 | 全部白底、同一容器、同一绘制尺寸 |
| Codex | 使用蓝白品牌色变体 |
| DeepSeek Harness | 支持，显示 `dsh` Developer Preview |
| 首页 | “现在需要你” + 4 条 Inbox 卡片 + 白底 Agent 图标磁贴 |
| Agent 清单 | Codex、DeepSeek Harness、Claude Code、Gemini CLI、Hermes Agent、OpenClaw、opencode 七个 |

## 文件说明

| 文件 | 内容与状态 |
| --- | --- |
| `mockups/2026-08-17-aht-visual-directions.html` | A/B/C 三个视觉方向；A（工业主控）为推荐项，历史稿 |
| `mockups/2026-08-17-aht-info-density-directions.html` | 中文首页三种信息密度方向，首批草案 |
| `mockups/2026-08-17-agent-icons-v2.html` | 加入 Agent 图标的草案 |
| `mockups/2026-08-17-agent-icons-v3.html` | 联网抓取官方/项目图标的草案 |
| `mockups/2026-08-17-lobehub-codex-v4.html` | Codex 切换为 LobeHub 蓝白图标 |
| `mockups/2026-08-18-lobehub-agent-icons-v5.html` | 最终稿：七个 Agent 统一 LobeHub 图标、白底等尺寸 |

`mockups/assets/` 保存全部本地图标资源。v3/v4 中引用的 Hermes 字标和 OpenClaw
像素龙虾资产已下载到 `assets/` 并改为相对引用，出处见下文。

## 与实现、文档的对应

- 浏览器实现：`src/assets/agents/*.svg`、`src/screens/HomeScreen.tsx`、`src/components/AgentIcon.tsx`
- 原生实现：`native/src/renderer.cpp`、`native/src/ui.cpp`
- 产品设计：`../superpowers/specs/2026-08-18-aht-product-design-planning.md`
- 原生设计：`../superpowers/specs/2026-08-18-aht-native-brickpro-design.md`
- 视觉实现计划：`../superpowers/plans/2026-08-18-aht-visual-refresh.md`
- 浏览器验收：`../verification/aht-v0-1-browser-simulator.md`
- 视觉与真机验收：`../verification/aht-visual-refresh.md`、`../verification/aht-native-brickpro.md`
- 真机截图：`../verification/screens/`

## 本地查看

直接用浏览器打开 `mockups/2026-08-18-lobehub-agent-icons-v5.html` 即可查看最终稿；
所有资源均为相对路径，无需联网。

## 图标出处

- LobeHub Icons：https://lobehub.com/zh/icons，固定版本 `@lobehub/icons-static-svg@1.94.0`
- Hermes 字标：https://raw.githubusercontent.com/NousResearch/hermes-agent/main/assets/banner.png
- OpenClaw 像素龙虾：https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/pixel-lobster.svg
- MainUI 桌面图标：参考 LobeHub `grok.svg`（仓库内 `src/assets/agents/grok.svg`，构建时离线栅格化）
