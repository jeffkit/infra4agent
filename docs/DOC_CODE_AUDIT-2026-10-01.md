# infra4agent 大仓「文档 ↔ 代码」匹配度审计

> 审计日期：2026-10-01（基于各子仓本地工作树当日状态）
> 范围：mona.yaml 全部 21 个子仓 + 大仓根级文档（README / AGENTS / docs/*）
> 方法：12 组并行审计（多子智能体 + 人工复核）。全部为只读静态核验：文档声明逐条对照清单文件（package.json / pyproject / Cargo.toml）、源码入口、目录结构、git 状态；未运行构建与测试。
> 评分口径：10 = 文档可直接当导航事实用；8-9 = 个别行滞后；6-7 = 局部章节失真；≤5 = 大面积失真。

## 一、总览

**全大仓加权平均 ≈ 8.0/10**。梯队分布：9 分档 7 仓（文档-代码同步做得最好的是 monarbor / deepseek-harness / dsh-lavs-integration / argusai / plaita-nodes / recursive-providers / browser-bridge）；8 分档 7 仓；7 分档 4 仓；**6 分以下 3 仓：flowcast 6.5、mediaflow 6、hil-mcp 5（全大仓最失步）**。大仓根级文档 8/10（9/28 大对齐基本有效，但 README 的 monarbor 警示与 mona.yaml 三处描述仍滞后）。

| 子仓 | 匹配度 | 一句话结论 |
|------|--------|-----------|
| agentproc | 8.5/10 | 结构/协议/CLI/Hub 与代码高度一致；但 wire 版本三处文档各说各话（0.1/0.3/0.4），AGENTS 自称「两个 SDK」实为三个 |
| ilink-hub | 8/10 | bridge 拆出叙事四处口径统一且属实；残留旧目录树、MySQL 支持三处口径打架 |
| im-agentproc | 8/10 | AGENTS/docs 达代码级吻合；README 与 Cargo.toml description 停留「仅 iLink」旧叙事（实际五通道已实现）【高危】 |
| recursive | 8/10 | 能力面声明几乎全部落地；CHANGELOG 版本头滞后、README 漏报 ACP/WeChat/hooks 等 5 个成规模能力 |
| recursive-providers | 9/10 | providers.json 与 README 逐字段吻合；「启动自动拉取」实际需 opt-in；auto/sync-providers 分支机制已废弃 |
| flowcast | 6.5/10 | README CLI 面准确，但 AGENTS 引用已删除的 adapters.js、「仅依赖 agentproc」被 9 个依赖推翻、force-dev 命令已不存在 |
| mediaflow | 6/10 | 8 条 flow 双轨清单准确，但 AGENTS 常用命令 4 条全失效、twitter 路由过时、README 内部「试点 vs 全量」自相矛盾 |
| plaita | 8.5/10 | AGENTS「唯一导航契约」质量高；但 e2e 脚本路径写错目录、内置节点数宣称 23 实注册 18 类、e2e 规模数字漂移 |
| plaita-nodes | 9/10 | entry points 恰 22 节点与大仓声称精确一致；agentproc 集成细节逐条可验 |
| argusai | 9/10 | AGENTS/README 与 5 包 monorepo 吻合、MCP 23 工具数准确；「当前里程碑」占位符未填 |
| argusai-marketplace | 7.5/10 | 结构/安装方式属实；README 称「11 个 MCP 工具」，实际已注册 23 个——工具清单严重滞后 |
| lavs | 7/10 | bundle/schema/版本/Py SDK 等核心事实一致；REGISTRY 有幽灵命令 `lavs install`、README roadmap 新旧段互殴、3 个 CLI 命令零文档 |
| dsh-lavs-integration | 9/10 | README 几乎逐条可对上源码（发现/路由/RPC/SSE/opt-in 全实锤）；仅根 package.json 文案残留 |
| deepseek-harness | 9/10 | pristine 镜像声明被 git 逐哈希证实；仅 vendor 软链表述不精确、fork 分支无远端备份未记载 |
| web-bridge | 8/10 | 命令/工具/注入链路/端口 token 逐条对应；但代码新增的 CDP attach 与 shell 能力未回写文档，「不需要 CDP」表述已失真 |
| browser-bridge | 9/10 | 三形态 CLI/14 工具/鉴权/协议形状全部有源码支撑；仅个别行滞后（测试数 13→21、v0.2→0.3.2） |
| hil-mcp | 5/10 | 全大仓最失步：「只保留两引擎」vs 代码五引擎、`uvx hil-mcp` 装不到包、env 变量名系统性过期、引用不存在的 packaging/（API 路径经修复员复核系审计误报，`/admin/api/` 为真实前缀拼接） |
| agently-mail-client | 7/10 | 核心/CLI/Formula/配置一致；CHANGELOG 缺 0.2.0 条目且幽灵依赖版本、AGENTS 结构清单漏 13 个模块 |
| issue-keeper | 7.5/10 | agentproc CLI 调用、screener 三后端（含 flow）代码级吻合；README 残留已删除的 --from、用例数 94 vs 实际 264、幽灵 .mcp.json |
| tunely | 8.5/10 | 架构声称与三端实现吻合；deploy 文档有过期 `--config` 警示、多处引用不存在的「0.12」版本 |
| monarbor | 9/10 | 8 命令/加固实现/8 回归测试/0.4.0 四条线全对上；但 README 让人 pip install 装回有缺陷的 PyPI 版 |
| 大仓根级文档 | 8/10 | 子仓数/清单/依赖边大体同步；但 README 的 monarbor 崩溃警示过时、mona.yaml 三处描述落后于代码、.gitignore/.zcode 自相矛盾 |

## 二、高危不一致（建议优先处理）

1. **hil-mcp 文档系统性过期（全大仓最低分 5/10）**
   - [高] `AGENTS.md:37-38`、`README.md:31`「只保留 ilink 与 wecom-aibot 两个引擎」vs 代码 `engines/builtin.py:89,169,216,261,325` 实有 ilink/wecom/telegram/discord/feishu **五个** EngineDescriptor；`AGENTS.md:209` 引擎类型清单同样缺三个（大仓 ARCHITECTURE.md:255 写的五渠道反而是对的）。telegram/discord/feishu 三引擎零用户文档。
   - [中] `AGENTS.md:20,31`、`README.md:24`「uvx hil-mcp」——PyPI 包名是 `hitl-mcp`（pyproject.toml:2），照文档装不到。
   - ~~[中] API 路径过期~~ **审计误报，已撤回**：`handlers/admin.py:28` 声明 `APIRouter(prefix="/admin")`，拼上前缀后 `/admin/api/engines/...` 即真实路径（TS 客户端 setup.ts:274 实际请求该路径）；`/api/ilink/qr|login_status|activated_users` 亦在 handlers/api.py:245,264,283 真实存在（新旧两套路由并存）。
   - [中] env 名过期：文档 USE_DATABASE/DATABASE_URL vs 代码 HIL_USE_DATABASE/HIL_DATABASE_URL（README 用的是正名——AGENTS 与 README 互相矛盾）。
   - [中] 幽灵引用：README:127/:179 引用 `packaging/hitl-server.service`、`packaging/build.sh`——仓库无 packaging/ 目录。整仓无 CHANGELOG。
2. **im-agentproc README/Cargo.toml 旧叙事**【高】`README.md:61`「iLink is the only real adapter today」、`README.md:3`、`Cargo.toml:5` description「(iLink/WeChat today)」——代码 `transport/registry.rs:88-93` 已注册 telegram/wecom/feishu/discord/ilink 五个真实适配器，自家 AGENTS.md 与 docs/transport.md 均已更新，唯 README/Cargo 落后。
3. **mediaflow AGENTS 常用命令整组失效**【高】`AGENTS.md:65-77` 四条示例（`npm run wechat:dry`/`wechat`/`wechat:no-publish`/`flowcast run wechat-daily`）——3 条脚本名不存在（实为 `wechat:publish(:dry)`）、1 条 flow 名不存在（实为 publish-wechat）。
4. **flowcast AGENTS 引用已删除模块**【高】`AGENTS.md:21,24,43,44` 的 L1 执行器 `adapters.js` 已在 v0.6 重构删除（agent.js:3 注释明言），执行器改走 agentproc in-process + `executor/` 目录；`AGENTS.md:9,103,106`「仅依赖 agentproc SDK；yaml 可选 lazy」vs `package.json:80-90` 实有 9 个运行时依赖（dagre/react/elkjs/acorn…）；`AGENTS.md:70` 的 `flowcast force-dev` 命令已不存在。
5. **argusai-marketplace 工具清单严重滞后**【中→高】README「MCP 工具（11 个）」——argusai-mcp 实际注册 23 个工具（`packages/mcp/src/server.ts:12-33` 导入 22 个模块，run.ts 导出 run+run_suite 两个处理器；argusai 根 README.md:30「23 个工具」是对的）。
6. **monarbor README 安装指引装回缺陷版**【中】`monarbor/README.md:7-8`「pip install monarbor」指向上游 PyPI——PyPI 0.4.0 不含软链环修复（修复只在本大仓子仓 monarbor/），照文档操作会复现已修复的崩溃；未提示 pipx 从本仓路径安装。
7. **两处「复制粘贴必失败」的路径错误**【中】plaita `AGENTS.md` 常用命令 `bash plaita-console/scripts/e2e-run.sh` 不存在（实际 `scripts/e2e-{run,gate,chaos-*.sh}`）；大仓 `docs/LAVS_AGENT_SOP.md` 全文硬编码 `/Users/kongjie/projects/infra4agent/...`（本机实际 `/Users/kong/...`）。
8. **大仓 README monarbor 崩溃警示过时**【中】`README.md:58`「已知缺陷：monarbor list 必然崩溃……0.3.0 与 0.4.0 均未修复」——MONARBOR_NOTES 已是「已修复」记录、ARCHITECTURE §8.12 已同步，README 警示与文档树中 MONARBOR_NOTES 描述（「已知缺陷与应对」）漏更。

## 三、各组详情

### 3.1 agentproc（自审）— 8.5/10
- 结构核验：AGENTS.md 布局树与实际完全一致（16 个 hub profile 全部四件套齐备；spec/conformance/ 套件存在；docs/ 中英镜像在）；CLI 14 个 flags + hub 子命令与 README 一致。
- 协议版本一致性：spec/protocol.md:3 `Wire protocol: 0.4` = 三 SDK 代码（runner.js:51 / runner.py:78 / protocol.rs:14 均 '0.4'）= CHANGELOG 顶部。**但**：
  - [中] AGENTS.md:129、:136 两处称 wire 版本是 `0.1`——滞后两个 minor；
  - [中] README.md:128「Status: Wire protocol 0.3, document revision 1.0 (Draft)」——spec 实为 0.4 / 1.1；同文件 :52 示例却用 0.4（自相矛盾）。
- [低] AGENTS.md:10「Two reference SDKs (Python and Node.js)」——实际三个（sdk/rust 存在，AGENTS.md:133 自己都在讲 Rust 版本轨）。
- [低] CHANGELOG「Currently Python and Node 0.15.0; Rust 0.11.1」——清单文件已 0.16.0/0.16.0/0.12.0（有 0.16.0 unreleased 段，属已 bump 未发版，Currently 行未更新）。

### 3.2 ilink-hub — 8/10
- 一致：README/AGENTS/CHANGELOG/docs 四处统一「bridge 已于 0.4.0 拆出」且属实；API 表/CLI 四子命令/健康阈值/发布三档链路全部对上；desktop 嵌入 run_serve 属实。
- [中] docs/knowledge/project/overview.md:31 目录树仍列已拆出的 `bridge/`，同树缺 bin/、client/。
- [中] 数据库支持口径打架：AGENTS.md:4「SQLite/MySQL」、common-commands.md:26 教 `--features mysql`，而 configuration.md:60 明说「仅 SQLite 与 PostgreSQL，MySQL 暂不支持」（与代码一致，另两处误导）。
- [低] ci.yml:41 步骤名仍提已删除的 `ilink-hub-bridge` artifact；Dockerfile:25 用已废弃的 `ILINK_HUB_ADDR`；desktop 锁 `im-agentproc = "0.1"` 而其已发 0.3.0，漂移无提示。
- 缺口：Hub 侧 A2A MCP server（list_agents/call_agent）、ilink-relay bin、/hub/ilink/{qr-stream,relogin,status} 端点均未入 README API 表/架构树；README 架构树与实际 src 布局脱节。

### 3.3 im-agentproc — 8/10
- 【高】README:61/3 与 Cargo.toml:5「仅 iLink」旧叙事 vs registry.rs:88-93 五适配器（详见第二节第 2 条）。
- 一致亮点：PROTOCOL_VERSION "0.4"（protocol.rs:16）与 agentproc spec 同步；出站 MCP 四工具 send_text/send_image/send_file/send_voice 逐行可验（mcp/tools.rs:158,211,277,327）；`~/.ilink-hub/*` 路径表与文档完全一致；版本 0.3.0 = CHANGELOG。
- [低] AGENTS.md:16「三种模式」实为四个子命令（另有 mcp-server）；孤儿文件 `builtin/opencode.rs` 完整存在却不参与编译，而 ilink-hub 知识库仍把 opencode 列为其内置（跨仓口径漂移）；docs/guide/mcp-outbound.md 示例路径 `~/.im-agentproc/` 在代码中不存在。
- 缺口：README 对 docs/guide/ 已有的 telegram/wecom/feishu/discord 四篇指南零入口；`docs/zh/skills.md` 存在而英文侧无对应（双语破口）。
- 卫生问题：仓内 publish-tunely-rust.yml 借用本仓 CRATES_TOKEN 发布 tunely Rust 客户端——跨仓职责放错仓库。

### 3.4 recursive — 8/10
- 一致：6 crate 全部 0.8.3 对齐；HTTP/MCP/TUI/多 Agent 与 workspace 成员一一对应；AGENTS 引用的脚本/docs/gates.json/CI 全实存；功能抽查 6 项（loop 自调度、HTTP 503 默认拒绝、Anthropic 适配器、providers.toml 16 preset 等）全部落地。
- [中] CHANGELOG.md:3 顶部 Unreleased（最新条目 0.8.2）vs Cargo.toml 0.8.3。
- [低] README:34「sqlite-vec」实为纯 rusqlite 进程内余弦；README:434-448（主路径=plaita）与 AGENTS.md:9-14（dev loop=Flowcast）口径相左；.dev/flows/package.json description 残留「flowx flow」。
- 缺口：ACP 整层（src/acp/ + agui-* 三 crate）、src/weixin/、src/permissions/、src/hooks/、sdk/typescript 五个成规模能力 README/AGENTS 均 0 提及。

### 3.5 recursive-providers — 9/10
- [中] README:7「启动自动拉取」实为需 `RECURSIVE_PROVIDERS_AUTO_REFRESH=1` opt-in（providers_cache.rs:263-264）。
- [低] README:119 称 CC0 但仓内无 LICENSE 文件。
- 一致：providers.json 结构与 README Schema 逐字段吻合、12 家清单逐行同；sync_providers.py + validate_providers.py + sync.yml（每日 cron、先验证后推送、失败开 issue）属实。

### 3.6 flowcast — 6.5/10
- 一致：README CLI 面（init/doctor/run/flows ×3/orchestrate/dashboard）与 bin/flowcast.js:96-136 派发一致；L3 codegen（orchestrator/ + 三道护栏 validate.js:3）、自改沙箱（self-mod-guard.js）、质量门（quality-gate.js）、HITL 后端切换（hitl.js:145-150）落点全部属实。
- 【高】AGENTS 引用已删除的 adapters.js、「仅依赖 agentproc」失真、force-dev 命令不存在（详见第二节第 4 条）。
- [低] README.md:123 bin 别名表「flowcast/flowc/fc/flowcast」重复自己，漏列遗留别名 flowx（package.json:12-17 实为四别名）；hitl.js:44 注释残留「wecom-hil」旧称（默认 server 已是 `@hitl`，hitl.js:103）。
- 缺口：run-script.js（runScript 五钩子受限脚本编排面，CHANGELOG Unreleased 有完整条目）文档 0 提及；CLI `rate-limits`、`dashboard-server` 未入命令表；flows-registry/rate-limiter/events/executor/ 不在 AGENTS 模块地图。

### 3.7 mediaflow — 6/10
- 一致：8 条 flow 的 flowcast/plaita 双轨清单 8/8 对齐（git e6011f5「全量迁移」佐证）；`flowcast: file:../flowcast` 属实；微信 HITL 链路（scripts/hitl.js 直连 hitl-server :8081）、MiniMax env、小红书 browser 半自动、pool 解耦全部有实据。
- 【高】AGENTS 常用命令 4 条全失效（详见第二节第 3 条）。
- [中] AGENTS.md:24「publish-twitter 官方 API v2」vs 代码默认 `via:'browser'` 网页半自动（`--via api` 才走 API；README.md:128 已定网页路线）。
- [中] README.md:75「plaita 试点」vs 同文件 :79-84 与 AGENTS.md:42「全量迁移」——README 内部自相矛盾；README.md:119-122（阶段 2/3 ⏳）vs AGENTS.md:99-100（✅）——两文档阶段状态互殴。
- [低] AGENTS.md:44「44 个业务粘接节点」vs nodes.py 实数 53；「revengers 4 角色」vs prompts/ 仅 3 文件；`publish-xhs.js` 实为 .py。
- 缺口：scripts/ 11+ 个模块 AGENTS 只列 3 项；config/projects.json 未入结构图；「微信 4 轮确认」未注明 flowcast 版默认关闭（需 `--confirm`）。

### 3.8 plaita（自审）— 8.5/10
- [中] AGENTS「常用命令」`bash plaita-console/scripts/e2e-run.sh` 路径不存在——实际在根 `scripts/`（e2e-run/e2e-gate/e2e-chaos-×4）。
- [低] README.MD「默认注册表内置 23 种节点」：默认注册 18 个类（_BUILTIN_NODES，CodeNode 有意 opt-in）；全包定义 22 个不同 node_type——数字对不上。
- [低] 大仓 ARCHITECTURE §4.2 称 console E2E「16 suite 231 用例」——e2e.yaml 实测 18 个 suite，用例散在 tests/e2e/ 19 个文件，数字已漂移。
- 一致：pyproject 0.5.0 与大仓口径一致；`python3 -m plaita` 可用（__main__.py 在）；CI console-e2e.yml 存在；仓内自有 docs/DOC_CODE_MAP.md；与 flowcast 无代码互依赖（仅文档/示例对标）✓。

### 3.9 plaita-nodes（自审）— 9/10
- 22 节点声称精确成立：pyproject `[project.entry-points."plaita.nodes"]` 恰 22 个。
- 依赖属实：`plaita>=0.5.0` + `agentproc>=0.15.0`；agent_run.py 证实「agentproc Python SDK in-process executor + 注册 recursive-direct（语义照搬 flowcast runRecursiveDirect）」。
- 注意：ARCHITECTURE 称「editable 依赖」——pyproject 是普通版本约束，editable 与否取决于本地安装方式（plaita/plaita.egg-info 存在，与 pip install -e 惯例吻合，属表述含糊非错误）。
- [低] 版本已 0.8.0，大仓 9/30 提交仍写「22 节点概览（0.7.0）」——轻微滞后（节点数一致）。

### 3.10 argusai（自审）— 9/10
- 一致：AGENTS 架构图与 5 包（core 0.15.5 / core-storage 0.15.4 / dashboard 0.15.5 / mcp 0.15.5 / server 0.6.16）对应；常用命令全部实存；schemas/examples/docs/specs/mcp-templates/ci-templates 齐备；README「23 个工具」准确。
- [低] AGENTS「当前里程碑：{待人工填写}」占位符未填；dashboard 包实名 `@preflight/dashboard`（历史 scope 残留，文档未提）。

### 3.11 argusai-marketplace（自审）— 7.5/10
- 【中→高】README「MCP 工具（11 个）」——实际 23 个（详见第二节第 5 条）。未收录：argus_history/trends/flaky/compare/diagnose/report_fix/patterns/mock_generate/mock_validate/resources/rebuild/dev。
- 一致：`.mcp.json` 确以 `npx argusai-mcp` 拉起 ✓；plugin.json 1.1.0 + 两条斜杠命令文件齐备；marketplace.json 结构规范。
- [低] plugin.json `repository` 指向 `github.com/jeffkit/infra4agent`（大仓）而非本分发仓——指向存疑。

### 3.12 lavs — 7/10
- 一致：REGISTRY 4 官方 bundle 与 bundles/ 完全一致；SKILL 声称的 5 命令全在 cli.ts SUPPORTED；四 TS 包版本与 CHANGELOG 逐一相符（runtime 0.8.0/types 0.4.0/client 0.3.0/view 0.2.0）；Protocol 1.1 = SPEC §11；**Py SDK 真实存在**（lavs-sdk 0.2.0）。
- [中] REGISTRY.md:3,56 `lavs install`——cli.ts 无此子命令（幽灵命令）；REGISTRY.md:8「官方 Bundle 随 lavs-runtime 内置」——runtime npm 包 files 只带 dist，bundles 仅存仓内。
- [中] README roadmap 内战：:317「[ ] mcp handler」vs :233 已标 ✅；:258「sdk/python (planned)」vs :313 已勾选且实存；:319「[ ] npm/PyPI 发布」vs lockfile 已落 lavs-runtime@0.2.0。
- [中] README:315+AGENTS「cli.ts (serve/init/validate)」——实际 9 子命令（另有 discover/call/view/host/daemon/serve-registry）。
- 缺口：host/daemon/serve-registry 三命令仓内文档零覆盖；schema/mcp-config.schema.json、第 4 包 lavs-view、bundles/ 目录均未入 README；README:321 License「TBD」vs 各包 MIT。

### 3.13 dsh-lavs-integration — 9/10
- 一致：`.lavs/bundles` 项目级发现、`/lavs-view/` 静态服务、`/lavs` list/call RPC、`/lavs/events` SSE、`~/.dsh/lavs-host.json` loopback 发现、agent tools 默认关闭（opt-in）、lavs-cli 三动词零依赖、ui-lavs 右栏 tab、ui-tasks useProjection('todos')——README 逐条实锤。
- [低] 根 package.json:5 description 仍写「headless-resume runner」未标废弃、未提 tunely-host/lavs-cli；:10 typecheck 不含 lavs-cli；README:122「9 个构建产物」为历史数字。
- 缺口：仓根 tools/build.ts 未入 README 组成表；「已验证」区无 tunely-host 条目。

### 3.14 deepseek-harness — 9/10
- pristine 声明逐条属实：master = origin/master = upstream/master（477b4f4205，rev-list 0 0）；工作树干净；`git grep lavs|headless-resume|TasksTab` 零命中；`--session-id adopt`+`--json` 为上游原生（startup.ts:43-44），版本 0.1.7-rc.2 自洽。
- fork 封存属实：feat/headless-resume 7 个提交与 mona.yaml 三类改造一一对应；**但该分支仅存本地，无远端备份，文档未记载**。
- [低] 大仓 ARCHITECTURE:322「vendor/cordis 与 vendor/include 互为软链」表述不精确——两目录本体是 git 跟踪的真实源码拷贝（vendor/README.md 有 manifest+上游 SHA），互指软链在各自 node_modules 安装产物里（环确实存在，monarbor 旧 bug 的触发面）。
- [低] 上游 AGENTS.md 布局块缺 apps/（workspaces 含 apps/*，且其自身 :119/:123 引用 apps/ 路径）。
- 缺口：仓内零镜像元数据（upstream 同步流程/封存口径无处记载）。

### 3.15 web-bridge — 8/10
- 一致：包元数据/bin/scripts、10 个核心 MCP 工具（src/mcp/index.ts:27-141）、inject.js 全链路（esbuild→/inject.js→snippet→启动打印）、默认 127.0.0.1:17832+WS token、/wb 13 条命令表（plugins/workbuddy/slash.yaml）逐条对应。
- [中] README:5/:158、AGENTS:41「不需要 CDP」「刷新后必须重新粘贴」vs 代码已有 CDP attach 路径（src/cli/index.ts:27 `serve --cdp`「reload-persistent; no console paste needed」、src/server/attach.ts）——顶层文档仍按「绕开 CDP」表述，该「限制」已不成立。
- [低] README:35「npm start 等价 npx tsx 直跑」——package.json:17 实跑 dist 产物（tsx 是 :16 的 dev）；README:129 MCP 工具表漏 `wb_recipes`（src/mcp/index.ts:158）。
- 缺口：shell 命令组（shell apps/start/stop + shells/apps.yaml + shell-app/ Tauri 壳）顶层文档零提及；plugins/ 实有 4 个插件（codebuddy/cursor/workbuddy/zcode）文档只记 workbuddy；CLI `plugin map/recipes/run`、`slash-help` 未入命令表；skills/web-bridge-plugin-author 未提及。

### 3.16 browser-bridge — 9/10
- 一致：gateway 0.3.2 与双 manifest 版本一致；CLI serve/mcp/relay/token/call 五子命令（README 只列四个）；MCP 恰 14 工具与文档表格一一对应（tools.ts:58-200）；Bearer 鉴权（serve 不设/relay 强制）、browserId 路由、close 4003、{id,method,params}+@eN 全部有源码落点；与 web-bridge 零代码依赖 ✓。
- [低] README:136「13 项单测」实为 21（AGENTS 写 21 正确）；README:8/ARCHITECTURE:3「v0.2 能力」实为 0.3.2。
- 缺口：`gateway call` 用法、close 4001/4002/4004 语义、tabs.get 方法定位、Firefox host_permissions 可选授予、browserId 白名单规则未入 README。

### 3.17 hil-mcp — 5/10（全大仓最低）
- 详见第二节第 1 条（两引擎 vs 五引擎【高】、uvx 包名错、env 名系统性过期、packaging/ 幽灵引用、无 CHANGELOG；API 路径一项系审计误报已撤回——`/admin/api/` 为 router prefix 拼接的真实路径）。
- 一致：目录三包结构、MCP 工具名 send_and_wait_reply/send_message_only、HITL_PORT=8081、ILINK_TOKEN_STORE_PATH 默认值、uv/pnpm 命令、版本自洽（PyPI 0.2.1 / npm 0.7.0 独立版本线）。
- [低] requirements.txt 注释残留「Relay Server & DevCloud Worker」旧架构；wecom-hil.mdc 文件名为历史配置名（内容已与现实现一致）；SECURITY_AUDIT 标题仓名口径旧。
- 缺口：telegram/discord/feishu 三引擎零用户文档（docs-site/engines/ 只有 ilink/wecom-aibot 两篇）；integrations/dsh-answerer、.flowcast/ 未入结构图。

### 3.18 agently-mail-client — 7/10
- 一致：src/dispatcher.js 存在；profiles/ 7 文件与 AGENTS 完全一致；CLI 子命令一致；Formula 与 package.json 互相咬合（0.2.0 pinned）；e2e.yaml 指向 argusai（5 个 suite 实存）；配置示例与文档一致。
- [中] CHANGELOG：只有 [Unreleased] 与 0.1.0，package.json 已 0.2.0（无条目）；「新增依赖 marked@18.0.5」vs 实际 ^4.3.0（幽灵版本）。
- [低] AGENTS:83「_spawnProfile — spawnSync」已改 spawn+Promise；:152「marked 是唯一非平凡依赖」vs 实际 5 个 dependencies；src/ 清单 11 个 vs 实际 24 个。
- 缺口：schedule-runner（cron 定时，email-schedules.example.yaml）零文档；Formula/Homebrew 安装路径未入 README；batch-handler/batch-store（批处理模式）无结构条目；deploy-launchd.sh 无文档。
- 注意：npm 依赖 `agentproc@^0.1.1`（package.json:59）——与 flowcast 的 ^0.10.1 同包差近十个 minor，大仓「agentproc 版本分裂」张力强证实。

### 3.19 issue-keeper — 7.5/10
- 一致：profile.py 确以 subprocess 调 agentproc CLI（`agentproc hub run`/`--profile`，非 Python 包依赖）✓；screener backend=flow 全链路属实（semver 最高/X-Admin-API-Key/TTL+stale 缓存/本地回退，screener.py:89-500）；config.example.yaml 与 README 配置节吻合；flows/（plaita 化管线）与 frontend/ 用途属实；CLI 六子命令齐。
- [中] README:473「自动传 --from」——profile.py:117-119 注释明言「0.14 CLI 已移除 --from」，实际 cmd 不含。
- [中] README:509「94 个用例」vs tests/ 静态计数 264 个。
- [中] README:304「仓根 .mcp.json（--timeout 300）」——文件不存在，且 :308 又写 3600（同文矛盾）。
- [低] README:191「两张表」vs 实际四张（issues/comments/status_history/projects）；README:417「default_review_agent 留空」vs 示例值 "reviewer-agent"。
- 缺口：screener `backend: flow` 只写在 config.example.yaml，README 仍称「两种后端」；`proposals` 子命令未记载；无 pyproject/setup.py，依赖靠 README 口头说明。

### 3.20 tunely — 8.5/10
- 一致：双形态服务端、字节级透传、tcp_listen_port、三客户端、Rust 单二进制（strip+lto）、admin-console（React18+Vite+antd）逐条属实；9080→dsh 部署在 docker-compose.yml:7,16,20 实证。
- [中] deploy/README.md:83「Rust CLI 尚无 --config 参数」——rust/src/main.rs:58-60 已实现，模板警示过期误导运维。
- [中] CLAUDE.md:172、deploy/README.md:160,165 称行为「0.12 起落地」——CHANGELOG 无 0.12 条目（最新 0.11.1，Unreleased 空）；行为确在代码，仅版本归属无据。
- [低] CHANGELOG 版本断档 0.7.0→0.11.0（tests 里存在 0.7.1-0.8.0 命名文件）；大仓「Host/Origin 不改写」在 tunely 自身文档无出处（HTTP 面反而写明 hop-by-hop 剥离）——大仓转述失真。

### 3.21 monarbor — 9/10
- 一致：8 命令逐一落点 cli.py（clone/pull/status/list/exec/checkout/init/add，另有未文档化的 local 组）；四重加固（不跟软链/SKIP_SCAN_DIRS 剪枝/深度上限 12/精确路径排除）+ list_repos 传 exclude_paths 全部实证；回归测试恰 8 个；0.4.0 三处一致且有防漂移守护测试。
- [中] README.md:7-8 `pip install monarbor` 会装回不含修复的 PyPI 版（详见第二节第 6 条）。
- [低] README 命令一览缺 `monarbor local list/set/unset`；clone/status 的 7 个 flags 未列。

### 3.22 大仓根级文档（自审）— 8/10
**数字与清单同步良好**：mona.yaml 21 = README 表 21 = ARCHITECTURE §3 表 21；.gitignore 覆盖全部 21 path 无缺漏；DOC_CODE_MAP.md 引用的 17 个文件路径全部存在；9/28「大对齐」提交有效。
**仍失步处**：
- [中] README.md:58 monarbor list「必然崩溃、未修复」警示过时（见第二节第 8 条）；README 树中 MONARBOR_NOTES 描述「已知缺陷与应对（list 崩溃）」同病。
- [中] .gitignore `.zcode/` 整目录忽略 vs 自己的注释「skill 等团队共享资源仍入库」+ README 树列 `.zcode/skills/`——实际 .zcode/（含 skills 软链）完全不被追踪，新 clone 拿不到 DOC_CODE_MAP 引用的 self-improve-{cycle,supervise} skill。
- [中] mona.yaml 三处描述落后于代码：im-agentproc「未来扩展飞书/Telegram」（已接入五通道，ARCHITECTURE:117 是对的）；recursive-providers「auto/sync-providers 分支由自动化维护」（已被校验后直推 main 取代，旧 PR 机制卡死被注释记录）；mediaflow「试点迁移 plaita」（实为全量迁移完成，ARCHITECTURE:317 对）。
- [低] DOC_CODE_MAP.md:11 称 README 子仓表「20 行」——实际 21。
- [低] ARCHITECTURE 头注「最后更新 2026-09-28」——其后 9/30 a94ef00 又改过该文件，头注滞后。
- [低] DOC_CODE_MAP.md:33 称 DISPATCH-PROTOCOL「草案，尚未落入 SPEC」——该文自标「partly superseded by SPEC §11」，SPEC.md:1114 已有 §11 View Dispatch Protocol (v1.1)（大仓说法过时）。
- [低] ARCHITECTURE:280 典型链路写 `lavs discover/view/call`——lavs 仓 bin 实为 `lavs-runtime`；`lavs` bin 属 dsh-plugin-lavs-cli 且仅 list/schema/call——大仓把两个 CLI 的命令名混写。
- [低] ARCHITECTURE §4.1「recursive → ilink-hub：微信 base_url 指向 hub」表述过强——recursive 代码默认 None=官方腾讯端点，hub 仅为显式覆盖项。
- [低] AGENTS.md 架构地图写「agently-mail」，实际路径/mona.yaml 为 agently-mail-client。
- [中] 审计期间根 AGENTS.md 刚把「编排双轨」改为「编排单轨：plaita 唯一内核，flowcast 冻结、仅存量回退」——与 mediaflow 实况仍有张力：flowcast 版 8 条 flow 仍在活跃修改（提交晚于 plaita 版），mediaflow package.json 17 个 scripts 全部经 `flowcast run` 驱动，「冻结」尚未落到最大消费方；mona.yaml mediaflow 描述也仍以 Flowcast 优先。
- [低] ADR-2026-08-16 头部状态仍「已接受」，未标注「已被 ADR-2026-09-06 取代」；其关联链接 `ADR-2026-08-16-dsh-workflow-layering.md` 不存在（死链）；ADR-2026-09-06「本地子仓待登记 remote」过时（9/28 已登记）。
- [低] README 树未列 ADR-2026-08-16、PGE-HANDOFF.md；docs/keeper-upgrade-A-session.patch、.zcodeignore、.pnpm-store 散落根目录未入库未清理。
- [低] LAVS_AGENT_SOP.md（2026-07-28）整体停留在 MCP 工具时代叙事（lavs_discover/lavs_call/daemon），未提 v1.1 CLI-first 叙事，且硬编码 /Users/kongjie/ 错误路径。

## 四、跨仓依赖边核验（ARCHITECTURE §4 声明 vs 代码）

| 声明边 | 结论 | 证据 |
|--------|------|------|
| argusai-marketplace → argusai（npx argusai-mcp） | ✅ 属实 | argusai-marketplace/argusai/.mcp.json |
| flowcast → agentproc（npm） | ✅ 属实 ^0.10.1 | flowcast/package.json:85 |
| agently-mail-client → agentproc | ✅ 属实但版本悬殊 | package.json:59 `agentproc@^0.1.1`（同 npm 包与 flowcast 差近十个 minor，「版本分裂」张力强证实） |
| im-agentproc → agentproc（crates.io 0.11，非 git pin） | ✅ 属实 0.11.1 | Cargo.toml:70 + Cargo.lock registry 源 |
| plaita-nodes → plaita / agentproc | ✅ 属实 | pyproject.toml + agent_run.py |
| plaita-nodes 22 节点 | ✅ 精确属实 | pyproject entry points 恰 22 |
| recursive → recursive-providers（URL 拉取 + 7 天 TTL） | ✅ 属实，但需 opt-in env | providers_cache.rs:50,55-56,263-264 + 守护测试 |
| recursive e2e → argusai（file: 相对路径张力 §8.6） | ⚠️ 张力已消失 | e2e/plugins/package.json 现为 registry 语义版 ^0.14.2，无 file: 引用 |
| recursive → ilink-hub（WEIXIN_BASE_URL 指向 hub） | ❌ 表述过强 | main.rs:193-196 默认 None=官方端点，hub 仅为显式覆盖项 |
| im-agentproc 从 ilink-hub src/bridge 抽离 | ✅ 属实 | ilink-hub src/ 无 bridge；CHANGELOG 0.4.0 记录拆分 |
| im-agentproc 五通道 | ✅ 代码属实；mona.yaml 与其 README 过时 | transport/registry.rs:88-93 |
| ilink-hub-bridge 与 im-agentproc 并存（张力 §8.9） | ⚠️ 表述过时 | ilink-hub 0.4.0 起 hub-only；通用 YAML CLI 后端现仅存于 im-agentproc `script:` |
| ilink-hub email-bridge vs agently-mail-client（张力 §8.4） | ✅ 可关闭 | ilink-hub 全仓无 email 痕迹，发布源唯一为 agently-mail-client |
| ilink-hub .flowx 旧引用（张力 §8.3） | ⚠️ 张力仍在 | .flowx/config.json + 六处 ~/projects/flowx 文档引用 vs 新 .flowcast/ 三件套并存 |
| mediaflow → flowcast（file: 依赖） | ✅ 属实 | mediaflow/package.json:27 `file:../flowcast` |
| mediaflow plaita 迁移「试点 vs 全量」 | ⚠️ 矛盾裁决：全量迁移已完成，但迁移≠切换 | plaita_flows/flows/ 8/8 覆盖全部业务流（git e6011f5）；mona.yaml:217「试点」过时；但 package.json 17 个 scripts 仍全走 `flowcast run`，flowcast 版提交更晚、未冻结——ARCHITECTURE:172 的「试点：content-daily」也滞后 |
| mediaflow → hil-mcp（微信 HITL 确认） | ✅ 属实（config 驱动非 npm 依赖） | mediaflow/scripts/hitl.js 直连 hitl-server :8081 |
| flowcast HITL 配置名 @wecom-hil（张力 §8.2） | ✅ 基本已对齐 | 代码默认 `@hitl`（hitl.js:103），全仓 grep @wecom-hil 零命中；残留仅注释/目录别名/两处文档措辞 |
| issue-keeper → agentproc（spawn CLI） | ✅ 属实 | issue_keeper/profile.py:107-110 |
| issue-keeper screener → plaita-console flow | ✅ 代码侧属实 | screener.py:89,396,404-409,450,463,496-500 |
| issue-keeper → plaita-nodes DecisionNode | ✅ 属实（可选依赖带回退） | screener.py:41,308-310 |
| deepseek-harness pristine 镜像 | ✅ 逐哈希属实 | git rev-parse / rev-list / git grep |
| dsh-lavs-integration 五 npm 包版本 | ✅ 逐一相符 | bundles/lavs@0.1.1 + 四插件 @0.1.0 |
| dsh-lavs-integration → deepseek-harness（peer 锚 + 精确锁 0.1.7-rc.2） | ✅ 属实 | 根 package.json:15-37 精确锁；插件 peerDeps ^0.1.7-rc.2 |
| dsh-lavs-integration → lavs（无 @lavs/* 依赖） | ✅ 字面属实，带限定 | 无 @lavs/* import；但依赖 npm 裸名 `lavs-runtime@^0.2.0`（lavs 仓 runtime 已 0.8.0，锚旧版） |
| headless resume 已退役 | ✅ 属实 | 活动包源码零命中；留档 packages/headless-resume/ 已标 [DEPRECATED] |
| web-bridge ↔ browser-bridge 协议形状一致、无代码依赖 | ✅ 属实 | messages.ts:40-50 + snapshot.ts:132（@eN）；双方零代码引用 |
| tunely 9080→dsh 部署 | ✅ 属实 | tunely/docker-compose.yml:7,16,20 |
| monarbor 修复 + 8 回归测试 + 0.4.0 | ✅ 三条全属实 | cli.py/config.py + test_nested_scan_safety.py:105-191 |
| 大仓对 tunely「Host/Origin 不改写」转述 | ⚠️ 无源文档出处 | tunely 自身文档无此声明 |
| hil-mcp 五渠道（ARCHITECTURE §5.2） | ✅ 代码属实；hil-mcp 自家文档反而写「两引擎」 | engines/builtin.py 五 EngineDescriptor |

## 五、修复优先级建议（按影响排序）

1. **hil-mcp 文档大修**（5/10）：引擎数、uvx 包名、env 名、packaging 幽灵引用、补三引擎文档与 CHANGELOG。
2. **im-agentproc README/Cargo.toml description** 更新五通道叙事（对外门面，与代码矛盾最刺眼）。
3. **mediaflow AGENTS 常用命令组**全部换名；README 内部「试点 vs 全量」「阶段 ⏳ vs ✅」矛盾二选一裁决。
4. **flowcast AGENTS** 删除 adapters.js/「仅依赖 agentproc」/force-dev 三处失真，模块地图对齐 executor/ 与 run-script.js。
5. **argusai-marketplace README** 工具清单 11→23。
6. **monarbor README 安装段**改为 pipx 从本仓路径安装；大仓 README 同步删除「必然崩溃」警示。
7. 两处「复制粘贴必失败」路径修正：plaita AGENTS e2e 脚本路径、LAVS_AGENT_SOP 用户路径。
8. **mona.yaml 三处描述**同步（im-agentproc 通道、recursive-providers 分支机制、mediaflow 迁移状态）。
9. agentproc AGENTS/README 的 wire 版本统一到 0.4；「两个 SDK」改三个。
10. 根 .gitignore/.zcode 策略二选一（要么接受 skills 不入库并改注释、要么 `!.zcode/skills/` 保留追踪）。
11. 已可关闭的 ARCHITECTURE §8 张力项：§8.4（email-bridge）、§8.6（file: 依赖）、§8.9（hub-bridge 并存）改写为现状描述。
12. 各仓「文档缺口」按需补齐（ilink-hub relay/MCP、recursive ACP/WeChat、im-agentproc 四通道指南入口、lavs host/daemon、web-bridge shell/CDP 等）。
