---
type: Skill
name: plaita-console-design
description: "plaita-console（React 18 + Vite + Tailwind 3.4 的流程引擎 Web 控制台，位于 plaita/plaita-console）界面美化与升级的专属 playbook。已定案混合式设计方向：UI 文本用 Inter 无衬线，数据/日志/ID/指标用 JetBrains Mono；纯色分层灰阶背景 + 受控品牌绿 + 语义状态色。Use when the user wants to 美化/升级/plish plaita console、控制台界面、加高级感、改 plaita 前端视觉。DESIGN.md 是唯一视觉权威：先读它，token 先行，基元先于页面，改完必须截图留档。"
mode: trigger
triggers: plaita console, plaita 界面, console 美化, 控制台美化, console 升级, plaita 前端, 界面高级感
---

# plaita-console-design — 控制台美化升级 playbook

对象：`plaita/plaita-console/frontend`（React 18 + Vite + TS + Tailwind 3.4 + React Flow + lucide）。
改动全部落在 plaita 子仓内提交；大仓不动。

## 视觉权威

`plaita/plaita-console/DESIGN.md` 是唯一视觉权威。动手前先读它；任何与它冲突的现状都是待改项，任何它没定义的新颜色/字号/圆角必须先补进 token 再使用。禁止在组件里写一次性 hex。

## 协作 skill 分工（均已 vendor 在 ../ 下）

| 阶段 | 用哪个 |
|---|---|
| 定/改设计方向、写宣言 | `frontend-design` |
| 存量页面 slop 审计与精修 | `impeccable`（Operate 模式，尊重既有 token） |
| 组件微观工艺（圆角/阴影/对齐/hover） | `better-ui` |
| 动效审计与路线图 | `improve-animations`（只出计划，另由你执行） |
| 验收合规审查 | `web-design-guidelines` |

不要一次全加载：按当前阶段加载对应的那一个。

## 工作流（顺序固定）

1. **审计**：对目标页面跑 impeccable 的 `audit` 视角 + DESIGN.md 反模式清单，产出 findings 列表（file:line + 违反条目）。
2. **Token 先行**：缺的语义 token 先补 `tailwind.config.js` / `index.css`，再动组件。
3. **基元先于页面**：高频基元（Card / StatusBadge / Button / PageHeader / Table / EmptyState）沉淀到 `src/components/ui/`，页面只准消费基元与 token，不准自带配方。
4. **逐页精修**：一次只动一个 surface（一个页面或一个组件族）。优先级：Dashboard → Flows/FlowEditor → ExecutionDetail/Logs → 其余。
5. **动效**：在静态层验收后做，遵循 DESIGN.md 动效规范；复杂审计交给 `improve-animations`。
6. **验收**（每页必做，缺一不可）：
   - 起 dev server（`cd plaita/plaita-console/frontend && pnpm dev`，后端可不启，空态即验收态之一）；
   - 用 browser-use 截图 1440px 宽整页，存 `plaita/plaita-console/docs/design-shots/<page>-<before|after>.png`；
   - 对照 DESIGN.md 验收清单逐项打勾；
   - 涉及合规/可访问性时跑 `web-design-guidelines`。

## 硬约束

- 混合式排版是定案：正文/导航 Inter；执行 ID、日志、时间戳、指标数字、代码一律 JetBrains Mono + `tabular-nums`。不得回退为全等宽或全无衬线。
- 品牌绿只出现在 DESIGN.md 允许的位置；见到渐变文字、渐变背景、装饰性 glow 一律移除。
- 新颜色先入 token；Tailwind 类与 DESIGN.md 必须能互相对上。
- 每次改动保持可独立提交：一页一 commit 粒度，改前截图先留档再动手。
