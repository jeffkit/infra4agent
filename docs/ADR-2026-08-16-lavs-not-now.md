# ADR: LAVS 暂不整合进 dsh web

- 日期：2026-08-16
- 状态：已接受（Accepted）
- 关联：[ADR-2026-08-16-dsh-workflow-layering.md](./ADR-2026-08-16-dsh-workflow-layering.md)（同批 dsh 整合评估）

## 决策

**暂不整合。** 不做 LAVS host bundle、不在 dsh web 挂 view bundle。

## 2026-08-16 二次修正（推翻初版事实基础）

初版理由之一"dsh web 只有 chat、无面板形态"经实证**错误**：dsh web 是产品化
多视图工作台——侧栏+工作区（ui-sidebar/ui-workspace）、文件 read/diff 卡片、
Trajectory 事件台账+时间线（独立 tab）、workflow-run 三层可视化（ui-workflow-run
作为 ConversationNodeDefinition 渲染进 conversation.chat.node 插槽的活例）、
plan/subagent/jobs 面板，共 44 个 client 包。修正后的判断：

1. **交互哲学错配（仍成立，换依据）**：dsh 的面板哲学是"durable session facts
   的只读投影 + 导航进会话"，交互原语是对话；LAVS 的差异化（mutation/
   subscription 双向）在 chat 哲学下不是空白，是设计选择。
2. **成熟度未过线（不变）**：LAVS pre-release、v1.1 刚重定位、官方 bundle 4、
   社区 0、宿主仅 AgentStudio。
3. **接缝成本大幅下修**：dsh 的 ui-slots 插槽系统 + client module 系统（`dsh.client`
   包、无需 fork 上游）对第三方 UI 插件正式开放——LAVS dispatch 的**只读半边**
   （按 content-type 渲染 artifact 节点）接入是"一个 client 插件"的量级；重的
   只是双向半边，而那半边本就错配。
4. **新增：借鉴方向反转**——dsh 的插槽体系（occupancy/holes/插槽环/节点定义）
   比 LAVS host 侧成熟一个量级，LAVS 的 host 实现可参考 ui-slots 设计。同
   workflow 评估的结论结构：借思想优于接协议。

## 正面观察（零成本保留）

- LAVS v1.1 的 content-type 绑定与 dsh render-intent 的 provider-neutral 词汇是
  同构设计（数据自描述 → 宿主选渲染器），将来若对接思想兼容。
- 零成本借鉴点：dsh render-intent 若被真实场景逼着扩展（如 table 卡片），LAVS
  data-table 的"列 schema 由 agent 推导"可直接参考——借思想，不接协议。

## 重新触发条件（修正后）

1. LAVS 出稳定版 → 可低成本试做"只读 dispatch 半边"的 dsh client 插件
   （ui-slots + ConversationNodeDefinition 路径，不需要上游开门）
2. dsh 出现"UI 反向操作数据"的真实产品诉求（届时双向半边才有一搏）
3. 反向借鉴触发：LAVS host 实现重构时参考 ui-slots 的 occupancy/holes 设计
