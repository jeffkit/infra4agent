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
| [hil-mcp](https://github.com/jeffkit/hitl-mcp) | Human-in-the-Loop MCP（微信 / 企微确认） |
| [agently-mail-client](https://github.com/jeffkit/agently-mail-client) | 邮箱作为 Agent 通信通道 |
| [recursive](https://github.com/jeffkit/recursive) | Rust ReAct 编码 Agent 平台 |
| [flowcast](https://github.com/jeffkit/flowcast) | Node workflow 编排（断点续跑 / HITL / L3 codegen） |
| [plaita](https://github.com/jeffkit/plaita) | Python 逻辑编排运行时（JSON / `@flow`） |
| [lavs](https://github.com/jeffkit/lavs) | Local Agent View：Agent ↔ 可视化 UI 协议 |
| [web-bridge](https://github.com/jeffkit/web-bridge) | 注入式 DOM/a11y 桥：Agent 操控 Electron/Tauri 页面 |
| [argusai](https://github.com/jeffkit/argusai) | 配置驱动的 Docker E2E + MCP |
| [argusai-marketplace](https://github.com/jeffkit/argusai-marketplace) | ArgusAI 的 Claude Code Plugin 分发 |
| [issue-keeper](https://github.com/jeffkit/issue-keeper) | Issue 监控 → 安全过滤 → Agent 回复 |

分层与依赖关系见架构文档；清单以 [`mona.yaml`](./mona.yaml) 为准。

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

monarbor list                   # 树形列表
monarbor status                 # 分支 / 脏检查 / 同步
monarbor pull                   # 更新已 clone 的子仓
```

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
├── README.md              # 本文件
└── docs/
    ├── ARCHITECTURE.md    # 分层架构与依赖
    └── DOC_CODE_MAP.md    # 文档 ↔ 配置映射
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
