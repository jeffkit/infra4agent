# PGE Flow 开发记录（已完成，历史存档）

> 创建：2026-08-04（session 中断时写，作为交接文档）
> 状态：**2026-08-04 同日完成**。本文档保留为历史教训记录；正文中的
> 「待修/下一步」均已解决，最终状态见下方摘要。

## 最终状态摘要（2026-08-04 晚）

pge flow（Planner-Generator-Evaluator）已在 **3 个仓端到端验证 land 成功**：

| 仓 | 技术栈 | 交付物（land commit） |
|---|---|---|
| lavs | TS+Python | FunctionExecutor 单元测试（`3e936ec`）|
| ilink-hub | Rust | queue 并发测试（`d037654d`）|
| im-agentproc | Rust | attachments 规范化 9 测试（`bea73be`）|

flowcast 侧最终代码（main 分支，按时间序）：
- `6c73c36` 全局错误捕获 + Evaluator scope 校验 + baseline 作用域修复
- `bb29103` scope guard + resume-fix 截断（**scope guard 部分已回退**，见下）
- `167eb23` 回退 scope guard + 加 baseline gate 健康检查（严格中止 / --allow-dirty-gates 跳过）
- `8bce9f7` --allow-dirty-gates 时 dirty gate 完全移除（而非降级 onFail）
- `0e57b6a` dashboard 功能整理提交（84 测试全过）

**关键教训（正文有完整推理）：**
1. **"Generator scope 蔓延"是误判**。查 claude 会话 jsonl（`~/.claude/projects/`）
   证实：Generator 改 Python 是被 resume-fix 的"修 ruff 报错"指令驱动的——真正
   根因是 **baseline 上有坏的 gate**（ruff 35 个 pre-existing error）。scope guard
   治的是不存在的问题，已回退。
2. **正确防御 = baseline gate 健康检查**：跑 pge 前先空跑 gates，baseline 就红的
   在严格模式直接中止（让人先修 baseline），或 --allow-dirty-gates 完全跳过。
3. **修 baseline 优先于跑 pge**：lavs ruff、ilink-hub breaking_changes.rs、
   im-agentproc clippy 的 baseline 修复都是跑 pge 前的必修课。
4. **claude 会话文件是可审计的真相源**：Generator 每个 tool call 都在
   `~/.claude/projects/<cwd-encoded>/<session-id>.jsonl`，排查问题先看它。

**运行要求：** 全局 flowcast 必须是本地源码版本（`flowcast/bin/flowcast.js`，
v0.7.2+）——npm 全局安装的旧版（v0.3.1）provider wiring 有 bug。flow 文件用
绝对路径传入（避免解析到 `~/.flowcast/flows/` 旧副本）。

---

# （以下为原始交接文档，历史存档）

## ⚡ 新 session 第一步：执行清理（自动）

上一个 session 在 lavs 仓留了 worktree 残留，可能导致 shell 卡死。
**新 session 开始后立即执行以下命令清理：**

```bash
cd /Users/kongjie/projects/infra4agent/lavs
git worktree prune
rm -rf .worktrees/pge-pge-1785817944054 .claude/ .flowcast/runs/pge-* .flowcast/pge/pge-*
git status --porcelain  # 确认输出为空（干净）
```

如果 `rm -rf` 报权限错，加 `sudo`。清理完确认 shell 正常后，再继续下面的修复工作。

> **触发方式**：用户对这个文件说"按 PGE-HANDOFF 继续"即可。

## 背景

为 flowcast 的 pge flow（Planner-Generator-Evaluator）建立跨语言 AI coding flow。
pge 是从「一句话需求 → 开发 → 验收」的自动化 flow，通过三件套配置
（.flowcast/gates.json + agents.json + hygiene.md）适配各子仓。

已完成 3 轮迭代，全部已 push。

## 已完成的工作（全部已 push 到 remote）

### 提交记录

