# ADR: 编排双轨收敛——plaita 作声明式编排内核，agentproc 作执行层

- 日期：2026-08-27
- 状态：已接受；**试点（spike）已通过**（见文末「试点结果」），后续按「后果」节推进文档与主图同步
- 关联：[ADR-2026-08-16-lavs-not-now.md](./ADR-2026-08-16-lavs-not-now.md)（同类"借思想/定边界"评估）；`docs/ARCHITECTURE.md` §5.1 / §8.7

## 决策

1. **编排内核收敛到 plaita**：新业务流程编排一律用 plaita 的声明式定义（JSON / `@flow`），不再新建 flowcast 编排的 flow。可视化 / 执行进度 / 版本管理直接使用 plaita-console。
2. **Agent 执行层统一走 agentproc**：为 plaita 新增自定义节点（首个即 AgentRun 节点），底层经 agentproc 起各 Agent CLI（claude-code / codex / recursive…），对齐大仓"横切协议"方向。语言差异（Python 编排 / Node CLI）**不构成障碍**，进程边界本就是 agentproc 的设计前提。
3. **自迭代、质量门、codegen 不进编排框架**：这些是**上层业务语义**，由业务层（如 flowcast 现有工具箱或未来独立仓）按需组合，编排内核只负责"图 + 挂起恢复 + 事件"。
4. **flowcast 重新定位**：冻结编排/dashboard 方向的功能投入；保留其作为"AI 自迭代执行器工具箱"的既有价值（gate / self-mod-guard / L3 codegen / memory），待上层业务语义沉淀后再定去留。
5. **mediaflow 作为试点**：迁移 1 个 flow 跑通 spike，再决定 8 个 flow 全量迁移。

## 背景：为什么收敛

### flowcast dashboard 的实证结论（2026-08-27 实测）

对 flowcast dashboard 流程图生成做了实机深度分析（浏览器实测 mediaflow 全部 8 个 flow）：

- **dry-run 快照路径 100% 失败**：spawn 硬传 `--repo/--goal`，mediaflow 的 flow 未声明 → parseArgs 严格模式全灭；错误卡片直接甩原始堆栈，tab 还误报「0 步」。
- **静态 DAG 语义失真**：迭代维度整体消失（for 循环体无直接 step 即被过滤）；if/else 只切边、无分支拓扑（孤儿节点）；容器框 0×0 不可见；for/while 无回边；动态 key 泄漏源码表达式（`${sub}brief`）；MemberExpression 子键遍历 bug 导致链式调用中的 step 被静默丢弃（实测漏 1/7）；折叠子流程入边因 GroupNode 无 Handle 静默丢失。
- **根因**：flow 是命令式 JS，"把代码变图"只能靠 AST 行范围匹配或跑一遍取线性轨迹，到不了真 DAG 语义层。这不是 bug 集合，是架构级凑合——不值得再投入修复。

### 决定性事实：mediaflow 从未把 flowcast 当流程引擎用

mediaflow 8 个 flow（约 1270 行）对 flowcast 的真实依赖仅：`Checkpoint`、agent 分发（`resolveAgent`）、`spawnCapture`、`notify`，HITL 本就直连 hitl-server。**flowcast 的流程原语（parallel / fanOut / loop / runGate）使用数为 0**。因此对 mediaflow 而言这不是"引擎迁移"，而是"控制流近乎无损地翻译成 `@flow` + 补一层执行节点壳"。

### plaita 具备内核能力

- 声明式图一等公民：Switch 分支 / Parallel（branches+join）/ Loop / Map 集合迭代 / InlineFlow·ReferenceFlow 子流程 / EventNode 外部挂起 / ApprovalNode 人工审批。
- Distributed 模式内建断点续执：挂起快照 + EventBus（memory/redis/sqlalchemy）+ ExecutionStorage + 幂等续跑，文档与 ops-runbook 完整。
- plaita-console：拖拽编排 + 试跑 + 执行实例管理 + 图形化执行进度 + 流程定义 semver 草稿/发布——**flowcast dashboard 的痛点在 plaita 是"图即源码"，架构上不存在**。
- plaita-ai：`@flow` 构建期校验 + MCP/CLI，AI 生成流程编译期拦错。

## 决策依据（负责人确认的三条判断）

1. plaita 没有 Agent 节点**可以加**——基于 agentproc 实现即可，不必等 plaita 内置。
2. **语言不是问题**（Python 编排内核 vs Node 业务脚本/CLI），进程边界经 agentproc 打通。
3. 自迭代 / 门禁 / codegen 是**上层业务语义**，编排框架无需内建——flowcast 在这些方向的积累归入业务层资产，不作为编排选型权重。

