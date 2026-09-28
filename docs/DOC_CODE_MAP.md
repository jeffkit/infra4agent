# 文档 ↔ 代码映射

> 最后更新：2026-09-28

大仓根只管理配置与导航文档；子仓源码在各自 git 仓库中（见 `.gitignore`）。

## 根目录配置与导航

| 文档 | 代码路径模式 | 说明 |
|------|----------------|------|
| `README.md` | `mona.yaml` | 人类向总览与子仓表（20 行，须与 mona.yaml 同步）；清单以 mona.yaml 为准 |
| `AGENTS.md` | `mona.yaml`, `docs/ARCHITECTURE.md` | AI 入仓导航；跨仓结构指向架构文档 |
| `docs/ARCHITECTURE.md` | `mona.yaml` | 大仓分层、子仓角色与依赖关系；子仓清单以 mona.yaml 为准 |
| `docs/ARCHITECTURE.md` | `.gitignore` | 子仓目录排除规则须与 mona.yaml 中 path 对齐 |
| `mona.yaml` | 各 `*/` 子仓根（本地 clone） | path / repo_url / description / tech_stack / branches |
| `docs/DOC_CODE_MAP.md` | 本文件 | 文档 ↔ 代码映射自身 |
| 各子仓 `AGENTS.md` | 对应子仓源码树 | 仓内导航；不在大仓 git 追踪范围内 |

## 大仓工具链

| 文档 | 代码路径模式 | 说明 |
|------|----------------|------|
| `docs/MONARBOR_NOTES.md` | `monarbor/monarbor/{config,cli}.py`、`monarbor/tests/test_nested_scan_safety.py` | monarbor 的软链环崩溃档案：根因（不剪枝 + 跟随软链 + `list_repos` 漏传 `exclude_paths`）、影响面矩阵、复现与**修复记录**（0.3.0/0.4.0 与上游均未修，修复落在大仓子仓 `monarbor/`） |
| `monarbor`（子仓） | `monarbor/monarbor/*.py`, `monarbor/tests/*.py` | 本大仓自身的 CLI 工具；按 `mona.yaml` 管理全部子仓。pipx 从该路径安装 |
| `docs/docker-build-speedup.md` | `recursive/docs/e2e-docker-build-speedup.md`（实战记录） | 语言无关的 Docker 构建提速方法论：依赖层分离、diff-scope 短路、跨 worktree 缓存共享；提炼自 recursive 实战，各语言（Rust/Go/Node/Python/Java）模板 |
| `docs/self-improve-review-prompt.md` | `.zcode/skills/self-improve-{cycle,supervise}`（symlink → `recursive/.zcode/skills/`） | self-improve 周期审查使用指南：触发方式（`/self-improve-cycle` skill / 定时 cron）、深度模式、并发规则、经验沉淀机制；历史战绩见文末 |

## 协议与集成设计

| 文档 | 代码路径模式 | 说明 |
|------|----------------|------|
| `docs/LAVS_AGENT_SOP.md` | `bundles/*/lavs.json`, `lavs/sdk/typescript/runtime/src/{mcp-server,tool-generator,cli}.ts` | Agent 使用 LAVS 的标准操作流程：何时用 LAVS、如何用 lavs_call、Daemon 管理 |
| `lavs/docs/DISPATCH-PROTOCOL.md` | `lavs/schema/lavs-manifest.schema.json`, `lavs/sdk/typescript/runtime/src/{loader,tool-generator,subscription-manager}.ts` | LAVS View 分发协议设计草案：content-type 为主抽象、pinned/dispatch 两种宿主模式、多 view 调度；草案，尚未落入 SPEC |
| `docs/ADR-2026-09-06-dsh-pure-plugin-form.md` | `dsh-lavs-integration/packages/*`, `dsh-lavs-integration/bundles/lavs/cordis.patch.yml` | DSH×LAVS 集成转纯插件形态：fork 封存、经官方 profile+bundle 仓外挂载、零上游改动；取代 ADR-2026-08-16 |
| `docs/ADR-2026-08-27-orchestration-converge-on-plaita.md` | `mediaflow/plaita_flows/`, `plaita-nodes/src/plaita_nodes/*`, `issue-keeper/issue_keeper/screener.py` | 编排收敛决议：内核收敛到 plaita、执行层经 agentproc；flowcast 保留存量 |
| `docs/ADR-2026-08-16-lavs-not-now.md` | `lavs/`（历史决议） | LAVS 暂不整合的旧决议，已被 ADR-2026-09-06 取代（仅存档） |
| `docs/PGE-HANDOFF.md` | — | 历史交接记录 |