| 仓 | commit | 内容 |
|---|---|---|
| flowcast | `9399f22` | pge 通用化 + 7 bug 修复 + worktree 隔离 + preserve/rescue + cross-provider review + CLAUDE_MODEL 修复 |
| lavs | `d8eac1f` | .flowcast 三件套（TS+Python 双端 SDK） |
| ilink-hub | `6d3252c` | .flowcast 三件套（Rust） |
| hil-mcp | `11f27d36` | .flowcast 三件套（Python 多包） |
| 大仓根 | `c2bb151` | coding-flow-supervise skill |

### flowcast 仓 pge.flow.js 当前能力

```
需求（一句话）
  ├─ Phase 0: preflight（captureBaseline + gitWorktreeAdd 创建隔离工作目录）
  ├─ Phase 1: Planner（需求 → spec → sprints，hygiene.md 注入）
  ├─ Phase 2: per-sprint loop（在 worktree 里）
  │   ├─ Generator 起草 contract → Evaluator 评审
  │   ├─ Generator 实现 → 质量门（gates.json）→ Evaluator 验收 → repair loop
  │   └─ 失败 → preserveScene（WIP commit + refs/preserve + diff + log）
  ├─ Phase 3a: cross-provider review（--reviewer-agent，VERDICT:PASS/NEEDS_FIX）
  ├─ Phase 3b: commit.land（worktree commit → cherry-pick 到 main）
  └─ cleanup：成功删 worktree，失败保留
```

### 已修复的 9 个 bug（详情见 flowcast git log）

1. resolveAgent 不注入 `__cli` → executor 永远 fallback 到 claude（根治）
2. `-planner`/`-evaluator` profile 找不到就崩 → 自动回退基础 profile
3. Planner 过度膨胀 → 收紧 prompt
4. Generator scope 蔓延 → 加 prompt 约束（**仍不够强，见下方待修 1**）
5. agent 调用卡死时 flow 永远 running → wall-clock failsafe（**未根治，见待修 2**）
6. golden-sample / codegen 模板同步 `__cli` 修复
7. .gitignore 全排除 .flowcast → 改为只排除 runtime 产物
8. lavs ruff gate autofix 崩溃 → 改 resume-fix
9. **CLAUDE_MODEL 不传** → provider 的 model 被 claude CLI 忽略（最新修复 `9399f22`）

## 验证结果

### 已验证通过 ✅

- worktree 隔离：Generator 改动只在 worktree，主仓全程干净（lavs 真实验证）
- deepseek-v4-flash 速度：单次调用 3.6 秒，比 minimax 快 3 倍
- Generator 产出质量：231 行测试，175 tests 全绿（lavs FunctionExecutor）
- dry-run 骨架跑通
- 全量测试 446/446 全绿
- Planner 不膨胀（1 sprint，收紧 prompt 生效）
- profile 回退（`--agent deepseek` 不报错）
- CLAUDE_MODEL 正确传递（deepseek-v4-flash 生效）

### 未验证通过 ⚠️

- **commit.land 端到端**：仍卡在 sprint loop（见下方「新发现的阻断问题」），没跑到 commit 阶段
- **cross-provider review**：同上，没到 review 阶段
- **preserve/rescue 命令**：部分验证（preserve ref + worktree 保留生效；`--land-preserve`/`--prune-preserve` 未单独验证）

## ✅ 原待修 1/2/3 全部已修（commit `6c73c36`，已 push）

> 本批修复于 2026-08-04 在 lavs 仓用 deepseek-v4-flash 端到端验证（见下方「验证日志」）。

### 待修 1：Generator scope 蔓延 → ✅ 已修（contract 谈判层）

**已修**：在 Evaluator 的 contract 评审 prompt（初评 + 再审）注入 scope 校验块，
把 goal 原文交给 Evaluator，超出 scope → agreed=false。位置：`pge.flow.js`
搜索 `scope 检查`。
**验证**：contract 的 C5/C7 现在会正确写明「仅新增测试文件、不改实现」。
**局限**：这只拦住了 contract 层的 scope。Generator 的 **build 行为** 仍会偏离
contract（实测仍改了 12 个 Python 文件）——这是更深的 build-time scope creep，
见下方「新发现待修 4」。

### 待修 2：agent 调用挂死 → ✅ 已修（根因并非 spawnCapture）

