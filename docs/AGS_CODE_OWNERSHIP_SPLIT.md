# 第二批（AGS 入主线）的**代码归属拆分** —— 不是全部进 plaita-nodes

> 用户指出："要啊，但按上面讲的，**不是全部代码都该进 plaita-nodes 吧**"
> **答：对。** 我此前的三层归类里，`sandbox_reaper.py` 是唯一需要**拆开**的文件。
> 本文给出**逐段归属**，以及拆分前后的边界形态。

---

## 一、总原则（来自 `docs/AGS_RESPONSIBILITY_BOUNDARY.md`）

| 层 | 内容 | 归属 |
|---|---|---|
| **语义** | 「沙箱是什么、怎么起、怎么回收」 | **plaita-nodes** |
| **机制** | driver 实现、argv 包装、git 同步、脱敏 | **plaita-nodes** |
| **调度** | 「什么时候跑、多久跑一次」 | **plaita**（已有 `_paused_sweeper`） |
| **部署绑定** | 「从哪拿 execution 状态、连哪个 Redis」 | **plaita** |

---

## 二、逐文件归属（实测行数）

| 文件 | 行数 | 归属 | 理由 |
|---|---|---|---|
| `sandbox.py` | 739 | ✅ **plaita-nodes** | 抽象层：`WorkspaceSpec`/`WorkspaceHandle`/`handle_id`/`root_execution_id`。**纯语义**，无 plaita 依赖 |
| `sandbox_ags.py` | 674 | ✅ **plaita-nodes** | AGS driver：`AgsClient`/`AgsDriver`/`wrap_argv_from_env`/`should_sweep_paused`。**这就是"在沙箱里执行 agent"的能力本体** |
| `sandbox_agent.py` | 244 | ✅ **plaita-nodes** | 唯一的**节点类型**（`SandboxAgentNode(AgentRunNode)`） |
| `ags_exec.py` | 98 | ✅ **plaita-nodes** | AGS 执行的 argv 适配器（`wrap_argv` 的 CLI 入口） |
| `sandbox_docker/ssh/krunvm.py` | 273/220/227 | ✅ **plaita-nodes** | 同类 driver（已存在的三个） |
| **`sandbox_reaper.py`** | **198** | ⚠️ **拆开**（见下） | 内部**混了两层** |

---

## 三、`sandbox_reaper.py` 的逐段拆分（这是用户指出那一点的具体答案）

实测该文件的顶层定义：`_parse_ts` / `decide` / `reap_one` / `run_cycle` /
`enumerate_resources` / `build_storage` / `main`。

| 段 | 行数（约） | 归属 | 理由 |
|---|---|---|---|
| `decide(state, *, stale_minutes, …) -> str` | ~22 | ✅ **plaita-nodes** | **纯决策**：`reap-unknown`/`reap-zombie`/`reap-terminal`/`skip-suspended`/`skip-fresh`。它要知道「**等人审批的合法挂起**」这个概念 —— **这是沙箱语义**，plaita 不懂 |
| `_parse_ts` | ~12 | ✅ **plaita-nodes** | 决策的辅助（时间解析），随之 |
| `reap_one(driver_name, execution_id, ws_key, …)` | ~21 | ✅ **plaita-nodes** | 「按决策结果对某个资源执行动作」——**动作是沙箱操作**（调 driver 的 release/kill） |
| `enumerate_resources(drivers, …)` | ~16 | ✅ **plaita-nodes** | 枚举**沙箱资源**（按 driver 列实例）——也是沙箱侧 |
| **`run_cycle(storage, resources, …)`** | ~34 | ⚠️ **可两属** | 编排"枚举→决策→动作"，**只要 `storage` 是注入的**（它已经是参数）⇒ 可留 plaita-nodes |
| **`build_storage(redis_url)`** | ~8 | ❌ **plaita** | **直接 `from plaita.storage.redis import RedisExecutionStorage`** —— 让"通用节点仓"**绑定了具体部署的存储后端** |
| **`main(argv)`（argparse CLI）** | ~30 | ❌ **plaita**（或运维层） | 「怎么被调用、连哪个 Redis、默认 drivers 是哪些」= **部署与调度** |

**⇒ 拆分结果**：

```
plaita-nodes 保留（约 160 行）： decide / _parse_ts / reap_one /
                                 enumerate_resources / run_cycle(storage=注入)
plaita 承接（约 38 行）：        build_storage（Redis 绑定）
                                 main（CLI 入口 + 调度）
```

**关键点**：`run_cycle(storage=...)` **已经是注入式**的
⇒ **拆分几乎不需要改逻辑**，只需把 `build_storage` + `main` 挪到 plaita 侧，
再让 plaita 的入口去调 `plaita_nodes.sandbox_reaper.run_cycle`。
**这是一次"搬移"，不是"重写"。**

---

## 四、拆分后的边界形态

