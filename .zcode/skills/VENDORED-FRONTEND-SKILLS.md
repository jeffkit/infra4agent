# Vendored Frontend Skills — 来源与许可

本目录下 6 个前端 skill 为 2026-08-29 从上游收编（vendor），用于 plaita-console 等 Web 界面的美化与升级。
升级方式：对照下列上游地址重新拉取覆盖。

| Skill | 上游 | 许可 | 说明 |
|---|---|---|---|
| `frontend-design` | https://github.com/anthropics/skills（skills/frontend-design） | Apache 2.0（见目录内 LICENSE.txt） | 定美学方向、建 token、反 AI 俗套 |
| `impeccable` | https://github.com/pbakaus/impeccable（.agent/skills/impeccable, v4.1.2） | Apache 2.0（见目录内 LICENSE） | slop 审计 + polish 精修，Operate 模式针对 dashboard；scripts/ 为其 Live Mode 依赖 |
| `better-ui` | https://github.com/jakubkrehel/skills（skills/better-ui） | 见上游 repo license | 微观工艺：同心圆角/阴影/光学对齐/动效克制 |
| `improve-animations` | https://github.com/emilkowalski/skills（skills/improve-animations） | MIT（见目录内 LICENSE） | 动效审计 → 优先级路线图，只出计划不改码 |
| `web-design-guidelines` | https://github.com/vercel-labs/agent-skills（skills/web-design-guidelines） | 上游未附 LICENSE（内容源为 vercel.com/design/guidelines） | 运行时拉取 100+ 条验收规则做 UI 合规审查 |
| `plaita-console-design` | 本仓自建 | — | plaita-console 专属 playbook，指向 plaita/plaita-console/DESIGN.md |

分工：`frontend-design`（定方向）→ `plaita-console-design`（流程编排）→ `impeccable` / `better-ui`（执行精修）→ `improve-animations`（动效专项）→ `web-design-guidelines`（验收）。