**已修**：在 dispatch 之前注册 `process.on('uncaughtException'/'unhandledRejection')`，
把原因（含 stack）写进 `cp.done`（state.json）+ stderr，并保留 worktree。
**验证根因**：交接文档怀疑是 spawnCapture 的 Promise 不 resolve——**实测不是**。
spawn.js 已有完整的 `exit`/`close`/`kill` failsafe，Promise 必 settle。真正原因是
异步路径抛 uncaughtException 时 node 默认崩掉、没机会落盘。加了 handler 后，
run pge-val-1785819383 的 `[claude] API Error: Connection closed mid-response`
被完整捕获并打印 stack（对比交接文档的「无 error 输出」）。

### 待修 3：清理 lavs 仓残留 → ✅ 已清理

lavs main 已干净（`git status` 空），worktree/run 产物/preserve ref 全部清除。

### 待修 3.5（新）：baseline 作用域 bug → ✅ 已修（验证中发现）

preserveScene 是顶层函数，引用 baseline，但 baseline 原先只在 main() 内声明，
闭包链走 module → 拿不到 → diff 导出报 `baseline is not defined`。
已把 `let baseline` 提到模块作用域（**必须在 dispatch 之前**，否则 TDZ：
`Cannot access 'baseline' before initialization`）+ null 守卫。

## 🔴 新发现的阻断问题（端到端 land 的真凶）

### 待修 4（高）：Generator build-time scope creep（真·阻断）

**现象**：goal 是「给 TS 的 FunctionExecutor 加单元测试，只加测试文件」，contract
也正确写明 C5「仅新增测试文件、不改实现」。但 Generator 在 turn-1 build 阶段**仍改了
12 个 Python 文件**（7 个实现 + 4 个测试 + types）。contract 谈判层的 scope 校验
拦不住 build 阶段的偏离。

**为什么致命**：lavs 的 `ruff` gate 在 main 上**本来就是坏的**（35 个 pre-existing
lint error，`cd sdk/python && uv run ruff check .` 即可复现）。Generator 一碰这些
Python 文件，`onFail: resume-fix` 就让 Generator 去修这 35 个无关的 lint error，
把整个 sprint budget（turn-1 ~11min、turn-2 ~11min、turn-3 被 wall-clock 砍）
耗在修无关代码上，永远到不了 verdict/land。

**两个独立的修法**（建议都做）：
1. **lavs 仓先修 ruff baseline**：`cd lavs/sdk/python && uv run ruff check --fix .`
   把 35 个 error 清掉并 commit。这样 gate 在 main 上就是绿的，Generator 碰了
   Python 文件也不会被无关 lint 拖死。这是**最低成本、立刻见效**的解法。
2. **pge 加 build-time scope 守卫**：在 Generator 的 build prompt 之后、跑 gate
   之前，加一个「git diff --name-only vs baseline」检查——如果改动的文件超出
   goal/contract 声明的 scope（如 goal 说 TS-only 却改了 .py），直接把超范围
   文件 `git checkout --` 还原，再跑 gate。比纯 prompt 约束更硬。

### 待修 5（中）：resume-fix 把整段 gate 输出灌进 prompt

makeResumeFix 把 failureOutput（实测可达 8KB+ 的 ruff 全量输出）整段塞进
Generator 的 repair prompt。deepseek 处理大 prompt 很慢（单轮 ~11min）。
建议截断到前 2KB + 提示「完整输出见 sprint-N-bugs.md」。

## 验证日志（2026-08-04）

| run-id | 结果 | 关键证据 |
|---|---|---|
| `pge-val-1785819383` | ❌ Connection closed mid-response（deepseek 网关瞬时错误） | 全局错误捕获生效：`[FATAL] uncaughtException` 打印完整 stack + preserve ref 创建 |
| `pge-v2-20260804-142837` | ❌ TDZ（baseline 放错位置） | `Cannot access 'baseline' before initialization` → 已修 |
| `pge-v3-20260804-143105` | ⚠️ wall-clock 30min 超时（turn-3 中途） | turn-1/2 各 11min 耗在 ruff resume-fix；TS 测试 165 pass、Python 49 pass、build pass 全绿；交付物 `function-executor.test.ts` 质量良好 |

