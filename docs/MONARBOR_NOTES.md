# monarbor 工具：软链环崩溃的根因与修复

> 最后更新：2026-09-28  
> 状态：**已修复**（修复落在本大仓子仓 `monarbor/`，不再依赖上游 PyPI 版本）  
> 影响版本：0.3.0 与 0.4.0 **上游均未修复**；本仓修复基于 0.4.0  
> 触发仓库：`deepseek-harness`（其 `vendor/cordis` 与 `vendor/include` 两个本地 vendor 包**互为软链**）

---

## 1. 症状（修复前）

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
| **`monarbor list`** | ❌ **必然崩溃** | `list_repos` 无条件调用 `find_nested_monorepos(config.root)`，**不传 `exclude_paths`** |
| `monarbor list -r` | ❌ 崩溃 | 同上，且额外再扫一遍 |

> 修复后 `monarbor list` 正常（实测 0.66s，退出码 0，列出全部 21 个子仓）。

---

## 3. 根因

`monarbor/config.py` 的 `find_nested_monorepos()` 承担「扫描子目录找嵌套 `mona.yaml`」职责，存在两个缺陷：

**缺陷 A —— 不剪枝、跟随符号链接（0.3.0 与 0.4.0 均在 `config.py:120`）**

```python
for entry in sorted(root.iterdir()):
    if not entry.is_dir() or entry.name.startswith("."):   # ← is_dir() 默认 follow symlinks
        continue
    ...
    nested.extend(find_nested_monorepos(entry, exclude))    # ← 无深度上限、无 node_modules 剪枝
```

- `entry.is_dir()` 默认跟随符号链接，而 deepseek-harness 的本地 vendor 包之间存在**互相引用的软链环**（实测确证）：

  ```
  vendor/cordis/node_modules/@deepseek-ai/cordis-plugin-include  →  ../../../include   （指向 vendor/include）
  vendor/include/node_modules/@deepseek-ai/cordis                →  ../../../cordis    （指回 vendor/cordis）
  ```

  两个本地包各自把对方 link 进自己的 `node_modules`，形成 `cordis → include → cordis → …` 的**二元环**。每层都是软链，`Path.resolve()` 每次都解析回 `deepseek-harness/vendor/cordis`；递归没有环检测也没有深度上限。

- 没有 `node_modules` / `target` / `dist` / `.venv` 等构建目录剪枝，即便没有软链环也是全树暴走。

**缺陷 B —— `list_repos` 漏传 `exclude_paths`（0.3.0 `cli.py:280`，0.4.0 `cli.py:373`）**

```python
nested = find_nested_monorepos(config.root)   # ← 应为 find_nested_monorepos(config.root, exclude_paths=…)
```

`walk_monorepos()` 正确计算了排除集并传给扫描函数，但 `list_repos` 在打印树时又独立调用了一次**不带排除集**的扫描，于是递归进入已登记的子仓 `deepseek-harness/`，撞上缺陷 A。

### 3.1 为什么「软链环」不总是崩——ELOOP vs PATH_MAX 的竞赛

这是写回归测试时踩到的关键坑，也是为何很多软链环不会暴露问题：

递归有两种终止方式，**只有第二种是故障**：

1. `stat` 因 **ELOOP**（POSIX 限制约 32 次软链解析）失败 → `is_dir()` 返回 `False` → 递归自然收敛。**不崩溃**，只是白跑若干层；
2. 路径字符串先撞上 **`PATH_MAX`** → `OSError [Errno 63]` → **崩溃**。

谁先发生取决于「每层路径增长量 vs ELOOP 上限」：

| 场景 | 每层增长 | 结果 |
|------|----------|------|
| 短名环（`alpha/peer` ↔ `beta/peer`） | ~5 字符 | ELOOP 先到 → 第 16 层收敛，**不崩** |
| deepseek-harness 真实结构（`node_modules/@deepseek-ai/cordis-plugin-include`） | ~45 字符 | PATH_MAX 先到 → **崩溃** |

因此**用短段名写的测试会是「假守卫」**——修复前也照样通过。仓库里的回归测试刻意使用长段名复现故障。

---

## 4. 复现（修复前）

```bash
cd /Users/kong/projects/infra4agent
monarbor list          # → OSError: [Errno 63] File name too long
```

不依赖 CLI 的最小复现（0.4.0 解包源码实测同样崩溃）：

