# infra4agent

AI Agent **基础设施逻辑大仓** — 用 [monarbor](https://pypi.org/project/monarbor/) 把协议、通道、运行时、编排、测试与协同相关仓库收拢到同一导航面。

子仓各自独立 git 仓库；本仓根目录只追踪配置与文档，**不合并**各子仓源码树。

**负责人：** jeffkit  
**架构说明：** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## 子仓库一览

| 路径 | 说明 |
|------|------|
| [agentproc](https://github.com/jeffkit/agentproc) | 消息平台 ↔ Agent CLI 的最小进程协议 + SDK + Profile Hub |
| [ilink-hub](https://github.com/jeffkit/ilink-hub) | 微信 ClawBot iLink 多路复用 Hub |
| [im-agentproc](https://github.com/jeffkit/im-agentproc) | 从 ilink-hub 抽离的 IM→AgentProc 桥接运行时（iLink/微信 → agentproc profile） |
| [hil-mcp](https://github.com/jeffkit/hitl-mcp) | Human-in-the-Loop MCP（微信 / 企微确认） |
| [agently-mail-client](https://github.com/jeffkit/agently-mail-client) | 邮箱作为 Agent 通信通道 |
| [recursive](https://github.com/jeffkit/recursive) | Rust ReAct 编码 Agent 平台 |
| [recursive-providers](https://github.com/jeffkit/recursive-providers) | recursive 的 LLM provider 预设目录（providers.json 单一事实源，启动时自动拉取） |
| [flowcast](https://github.com/jeffkit/flowcast) | Node workflow 编排（断点续跑 / HITL / L3 codegen） |
| [plaita](https://github.com/jeffkit/plaita) | Python 逻辑编排运行时（JSON / `@flow`） |
| [plaita-nodes](https://github.com/jeffkit/plaita-nodes) | plaita 通用节点集（AgentRun / Capture / Hitl / Notify / WriteFile） |
| [lavs](https://github.com/jeffkit/lavs) | Local Agent View：Agent ↔ 可视化 UI 协议 |
| [web-bridge](https://github.com/jeffkit/web-bridge) | 注入式 DOM/a11y 桥：Agent 操控 Electron/Tauri 页面 |
| [browser-bridge](https://github.com/jeffkit/browser-bridge) | 浏览器扩展（Chromium/Firefox）+ MCP gateway：远程 Agent 操控本地真实浏览器 |
| [argusai](https://github.com/jeffkit/argusai) | 配置驱动的 Docker E2E + MCP |
| [argusai-marketplace](https://github.com/jeffkit/argusai-marketplace) | ArgusAI 的 Claude Code Plugin 分发 |
| [issue-keeper](https://github.com/jeffkit/issue-keeper) | Issue 监控 → 安全过滤 → Agent 回复 |
| [mediaflow](https://github.com/jeffkit/mediaflow) | KONG 全自动化自媒体运营系统（Flowcast 编排：公众号全自动 / 小红书半自动 / MiniMax 视频） |
| [deepseek-harness](https://github.com/jeffkit/deepseek-harness) | DeepSeek Harness 上游 pristine 镜像（master 跟随 upstream，不改源码） |
| [dsh-lavs-integration](https://github.com/jeffkit/dsh-lavs-integration) | DSH 仓外插件集：经官方 profile+bundle 挂载 LAVS host 适配与右栏视图 tab，零上游改动 |
| [tunely](https://github.com/jeffkit/tunely) | WebSocket 反向代理隧道：内网服务经公网 HTTPS 可达 |
| [monarbor](https://github.com/jeffkit/monarbor) | **本大仓自身的命令行工具**：一个 `mona.yaml` 管全部子仓（list/status/clone/pull/exec/checkout） |

分层与依赖关系见架构文档；**清单以 [`mona.yaml`](./mona.yaml) 为准**（本表须与其保持同步，当前 21 个子仓，含大仓工具 monarbor 自身）。

---

## 快速开始

```bash
# 安装 monarbor
pip install monarbor

# 克隆本仓后，按 mona.yaml 拉齐所有子仓
git clone git@github.com:jeffkit/infra4agent.git
cd infra4agent
monarbor clone -b prod          # 多数子仓目前用 main
# 或：monarbor clone -b prod --jobs 4

monarbor status                 # 分支 / 脏检查 / 同步（推荐）
monarbor pull                   # 更新已 clone 的子仓
```

> ⚠️ 已知缺陷：`monarbor list`（及 `list -r`）在本仓**必然崩溃**——子仓 `deepseek-harness` 的 `vendor/cordis` 与 `vendor/include` 互为软链，嵌套大仓扫描跟随该软链环递归到路径超长（`OSError: [Errno 63] File name too long`）；monarbor 0.3.0 与 0.4.0 均未修复。请用 `monarbor status` 代替，详见 [`docs/MONARBOR_NOTES.md`](./docs/MONARBOR_NOTES.md)。

添加子仓：

```bash
monarbor add --path <path> --name "<Name>" --url git@github.com:org/repo.git \
  --dev-branch main --test-branch main --prod-branch main
# 再补全 mona.yaml 中的 description / tech_stack，并更新 .gitignore
```

---

## 仓库里有什么

```
infra4agent/
├── mona.yaml              # 逻辑大仓配置（子仓清单）
├── .gitignore             # 排除本地 clone 的子仓目录
├── AGENTS.md              # AI 助手导航入口
├── CLAUDE.md              # → AGENTS.md（软链，兼容 Claude Code）
├── README.md              # 本文件
├── .zcode/skills/         # 跨仓共享的 ZCode skill（软链入 recursive）
├── bundles/               # LAVS view bundle（todo-list / notes，见 LAVS_AGENT_SOP）
└── docs/
    ├── ARCHITECTURE.md            # 分层架构与依赖（必读）
    ├── DOC_CODE_MAP.md            # 文档 ↔ 配置映射
    ├── MONARBOR_NOTES.md          # monarbor 已知缺陷与应对（list 崩溃）
    ├── LAVS_AGENT_SOP.md          # LAVS View 标准操作流程
    ├── ADR-2026-08-27-orchestration-converge-on-plaita.md  # 编排收敛决议
    ├── ADR-2026-09-06-dsh-pure-plugin-form.md              # DSH×LAVS 纯插件形态决议
    ├── docker-build-speedup.md    # 通用 Docker 构建提速指南
    └── self-improve-review-prompt.md  # self-improve 周期审查使用指南
```

clone 之后本地还会出现各子仓目录（已被 gitignore，不提交到本仓）。

---

## 给 AI / 协作者

1. 先读根目录 [`AGENTS.md`](./AGENTS.md) 与 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。
2. 进入具体子仓后再读该仓的 `AGENTS.md`。
3. 改跨仓行为前，核对架构文档里的依赖边，避免改错层。

---

## License

本仓文档与配置以各子仓自身许可证为准；根目录内容默认与负责人仓库惯例一致（未单独声明时按 MIT 理解各公开子仓）。
