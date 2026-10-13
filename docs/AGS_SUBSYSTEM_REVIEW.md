# AGS（腾讯云沙箱）子系统评审意见 — 2026-10-13

> 用户问："ags 是指腾讯云的沙箱相关的内容吧？你可以详细展开说明一下现状和你对这些特性的评审意见吗"
> 本文给出：**是什么 / 现状 / 我的评审意见（含反对意见）**。
> 所有结论都有实测依据，标注了证据来源。

---

## 一、AGS 是什么

**AGS = 腾讯云 Agent Runtime（`api.ap-guangzhou.tencentags.com`）**，
E2B 兼容面的远程沙箱服务。在 plaita-nodes 的**沙箱执行抽象（Sandbox Drivers）**里，
它是四个 driver 之一：

| driver | 类型 | 状态 |
|---|---|---|
| `docker` | 本地 argv 型 | conformance 覆盖 |
| `krunvm` | 本地 argv 型 | conformance 覆盖 |
| `ssh` | 本地 argv 型 | 有 e2e |
| **`ags`（E2B 兼容）** | **API 型（需分叉执行循环）** | **未进 conformance** |

**它要解决的问题**（设计文档 §0）：coding 多 agent 协同场景下，
agentrun 节点调用的 Agent CLI（recursive / claude-code）目前**直接在宿主文件系统上跑**——
agent 的 bash / edit 操作会直接作用于宿主。沙箱化是为了把执行面隔离出去。

**设计底线两条**：① 脑手分离（控制面永远留宿主，沙箱只承载执行面）；
② flow 级 checkpoint 红利不丢（它在宿主 Redis，与 agent 在哪跑无关）。

---

## 二、现状（实测）

### 规模

| 项 | 数值 |
|---|---|
| 分支 | `origin/feat/ags-driver`，**领先 main 30 个提交**，最后活动 2026-10-11 |
| 实现 | 8 个文件约 **2,673 行**（`sandbox.py` 739、`sandbox_ags.py` 674、其余 6 个 220–273） |
| 测试 | 5 个单测文件约 **1,900 行** + 4 个 e2e |
| 设计文档 | `docs/sandbox-drivers-design.md`，**v2.1，四路交叉评审 10/10 Blockers CLOSED** |

### ⚠ 关键事实：AGS 已经在【生产链路】里，但它的代码不在 main 上

**先澄清一个我一开始也差点搞错的机制**：plaita 的节点通过
**`importlib.metadata` entry_points（group `plaita.nodes`）发现**
（`plaita/node/__init__.py:7,19`），**不是**在 plaita 仓里硬编码的。

实测两个 ref 的 `pyproject.toml`：

```
origin/main            →  agentrun = "plaita_nodes.agent_run:AgentRunNode"
origin/feat/ags-driver →  agentrun = "…AgentRunNode"
                          sandbox_agent = "plaita_nodes.sandbox_agent:SandboxAgentNode"   ← 多这个
```

⇒ **`sandbox_agent` 只在装了分支版 plaita-nodes 时才存在。**
⇒ 但**宿主侧的适配逻辑已经在 main 上**了（下面两条），
说明**曾经有环境装了分支版并真实跑过**：

**证据**（`plaita` 仓 main 上的生产代码已经为它写了专门处理）：

- `flow_worker.py:144`：失败/取消一律 **pause 保现场**（`sandbox_agent._preserve_scene`），
  并配套**清扫暂停实例**（否则累积占配额 —— 注释写明 **AGS 配额 ~20**，
  暂停不计计算力费但配额满会让新建失败）；
- `node_timings.py:104`：记录了**真实事故** —— 沙箱 `sandbox_agent` 节点跑 35 分钟期间，
  宿主侧 `node_timings` 停在最后一个已完成节点，keeper 判"末节点停滞超 1800s"
  ⇒ **把健康 run 判死并 cancel**。实测 execution `7c1f513f`/`31e74058`/`26e861d5`
  的产出落盘与 keeper 判死**同一秒**，worktree 里躺着完整的 +250 行实现。

⇒ **AGS 不是"未启用的实验"**：它在某个环境里跑过、踩过真事故、
宿主侧已为它打了补丁。**但驱动它的代码从未进入 main。**

### ⚠ 验证缺口（我最在意的一点）

```
tests/test_driver_conformance.py:
  ALL_DRIVERS = [d for d in ("docker", "krunvm") if _driver_available(d)]   ← 没有 ags

tests/test_sandbox_ags.py:  全部用 FakeClient / _LocalExecClient            ← 非真实 AGS
e2e 套件:  docker / ssh / krunvm 各一份，**没有 AGS 的**
```

⇒ **AGS driver 从未被端到端验证过**。它的 566 行测试全部对着**自己写的假客户端**。
这不是"测试不足"，而是**关键路径（真沙箱创建/attach/sync）没有真实验证**。

