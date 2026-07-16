# 文档 ↔ 代码映射

> 最后更新：2026-07-16

大仓根只管理配置与导航文档；子仓源码在各自 git 仓库中（见 `.gitignore`）。

| 文档 | 代码路径模式 | 说明 |
|------|----------------|------|
| `README.md` | `mona.yaml` | 人类向总览与子仓表；清单以 mona.yaml 为准 |
| `AGENTS.md` | `mona.yaml`, `docs/ARCHITECTURE.md` | AI 入仓导航；跨仓结构指向架构文档 |
| `docs/ARCHITECTURE.md` | `mona.yaml` | 大仓分层、子仓角色与依赖关系；子仓清单以 mona.yaml 为准 |
| `docs/ARCHITECTURE.md` | `.gitignore` | 子仓目录排除规则须与 mona.yaml 中 path 对齐 |
| `mona.yaml` | 各 `*/` 子仓根（本地 clone） | path / repo_url / description / tech_stack / branches |
| 各子仓 `AGENTS.md` | 对应子仓源码树 | 仓内导航；不在大仓 git 追踪范围内 |