```bash
python3 -c "
from pathlib import Path
from monarbor.config import find_nested_monorepos
find_nested_monorepos(Path('/Users/kong/projects/infra4agent'))
"
```

---

## 5. 为什么升级到 0.4.0 也没用

PyPI 上 `monarbor` 最新为 0.4.0（此前本机 pipx 装的是 0.3.0）。0.4.0 里的 PR #1（`fix/nested-monorepo-discovery-clean`）重写了嵌套发现，但只改了 `exclude_paths` 的语义（目录名集合 → 绝对路径集合），**两个缺陷都还在**：

| 缺陷 | 0.3.0 | 0.4.0 |
|------|-------|-------|
| A：剪枝/软链保护 | 无 | **仍无**（`config.py:128` 仍是裸 `entry.is_dir()`） |
| B：`list_repos` 传 `exclude_paths` | 漏传（`cli.py:280`） | **仍漏传**（`cli.py:373`） |

---

## 6. 修复（已实施）

monarbor 已登记为本大仓第 21 个子仓（`monarbor/`），修复就地落在这里。

### 6.1 代码改动

`monarbor/monarbor/config.py`

- 新增 `SKIP_SCAN_DIRS`：扫描时剪枝 `node_modules`、`vendor`、`target`、`dist`、`build`、`venv`、`__pycache__` 等依赖/构建目录（以 `.` 开头的目录本就已跳过）；
- 新增 `MAX_SCAN_DEPTH = 12`：递归深度上限兜底；
- 新增 `registered_repo_abs_paths(config)`：统一的「已注册子仓精确绝对路径集合」计算，供 `walk_monorepos` 与 `cli` 共用；
- 加固 `find_nested_monorepos`：**不跟随符号链接**（`entry.is_symlink()` 直接跳过，从根上断环）、剪枝、深度上限、不可读目录跳过而非中断整次扫描。

`monarbor/monarbor/cli.py`

- `list_repos` 改为传入 `exclude_paths=registered_repo_abs_paths(config)`——**缺陷 B 的正解**，不再递归进入已注册子仓；
- `clone -r` 复用同一 helper，去掉重复实现。

### 6.2 回归测试

新增 `monarbor/tests/test_nested_scan_safety.py`（8 个用例，独立文件、不改动上游 PR 的测试文件）：

- 长段名软链环不得崩溃（**修复前此用例崩溃**）
- 已注册子仓内含软链环时，`monarbor list` 不得崩溃（**修复前的崩溃最小复现**）
- `walk_monorepos -r` 同样不得崩溃
- 依赖目录 / `vendor` 下结构被剪枝
- 超过 `MAX_SCAN_DEPTH` 不再下探
- 普通子目录仍能被正常发现（不误伤主功能）
- 排除集是精确绝对路径（不误伤共享前缀的兄弟目录）

### 6.3 验证结果

```
修复前：  58 passed
修复后：  66 passed
修复前 CLI 复现：monarbor list → 退出码 1，OSError [Errno 63] File name too long
修复后真实树扫描：find_nested_monorepos(infra4agent) → [] ，耗时 0.064s
修复后 CLI：      monarbor list → 退出码 0，0.66s，21 个子仓全部列出
```

### 6.4 安装（本机）

```bash
pipx install --force /Users/kong/projects/infra4agent/monarbor
```

注意：pipx 是**拷贝安装**（非 editable），改完子仓代码需要重新执行上面的命令才会生效。

---

## 7. 上游状态

- 上游 `jeffkit/monarbor` 已并入 PR #1 并发布 0.4.0，但未覆盖软链环与剪枝（见 §5）。
- 本仓修复可反向提 PR 给上游；在此之前，本机命令以子仓 `monarbor/` 的代码为准。
- ⚠️ 另有一份**旧 checkout** 在 `/Users/kong/projects/force-lab-b/infra/monarbor`（0.3.0、无修复，登记在 force-lab-b 大仓）。本机 pipx 此前正是从那里安装的；若从该路径重装，缺陷会回来。

---

## 8. 时间线

| 日期 | 事件 |
|------|------|
| 2026-09-28 | 发现 `monarbor list` 在 infra4agent 崩溃；定位根因（缺陷 A + B）；实测 0.3.0 与 0.4.0 均未修 |
| 2026-09-28 | 登记 `monarbor` 为本大仓第 21 子仓，就地在源码层修复 + 8 个回归测试；pipx 重装自子仓路径并验证 |
