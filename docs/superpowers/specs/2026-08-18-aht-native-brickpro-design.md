# AHT Brick Pro 原生小程序设计

状态：按用户要求进入计划式执行

## 目标

把当前 AHT 浏览器模拟器的核心状态模型和界面层移植成一个不依赖浏览器、可在 TRIMUI Brick Pro TG4040（Linux 4.9、A133p）上启动的原生 ARM64 小程序。

第一版以真实设备 bring-up 为目标：程序能打开设备帧缓冲，绘制 1024×768 AHT 界面，读取 Linux evdev 按键，展示现有五个页面，并用本地 fixture 状态完成浏览、打开 Needs You、批准/拒绝/稍后处理和返回。

## 明确边界

第一版交付：

- 固定逻辑显示 1024×768；运行时读取 `/dev/fb0` 的实际 stride、像素格式和尺寸。
- Home、Needs You、Agents、Servers、Terminal 五个页面。
- 当前 TypeScript `FixtureState` 的七个 Agent、四个 Inbox 项目、一个服务器、网络/电量/显示状态。
- `A` 批准、`X` 拒绝、`B` 返回；方向键和确认键用于选择/打开；Linux evdev 设备通过环境变量可指定。
- 设备不可用时的 host headless 渲染和 PPM 截图，用于不连接硬件的回归测试。
- 通过 Zig 交叉编译生成 AArch64 Linux 可执行文件和可复制到 SD 卡的 NextUI-compatible tool pak 启动包。
- 所有未实现的真实能力显示为本地/不可用状态，不伪装成 Gateway、SSH、语音或生产连接。

第一版不交付：

- 修改或重打包官方固件、写入 eMMC、修改 bootloader/u-boot/kernel、硬件签名。
- 真实 `aht.gateway.v1` WebSocket、认证、TLS、SSH/Mosh、4G 驱动、麦克风和 Agent adapter。
- 对 `gh7003` 面板时序或硬件 stride 的未经设备验证的假设；帧缓冲由 ioctl readback 决定。
- 依赖设备上存在 Chromium、WebView、SDL2、字体库或 Node.js。

## 架构

```text
native/main
  ├── FixtureModel / reducer
  ├── EvdevInput
  ├── FramebufferSurface
  └── NativeRenderer
        ├── status bar
        ├── current page
        ├── approval panel
        └── navigation bar
```

### 领域模型

`native/include/aht/model.hpp` 使用与 `src/app/types.ts` 对齐的稳定字段和枚举，但不复用 TypeScript 编译产物。模型只负责数据、fixture 初始化、pending 统计、当前页面、选中 Inbox 项和决策 reducer；渲染器不直接修改状态。

第一版数据源固定为 fixture。模型保留 `DataSource::Fixture`、`DataSource::GatewayUnavailable` 和连接/陈旧状态字段，方便后续增加协议 adapter，但 Gateway 不在本轮伪造。

### 显示层

`FramebufferSurface` 只依赖 Linux `linux/fb.h`、`mmap` 和 POSIX 文件接口：

- 打开可配置的 framebuffer 路径，默认 `/dev/fb0`。
- 读取 `FBIOGET_VSCREENINFO` 和 `FBIOGET_FSCREENINFO`。
- 支持 32-bit RGB/ARGB 和常见 16-bit RGB565；未知格式在启动日志中失败并退出。
- 在 host 使用内存 surface，输出 PPM 截图，不需要 X11、Wayland 或 SDL2。

`NativeRenderer` 使用当前 CSS 的颜色、间距、卡片、状态色和 1024×768 逻辑尺寸，以软件矩形/线条/文字绘制页面。文字绘制提供内置 Latin bitmap fallback，并支持构建时生成的 CJK glyph atlas；缺少 atlas 时仍能启动，但非 Latin 字符显示为可见的方框，不静默丢失文本。

### 输入层

`EvdevInput` 扫描或使用 `AHT_INPUT_DEVICE` 指定 `/dev/input/event*`，读取 `struct input_event`，只处理按键按下/重复事件。标准 Linux `KEY_LEFT/RIGHT/UP/DOWN/ENTER/SPACE/ESC/A/B/X/H/N/S/T/V` 映射到 AHT 动作；未知按键不触发危险操作。host 模式提供 stdin 命令输入，测试可直接注入动作。

### 启动包

`native/pack/aht.pak/launch.sh` 使用脚本所在目录定位二进制，设置 `AHT_FRAMEBUFFER`、`AHT_INPUT_DEVICE` 和可选字体资源，然后执行 ARM64 binary。脚本不会格式化 SD 卡、修改隐藏系统目录或写入固件；运行失败返回非零并留下 stderr。

## 页面和交互

- Home：显示 pending 数量和 pending Inbox 卡片；确认打开第一项。
- Needs You：显示全部 Inbox 项；方向键选择、确认打开。
- Approval：显示 Agent、标题、风险、详情和 fixture 结果；`A`/`X`/`B` 分别批准/拒绝/返回，`Enter` 默认确认当前动作，`Esc` 返回。
- Agents：显示七个 Agent 的名称、项目、摘要、状态和 Developer Preview 标记。
- Servers：显示 TOKYO-01 的 Ping、CPU、RAM、Disk、Load、Docker 和服务状态，并标记 fixture。
- Terminal：显示只读本地回显说明；第一版不执行 shell，不接受真实远程命令。
- Navigation：按 `H/N/A/S/T` 切换页面；底部显示 Agent/服务器数量、fixture 数据源和快捷键提示。

## 错误边界

- framebuffer 打不开、mmap 失败、像素格式不支持时，打印明确错误并以非零退出，不回退到伪造设备成功。
- evdev 不可读时程序仍允许 host/headless 或无输入启动，并在界面 footer 显示 `Input unavailable`。
- fixture 决策只更新内存状态，不写服务器、不写 SD、不发网络请求。
- 缺失字体 atlas、缺失图标资源只影响对应绘制，不影响进程启动；状态栏显示资源缺失提示。

## 验收

主机验收：

- native model tests 覆盖七个 Agent、四个 Inbox、pending count 和三种决策。
- renderer headless test 输出固定尺寸 PPM，并验证关键颜色/像素和页面标题存在。
- input/state test 覆盖五个页面切换、打开审批和 A/X/B 决策。
- `make host-test`、`make host`、`make arm64` 和 `make package` 成功；ARM64 文件由 `file`/ELF header 验证为 AArch64，不能把 host binary 冒充设备包。

设备验收：

- 连接底部 PC data Type-C 口并使用真实数据线后，复制 pak 到已确认的 Brick Pro/NextUI SD 环境。
- 程序启动后读取真实 framebuffer 参数，在屏幕显示 AHT Home。
- 用实际按键完成页面切换、打开审批、批准和返回。
- 记录设备型号、内核、framebuffer ioctl、input event 节点和退出日志；不以本机交叉编译成功替代设备实测。

## 后续演进

设备 bring-up 通过后，再单独设计 `aht.gateway.v1` 的原生 WebSocket adapter、TLS/认证、真实数据 stale/readback、字体和 SVG/PNG 图标资源，以及是否需要自定义 CFW。第一版不会把这些未验证能力混入启动包。
