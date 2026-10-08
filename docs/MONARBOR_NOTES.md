# monarbor 工具：软链环崩溃的根因与修复状态

> 最后更新：2026-10-08（复核勘误）
> 状态：**根因已定位、修复方案已记录；修复代码尚未入库**——`jeffkit/monarbor` 的 `main` 与全部远端 ref 均不含本文 §6 所述改动
> 影响版本：0.3.0、0.4.0（PyPI 与仓库 `main` 均未修复）
> 触发仓库：`deepseek-harness`（其 `vendor/cordis` 与 `vendor/include` 两个 workspace 包经 `link:` 互相引入，`pnpm install` 后形成软链环）

---

## 0. 当前实际状态（2026-10-08 复核）

本文早期版本把 §6 的修复描述为"已实施、已入库（提交 `0fc706c` / `debe366`）"，并声称配有 8 个回归测试与 `monarbor doctor`。**该描述与 `jeffkit/monarbor` 仓库实际不符**，现予勘误。

复核方法：`git clone git@github.com:jeffkit/monarbor.git` 后，在 `main`（HEAD `664bb67`，`chore: bump version to 0.4.0`，2026-04-16）上直接检查源码、git 对象与测试计数。

| 早期版本声称 | 复核结果 |
|--------------|----------|
| `find_nested_monorepos` 支持 `exclude_paths` | ✅ **属实**（上游 PR #1 内容）：`config.py:120,126,130`，调用点 `config.py:166`、`cli.py:218` |
| `list_repos` 传入 `exclude_paths`（缺陷 B 正解） | ❌ **仍漏传**：`cli.py:373` 依旧是 `find_nested_monorepos(config.root)` |
| `SKIP_SCAN_DIRS` 剪枝依赖/构建目录 | ❌ 全仓 grep 零命中 |
| `MAX_SCAN_DEPTH` 递归深度上限 | ❌ 零命中 |
| `registered_repo_abs_paths()` helper | ❌ 零命中 |
| 不跟随符号链接（`is_symlink()` 跳过） | ❌ 零命中；`config.py:128` 仍是裸 `entry.is_dir()`（默认跟随软链），无深度上限、无不可读目录兜底 |
| `tests/test_nested_scan_safety.py`（8 用例） | ❌ 文件不存在；`tests/` 仅 8 个既有文件 |
| `tests/test_version_consistency.py` | ❌ 不存在 |
| 测试数「58 → 66/67 passed」 | ❌ 当前 `def test_` 总数恰为 **58**，即处于所述"修复前"状态 |
| 提交 `0fc706c`、`debe366` | ❌ `git cat-file -t` 均为 `Not a valid object name`；`git log --all -- tests/test_nested_scan_safety.py` 为空 |
| `__version__` 同步到 0.4.0 | ❌ 未修：`monarbor/__init__.py` 仍为 `"0.3.0"`，与 `pyproject.toml` 的 `0.4.0` 漂移 |
| `monarbor doctor` 命令 | ❌ 不存在（无 `doctor.py`）；`docs/DOC_ASSERTIONS.yml` 因此当前**不可执行** |

**结论**：**缺陷 A（跟随软链、不剪枝、无深度上限）与缺陷 B（`list_repos` 漏传 `exclude_paths`）在现行代码中完整存在**，PyPI 0.4.0 与仓库 `main` 一致。§6 的方案本身有效，但需要**重新实施并入库**；在此之前，本文只能作为根因分析与实施方案记录，不能作为"已修复"的证据。

> 旁证：早期版本记录的操作路径为 `/Users/kong/...`，说明该修复当时只落在**另一台机器的本地工作树**，从未推送到远端。2026-10-01 的全仓审计对 monarbor 的 9/10 评分同样基于那份本地树。

---

## 1. 症状

在 infra4agent 根目录执行 `monarbor list`，命令以 Python 异常退出：