## 试点方案（spike，约一周）

1. **自定义节点（plaita entry_points，Python）**：
   - `AgentRunNode`：经 agentproc 起 profile（claude-code / codex / …），透传 prompt、回收文本/结构化输出；能力协商对齐 agentproc SDK。
   - `CaptureNode`：跑本地命令/脚本并捕获输出（对标 `spawnCapture`）。
   - `HitlNode`：直连 hitl-server HTTP API（mediaflow 现有 `scripts/hitl.js` 语义），微信通道确认后以事件恢复。
   - `NotifyNode`：通知外发。
2. **迁移 `content-daily` 一个 flow**：平台循环 → `Map`/`Loop` 节点；AI 审核 ≤2 轮 → Loop + 条件分支；promo 分支 → Switch。对照验证：console 可视化编排/执行进度是否替代原 dashboard 诉求。
3. **验收标准**：微信 HITL 桥接可用；断点续跑（kill 后恢复）可用；console 里能看清 3 平台 × 审核循环的完整结构；dry-run（试跑）可用。

## 后果

- **flowcast dashboard 不再修复**（上列 P0 清单留档不修）；`flowcast run` / Checkpoint 在存量 flow 迁移完成前继续可用。
- 文档同步：试点通过后更新 `ARCHITECTURE.md` §2/§5.1（双轨 → 分层互补）、§3/§4（mediaflow → plaita + agentproc 边）、`mediaflow` 子仓文档。
- 大仓关系变化：flowcast → agentproc 的既有边弱化为"业务层可选"；plaita → agentproc 新增边（经 AgentRun 节点）。
- 维护面：过渡期 Node（mediaflow 业务脚本）+ Python（plaita 节点）双栈并存，属已知且接受的成本。

## 风险与边界

- plaita Distributed 可靠性边界为"非默认至少一次投递"（其文档自述）——HITL 等长挂起场景需在节点层做幂等/去重。
- plaita-console 依赖 Redis，比 flowcast 静态 dashboard 重；单机自用场景可用 memory 后端起步。
- ApprovalNode 面向审批人模型，与微信通道语义有差；试点用 HitlNode 直连方案绕开，不强行套 approval_service。
- flowcast 的存量非 mediaflow 使用方（若有）不受本决议强制约束。

## 重新触发条件

1. spike 失败（HITL 桥接 / 恢复语义 / console 体验任一不过验收）→ 回到"双轨并行"，flowcast dashboard P0 修复清单重新排期。
2. agentproc 出现更强的编排向能力（如原生 DAG）→ 重新评估内核归属。
3. plaita 长期不发布稳定版 / 维护停滞 → 重新评估。

## 试点结果（2026-08-27，全部验收通过）

