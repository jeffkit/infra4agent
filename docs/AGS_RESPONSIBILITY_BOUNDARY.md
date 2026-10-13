# AGS 代码的职责边界分析 —— 回答"是节点类型，还是也含节点外控制逻辑"

> 用户问：AGS 实现代码里的逻辑**主要是节点类型吗？还有其他节点外的控制逻辑吗？
> 如果有，是否把控制逻辑放到 issue-keeper 更好？**
>
> 本文用实测数据回答，并给出我的判断（含**反对**把全部控制逻辑搬走的部分）。

---

## 〇、先确认用户的观察：AGS **确实在生产跑过**（我核实了）

VM `tcloud_gz`（VM-8-2-ubuntu）的 `~/.plaita-console/worker-tcg1.log`：

| 证据 | 数值 |
|---|---|
| 提及 `sandbox_agent` 的行数 | **5,677** |
| `已 pause 保留现场 <instance>` 事件 | **1,417 次** |
| 日志时间跨度 | **2026-10-06 15:25 → 2026-10-12 11:56**（后者正是管线停机那一刻） |

日志里有真实失败现场，例如：
```
sandbox_agent: 取消路径 sync_out 未完成：Request timed out
sandbox_agent: 失败路径 sync_out 未完成：sync_out 取补丁失败：fatal: unable…
sandbox_agent: 已 pause 保留现场 266gkl5y54sqqkgtntedhatxlgyph7
```

⇒ **跑了整整一周、1,417 次 pause**。用户说的"worker 就是跑 AGS 沙箱的"**属实**。

**⚠ 但有一个我必须指出的配置事实**（解释"为什么它不在主分支上还能跑"）：

VM 上 `plaita-nodes` 的 **git checkout 在 `feat/ags-driver`**（`7d2ae3b` = 分支尖端），
**但安装的是 site-packages 里的 `plaita-nodes 0.8.0`（非 editable）**，
而 0.8.0 的 `entry_points.txt` **没有 `sandbox_agent`**。

⇒ **这是"代码在分支上、但要跑得起来需要另外安装分支版本"的状态。**
⇒ 我的巡检在本机测到 `sandbox_agent` **未注册**（18 个节点类型），与此一致。
⇒ **这正是我此前标的"部署状态不可自证"风险的具体形态**：
同一份仓库，checkout 在分支、安装物在 site-packages，**两者可以不一致**。

---

## 一、直接回答：**不，绝大部分不是节点类型**

按顶层定义逐个文件核对：

| 文件 | 行数 | 性质 |
|---|---|---|
| `sandbox_agent.py` | **244** | **唯一的节点类型**（`SandboxAgentNode(AgentRunNode)`） |
| `sandbox.py` | 739 | **框架/抽象层**（`WorkspaceSpec`/`WorkspaceHandle`/`handle_id`/`root_execution_id`…） |
| `sandbox_ags.py` | 674 | **AGS driver 实现**（`AgsClient`/`AgsDriver`/`wrap_argv_from_env`…） |
| `sandbox_reaper.py` | **198** | **独立控制面 CLI**（有 `main()`；`decide()`/`reap_one()`/`run_cycle()`） |
| `ags_exec.py` | **98** | **独立 CLI**（有 `main()`；读 envfile、包装 AGS 执行） |
| `sandbox_docker/ssh/krunvm.py` | 273/220/227 | 其它 driver（同类） |

⇒ **节点类型只有 244 行（占子系统约 9%）**，其余约 **2,400 行是节点外的机制**：
driver 抽象、生命周期、argv 包装、补丁同步、清扫。

**⇒ 结论：AGS 实现的绝大部分不是"节点"，而是"执行机制 + 控制面"。**

---

## 二、有三类"节点外控制逻辑"，但**它们的归属应该分开判断**

这是我要**反对"一律搬到 issue-keeper"**的地方。三类必须区别对待：

### A 类：**driver 机制**（`sandbox.py` / `sandbox_ags.py` 主体）

`AgsClient.ensure/attach/exec/release`、`wrap_argv_from_env`、
`_host_working_tree` / `_apply_patch`（git 同步）、canary 脱敏、argv 包装。