```
plaita-nodes（业务无关 · 通用可复用）
  sandbox.py            抽象
  sandbox_{ags,docker,ssh,krunvm}.py   driver 机制
  sandbox_agent.py      节点
  sandbox_reaper.py     decide / reap_one / enumerate_resources / run_cycle(storage=)
  ↑ 无 plaita 依赖；任何宿主都能用它做"沙箱资源回收"

plaita（控制面 · 部署相关）
  flow_worker._paused_sweeper()          已有的调度线程（暂停实例）
  <新增> reaper 的 CLI/调度入口          连 Redis、按 cron/线程跑 run_cycle
  ↑ 调度与后端绑定只在这里
```

**⇒ 收益**：
1. `plaita-nodes` 恢复"**无部署依赖**"（这是它作为通用节点仓的立身之本）；
2. 回收逻辑**只有一份决策**（`decide`），plaita 侧只负责"何时调、从哪拿状态"；
3. 第三方使用者（非 plaita 宿主）也能用 `run_cycle(storage=自己实现)`。

---

## 五、与"是否合并"的关系

**这个拆分应该在 `rebase` 之前或同时做**，因为：

- 如果**先整块 merge** 再拆，`gate.py` 的安全冲突**已经解过一次**，
  拆分会**再动一次同一批文件** ⇒ 两次风险；
- 如果**先拆再合**，合并时带入的 `sandbox_reaper.py` **已经是干净形态**（无 plaita import），
  `build_storage`/`main` 直接落在 plaita 侧 ⇒ **冲突面更小**。

**⇒ 我建议**：
```
1. 在分支上先做这次"搬移"（build_storage + main → plaita 侧）
2. 然后 rebase 到 main（逐冲突核对，判据含 #5 的 env 隔离测试全绿）
3. 补 conformance（AGS 进 ALL_DRIVERS + 真沙箱 smoke）
4. 补 plaita-nodes#15 验收（sync_in 自愈 / 有界 fail-closed）
```

---

## 六、四项待核实 —— **已全部核实，结论比预期更干净**

我在动手前把这四项查清了（不是"看起来是"）：

### ① 全量 import 审计：整个沙箱子系统**只有一处** plaita 依赖

```
sandbox.py            （无）
sandbox_ags.py        （无）
sandbox_agent.py      （无）
ags_exec.py           （无）
sandbox_docker.py     （无）
sandbox_ssh.py        （无）
sandbox_krunvm.py     （无）
sandbox_reaper.py:147   from plaita.storage.redis import RedisExecutionStorage   ← 唯一一处
```

**⇒ 边界违规只有一处，且就在 `build_storage` 里** —— 与我的判断完全一致，
**而且比我预想的更干净**（我原本担心还有隐性依赖）。

### ② `enumerate_resources` 只依赖兄弟 driver 模块

```python
if "docker" in drivers: from .sandbox_docker import enumerate_workspaces
if "krunvm" in drivers: from .sandbox_krunvm import enumerate_workspaces
if "ssh"    in drivers: from .sandbox_ssh    import enumerate_workspaces
```

⇒ **全是相对 import**，无 plaita、无注册表格式依赖。✅

**⚠ 附带发现一个必须一并处理的缺口**：

```
sandbox_docker.py   def enumerate_workspaces : 有
sandbox_krunvm.py   def enumerate_workspaces : 有
sandbox_ssh.py      def enumerate_workspaces : 有
sandbox_ags.py      def enumerate_workspaces : ✗ 没有（只有 sweep_paused）
```

而 `enumerate_resources` 的默认 `--drivers` 是 **`docker,krunvm`**
⇒ **`ags` 既不在默认列表里、也没有枚举实现**。

⇒ **即使 AGS 入了主线，它的孤儿沙箱也不会被 reaper 回收。**
当前只有 plaita 的 `sweep_paused` 覆盖"暂停实例"那一类，
**不覆盖 `reap-zombie` / `reap-terminal` 那些类别**
（与我在边界分析里的"覆盖不全"结论一致，这里找到了**具体原因**）。

**⇒ 第二批应包含**：给 AGS driver 补 `enumerate_workspaces`
（AGS 侧可用 `GET /v2/sandboxes` 列实例 —— **这正是我今天在 sweep 里用 curl 打通的那个接口**），
并把 `ags` 纳入 reaper 的 drivers 列表。

### ③ `run_cycle` 全程只用**注入**的 storage

```python
def run_cycle(storage, resources, *, …, spec_lookup=None, dry_run=False):
    if storage is not None:
        for state in storage.list_executions(limit=1000):   # 鸭子类型，无全局
    …
    lookup = spec_lookup or (lambda key: sb.load_sandboxes().get(key))   # 也是注入
```

⇒ **无全局状态、无 plaita 依赖** ✅ ⇒ 搬移几乎零改动。

### ④ 结论

**`sandbox_reaper.py` 里需要搬到 plaita 的只有两段：**
- `build_storage()`（8 行，唯一的 plaita import）
- `main()`（~30 行 argparse CLI）

**其余约 160 行是纯沙箱语义，本来就不该出去。**