落地物：新子仓 [plaita-nodes](https://github.com/jeffkit/plaita-nodes)（通用节点：AgentRun/Capture/Hitl/Notify/WriteFile，28 单测）；
mediaflow `plaita_flows/`（content-daily 声明式流程 + 业务粘接节点，20 单测）。共 48 测试全绿。

| 验收项 | 结果 | 证据 |
|--------|------|------|
| ① dry-run 全链路 | ✅ | default/promo 赛道 × twitter 跳审核/xhs·wechat 两轮审核路径全通；dry-run 不落 pool |
| ② 微信 HITL 桥接 | ✅ | HitlNode 对 stub hitl-server：send/poll/upstream=ilink、超时不抛错、发图降级提示 |
| ③ 断点续跑（kill 恢复） | ✅ | Distributed 模式步进驱动，context JSON 落盘→新执行体加载→event resume 完成后续节点 |
| ④ 真实 GLM | ✅ | 隔离 clone 中 twitter 单平台 3 次真实 recursive/GLM 调用（brief→推文→中文自回复），payload 合格入池 |

试点中确认的实现决策：

1. **AgentRun 经 agentproc in-process executor**：注册 `recursive-direct` 执行器（语义=flowcast
   `runRecursiveDirect`），走 `agentproc.runner.run`——ADR"执行层统一走 agentproc"落地，无需 bridge 子进程。
2. **flow 定义用 JSON IR 而非 @flow 源码**（PARALLEL per-branch input 在 @flow 模式不可用；
   JSON 语义完整）；`{% %}` 模板只引用预拼串，prompt 静态头部在业务节点预拼，
   flow 图里不出现大段 prompt 文本。
3. **审核 ≤2 轮定长展开**为 review-1/verdict/switch + rework/review-2/verdict/switch——
   与源码 `for+break` 语义等价且在图上完全可见。
4. 运行参数走 `params=`（kwargs 不进 `$INPUT`）——**确认的内核设计**，按官方模式使用；
   EventNode 挂起恢复后 context 中的 `$INPUT`/`$NODE` 快照语义需按"每步传 context"的官方模式使用。

## 全量迁移（2026-08-27，同日完成）

其余 7 个内置 flow 全部重构为 plaita 声明式流程，且按负责人决定改用 **`@flow` 源码作为
权威定义**（`plaita_flows/flows/*.flow`，`flow_from_source` 编译执行；JSON IR 仅为 console
对接时的按需编译产物，不再入库）。mediaflow 36 + plaita-nodes 28 测试全绿。

迁移中确认的 `@flow` 作者约束（已沉淀为流程编写规范）：

1. 变量名即节点 id：**跨分支同名赋值禁止**（无 phi 合并），分支合流用 `FIRST_NON_NULL`；
2. map 子流程的 end 不能引用 if 块内赋值的节点——**每项结果经 run 级报告文件**
   （`.flowcast/plaita-reports/<token>.jsonl`）传给主流程聚合，body 返回字面量；
3. `timeout=` 是节点级 ISO 超时的保留 kwargs；接表达式的节点字段一律 `Optional[Any]`；
4. `FlowExecution.run` 的 kwargs 不进 `$INPUT`（确定的设计），运行参数走 `params=`。

顺带修复 plaita 内核一处分歧于文档语义的表达式求值缺陷：`$NODE` 路径的普通字符串
属性值（含 `[tag]`/引号/换行等元字符）曾被无条件当表达式二次解析（mediaflow 真实
节点输出 "[promo] ..." 触发误导性 KeyError）。修复为仅对 `$` 前缀变量 / `{% %}` 模板
递归，附回归测试；plaita 全量 unit（3243 passed）零回归（14 个失败为改动前即有的
redis/db/perf 环境性失败）。

遗留（phase 2）：plaita-console 起服务做可视化验收（含流程发布/版本管理）；HitlNode
挂起版（崩溃级恢复）与 poller 服务；GitHub 建仓推送 plaita-nodes。

## Phase 2（2026-08-27 启动，部分完成）

1. **plaita-nodes 已建仓推送**（github.com/jeffkit/plaita-nodes，private）；mediaflow /
   plaita / infra4agent 同日提交全部推送同步。
2. **环境性单测重构（plaita）**：14 个"失败"均为单测依赖可选 extras（fakeredis[lua] 的
   EVAL / sqlalchemy / RestrictedPython / redis+cachetools）而环境未装齐。两层修复：
   六个测试模块加 `pytest.importorskip`（缺包 SKIP 而非 FAIL）；`[dev]` extra 集齐单测
   依赖（`.[dev]` 即全量执行，原需 `[dev,lint,all]`）。装齐后 unit 3266 passed 零失败。
3. **HitlAwaitNode 挂起版 + poller（plaita-nodes）**：`hitl_await` 节点
   （is_suspending，execute 发消息拿 session 即挂起，内核快照 context——微信确认等待
   期间进程可崩溃重启）；`hitl_poller` 轮询 hitl-server 向 EventBus 发布 hitl_reply。
   Distributed 闭环测试通过：挂起 → context 落盘 → 新执行体恢复 → 事件唤醒 → 续跑完成。
4. **plaita-console 本地起服 + 发布验收（部分）**：backend（uvicorn + 本机 redis +
   PLAITA_CONSOLE_NODE_MODULES/NODE_PATH 业务节点注入钩子，console 同日提交）+ 前端
   vite 起服；content-daily@1.0.0 发布成功；**console dry-run 全节点 success**（含
   agent/capture/业务节点全链路）；节点管理识别全部业务节点。
   遗留：~~编辑器「编辑」入口打开的是新建 draft 而非已发布版本~~（已修复：无版本参数时
   自动选最新已发布版本加载）；docker compose 构建在本机网络下卡死（改本地 uvicorn+vite）。

## Phase 2.6（2026-08-28）：PGE 迁移评估与试点——替换论验收

负责人校准目标：plaita 的终局是**替换 flowcast**（或基于 plaita 重建 flowcast 做的事），
因此 PGE（flowcast 旗舰示例，1082 行软件开发编排）必须做真迁移评估，而非划出范围。

**评估结论：可迁移，无硬缺口。** 逐项映射全部落到现有原语：

| PGE 构件 | plaita 对应物 |
|---|---|
| 断点续跑 | Distributed 挂起/恢复 ✅ |
| runProfile | AGENTRUN（agentproc）✅ |
| runGates | CAPTURE + CODE 判定 ✅ |
| git worktree/baseline | CAPTURE git 序列 + pge_lib ✅ |
| structured 输出 | LLM json_mode + CODE 解析 ✅ |
| 循环直到绿 | Loop.condition（break 语义）✅ |
| HITL/notify | HITL_AWAIT / NOTIFY ✅ |

**已落地**：`plaita/examples/pge/`（pge.flow 37 节点 + pge_lib.py + README），
plaita unit 全量回归通过（3266 passed）。真跑验收（目标仓上真实 GLM 修复循环）待排期。

**节点抽象原则修正（负责人定调）**：Agent 节点 ≠ LLM 节点——前者多步工具循环，
后者单次补全生成文本；两者不可互相替代。原子抽象三原则：**原子性**（单一不可
再分职责）、**通用性**（不绑业务语义与凭证）、**普适性**。已新增 `llm` 原子
（OpenAI 兼容单次补全，凭证三级解析），agentrun 通用性修正（profile 参数化）。
纯变换不做节点——注册为 `F.*` 表达式函数；业务轻逻辑用 CODE 节点（业务包纯函数
+ 单行 import）。

**对 flowcast 的最终定位（更新）**：原语能力逐个沉淀为 plaita 原子/F 函数，
PGE 这类场景重建为 plaita 流程后，flowcast 退为历史参考；不再保留"自迭代
留在 flowcast"的双轨。

## Phase 2.7（2026-08-28）：PGE 真跑调试——机制全通，卡点收敛为提示词工程

6 轮真实 GLM 调试，逐层剥出 4 个真问题并全部修复/定位：

1. **recursive headless 下工具调用默认全拒**——generator"只说不做"的根因。
   修复：recursive-direct 执行器补 `--permission-mode auto --headless`；
   手动验证 recursive 能在 worktree 正确写文件并跑绿 pytest（7 passed）。
2. **gate 命令环境性失败**（bash -lc 下 python=2.7 无 pytest）——dirty-gate
   中止**行为正确**（PGE 纪律：baseline 红先修 main）。改用 venv 绝对路径 gate。
3. **worktree 残留注册**导致 add 失败——worktree_ensure 加 prune 重试；
   wt_check 后补闸门（不再裸奔到 gate_run）。
4. **sprint fail 的诊断透传**（s_out2 带 gate2_passed 与 evaluator 原文）。

**当前状态**：全链路机制验证完毕；剩余卡点是 GLM-5.2 在 generator 任务措辞下
的 agentic 执行稳定性（时而只描述不落盘）——属提示词工程迭代，候选强化措辞
已写入 examples/pge/README.md 交接用户在 console 试跑界面上迭代。

另：plaita 内核修复一处分歧于文档语义的表达式求值缺陷（`$NODE` 路径普通字符串
属性不再二次表达式解析——节点输出含 `[tag]`/引号/换行等元字符时曾触发误导性
KeyError），附回归测试；unit 3243 passed 零回归。

## Phase 2.5（2026-08-27 晚）：编排界面辨识度 + AI 生成

1. **节点辨识度体系**（console 前端）：族规则解析——Agent 紫🤖 / 命令执行蓝⌨️ /
   人工确认橙🙋 / 内容池青🗃 / 数据闭环青📈 / 解析判定靛⚖️ / Twitter🐦 / 平台发布📕 /
   流程上下文🧰 等 12 族 + 节点左色条与图标徽章；未知类型 hash 落色带兜底，
   画布任意新自定义节点不再"千篇一律"。
2. **AI 流程生成**：后端为 **agent 宿主**架构——不直连 LLM 端点、不持有模型凭证；
   经 agentproc 运行真实编码 Agent（recursive/GLM，凭证走其 agents.json），
   `POST /api/flows/ai-generate/stream` 以 SSE 输出 AG-UI 风格最小事件
   （run_started/turn_started/line/compile_failed/finished）；编译校验为宿主
   确定性检查，失败回喂 agent 自纠 ≤3 轮。前端 AiGenerateDialog 实时展示
   agent 过程并导入画布。真实 GLM 端到端验证：极简确认流生成 → 编译通过（6 节点）。
3. 过程中沉淀的 @flow AI 提示词铁律（大写占位符调用自定义节点 / return 即结束 /
   不写 end(...) / 禁创建文件直接输出源码等）已在 ai_flow.py 的任务模板中固化。