**这一点正好与我今天的经历呼应**：我自己在 AGS 传输问题上**连错五次**，
根因都是"拿一个没对齐的观测下结论"。**这里存在同类风险：
一个从未对真实服务验证过的 driver，其"通过"的测试证明的是它与假客户端一致。**

---

## 三、我的评审意见

### 3.1 先说好的：设计质量**显著高于**本仓平均水平

我逐节读了 `sandbox-drivers-design.md`（v2.1）。**这些东西是真的**，不是 PPT：

1. **评审是真的**：v2.1 标注"四路交叉评审 + 复核通过：10/10 Blockers CLOSED"，
   且 v1 的被否决项（节点 API 定义权曾放 flow YAML）**明确写了"评审否决"**——
   有留痕、有裁决，**不是事后补的漂亮话**；
2. **安全从"清单"升级到"机制"**（§7 标题原文），且**代码里确实落地**：
   实测 `canary` 3 处、`REDACTED` 2 处、`egress` 5 处、`digest` 7 处、
   `dry_run` 7 处命中 —— **设计里的安全机制在实现里存在**；
3. **最值得称道的一条**：§7.7 **"dry_run 可证伪"**——
   要求 dry 判定**先于** workspace 解析**和**凭据/env 组装，
   并用 monkeypatch 把 `get_credential`/`resolve_agent` 改成 raise，
   **断言 dry 下不得触发**；再加 `RecordingDriver` 计数断言 `ensure/exec/release` 调用数为 0。
   ⇒ **这是"我证明了它不会发生"，而不是"我保证它不会发生"** ——
   本会话反复出现的坏味道正是后者（`#124` 伪造满分、`#140` 假守卫、
   `#55` 的 mock-only 断言）。
4. **如实陈述了能力边界**：§0 明写"agent 级会话续跑在 plaita-nodes **现状为 0**"，
   因此沙箱化"**不会丢失**存量不存在的能力" ——
   **主动否定了自己方案的一个卖点**（"不丢断点续跑红利"），而不是含糊带过。
5. **自己声明了残余风险**：§1.3 明写"clone 进来的 repo **本身是攻击载荷载体**
   （安装脚本 / hooks / prompt injection in 源码），隔离它靠 §7 的 egress、run 画像
   与 token 最小化，**不靠「不 bind-mount」**" ——
   **没有被"我们隔离了文件系统"这种安全感糊弄过去**。

### 3.2 我的反对意见 / 三个真实风险

#### 风险 1（最重）：**关键路径零真实验证**，而部署状态不可自证

- conformance **不含 ags**（`ALL_DRIVERS = ("docker","krunvm")`）；
- 全部 AGS 测试对着 `FakeClient` / `_LocalExecClient`；
- **没有 AGS 的真 e2e**（docker/ssh/krunvm 各有一份）；
- 而 plaita **main 上已经有为它写的宿主侧适配**（pause/清扫/误杀补丁）
  ⇒ **曾经真实跑过**，且踩过真事故（`node_timings.py:104` 记录的误杀）。

**更麻烦的是"部署状态不可自证"**：`sandbox_agent` 的**有无取决于装了哪个版本的
plaita-nodes**（entry_point 在分支的 `pyproject.toml` 里）。
⇒ **同一份 plaita main，在不同机器上可能一份有 `sandbox_agent`、一份没有**，
而**从 plaita 侧看不出来**。这对"可复现"是硬伤：
一个 flow 在某台机器上能跑、换一台就"未知节点类型"，**且原因不在 flow 里**。

**我的建议**：
1. **要么让 AGS 进 conformance**（至少真沙箱 smoke：ensure → exec → sync_out → release），
   并让 `sandbox_agent` 的注册进入 main；
2. **要么明确降级为实验特性**（文档 + 代码双重标注"未经端到端验证"），
   同时**让 plaita 侧能检测到它的缺失并给出明确提示**（而不是报"未知节点类型"）。

**不能停在中间态** —— 现在既没有验证、也没有明确的"未启用"标记。

#### 风险 2：**配额是硬约束 —— 但清扫逻辑本身是合格的**（我复核后下调了这一条）

`flow_worker.py` 注释写明 **AGS 配额 ~20**，pause 保现场的实例**占配额**
（不计计算力费，但配额满会让新建失败）。

**我起初担心"暂停实例会无限累积"，复核 `sandbox_reaper.py` 后下调了这一判断**：
它的决策函数是**状态感知**的，共五种结局：

```
reap-unknown    —— 查无记录
reap-zombie     —— 有记录但停滞
reap-terminal   —— 已终态
skip-suspended  —— 等人审批的【合法挂起，永不回收】
skip-fresh      —— 还新鲜，不动
```

⇒ **"合法挂起"与"孤儿"被明确区分**，且"等人审批"的实例**永不误杀** ——
**这是正确的保守取向**（宁可占配额，不可杀掉等人工审批的现场）。

