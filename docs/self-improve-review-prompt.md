# Self-Improve 周期审查：使用指南

> 定期对 recursive 代码库做"架构 review → 生成 goal → self-improve 迭代"的完整周期。
> 2026-08-01~02 的实战提炼——那天跑了 4 轮、落地 17 个 goal（353-369）。

---

## 怎么触发

### 方式 1：用 skill（推荐）

在 ZCode 会话里输入：

```
/self-improve-cycle
```

或自然语言：

```
找问题跑自迭代
```

ZCode 会自动加载 [`self-improve-cycle`](https://github.com/jeffkit/recursive/blob/main/.zcode/skills/self-improve-cycle/SKILL.md)
skill，执行完整周期：review → 写 goal → 迭代 → 验证 → 沉淀经验 → 汇报。

skill 会先告诉你"我打算从这几个角度审查、预计写几个 goal"，等你确认方向后再动手。

### 方式 2：定时自动化（定期扫描）

用 ZCode 的定时任务（`CronCreate`）周期触发。例如每周一早 9 点：

```
CronCreate:
  cron: "0 9 * * 1"
  title: "每周 self-improve 审查周期"
  prompt: "对 ~/projects/infra4agent/recursive 做 self-improve-cycle：架构 review 找问题，写成 goal，用 self-improve flow 迭代推进。先告诉我你选的审查角度和预计 goal 数，等我确认。"
```

或用系统 cron + 脚本定期开 ZCode 会话。

---

## 调审查深度

触发后告诉 agent 你想要的深度：

| 模式 | 子 agent 数 | 预计 goal 数 | 耗时 | 适用 |
|---|---|---|---|---|
| **快速扫** | 2 路 | 2-3 个 | ~1-2 小时 | 日常健康检查 |
| **标准轮**（默认） | 3-4 路 | 3-5 个 | ~2-4 小时 | 周期性维护 |
| **深度审** | 4 路 + 逐个核验 | 5-8 个 | ~半天 | 大改动后 / 发版前 |

---

## 并发加速

skill 支持并发跑独立 goal（不同 worktree + tmux session）。默认安全规则：

- **纯测试/docs goal**（e2e 跳过）可以并发——最多 3 个同时
- **src/ 改动 goal**（触发 e2e）**只能单独跑**——因为 e2e 容器名 `recursive-e2e` +
  端口 8080 是固定的，两个并发 e2e gate 会撞容器名/端口
- **推荐模式**：1 个 src/ goal + 1-2 个 tests/docs goal 并发——tests goal 秒过，
  src/ goal 的 docker build 跑着，互不干扰

skill 内部有完整的并发决策树，会自动判断哪些 goal 可以并发。

---

## 经验自动沉淀

每次周期结束后，skill 会**自动把新学到的教训写回** `self-improve-supervise/SKILL.md`
的 Discipline 章节。这是让 supervisor 跨会话越来越聪明的机制——下一个会话的 agent
加载 skill 时就能读到。

沉淀的内容格式：触发条件 + 症状 + 应对动作 + 来源 incident（goal 号 + commit）。
只记真实碰到的，不编造。

---

## 已有的两个 skill

| skill | 职责 | 触发 |
|---|---|---|
| [`self-improve-supervise`](https://github.com/jeffkit/recursive/blob/main/.zcode/skills/self-improve-supervise/SKILL.md) | 单个 goal 的端到端监督（launch → poll → verdict → rescue） | "跑这个 goal" |
| [`self-improve-cycle`](https://github.com/jeffkit/recursive/blob/main/.zcode/skills/self-improve-cycle/SKILL.md) | 完整周期（review → 多 goal 迭代 → 沉淀） | "找问题跑自迭代" / `/self-improve-cycle` |

cycle 加载 supervise，supervise 承载 18 条已沉淀的 Discipline 教训。

---

## 历史战绩

| 日期 | 轮次 | goal 数 | 主题 |
|---|---|---|---|
| 2026-08-01 | 第 1 轮 | 6（353-358） | 不变量违反 + 依赖安全 + 测试盲区 + 发布 |
| 2026-08-01 | 第 2 轮 | 4（359-362） | AG-UI 正确性 + 资源泄漏 + HTTP 状态 + 多 agent 测试 |
| 2026-08-02 | 第 3 轮 | 4（363-366） | CLI 退出码 + 配置静默错误 + 边界 panic + OOM |
| 2026-08-02 | 第 4 轮 | 3（367-369） | Grep OOM + token 估算 + 文档准确性 |

每轮 ~3-5 个 goal，e2e 提速后约 2-4 小时完成。
