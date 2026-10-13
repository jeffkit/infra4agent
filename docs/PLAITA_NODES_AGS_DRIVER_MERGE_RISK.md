# `plaita-nodes` / `feat/ags-driver` 合并建议（2026-10-13，含实测依据）

> 用户问："怎么合，你的建议是什么？"
> 本文件给出**结论 + 依据 + 可执行路径**。结论基于实测，不是权衡后的模糊判断。

## 结论（一句话）

**不要 merge、不要 rebase，也不要试图 cherry-pick `sync_in`** ——
因为 `sync_in` **无法独立存在**。正确做法是**按依赖分层推进**：
先决定 AGS driver 子系统（`0f4960e` 起）是否要进 main，再在其上落 `sync_in`。

## 关键实测：`sync_in` 摘不出来

```
分支上 src/plaita_nodes/sandbox_ags.py : 存在
main  上 src/plaita_nodes/sandbox_ags.py : ✗ 不存在
该文件由 0f4960e 引入（"feat(sandbox): AGS driver …"）
```

⇒ **`sync_in` 定义在 `sandbox_ags.py` 里，而该文件整个只存在于分支上。**
⇒ 想让 `sync_in` 进 main，**必须先让 AGS driver 子系统进 main**。
⇒ "只 cherry-pick `sync_in` 那两个提交"**这条路不存在**（我原本列为选项 2，实测后排除）。

## 第二个实测：30 个提交不是单一特性

分支上是**五类混杂**：

| 类别 | 代表提交 |
|---|---|
| AGS driver 子系统（**`sync_in` 的载体**） | `0f4960e` `af94281` |
| 沙箱生命周期（pause/reap/续期） | `f925634` `028e29a` `5a71814` |
| gate 门禁下沉沙箱 | `fd3888b` `fa5be26` `450b5f9` `ed9aeb2` |
| 执行器/配置修复（**与沙箱无关**） | `4f0c4da` `f8bd3af` `018b7fa` `7e8c91e` |
| `sync_in` 本体 | `ea52588` `30957fd` `c40c603` `f463a65` `204c608` |

⇒ 它**不是**"一个特性分支"，而是**一条长期开发线的全部工作**。
合并 = **一次性引入 30 个提交的行为变更**，其中多个带 `!`（破坏性）标记：
`979bce8 fix(sandbox)!`、`4f0c4da fix(agent_run)!`。

## 第三个实测：与 main 的安全修复**真实冲突**

```
git merge-tree --write-tree origin/main origin/feat/ags-driver
  → CONFLICT (content): Merge conflict in src/plaita_nodes/gate.py
```

`main` 独有的 `b409a66`（`#5`）把 gate.py 的 env 处理从
`env = os.environ.copy()` **改成白名单** `build_subprocess_env()`，
并把 `_clip_tail` 抽到公共层（`from ._subprocess_env import build_subprocess_env, clip_output`）。

**分支上 4 个 gate 提交改的是同一批代码**（`--cwd` 归一、sandbox 字段求值、工件注入）。
⇒ **天真合并会与"宿主凭据不进被执行的命令"这条安全语义冲突**，
**且冲突解决者很容易顺手保留分支侧而丢掉白名单**（因为分支侧看起来"更完整"）。

## 我的建议：分三步，且**先要一个决策**

| 步 | 做什么 | 判据 |
|---|---|---|
| **0（需你决策）** | **AGS driver 子系统是否要进 main？** 这是产品/架构决策，不是技术决策 | 若"要" → 走步 1；若"不要但想留代码" → 保持在分支，本条不推进 |
| **1** | 分支 **rebase 到 main**，**逐冲突手工核对** | **`#5` 的 env 白名单语义必须保留**；`tests/test_subprocess_env_isolation.py`（168 行）+ `test_agent_host_run_guard.py`（54 行）**必须全绿** |
| **2** | rebase 后跑全量 + 对 `sync_in` 补 `plaita-nodes#15` 要求的验收 | `#15` 的验收条件：自愈**或**有界 fail-closed，**bound 由测试断言** |

**关键点**：**步 1 的验收判据必须包含 `#5` 的安全测试全绿** ——
否则这次合并会**静默回退一个已交付的安全修复**（`#5` 修的是"宿主凭据泄漏进子进程"）。
这正是"冲突处要保持**双方**语义都在"的具体应用，且**丢的那一侧是安全**。

## 为什么我不直接做

- **步 0 是产品决策**（是否把 AGS driver 纳入主线），我不具备依据；
- 30 提交 rebase + 安全语义冲突解决，**属于"需要方案评审 + 独立验收"的开发任务**
  （按 `issue-keeper/AGENTS.md` 的六阶段流程，我应先出方案交评审团，而非直接动手）；
- **但我把三个决定性问题全部实测清楚了**（`sync_in` 不可独立、分支是混杂长线、冲突涉及安全语义），
  决策者拿到的是**可直接行动**的结论，而不是"似乎有风险"。

## 交付方那边

`okguitar` **已经开了 `plaita-nodes#15`** 作为这一半的追踪单（他读了我 `plaita#120` 的关闭说明），
正文里记录了起点提交与验收条件。**⇒ 归属已经接上了，缺的是"步 0"这个决策。**
