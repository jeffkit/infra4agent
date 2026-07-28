# LAVS Agent SOP — AI Agent 使用 LAVS View 标准操作流程

> 适用对象：在 Cursor / Claude Code / 任何 MCP-compatible Agent 中工作的 AI Agent  
> 适用仓库：infra4agent / lavs  
> 最后更新：2026-07-28

---

## 什么是 LAVS？

LAVS（Local Agent View Service）是一个协议，让 AI Agent 能把结构化数据"投影"到用户的浏览器 View 里：

- Agent 通过 MCP 工具（或 `lavs call` CLI）写数据
- LAVS Host 自动把结果广播给已打开的 View 页面（SSE）
- 用户在浏览器里实时看到更新，**无需手动刷新**

---

## 快速判断：什么时候使用 LAVS？

| 场景 | 做法 |
|------|------|
| 要展示列表、卡片、表单给用户看 | ✅ 用 LAVS |
| 数据需要实时更新（Agent 正在写） | ✅ 用 LAVS |
| 临时输出，不需要持久化 | ❌ 直接输出文本即可 |
| 单次问答 | ❌ 直接回复 |

---

## 标准流程（三步走）

### 第一步：用户启动 LAVS Host（或由你提示用户启动）

```bash
# 启动全局 Host，加载所有 bundles
node /Users/kongjie/projects/infra4agent/lavs/sdk/typescript/runtime/dist/cli.js \
  host \
  --registry-dir /Users/kongjie/projects/infra4agent/bundles \
  --port 7842
```

Host 启动后会自动打开浏览器并显示 View 界面。  
若已安装 daemon，Host 开机自启，无需手动启动。

> **检查 Host 是否在运行：**  
> `curl http://localhost:7842/api/discover` 若返回 JSON 列表则 Host 正常。

---

### 第二步：用 `lavs_discover` 找到可用的 Bundle 和 Endpoint

```
lavs_discover({ registryDir: "/Users/kongjie/projects/infra4agent/bundles" })
```

输出示例：
```
📦 todo-list  (contentType: lavs/todo-list)
   dir: /Users/kongjie/projects/infra4agent/bundles/todo-list
   
   • addTodo [mutation]
     Params:
       text: string (required)
       priority: "high"|"medium"|"low" (optional)

   • listTodos [query]
     Params: (none)
   ...
```

---

### 第三步：用 `lavs_call` 操作数据（**永远不要直接调脚本**）

```
lavs_call({
  registryDir: "/Users/kongjie/projects/infra4agent/bundles",
  bundle: "todo-list",
  endpoint: "addTodo",
  params: { text: "完成架构文档", priority: "high" }
})
```

`lavs_call` 执行后：
1. 脚本运行，数据写入 `data/*.json`
2. LAVS Host 自动收到通知（POST /api/notify）
3. View 页面通过 SSE 实时刷新，用户无感知延迟

**返回格式：**
- mutation：`✅ addTodo completed — LAVS view will auto-refresh.\n{result}`
- query：`📋 N item(s) returned.\n{json}`

---

## ⚠️ 关键约束（必须遵守）

1. **永远用 `lavs_call`，不要直接 `node scripts/add.js`**  
   直接调脚本会绕过 Host 通知，View 不会刷新。

2. **不要手动修改 `data/*.json`**  
   通过 endpoint 操作才能保证数据格式和 View 同步。

3. **query 端点只读取，mutation 端点才写入**  
   用 `lavs_discover` 输出里的 `[query]` / `[mutation]` 判断。

4. **registryDir 必须是绝对路径**  
   相对路径会导致 bundle 找不到。

---

## 本仓可用 Bundles

| Bundle | ContentType | 用途 |
|--------|-------------|------|
| `todo-list` | `lavs/todo-list` | 任务清单（CRUD） |
| `notes` | `lavs/notes` | 笔记本（Markdown + 标签） |

Bundle 目录：`/Users/kongjie/projects/infra4agent/bundles/`

---

## Daemon 管理（开机自启）

```bash
# 安装 daemon（macOS launchd）
node .../dist/cli.js daemon install \
  --registry-dir /Users/kongjie/projects/infra4agent/bundles \
  --port 7842

# 查看状态
node .../dist/cli.js daemon status

# 卸载
node .../dist/cli.js daemon uninstall

# 查看日志
tail -f /tmp/lavs-host.log
tail -f /tmp/lavs-host.err
```

---

## 典型对话模板

**用户说：**「帮我把今天要做的事加到任务清单」

**Agent 应该做：**

1. 调用 `lavs_discover` 确认 `todo-list` bundle 存在和 endpoint schema
2. 依次调用 `lavs_call` 添加每个任务（mutation）
3. 告知用户：「已添加 N 个任务，你的 LAVS View 页面已自动刷新」

**不要做：**

- 直接 `node scripts/add.js`（View 不会刷新）
- 直接编辑 `data/todos.json`（绕过验证）
