# 最终建议：AGS / `feat/ags-driver` 要不要部分合入 main

> 用户问："那最后你的建议是怎样，要不要部份合入 main 分支"
> **答：要，但分两批。第一批现在就做（2 个提交，与沙箱无关，修的是 main 上真实存在的 bug）；
> 第二批（AGS 本体）等你决策。**

---

## 一、结论

| 批次 | 内容 | 我的建议 |
|---|---|---|
| **第一批（建议立刻）** | **2 个与沙箱无关的 bug 修复**（`f8bd3af` / `4f0c4da`，均在 `agent_run.py`） | **合** —— 它们修的是 **main 上真实存在、且正在生效的 bug**，与 AGS 决策无关 |
| **第二批（等你决策）** | AGS driver 子系统（`sandbox_agent` + driver + reaper） | **先决策"是否纳入主线"**，再 `rebase` 到 main（保 `#5` 安全语义） |
| **不合** | 分支上其余沙箱/生命周期/gate 提交 | 随第二批一起走，不单独摘 |

---

## 二、第一批：2 个提交，**证据充分，风险低**

### `f8bd3af` —— **签名落后 ⇒ 整个 recursive 执行器不可用**

实测（在 `origin/main` 的干净 worktree 上）：

```
main 的 plaita-nodes:   def build_args(message, session_id, env) -> list        ← 3 个参数
agentproc SDK:          def build_args(message, session_id, env, _ctx=None)     ← 4 个参数
                        (executors.py:287 与 :398 两处)
```

⇒ **`executors.py` 用 4 参调用，main 上的实现只收 3 参** —— 这是硬失配。

### `4f0c4da` —— **agentproc 路径漏传 `cwd` ⇒ agent 在错误目录干活、改动被静默丢弃**

实测 main：

```
:457  RunOptions(message=…, session_id=…, extra_env=extra_env, …)   ← 没有 cwd=
:702  subprocess.Popen(argv, …, cwd=workspace, …)                    ← 直调路径【有】
```

**⇒ 同文件两条路径不一致**：recursive 直调传了 `cwd=workspace`，
而 **agentproc executor 路径（`:457`）没传** ⇒ agent 继承**调度进程的 cwd**。

该提交的注释记录了**端到端实测**：`impl_agent=cursor-sonnet46` 的 run，
cursor 会话 `meta.json` 记录 `cwd=/Users/kong/projects/infra4agent/issue-keeper`
（= 发起 bridge 的目录），而**目标仓是 `/tmp/e2e-repo`** ⇒ `has_changes` 查 worktree
⇒ 判「agent made no changes」⇒ **任务被静默丢弃（不报错）**。

**影响面**：注释写明"全部 14 个 agentproc executor（cursor/claude-code/codex/deepseek/…）"。

### 两个提交都**实测可干净应用到 main**

```
git cherry-pick --no-commit f8bd3af  → ✅ 干净应用
git cherry-pick --no-commit 4f0c4da  → ✅ 干净应用
```

**⇒ 无冲突、无沙箱依赖、修的是 main 上的真 bug。我没有理由把它们扣在那条分支上。**

> **⚠ 我起初把 `7a57911`（宿主锁定型 CLI 拒绝进沙箱）也算进第一批，复核后剔除**：
> 它的 `agent_run.py` 改动**引用了 `_execute_sandboxed` 的 fail-closed 说明**，
> 且测试落在 `tests/test_sandbox_ags.py` ⇒ **它依赖沙箱子系统**，属第二批。
> （又一次"没读完就归类" —— 我核对了它的 `--stat` 才把测试文件的位置看出来。）

> **为什么我建议先合这两个**：它们与"AGS 要不要进主线"**完全无关** ——
> 是 `agent_run.py` 的执行器接线问题。**因为 AGS 没决策而让这两个 bug 继续挂在 main 上，
> 是不合理的。** 尤其 `4f0c4da` 是**静默丢结果**（本会话最该优先消灭的一类）。

---

## 三、第二批：AGS 本体 —— 建议**先决策，再 rebase**

**不建议直接 merge**，理由（实测）：

1. 30 个提交**混杂五类**（AGS driver / 沙箱生命周期 / gate 下沉 / 执行器修复 / sync_in），
   含两条 `!` 破坏性标记；
2. **与 main 的 `#5` 安全修复在 `gate.py` 真实冲突**（`merge-tree` 报 CONFLICT）：
   main 侧把 `os.environ.copy()` 改成白名单 `build_subprocess_env()`，
   分支侧 4 个 gate 提交改同一批代码 ⇒ **冲突解决者容易丢掉白名单**（丢的是**安全**语义）；
