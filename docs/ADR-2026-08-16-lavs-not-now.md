# ADR: LAVS 暂不整合进 dsh web

- 日期：2026-08-16
- 状态：已接受（Accepted）
- 关联：[ADR-2026-08-16-dsh-workflow-layering.md](./ADR-2026-08-16-dsh-workflow-layering.md)（同批 dsh 整合评估）

## 决策

**暂不整合。** 不做 LAVS host bundle、不在 dsh web 挂 view bundle。

## 理由（按重要性）

1. **场景错配（主因）**：dsh web 是会话转录（chat transcript），呈现层已被
   render-intent 词汇（Generic/Terminal/Diff 卡片）+ `schema-form` 覆盖；chat 的
   交互原语是对话（"把第三个 todo 勾掉"→ agent 用工具执行），不是 UI 回调。
   LAVS 的差异化恰是双向服务界面（query/mutation/subscription）——那是 dashboard
   场景（AgentStudio 的定位），不是 chat 场景。turn 内要的是单次呈现，LAVS 卖
   的是持续服务界面。
2. **成熟度未过线**：自标 pre-release；v1.1 刚完成重定位（manifest 绑定从 agent
   改为 content-type，架构仍在动）；官方 bundle 4 个、社区 0；宿主仅仓外
   AgentStudio。（与 web-bridge 暂缓同一标准。）
3. **接缝可行但不便宜**：dsh 的 client module 系统（浏览器侧 Loader /
   `dsh.client` / HMR）技术上可承载 view bundle，但 query/mutation/subscription
   桥接回 agent 侧需要双向通道工程，投入大而场景收益小。

## 正面观察（零成本保留）

- LAVS v1.1 的 content-type 绑定与 dsh render-intent 的 provider-neutral 词汇是
  同构设计（数据自描述 → 宿主选渲染器），将来若对接思想兼容。
- 零成本借鉴点：dsh render-intent 若被真实场景逼着扩展（如 table 卡片），LAVS
  data-table 的"列 schema 由 agent 推导"可直接参考——借思想，不接协议。

## 重新触发条件

1. dsh web 出现"会话旁挂面板"产品形态（dashboard 视图）——LAVS dispatch 模式
   才有真场景
2. LAVS 发布稳定版且出现第二个宿主
3. dsh render-intent 词汇被真实场景逼着扩展（届时参考其 bundle 设计而非接入协议）