**⇒ 必须留在 plaita-nodes。**
理由：这就是"**在沙箱里执行 agent**"这个能力的本体，
**它是通用可复用的执行能力**，与 issue-keeper 的业务（监控 GitHub issue）**无关**。
搬到 issue-keeper 会让"任何想用沙箱的 flow"都被迫依赖 issue-keeper ——
**恰好违背你说的"业务无关、通用可复用"的定位**。

### B 类：**`ags_exec.py`（98 行独立 CLI）** —— 我倾向**留在 plaita-nodes**

它是"把 AGS 执行包装成可被 agentproc 调用的 argv"的适配器，属 A 类的延伸。

### C 类：**`sandbox_reaper.py`（198 行）** —— **这个是你的直觉对的地方**

它是**独立控制面**：枚举资源 → 决策 → 回收，且有 `main()` 和 `build_storage(redis_url)`
（直接连 plaita 的 `RedisExecutionStorage`）。

**而这里有一个我实测发现的重要事实 ——「两边重复」**：

```
plaita-nodes/sandbox_reaper.py:  decide() → reap-unknown / reap-zombie /
                                          reap-terminal / skip-suspended / skip-fresh

plaita/plaita/server/flow_worker.py:136  _paused_sweeper(max_age_secs=6*3600)
plaita/plaita/server/flow_worker.py:158  if drv is None or not hasattr(drv, "sweep_paused"): …
plaita/plaita/server/flow_worker.py:182  sweep_paused_sandboxes(...)
```

**⇒ plaita 自己已经有一个清扫线程（`_paused_sweeper`），而它调用的是 driver 上的
`sweep_paused` 方法**；同时 plaita-nodes 里又有一个**独立的 198 行 reaper CLI**。

**⇒ 同一件事（回收暂停/孤儿实例）**在两处各有实现，**且两边都没有调度器**：
- plaita 侧：靠 `flow_worker` 启动时起的线程；
- plaita-nodes 侧：`sandbox_reaper.py` 有 `main()`，但**我在 VM 上没找到任何 cron/systemd-timer 在调它**。

#### ⚠ 复核后修正：两者**不是简单重复**，而是**判据不同**

我起初写"两处重复实现同一件事"。**复核两者的决策函数后，需要更准确的表述**：

```
sandbox_ags.py:541  should_sweep_paused(metadata, started_at, *, now, max_age_secs) -> bool
                    「这条【暂停】实例该不该清」：
                      ① 必须带自家 metadata（plaita_execution/plaita_ws）——**绝不碰他人的实例**
                      ② 必须能取到 started_at 且存活 ≥ max_age_secs ——刚暂停的可能马上被续跑

sandbox_reaper.py:50  decide(state, *, stale_minutes, …) -> str
                    「这条【资源】当前处于什么状态、该怎么处置」：
                      reap-unknown / reap-zombie / reap-terminal /
                      skip-suspended（等人审批的合法挂起，永不回收）/ skip-fresh
```

⇒ **两者判据不同**：前者是"**我的、且够老的暂停实例**"，
后者是"**资源处于哪种终态**"（含 zombie / terminal / 合法挂起）。
**⇒ 更正为"功能相邻但不完全重合"**，而不是"重复实现"。

**但"悬空"这一点仍然成立**：`sandbox_reaper.py` 有完整 `main()` 却**没有调度器**，
而 plaita 的 `_paused_sweeper` 只覆盖了其中"暂停实例"那一类
（`drv.sweep_paused()`），**不覆盖 `reap-zombie` / `reap-terminal` 那些类别**。

⇒ **更准确的结论**：
- **不是重复**，而是**覆盖不全 + 后者无人驱动**；
- `reaper` 想做的（全类别资源回收）**比 plaita 线程做的更多**，但它**没在跑**。

> **这是我在这份分析里的第二处自我修正**（第一处是把 AGS 的"生产依赖"改成"部署状态不可自证"）。
> **同一个毛病**：我读到"两边都有回收逻辑"就下了"重复"的判断，
> **没有先读完两个函数的判据**。**这正是我反复犯的那类错。**

---

## 三、我的建议（分三层，不是"一刀切搬走"）

