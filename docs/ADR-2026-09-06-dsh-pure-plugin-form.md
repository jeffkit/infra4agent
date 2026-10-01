# ADR: DSH×LAVS 转纯插件形态——废弃 fork 路线

- 日期：2026-09-06
- 状态：已接受（Accepted）
- 关联：[ADR-2026-08-16-lavs-not-now.md](./ADR-2026-08-16-lavs-not-now.md)（原"暂不整合"决议，本文推翻其"不进 dsh"前提）、`dsh-lavs-integration/`（落地物，已登记为大仓子仓，见 mona.yaml）

## 决策

**停止维护 deepseek-harness fork 分支（feat/headless-resume）作为集成载体**，将全部集成物
（LAVS host 适配、Views/Tasks 两个 client tab、headless --resume runner）迁移为**仓外纯插件**，
经由 DSH 官方扩展机制挂载：

1. **Profile bundle**：`dsh.profile.bundles` 追加我们的 bundle（`dsh-bundle-lavs` /
   `dsh-bundle-headless-resume`），bundle 声明 `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`
2. **插件 insert**：bundle patch 层 insert 三个插件；headless 变体按 id disable 原生
   `headless-startup`/`headless-runner` 后插入同名服务形状的替身
3. **动态 client module**：client 包声明 `dsh.client`，宿主运行时从 `/plugins/<id>/client.js`
   serve，**上游前端无需任何构建介入**
4. **用户 patch 层**：`~/.dsh/profiles/<name>/cordis.patch.yml`（HMR 生效）承载部署个性化配置

## 背景

- 8/16 当晚曾在 fork 分支落地 LAVS 全双向集成（6 提交，验证通过），但上游 PR 通道持续关闭
  （issues 停用、pulls API 404），fork 需要周期性 rebase（实测上游 3 周落 328 个 first-parent 合并）。
- 2026-09-06 完成 rebase 演练（`reh/rebase-upstream-2026-09-06` 分支）：7 提交全部 replay 上
  0.1.3-alpha.1，冲突 3 处，typecheck/单测全绿——fork 路线可行但成本 recurring，且上游
  `app-boot` 的 profile 机制成熟度已足以承载仓外插件，故转轨。

## 依据（2026-09-06 实测）

- `@deepseek-ai/dsh-*` npm 公开同步发布（锚定 `0.1.2-rc.1`；latest 标签滞后需显式版本），
  `@deepseek-ai/dsh` bin 可用
- `dsh plugin --profile <n> add <pkg>` 官方建 profile 路径 + `dsh.profile.bundles` 两锚解析
- 独立仓 `dsh-lavs-integration`：4 包 2 bundle，typecheck 全绿、8 产物构建成功
- `dsh --profile lavs` 真实启动成功，装配树含三插件；`/lavs-view/todo-list/view/index.html`
  经我们 lavs-host 返回 200
- `headless-rs` profile：`--help`/错误路径均为我们 runner（原生无 `--resume`，证明替换生效）
- 用户 patch 层热重载实战验证（禁用 `ui-settings-models` 跳过 onboarding 门）
- 待办：浏览器端 Views tab 点击级验证（被"添加工作区"原生目录选择器挡住，需人工一次）

## 版本锚定

- 类型源：devDeps `link:` 指 dsh git master 构建产物（0.1.3 特有 API：`ctx.sessions`、
  `rpc.handle` 两参、`brandString<SessionId>`）；0.1.3-alpha.1 上 npm 后切回 npm 版本
- `@deepseek-ai/cordis` 必须与类型源同物理实例，否则 `declare module` 扩增失效（关键坑）
- API 漂移台账见 `dsh-lavs-integration/README.md`

## 后果

- **fork 分支封存**：`feat/headless-resume`（推送至 jeffkit fork）与本地 rebase 演练分支留档
  不再演进；`submit-pr.sh`（等上游开 PR 通道）随之作废，除非上游原生实现 --resume（届时删
  我们的 runner bundle 即可）
- 升级模型从「git rebase 全仓」变为「npm 升版本 + 修自己包的编译错」，可进 CI、时机自选
- 大仓 `ARCHITECTURE.md` 的 dsh 描述同步更新；`mona.yaml` 待 `dsh-lavs-integration` 有 remote
  后登记

## 补记（同日）：Agent 工具面收敛为 CLI + Skill

同日落地 agent 工具面的形态收敛：`lavs_*` 全量注册工具（4 bundle 18 个）改为 **opt-in**
（`registerAgentTools`，默认关）——常驻工具 schema 是固定上下文税。默认路径改为：

- `lavs` CLI（`dsh-plugin-lavs-cli`，零依赖）：`list` / `schema <bundle>` / `call` 三动词，
  manifest 驱动、按需加载，经宿主 **loopback 端点**（`~/.dsh/lavs-host.json` 发现文件，
  Bearer token）路由——CLI 必须过宿主而非直写存储，否则 mutation → SSE → 视图刷新断链
- `skills/lavs/SKILL.md`：装 `~/.dsh/skills/`（dsh 原生 skill 发现路径），场景知识按需加载
- mutation 审计记录下沉到 `service.call`：浏览器 RPC / CLI / opt-in 工具三个面共享同一条
  审计流与 fan-out（顺带修复 iframe 发起的 mutation 不触发视图刷新的存量 bug）
- e2e 已验：CLI addTodo 往返 + 落盘 + 宿主审计；typecheck/构建全绿
