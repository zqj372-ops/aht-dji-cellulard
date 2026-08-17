# AHT · AI 手持终端

AHT（AI Handheld Terminal）当前交付的是中文优先的 4:3 浏览器模拟器，用来冻结手持终端的 UI、状态模型和交互基线。逻辑屏幕固定为 `1024 × 768`，外层浏览器窗口只负责缩放；`1024 × 16384` 虚拟帧缓冲不会被当作可见布局高度。

## 当前能力

- 中文首页、Needs You、Agents、Servers、Terminal 五个本地页面
- Codex 蓝白图标与 DeepSeek Harness（`dsh`）Developer Preview 入口
- Codex 审批面板：批准、拒绝、稍后，均为本地模拟状态变更
- Codex、DeepSeek Harness、Claude Code、Gemini CLI、Hermes Agent、OpenClaw、opencode 七个 Agent 状态列表
- 所有 Agent 图标统一为白底、等尺寸、随应用发布的本地 SVG
- 服务器指标、网络、电量和显示参数使用明确标注的 fixture 数据
- Terminal 为只读本地回显，不连接真实 SSH/Mosh
- 语音按钮为本地“录音中（模拟）”状态，不申请麦克风权限
- 快捷键：`H` Home、`N` Needs You、`A` Agents、`S` Servers、`T` Terminal、`V` 语音、`Esc` 返回

图标资源固定来自 [LobeHub Icons](https://icons.lobehub.com/) 的 `@lobehub/icons-static-svg@1.94.0`，运行时不依赖联网。DeepSeek Harness 的产品边界参考 [DeepSeek 官方仓库](https://github.com/deepseek-ai/deepseek-harness)；本版本只提供本地展示和状态占位，不建立真实 dsh 连接。

## 运行

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

浏览器打开 <http://127.0.0.1:4173/>。

## 验证

```bash
npm test -- --run
npm run build
```

最近一次验收记录见 [AHT V0.1 浏览器模拟器验证记录](docs/verification/aht-v0-1-browser-simulator.md)。

## 硬件边界

当前代码不是 TRIMUI BRICK PRO 的原生客户端，也没有写入 Framebuffer、处理 `gh7003` 面板时序、连接真实 Gateway、执行生产部署或进行硬件签名。已进入 UI 状态模型的显示参数为：

| 参数 | 值 |
| --- | --- |
| 实际显示 | `1024 × 768` |
| 刷新率 | `60 Hz` |
| 旋转 | `0°` |
| 色深 | `32 bit` |
| 帧缓冲步长 | `4096 bytes`，预留给后续渲染适配层 |
| 虚拟帧缓冲 | `1024 × 16384`，仅用于多缓冲，不参与 UI 布局 |
| 面板配置标识 | `gh7003` |
