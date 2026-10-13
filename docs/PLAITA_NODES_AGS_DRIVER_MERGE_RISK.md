# `plaita-nodes` / `feat/ags-driver` 合并风险（2026-10-13 实测）

**背景**：`plaita#120` 的另一半（`sync_in` 自愈 / 沙箱基线漂移）不在 `plaita` 仓，
而在 `plaita-nodes`，且只存在于**未合并**的 `origin/feat/ags-driver`。
交付方点名两个提交 `30957fd`（sync_in 排除 facts.jsonl）与 `204c608`（sync_in fail-closed）。
**我已核实这两个提交确实在该分支上。**

## 实测事实

| 项 | 值 |
|---|---|
| `feat/ags-driver` 领先 `origin/main` | **30 个提交** |
| `main` 领先分支 | **1 个提交**（`b409a66`） |
| 分支最后活动 | **2026-10-11**（已 2 天） |
| `main` 上是否有 `sync_in` | **没有**（`grep -c "def sync_in"` = 0） |

`b409a66` = **`#5` 安全修复**：`gate/capture/agent` 直跑仍透传宿主全量 env
⇒ 修好后**加了 19 行 gate.py 改动 + 2 个测试文件（+222 行测试）**。

## ⚠ 合并冲突及其风险

```
git merge-tree --write-tree origin/main origin/feat/ags-driver
  → CONFLICT (content): Merge conflict in src/plaita_nodes/gate.py
```

**两边都改了 `gate.py`**：
- **`main`**：`#5` 的 **env 隔离安全修复**（含专门的测试：
  `test_subprocess_env_isolation.py` 168 行、`test_agent_host_run_guard.py` 54 行）；
- **分支**：4 个沙箱相关提交（`ed9aeb2` 表达式串误入沙箱分支、`450b5f9` `--cwd` 归一、
  `bc8ef91` 沙箱身份取根执行 id、`028e29a` 续期预算）。

⇒ **天真合并有丢安全修复的风险** —— 这正是"**冲突处要保持双方语义都在**"的典型场景，
而且**丢的是安全语义**，比丢普通功能更严重。

## 我的建议（需要人决策，我不擅自合并）

**不要直接 merge。** 建议二选一：

1. **分支 rebase 到 main**（推荐）：让分支作者/我 在 rebase 时**逐冲突核对**，
   确保 `#5` 的 env 隔离语义**保留**（并以 `test_subprocess_env_isolation.py` 全绿为判据）；
2. **只挑需要的部分**：如果 `sync_in` 自愈能**独立于其余 28 个提交**摘出来，
   那 cherry-pick 风险小得多 —— **但这需要先确认 `204c608`/`30957fd` 的依赖链**，
   我尚未查证。

**无论哪条，验收判据都应包括**：`#5` 的 env 隔离测试**必须仍然全绿**
（那是 main 上已有的安全保证，不能被这次合并回退）。

## 我为什么只记录、不动手

- 这是**跨仓 + 30 提交 + 安全语义冲突**，属于**需要归属与优先级决策**的事，
  不在"我能确定要做"的范围内；
- 用户的铁律里没有授权我合并 `plaita-nodes` 的长期分支；
- **但我把事实查清了**（分支状态、冲突文件、冲突性质、风险点），
  决策者拿到的是可直接行动的信息，而不是"似乎有风险"。