```
File ".../monarbor/config.py", line 125, in find_nested_monorepos     # ← 0.3.0 行号
    if not entry.is_dir() or entry.name.startswith("."):
OSError: [Errno 63] File name too long: '/Users/kong/projects/infra4agent/deepseek-harness/apps/cli/node_modules/@deepseek-ai/cordis/node_modules/@deepseek-ai/cordis-plugin-include/node_modules/@deepseek-ai/cordis/...'
```

路径在报错文本中重复 `@deepseek-ai/cordis/node_modules/@deepseek-ai/cordis-plugin-include/node_modules/` 数十轮后超出系统路径长度上限。

---

## 2. 影响面：哪些命令受影响

| 命令 | 修复前 | 原因 |
|------|--------|------|
| `monarbor status` / `pull` / `exec` / `checkout` / `clone` | ✅ 正常 | `walk_monorepos(root, recursive=False)`，不触发嵌套扫描 |
| `monarbor clone -r` / `status -r` / `pull -r` | ✅ 正常 | 嵌套扫描带 `exclude_paths`，已排除各顶层子仓目录 |
| **`monarbor list`** | ❌ **必然崩溃** | `list_repos` 无条件调用 `find_nested_monorepos(config.root)`，**不传 `exclude_paths`**（`cli.py:373`） |
| `monarbor list -r` | ❌ 崩溃 | 同上，且额外再扫一遍 |

---

## 3. 根因

`monarbor/config.py` 的 `find_nested_monorepos()` 承担「扫描子目录找嵌套 `mona.yaml`」职责，存在两个缺陷：

**缺陷 A —— 不剪枝、跟随符号链接（0.3.0 与 0.4.0 同在 `config.py:128`）**

```python
for entry in sorted(root.iterdir()):
    if not entry.is_dir() or entry.name.startswith("."):   # ← is_dir() 默认 follow symlinks
        continue
    ...
    nested.extend(find_nested_monorepos(entry, exclude))    # ← 无深度上限、无 node_modules 剪枝
```

- `entry.is_dir()` 默认跟随符号链接，而 deepseek-harness 的 workspace 包之间存在**互相引用的软链环**（实测确证）：

  ```
  vendor/cordis/node_modules/@deepseek-ai/cordis-plugin-include  →  ../../../include   （指向 vendor/include）
  vendor/include/node_modules/@deepseek-ai/cordis                →  ../../../cordis    （指回 vendor/cordis）
  ```

  `pnpm-workspace.yaml` 把 `vendor/*` 列为 workspace 包，并以 `link:` 覆盖互相引用，因此上述 `node_modules` 结构**只在安装依赖后出现**（见 §4 的潜伏性说明）。两个本地包各自把对方 link 进自己的 `node_modules`，形成 `cordis → include → cordis → …` 的**二元环**。每层都是软链，`Path.resolve()` 每次都解析回 `deepseek-harness/vendor/cordis`；递归没有环检测也没有深度上限。

- 没有 `node_modules` / `target` / `dist` / `.venv` 等构建目录剪枝，即便没有软链环也是全树暴走。

**缺陷 B —— `list_repos` 漏传 `exclude_paths`（0.3.0 `cli.py:280`，0.4.0 `cli.py:373`）**

```python
nested = find_nested_monorepos(config.root)   # ← 应为 find_nested_monorepos(config.root, exclude_paths=…)
```

`walk_monorepos()` 正确计算了排除集并传给扫描函数（`config.py:166`），但 `list_repos` 在打印树时又独立调用了一次**不带排除集**的扫描，于是递归进入已登记的子仓 `deepseek-harness/`，撞上缺陷 A。

### 3.1 为什么「软链环」不总是崩——ELOOP vs PATH_MAX 的竞赛

这是写回归测试时的关键坑，也是为何很多软链环不会暴露问题：

递归有两种终止方式，**只有第二种是故障**：

