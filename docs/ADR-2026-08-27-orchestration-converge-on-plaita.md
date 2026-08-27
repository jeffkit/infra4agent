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
4. 发现并绕开（不修改内核）：`FlowExecution.run` 的运行参数须走 `params=`（kwargs 不进 `$INPUT`）；
   EventNode 挂起恢复后 context 中的 `$INPUT`/`$NODE` 快照语义需按"每步传 context"的官方模式使用。

遗留（phase 2）：plaita-console 起服务做可视化验收（含流程发布/版本管理）；HitlNode 的
挂起版（崩溃级恢复）与 poller 服务；其余 7 个 flow 迁移；GitHub 建仓推送 plaita-nodes。