3. `sync_in` **摘不出来**（它定义在 `sandbox_ags.py`，该文件整体只在分支上，由 `0f4960e` 引入）。

**⇒ 步骤**：
| 步 | 内容 | 判据 |
|---|---|---|
| 0 | **决策：AGS 是否纳入主线？** | 产品决策，非技术决策 |
| 1 | 分支 `rebase` 到 main，**逐冲突手工核对** | **`#5` 的 env 白名单语义必须保留**；`test_subprocess_env_isolation.py`(168 行) + `test_agent_host_run_guard.py`(54 行) **必须全绿** |
| 2 | **AGS 进 conformance**（当前 `ALL_DRIVERS` 只有 docker/krunvm） | 补"零真实验证"这个最大缺口 |
| 3 | 补 `plaita-nodes#15` 验收（`sync_in` 自愈**或**有界 fail-closed） | bound 由测试断言 |

---

## 四、一个必须同时处理的配置问题（否则"合了也白合"）

**实测发现**：VM `tcloud_gz` 上 plaita-nodes 的 **git checkout 在 `feat/ags-driver`（尖端 `7d2ae3b`）**，
**但安装物是 site-packages 里的 `0.8.0`（非 editable）**，而 0.8.0 的
`entry_points.txt` **没有 `sandbox_agent`**。

⇒ **代码在分支、安装物在别处，两者可以不一致。**
⇒ 这正是"部署状态不可自证"的具体形态，也是**为什么"它不在主分支上却能跑一周"**。

**⇒ 无论第二批合不合，这一条都该修**：让"代码版本"与"安装版本"可核对
（editable 安装、或启动时校验版本一致性并给出明确提示）。
**否则合并之后，仍然可能出现"checkout 在 A、跑的是 B"。**

---

## 五、一句话

**要合，但不是"合 AGS"——先把 2 个与沙箱无关的真 bug（`f8bd3af`/`4f0c4da`）摘进 main，
它们修的是 main 上正在生效的问题（执行器签名失配 + agent 在错误目录干活且静默丢结果），
且实测可干净应用、零冲突。AGS 本体则先做"是否纳入主线"的决策，
再按 rebase（保 #5 安全语义）→ 补 conformance → 补 #15 验收 三步走。
另需同时修掉"checkout 在分支、安装物在 site-packages"这个部署不一致，否则合了也白合。**

---

## 六、第一批**已落地**（2026-10-13 11:25）

```
plaita-nodes  origin/main:  b409a66 → 48d087e
  298b89c  fix(agent_run): recursive build_args 签名落后于 agentproc
  48d087e  fix(agent_run)!: agentproc 路径缺 cwd
改动面：src/plaita_nodes/agent_run.py，+26 / -2（单文件）
```

### 验证（负向对照先行 + 失败集差异比较）

**① 缺陷确实存在于 main**（还原源码即重现）：

```
main      : def build_args(message, session_id, env)         ← 3 参
agentproc : def build_args(message, session_id, env, _ctx)   ← 4 参 ⇒ 失配
main 的 cwd=str(repo) 出现次数：0                             ← agentproc 路径漏传
```

**② 失败集比较**（同一套测试，基线 vs 修复后）：

| | 失败数 |
|---|---|
| `origin/main`（未改动） | **13** |
| 摘入两个修复后 | **10** |

```
我修好的（基线红 → 修复后绿）：
  ✓ test_agent_run.py::test_recursive_usage_fallback_from_parsed
  ✓ test_agent_run.py::test_details_mode_collects_observations
  ✓ test_agent_run.py::test_details_false_has_no_observations_key

我引入的（基线绿 → 修复后红）：
  （空）—— 零回归
```

**③ 剩余 10 个失败与本次改动无关**（基线同样失败），根因是**环境限制**：
```
agentproc.run_lock.RunLockBusy: …遗言锁指向存活 pid，但身份无法核实（ps 不可用）
```
⇒ 沙箱内 `ps` 不可用，属**执行环境**问题，不是代码缺陷；CI（GitHub runner）上 `ps` 可用。

**⇒ 净效果：-3 失败、0 回归。**

### 顺手确认

- 推前核对 `origin/main` 仍是 `b409a66`（无人推进），**非 force push**；
- 改动**只碰 `agent_run.py`**，未触及 gate / 沙箱 / 任何 AGS 相关文件
  ⇒ **不作为第二批的预判**，AGS 仍需独立决策。
