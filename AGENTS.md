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

分层（下→上）：`agentproc` → 通道（ilink-hub / im-agentproc / hil-mcp / agently-mail-client）→ 运行时（recursive——provider 预设由配套数据仓 recursive-providers 供给 ‖ deepseek-harness，后者经仓外插件集 dsh-lavs-integration 挂载 LAVS 集成）→ 编排（flowcast ‖ plaita）→ 视图/操控（lavs ‖ web-bridge ‖ browser-bridge）→ argusai(+marketplace) → 协同/业务应用（issue-keeper ‖ mediaflow）。  
**编排单轨**：plaita（Python Flow，`@flow` 源码为权威定义）为新编排唯一内核，执行层统一 agentproc；flowcast（Node/CLI）冻结、仅存量回退（ADR-2026-08-27）。写 flow 的规范与 skill 见 `plaita/plaita-ai/plaita_ai/skills/flow-coder/`。  
**视图三件**：lavs（结构化 View 协议）、web-bridge（注入式 DOM 操控桌面 WebView）、browser-bridge（MV3 扩展 + gateway，远程 Agent 经 MCP 操控本地真实浏览器）互补、无互依赖；web-bridge 与 browser-bridge 协议形状一致。  
**横切协议**：多数通道/协同经 agentproc（stdin turn / stdout NDJSON）。  
**新增 IM 桥接**：`im-agentproc` 从 `ilink-hub` 的 `src/bridge` 抽离，是 agentproc-native 的 IM→本地 CLI 桥接运行时——连 iLink Hub 作虚拟 token 后端，跑 agentproc profile（claude-code/codex 等）；经 `Transport` trait 已接入 iLink/微信、Telegram、WeCom、飞书、Discord 五通道。

关键路径：
- `mona.yaml` — 子仓清单（path / url / description / branches）
- `.gitignore` — 排除本地子仓 clone
- `docs/ARCHITECTURE.md` — 分层图与依赖边
- `docs/DOC_CODE_MAP.md` — 文档映射
- `docs/ISSUE_FILING_GUIDE.md` — **提 issue 须知**（优先级 / `depends-on` / 证据 / 验收约定；issue-keeper 按正文排期，提报前必读）
- `<子仓>/AGENTS.md` — 入仓后读这里（clone 后才有）

## 开发约定

**分支策略：** 大仓 `main`；子仓分支见 mona.yaml（多数为 main）。

**提 issue：** 任何 agent 向子仓提报 issue 必须遵守 `docs/ISSUE_FILING_GUIDE.md`——正文头部的 `优先级 **Px**` + 字面量 `depends-on: #N` 是 issue-keeper 排期与依赖门的输入；缺了会卡单或乱序。修复落地后由提报方按该文「代码级验收」条款验收（读修复 diff 逐点核对，可跑测试优先实跑）。

**禁止事项：**
- 禁止把子仓源码提交进本仓（必须保持 gitignore）
- 禁止只改子仓却假定兄弟仓已同步 API（先查 ARCHITECTURE 依赖边）
- 禁止在根目录堆业务实现代码（应落在对应子仓）
- 禁止删除/绕过 `mona.yaml` 用「口头约定」管理子仓列表

## 常用命令

```bash
# 未装工具时，直接按 mona.yaml 拉全部子仓（推荐：monarbor 的 list 缺陷尚未修复，见下）
grep -E '^(- path:|  repo_url:)' mona.yaml | sed 's/^[^:]*: *//' | paste - - | \
  while read -r path url; do git clone "$url" "$path"; done

# 或装 monarbor 统一管理（PyPI 0.4.0 与子仓 main 均含 list 崩溃缺陷，未修复）
git clone git@github.com:jeffkit/monarbor.git && pipx install ./monarbor
monarbor status                 # list / list -r 会崩；status/pull/clone/exec 正常
monarbor clone -b prod --jobs 4
monarbor pull
monarbor add --path <p> --name "<n>" --url <git-url> \
  --dev-branch main --test-branch main --prod-branch main
```

monarbor 自身也登记为本仓子仓 `monarbor/`（改工具逻辑就在那里改并提交）。本机经 pipx 从该路径安装；
`monarbor list` 会因 deepseek-harness 软链环崩溃（`OSError [Errno 63]`）——**缺陷 A/B 至今未修**，
修复方案只记录在 `docs/MONARBOR_NOTES.md` §6、**未入库**；修复落地前请避开 `monarbor list`。

改子仓：`cd <path>` 后在该 git 仓内提交；大仓只提交配置/文档变更。

## 当前状态

**当前里程碑：** 21 子仓已登记（含从 ilink-hub 抽离的 im-agentproc、业务应用 mediaflow、DeepSeek Harness 上游镜像及其仓外插件集 dsh-lavs-integration、编排节点层 plaita-nodes、页面操控层 browser-bridge、公网隧道 tunely、recursive 配套 provider 预设目录 recursive-providers，以及本大仓工具 monarbor 自身——已部署 crypto 暴露本机 DSH）；架构文档持续同步。

## 深入阅读

| 文档 | 说明 |
|------|------|
| `README.md` | 人类向快速开始 |
| `docs/ARCHITECTURE.md` | 依赖与典型链路（必读） |
| `docs/ISSUE_FILING_GUIDE.md` | 提 issue 须知（keeper 管线协作约定，提报前必读） |
| `mona.yaml` | 权威子仓清单 |
| 各子仓 `AGENTS.md` | 仓内导航 |