**⇒ 我把这一条从"风险"下调为"待确认项"**：设计是合格的，我只想确认
**"配额接近上限时是否优先回收 zombie"**（当前是周期性巡检，不是配额驱动）。
**这不阻塞合并**，属可选优化。

> **记一次自己的修正**：我起初把它写成"真实风险"，是因为只看到
> `flow_worker.py` 的注释、**没读 reaper 的实现**就下了判断。
> **这正是我今天在 AGS 传输问题上犯的同一个错**（拿局部观测推整体结论）。
> 复核后我把它降级了 —— **宁可少列一条风险，也不留一条不准确的**。

#### 风险 3：**30 个提交混杂，含破坏性标记**

```
979bce8 fix(sandbox)!: 包装层 build_args 漏第 4 参——整个 <base>-sandbox executor 不可用
4f0c4da fix(agent_run)!: agentproc 路径缺 cwd——agent 在【错误目录】干活，改动被静默丢弃
```

两条 `!` 都意味着**行为变更**。加上与 main 的 `#5` 安全修复在 `gate.py` **真实冲突**
（`merge-tree` 报 CONFLICT；main 侧把 `os.environ.copy()` 改成白名单
`build_subprocess_env()`，分支侧 4 个 gate 提交改同一批代码）。

⇒ **一次性合并 = 同时引入 30 个行为变更 + 解决一个"容易丢安全语义"的冲突**。

### 3.3 我的结论与建议

**不建议直接 merge/rebase，也不建议 cherry-pick `sync_in`**（实测它**摘不出来**：
`sync_in` 定义在 `sandbox_ags.py`，而该文件**整个只存在于分支上**，
由 `0f4960e` AGS driver 引入）。

**建议按依赖分层，且第一步是决策而不是编码**：

| 步 | 内容 | 判据 |
|---|---|---|
| **0（需人决策）** | **AGS driver 是否纳入主线？** —— 这是产品/架构决策 | 若"要" → 步 1；若"只留代码不启用" → 分支挂起，`#15` 作追踪 |
| 1 | 分支 rebase 到 main，**逐冲突手工核对** | **`#5` 的 env 白名单语义必须保留**；`test_subprocess_env_isolation.py`(168 行) + `test_agent_host_run_guard.py`(54 行) **必须全绿** |
| 2 | **AGS 进 conformance**（至少真沙箱 smoke：ensure → exec → sync_out → release） | 这是补上"零真实验证"这个最大缺口 |
| 3 | 补 `plaita-nodes#15` 的验收（`sync_in` 自愈**或**有界 fail-closed，bound 由测试断言） | 交付方已写好验收条件 |

**如果决定"不纳入主线"**：那也是合理选择，但请**同时**处理风险 1 ——
即明确 `sandbox_agent` 节点在主线上的行为（当前状态下它依赖未合并代码）。
**悬空状态本身才是问题**，不是"用"或"不用"。

---

## 四、一句话总结

**这个子系统的设计质量（评审留痕、安全机制化、可证伪的 dry-run、
主动声明残余风险）明显高于本仓平均水平，值得纳入；
但它当前处于最坏的中间态 —— 生产链路已经在依赖它，
而它的代码不在 main 上、且从未对真实 AGS 验证过。
我的建议是先做"是否纳入"的决策，然后按「rebase（保安全语义）→ 补 conformance → 补 #15 验收」三步走。**

---

## 五、本机实测补充（写完后复核）

```
本机 plaita 环境注册的节点类型：18 个
  sandbox_agent 是否注册：False        ← 与"entry_point 只在分支上"一致
```

⇒ 风险 1 的"部署状态不可自证"**在本机得到印证**：
同一份 plaita main，**换一台装了分支版 plaita-nodes 的机器就会有 `sandbox_agent`**，
而**从 plaita 侧无法区分**。

## 六、我对自己这份评审的两处修正（留痕）

1. **风险 2 被下调**：我起初写"暂停实例会累积、配额会被吃满"，
   **那是我只读了 `flow_worker.py` 的注释、没读 `sandbox_reaper.py` 的实现**。
   复核后发现 reaper 的决策是**状态感知**的（`skip-suspended` 明确"等人审批的合法挂起永不回收"）
   ⇒ 设计是正确的保守取向。**已从"风险"降为"待确认项"**。
2. **风险 1 的描述被修准**：我起初写"生产依赖一个未验证组件"，
   复核 entry_point 机制后改成更准确的"**部署状态不可自证**" ——
   `sandbox_agent` 的有无**取决于装了哪个版本的 plaita-nodes**，
   而不是"main 上的 plaita 一定会调用它"。

**⇒ 两处修正都是同一个毛病**：**拿局部观测（一段注释、一个 grep）去推整体结论。**
这与我今天在 AGS 传输问题上连错五次是同一种错。
**我把修正过程留在文档里，而不是悄悄改掉** —— 因为"我差点写错什么"本身是有用的信息。