**已验证通过的能力**（v3 run）：
- worktree 隔离（main 全程干净）
- wall-clock failsafe（30min 精准触发、写 state、打印恢复指令）
- Planner/Generator/Evaluator 全流程跑通（deepseek-v4-flash）
- 三件套质量门生效（build/test/py-test 全过，ruff 因 baseline 坏而失败）
- Generator 产出质量：新增 TS 测试编译过 + 165 tests 全绿


## 关键文件路径

- pge flow 主文件：`flowcast/examples/pge.flow.js`（~700 行）
- executor（resolveAgent/makeDefaultRun）：`flowcast/executor.js`
- spawnCapture：`flowcast/spawn.js`
- provider 翻译：`flowcast/provider.js`
- supervisor skill：`.zcode/skills/coding-flow-supervise/SKILL.md`
- recursive 参考实现：`recursive/.dev/flows/self-improve.flow.js`（2033 行，成熟参考）
- 各仓配置：`{lavs,ilink-hub,hil-mcp,flowcast}/.flowcast/{gates.json,agents.json,hygiene.md}`

## 运行环境

- provider：`deepseek`（anthropic-deepseek 网关，model=deepseek-v4-flash）
  - 在 `~/.flowcast/providers.json` 配置
  - API key 在 `~/.zshrc` 的 `DEEPSEEK_API_KEY`（需 `source ~/.zshrc` 加载）
- claude CLI：2.1.205（brew 安装，`/opt/homebrew/bin/claude`）
- node：v20.19.3（flowcast 用）/ v24.3.0（系统默认）

## 下一步建议

> 原待修 1/2/3 已全部完成（commit `6c73c36`）。下面的步骤是**打通端到端 land**。

1. **先做待修 4a（最低成本）**：`cd lavs/sdk/python && uv run ruff check --fix .`
   清掉 35 个 pre-existing ruff error 并 commit 到 lavs main。这样 ruff gate
   在 baseline 就是绿的，Generator 碰 Python 文件也不会被无关 lint 拖死。
2. **重跑验证**：用同一个 goal 在 lavs 跑一轮 pge（命令见下方「重跑命令」），
   这次应能 sprint 通过 → cross-provider review → commit.land 到 main。
3. **若仍 scope 蔓延**：做待修 4b（pge 加 build-time git-diff scope 守卫）。
4. **验证通过后**：把成熟的 pge + skill 推广到其余子仓（ilink-hub/hil-mcp）。

## 重跑命令（关键：用本地 flowcast bin + 显式 flow 文件路径）

> ⚠️ **重要**：全局安装的 `flowcast` 是 **v0.3.1（旧）**，provider/env wiring 有 bug
> （claude executor 不读 opts.env → "Not logged in"）。**必须用本地 flowcast bin**
> （`flowcast/bin/flowcast.js`，v0.7.2）跑，且把 pge.flow.js 作为**文件路径**传入
> （否则 `flowcast run pge` 会解析到 `~/.flowcast/flows/pge.js` 的旧副本）。

```bash
cd /Users/kongjie/projects/infra4agent/lavs
source ~/.zshrc 2>/dev/null   # 加载 DEEPSEEK_API_KEY
export PGE_WALL_CLOCK_MS=1800000   # 30min wall-clock failsafe
FLOWCAST=/Users/kongjie/projects/infra4agent/flowcast/bin/flowcast.js
PGE_FLOW=/Users/kongjie/projects/infra4agent/flowcast/examples/pge.flow.js
RUN_ID="pge-$(date +%Y%m%d-%H%M%S)"
node $FLOWCAST run $PGE_FLOW \
  --goal "给 sdk/typescript/runtime 的 FunctionExecutor 增加单元测试，覆盖 call() 方法在参数为空数组时的行为。只加测试文件，不要改任何现有实现代码。" \
  --agent deepseek --repo . --run-id "$RUN_ID" --max-sprints 2 --max-rounds 3
```

## 环境备忘

- 全局 `flowcast`（v0.3.1）已过期；本地 `flowcast/`（v0.7.2）是当前源。考虑
  `cd flowcast && npm link` 或 `npm install -g .` 更新全局，省得每次写全路径。