1. `stat` 因 **ELOOP**（POSIX 限制约 32 次软链解析）失败 → `is_dir()` 返回 `False` → 递归自然收敛。**不崩溃**，只是白跑若干层；
2. 路径字符串先撞上 **`PATH_MAX`** → `OSError [Errno 63]` → **崩溃**。

谁先发生取决于「每层路径增长量 vs ELOOP 上限」：

| 场景 | 每层增长 | 结果 |
|------|----------|------|
| 短名环（`alpha/peer` ↔ `beta/peer`） | ~5 字符 | ELOOP 先到 → 第 16 层收敛，**不崩** |
| deepseek-harness 真实结构（`node_modules/@deepseek-ai/cordis-plugin-include`） | ~45 字符 | PATH_MAX 先到 → **崩溃** |

因此**用短段名写的测试会是「假守卫」**——修复前也照样通过。回归测试必须刻意使用长段名才能复现故障。

---

## 4. 复现（修复前）

```bash
cd <infra4agent 根>
monarbor list          # → OSError: [Errno 63] File name too long
```

不依赖 CLI 的最小复现：

```bash
python3 -c "
from pathlib import Path
from monarbor.config import find_nested_monorepos
find_nested_monorepos(Path('<infra4agent 根>'))
"
```

> **潜伏性（2026-10-08 实测补充）**：在**未安装依赖**的干净 clone 上（无 `node_modules`，即不存在软链环），扫描**不会崩溃**——实测 3.53s 正常返回 `[]`。故障只在 `deepseek-harness/` 执行过 `pnpm install`（或任何在树内制造 `node_modules` 软链环的操作）之后才显现。因此"干净树上跑一遍没崩"**不能**作为缺陷不存在的证据；§3.1 的长段名测试是更可靠的守卫。

---

## 5. 为什么升级到 0.4.0 也没用

PyPI 上 `monarbor` 最新为 0.4.0。0.4.0 里的 PR #1（`fix/nested-monorepo-discovery-clean`）重写了嵌套发现，但只改了 `exclude_paths` 的语义（目录名集合 → 绝对路径集合），**两个缺陷都还在**：

| 缺陷 | 0.3.0 | 0.4.0 |
|------|-------|-------|
| A：剪枝/软链保护 | 无 | **仍无**（`config.py:128` 仍是裸 `entry.is_dir()`） |
| B：`list_repos` 传 `exclude_paths` | 漏传（`cli.py:280`） | **仍漏传**（`cli.py:373`） |

---

## 6. 修复方案（尚未入库）

monarbor 已登记为本大仓第 21 个子仓（`monarbor/`），修复应就地落在那里。**下列改动目前只存在于本文档，需要重新实施、提交并推送。**

### 6.1 代码改动

`monarbor/monarbor/config.py`

- 新增 `SKIP_SCAN_DIRS`：扫描时剪枝 `node_modules`、`vendor`、`target`、`dist`、`build`、`venv`、`__pycache__` 等依赖/构建目录（以 `.` 开头的目录本就已跳过）；
- 新增 `MAX_SCAN_DEPTH = 12`：递归深度上限兜底；
- 新增 `registered_repo_abs_paths(config)`：统一的「已注册子仓精确绝对路径集合」计算，供 `walk_monorepos` 与 `cli` 共用；
- 加固 `find_nested_monorepos`：**不跟随符号链接**（`entry.is_symlink()` 直接跳过，从根上断环）、剪枝、深度上限、不可读目录跳过而非中断整次扫描。

`monarbor/monarbor/cli.py`

- `list_repos` 改为传入 `exclude_paths=registered_repo_abs_paths(config)`——**缺陷 B 的正解**，不再递归进入已注册子仓；
- `clone -r` 复用同一 helper，去掉重复实现。

`monarbor/monarbor/__init__.py`（顺带修掉的版本漂移）