| 逻辑 | 我的建议 | 理由 |
|---|---|---|
| **A/B 类：driver 机制 + exec 适配** | **留在 plaita-nodes** | 这是"通用可复用的执行能力"的本体；搬到 issue-keeper 会让其它 flow 被迫依赖 issue-keeper，**违背你定的定位** |
| **C 类：`sandbox_reaper.py` 的"策略"（何时算孤儿、何时跳过）** | **收敛到一处**，我倾向**留在 plaita-nodes 作为 driver 方法**（`sweep_paused`），**由 plaita 的调度器驱动** | 「什么算孤儿」是**沙箱语义**（要知道 `skip-suspended` 的合法挂起概念），plaita-nodes 更懂；而「**何时跑**」是控制面的事，plaita 已有线程 |
| **"何时触发清扫"** | **留在 plaita**（已有 `_paused_sweeper`） | 调度属控制面；且 plaita 有 execution 状态可查 |
| **issue-keeper 该拿什么** | **什么都不必拿** | issue-keeper 是"监控 GitHub issue → 调 agent → 回评"，**与沙箱生命周期无关** |

**⚠ 我不建议把 reaper 搬进 issue-keeper**，理由：

1. **issue-keeper 的职责是"issue 工作流"**，不是"沙箱资源治理"。
   把沙箱回收放进去，会让"沙箱孤儿"这个问题**依赖 issue-keeper 是否在跑** ——
   而 issue-keeper 本身是可以停的（当前就在停着）。**那会造成新的单点。**
2. **真正的问题不是"位置"，而是"覆盖不全 + 无人驱动"**（复核后修正，见上文）：
   `sandbox_reaper.py` 有完整 `main()` 却**没有调度器**，
   而 plaita 的 `_paused_sweeper` **只覆盖"暂停实例"一类**
   （`drv.sweep_paused()`），**不覆盖 `reap-zombie` / `reap-terminal`**。
   ⇒ 搬到一个新地方**不会解决"没人跑"**，只会让覆盖问题换个地方藏着。
3. 如果确实想要一个**独立的运维入口**（可被 cron/人工调用），
   那它属于**运维层**（如 `~/.plaita-console/` 的脚本或 launchd/systemd unit），
   **不是 issue-keeper 的业务代码**。

---

## 四、我对 plaita-nodes 定位的意见（回应你说的"通用可复用能力节点"）

**我认同这个定位，而且 AGS 的实现基本符合它** —— 但有两个偏离项值得处理：

1. **`sandbox_reaper.build_storage()` 直接 import plaita 的 `RedisExecutionStorage`**
   ⇒ 这让"通用节点仓"知道了一个**具体部署的存储后端**。
   作为**可选便利**可以接受（延迟 import、缺装降级），
   但**不该是唯一路径** —— 建议保留"传入 storage"的抽象入口（它已有 `run_cycle(storage=...)`）。
2. **控制面策略与执行机制混在同一仓**：`sandbox_reaper.py` 的**决策函数 `decide()`**
   是沙箱语义（该留），但它的 **`main()`/`build_storage()`/CLI 包装**是控制面（该出去）。

**⇒ 一句话**：plaita-nodes 应保留"**沙箱是什么、怎么起、怎么回收**"（语义 + 机制），
把"**什么时候跑、从哪拿状态**"（调度 + 后端绑定）留给控制面。

---

## 五、给你的一句话总结

**AGS 的实现里，真正是"节点类型"的只有 244 行（`SandboxAgentNode`，还是继承 `AgentRunNode`），
其余约 2,400 行是 driver 机制（该留在 plaita-nodes）+ 一类控制面逻辑（`sandbox_reaper.py` 198 行）。
我的建议不是"把控制逻辑搬到 issue-keeper"，而是：机制留 plaita-nodes；
`reaper` 的**决策**留 plaita-nodes（它懂沙箱语义）、**调度**留 plaita（已有 `_paused_sweeper`）；
**issue-keeper 不该承接沙箱治理** —— 那会让沙箱回收依赖 issue-keeper 存活，制造新的单点。
真正要修的是当前「同一件事在两处实现、且 reaper CLI 无人调用」的重复与悬空。**
