# Self-Improve 周期审查：可复用提示词

> 这是一份**给 ZCode agent 的提示词模板**，用于驱动"架构 review → goal 生成 →
> self-improve 迭代"的完整周期。每次（或定期）启动新会话时，把下方的【提示词】
> 整段发给 agent 即可。
>
> 这份模板提炼自 2026-08-01 ~ 08-02 的实战，那天用这个模式跑了 4 轮、落地了 17 个
> goal（353-369）。配套的 supervisor skill 在
> [`.zcode/skills/self-improve-supervise/SKILL.md`](https://github.com/jeffkit/recursive/blob/main/.zcode/skills/self-improve-supervise/SKILL.md)。

---

## 【提示词】——整段复制发给 agent

```
请作为 Supervisor 带跑 Recursive 的 self-improve 周期。先做架构 review 找问题，
转成 goal，再用 self-improve flow 迭代推进。

## 你要做什么

1. 先加载 self-improve-supervise skill（它会给你完整的 SOP）。
2. 对 recursive 仓库（~/projects/infra4agent/recursive）做一轮架构 review，
   找出当前最值得修的问题。
3. 把发现拆成 goal（一个 goal 聚焦一个改动），按优先级排序。
4. 逐个用 self-improve flow 推进，每个 goal 跑完后独立验证再启动下一个。
5. 全部跑完后汇报成果。

## 架构 review 的方法

不要只看表面。用 Explore 子 agent 并行铺开 3-4 路深度审查，每路一个角度：

- 角度参考：架构不变量违反 / 并发与资源管理 / 错误处理一致性 /
  配置与初始化健壮性 / 边界条件与 panic / 测试覆盖盲区 / 文档与示例正确性 /
  性能热路径 / CLI 与用户体验。每轮选 3-4 个还没深挖的角度。

- 每路子 agent 要求：产出带 file:line 证据的 P0 清单，区分"真 bug"和"改进项"。
  让它给具体的修复方向，不要泛泛而谈。

- 子 agent 回来后，亲自核验最关键的 2-3 个发现（读代码确认真伪），
  再决定写哪些 goal。

## goal 的质量标准

每个 goal 文件必须包含：
- **Design principle check**：声明不违反不变量 #1（不分支 run_inner）
- **Why**：根因 + file:line 证据
- **Scope**：编号步骤 + 代码片段，"do exactly this, no more"
- **Files NOT to touch**：明确列出禁区
- **Acceptance**：精确的 gate 命令 + grep 可验证的检查
- **Notes for the agent**：陷阱（API 签名、顺序约束、不变量）

agent 只看 goal 文本——含糊的 goal 会烧 fix-round。看最近同类 goal 的格式参考。

## 迭代节奏

- 一次 batch 写 3-5 个 goal 文件，全部提交后逐个启动。
- 故意混 scope：纯测试/docs 的 goal（e2e gate 秒过）+ src/ 改动的 goal
  （触发 docker build）交替，保持节奏。
- 每个 goal 用后台轮询监控到终态，不要 foreground babysit。
- verdict=committed 的独立验证产品；verdict=failed-preserved 的判断是否是
  watchdog 误杀（g353 教训），是的话 cherry-pick 救回。
- 不要 push 除非我明确要求。

## 优化提示（已落地，你受益）

- e2e gate 的 docker build 已用 cargo-chef 优化：src/ 改动 ~1min（不是 25min）。
- 纯测试/docs goal 的 e2e gate 跳过（435ms）。
- 跑前确认 colima 资源够：colima ls 看 CPU ≥ 6。

## 开始于

加载 self-improve-supervise skill，然后开始架构 review。先告诉我你打算从哪几个
角度审查、预计写几个 goal，让我确认方向后再动手。
```

---

## 怎么用这份提示词

### 日常触发（手动）

开一个新 ZCode 会话，把上方【提示词】整段粘贴发送。agent 会：
1. 加载 skill 获取完整 SOP
2. 汇报它选的审查角度 + 预计 goal 数（等你确认）
3. 确认后开始 review → 写 goal → 逐个迭代

### 定期触发（自动化，可选）

如果你想每周自动跑一轮，用 ZCode 的定时任务：

```
# 示例：每周一早 9 点触发一轮审查
# 在 ZCode 里设置 scheduled automation
```

或用 cron + 一个启动脚本，定期开 ZCode 会话并喂入提示词。

### 调整审查深度

- **快速扫**（1-2 小时）：2 路子 agent，写 2-3 个 goal
- **标准轮**（半天）：3-4 路子 agent，写 3-5 个 goal（默认）
- **深度审**（一整天）：4 路子 agent + 亲自逐个核验，写 5-8 个 goal

在提示词里改"3-4 路"和"3-5 个 goal"的数字即可。

---

## 已积累的经验（agent 加载 skill 后会自动读到）

self-improve-supervise skill 里已沉淀 18 条 Discipline 教训，关键几条：

1. e2e gate 是成本中心——纯测试 goal 跳过（435ms），src/ goal ~1min（cargo-chef）
2. `failed-preserved` ≠ 代码坏——watchdog 可能误杀，改动在 preserve ref 可救回
3. `gate.e2e.fix-1` 是 agent 自愈，不要干预
4. 工作树 dirty guard 有两层（launch-flow + flowcast 内部），保持树干净
5. 后台轮询到终态，不要 foreground babysit
6. 按名验证 goal 的 headline test，不只看套件绿
7. goal 文件要无歧义——agent 只看 goal 文本
8. 按 leverage 排序 goal，混 scope

完整的 18 条在
[SKILL.md 的 Discipline 章节](https://github.com/jeffkit/recursive/blob/main/.zcode/skills/self-improve-supervise/SKILL.md)。

---

## 这份模板的设计原则

1. **角色清晰**：明确告诉 agent 它是 Supervisor，不是直接写代码——它的职责是
   review + 写 goal + 监控 + 验证。
2. **方法具体**：不只说"做 review"，而是给出"用 Explore 子 agent 并行 + 每路一个角度
   + 亲自核验关键发现"的具体方法。
3. **goal 质量门槛**：列出 goal 文件必须包含的 6 个段落，避免含糊 goal 烧 fix-round。
4. **节奏可控**：让 agent 先汇报方向再动手（避免它跑偏），混 scope 保持效率。
5. **复用安全**：不绑定特定一轮的发现——每次跑都扫当时的问题。
6. **承接已有 skill**：提示词让 agent 加载 self-improve-supervise skill，复用已沉淀的
   18 条教训，不用在提示词里重复。

---

## 历史战绩（供参考）

| 日期 | 轮次 | goal 数 | 主题 | commit 范围 |
|---|---|---|---|---|
| 2026-08-01 | 第 1 轮 | 6（353-358） | 不变量违反 + 依赖安全 + 测试盲区 + 发布一致性 | `5fdbead`~`6e954be` |
| 2026-08-01 | 第 2 轮 | 4（359-362） | AG-UI 正确性 + 资源泄漏 + HTTP 状态 + 多 agent 测试 | `d3f7ca6`~`c89e082` |
| 2026-08-02 | 第 3 轮 | 4（363-366） | CLI 退出码 + 配置静默错误 + 边界 panic + OOM 防护 | `8702bf7`~`c9c2211` |
| 2026-08-02 | 第 4 轮 | 3（367-369） | Grep OOM + token 估算 + 文档准确性 | `ec54089`~`68ff7a1` |

每轮 ~3-5 个 goal，从 review 到全部落地 + push 约 2-4 小时（e2e docker build 提速后）。