- `__version__` 从 0.3.0 同步到 0.4.0：上游 0.4.0 的 bump 提交只改了 `pyproject.toml`、漏改此处，而 `click.version_option` 读的是包内 `__version__`，导致 `monarbor --version` 在 0.4.0 上仍报 0.3.0；
- 新增 `monarbor/tests/test_version_consistency.py`，断言 `__version__` 与 `pyproject.toml` 一致，防止后续 bump 再次漏改。

### 6.2 回归测试（待补）

应新增 `monarbor/tests/test_nested_scan_safety.py`（8 个用例，独立文件、不改动上游 PR 的测试文件）：

- 长段名软链环不得崩溃（**修复前此用例崩溃**）
- 已注册子仓内含软链环时，`monarbor list` 不得崩溃（**修复前的崩溃最小复现**）
- `walk_monorepos -r` 同样不得崩溃
- 依赖目录 / `vendor` 下结构被剪枝
- 超过 `MAX_SCAN_DEPTH` 不再下探
- 普通子目录仍能被正常发现（不误伤主功能）
- 排除集是精确绝对路径（不误伤共享前缀的兄弟目录）

> 测试必须使用**长段名**制造软链环，否则会因 ELOOP 先到而成为"假守卫"（§3.1）。

### 6.3 预期验证结果

| 检查 | 基线（修复前） | 目标（修复后） |
|------|----------------|----------------|
| 测试 | 58 passed | 66 passed（+ 版本一致性用例 = 67） |
| CLI 复现 | `monarbor list` → 退出码 1，`OSError [Errno 63]` | 退出码 0，列出全部 21 个子仓 |
| 真实树扫描 | 干净 clone 上不崩（潜伏），装依赖后崩 | `find_nested_monorepos(infra4agent)` → `[]`，秒级返回 |
| `monarbor --version` | 误报 0.3.0（`__version__` 漂移） | 0.4.0 |

### 6.4 安装（本机）

```bash
pipx install --force <infra4agent 路径>/monarbor
```

注意：pipx 是**拷贝安装**（非 editable），改完子仓代码需要重新执行上面的命令才会生效。若本机没有 pipx，也可先用 `PYTHONPATH=<infra4agent 路径>/monarbor python3 -m monarbor ...` 直接跑源码。

---

## 7. 上游状态

- 上游 `jeffkit/monarbor` 已并入 PR #1 并发布 0.4.0，但**未覆盖软链环与剪枝**（见 §5）；`main` 上也不含本文 §6 的修复。
- 本仓修复可反向提 PR 给上游；在此之前，任何版本的 `monarbor`（含 PyPI 0.4.0）都带缺陷 A/B。
- ⚠️ 另有一份**旧 checkout** 在 `/Users/kong/projects/force-lab-b/infra/monarbor`（0.3.0、无修复，登记在 force-lab-b 大仓）。若从该路径安装，缺陷同样存在。

---

## 8. 时间线

| 日期 | 事件 |
|------|------|
| 2026-09-28 | 发现 `monarbor list` 在 infra4agent 崩溃；定位根因（缺陷 A + B）；实测 0.3.0 与 0.4.0 均未修 |
| 2026-09-28 | 在**另一台机器的本地工作树**实施修复方案（不跟软链 + 剪枝 + 深度上限 + `list_repos` 传排除集）并验证；该改动**未推送到远端** |
| 2026-10-01 | 全仓文档↔代码审计基于该本地树给 monarbor 打 9/10（结论对本地树成立，对远端仓库不成立） |
| **2026-10-08** | **复核勘误**：确认 `jeffkit/monarbor` 的 `main` 与全部远端 ref 均无 §6 改动（提交对象不存在、测试文件不存在、测试数仍 58、`__version__` 仍 0.3.0）；本文档与根 README / AGENTS / ARCHITECTURE 的"已修复"表述一并改为"未入库"；缺陷 A/B 仍待修复 |

**待办**：在 `monarbor` 子仓重新实施 §6 并推送，之后本文档 §0 的"未入库"状态才可撤销。
