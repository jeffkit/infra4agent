# AGENTS.md — infra4agent

> AI Agent 基础设施逻辑大仓（monarbor）：协议 / 通道 / 运行时 / 编排 / 测试 / 协同。
> 负责人：jeffkit | 创建：2026-07-16

## 项目概述

本仓是**逻辑大仓**，不是单一应用。子仓各自独立 git；根目录只维护 `mona.yaml`、`.gitignore` 与文档。  
目标：让 AI 在 3 次工具调用内定位该改哪一仓，并理解跨仓依赖。  
子仓细节以各仓 `AGENTS.md` 为准；跨仓结构以 `docs/ARCHITECTURE.md` 为准。

**技术栈：** monarbor, YAML, Markdown  
**主仓库：** `git@github.com:jeffkit/infra4agent.git`

## 架构地图

分层（下→上）：`agentproc` → 通道（ilink-hub / hil-mcp / agently-mail）→ `recursive` → 编排（flowcast ‖ plaita）→ lavs → argusai(+marketplace) → issue-keeper。  
**编排双轨**：flowcast（Node/CLI）与 plaita（Python Flow）并行、无互依赖。  
**横切协议**：多数通道/协同经 agentproc（stdin turn / stdout NDJSON）。

关键路径：
- `mona.yaml` — 子仓清单（path / url / description / branches）
- `.gitignore` — 排除本地子仓 clone
- `docs/ARCHITECTURE.md` — 分层图与依赖边
- `docs/DOC_CODE_MAP.md` — 文档映射
- `<子仓>/AGENTS.md` — 入仓后读这里（clone 后才有）

## 开发约定

**分支策略：** 大仓 `main`；子仓分支见 mona.yaml（多数为 main）。

**禁止事项：**
- 禁止把子仓源码提交进本仓（必须保持 gitignore）
- 禁止只改子仓却假定兄弟仓已同步 API（先查 ARCHITECTURE 依赖边）
- 禁止在根目录堆业务实现代码（应落在对应子仓）
- 禁止删除/绕过 `mona.yaml` 用「口头约定」管理子仓列表

## 常用命令

```bash
pip install monarbor
monarbor list
monarbor status
monarbor clone -b prod --jobs 4
monarbor pull
monarbor add --path <p> --name "<n>" --url <git-url> \
  --dev-branch main --test-branch main --prod-branch main
```

改子仓：`cd <path>` 后在该 git 仓内提交；大仓只提交配置/文档变更。

## 当前状态

**当前里程碑：** 11 子仓已登记；架构文档初版已落地。

## 深入阅读

| 文档 | 说明 |
|------|------|
| `README.md` | 人类向快速开始 |
| `docs/ARCHITECTURE.md` | 依赖与典型链路（必读） |
| `mona.yaml` | 权威子仓清单 |
| 各子仓 `AGENTS.md` | 仓内导航 |
