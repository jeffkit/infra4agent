# Docker 构建提速指南：依赖层分离

> 任何「编译型项目 + Docker 构建 + 有重 CI/E2E 测试」的项目都能复用的方法论。
> 提炼自 recursive 项目的实战——那里把每次 ~25 分钟的 docker build 优化到了
> 源码改动 ~1 分钟、纯测试/文档改动 0.4 秒跳过。完整战斗记录（含失败的方案、
> 三个对照实验的原始数据）见
> [recursive/docs/e2e-docker-build-speedup.md](https://github.com/jeffkit/recursive/blob/main/docs/e2e-docker-build-speedup.md)。
>
> 本文聚焦**可迁移的部分**：去掉项目特有细节，留下任何语言项目都能直接套用的
> 原则、模板、决策框架。

---

## 问题画像：你的项目是否中招？

如果你的项目同时满足以下条件，本文的方法直接适用：

1. **编译型项目**（Rust / Go / Node-ts / Java / ...），构建产物是二进制或打包文件
2. **Docker 构建**（CI / E2E 测试在容器里跑，每次改动触发一次 docker build）
3. **依赖很多**（几百个包/模块/crate）
4. docker build 慢到**拖慢迭代节奏**（>5 分钟/次）

典型症状：改一行源码，docker build 要 10-25 分钟，因为容器里从零编译/安装全部依赖。
本地增量构建是秒级的，但 Docker 容器的缓存目录每次都是空的。

---

## 核心原则：依赖层 vs 项目层分离

一切优化的根基。**适用于任何语言。**

### 根本原因：Dockerfile 把"依赖"和"项目代码"混在一层

大部分 Dockerfile 长这样：

```dockerfile
COPY . .                          # 把所有东西（依赖描述 + 源码）一起 COPY
RUN <编译/安装命令>                # 依赖和项目一起构建
```

源码改一行 → `COPY . .` 层指纹变 → `RUN` 层失效 → **重新编译/安装全部依赖**（即使
依赖描述文件根本没变）。容器里没有增量缓存，每次都从零开始。

### 依赖与项目代码的编译量分布

一个典型项目：
- **依赖**（第三方库/模块）：几十到几百个，编译/安装占 ~95-99% 的时间。描述文件
  （`Cargo.lock` / `go.sum` / `package-lock.json` / `requirements.txt`）跨改动几乎不变。
- **项目代码**：几个模块，编译占 ~1-5%。这是每次改动的对象。

为 1-5% 的改动重做 95-99% 的工作——这是浪费的根源。

### 解决：分两层 COPY + 构建

```dockerfile
# 第一层：只 COPY 依赖描述文件，编译/安装依赖（稳定层）
COPY <依赖描述文件> ./
RUN <编译/安装依赖>

# 第二层：COPY 项目源码，编译项目（变动层）
COPY <源码> ./
RUN <编译项目>
```

源码变动只触发第二层重建——第一层（依赖）保持 Docker layer cache 命中。

**这是所有语言版本的共同骨架。** 下文给出各语言的具体实现。

---

## 三层优化，按杠杆排序

### 优化 1：E2E/CI gate 的 diff-scope 短路（最高杠杆，不限语言）

**思路**：很多改动（文档、测试、配置、版本号）根本不可能影响 Docker 构建的产物行为。
在 docker build 之前加一道 diff 检测：如果改动路径不在白名单内，直接绿灯跳过整个
docker build。

**通用模板**（bash，可嵌入任何 gate 脚本）：

```bash
# 定义"会影响构建产物行为"的路径白名单（按你的项目调整）
RUN_BUILD_IF_CHANGED="src/|<你的关键路径>/"

if [[ "${FORCE_FULL_BUILD:-0}" != "1" ]]; then
  CHANGED=$( { git diff --name-only main...HEAD 2>/dev/null; git diff --name-only; } | sort -u )
  RELEVANT=$(echo "$CHANGED" | grep -E "$RUN_BUILD_IF_CHANGED" || true)
  if [[ -z "$RELEVANT" ]]; then
    echo "[gate] skip: 改动未触及构建关键路径，跳过 docker build"
    exit 0  # 绿灯
  fi
fi
# ... 继续 docker build ...
```

**怎么定义白名单**：问自己"改这个路径会不会改变构建产物的运行时行为？"
- **会**：源码（`src/`）、build script、编译期配置、依赖描述文件（如果 docker build
  需要重新编译依赖）
- **不会**：文档（`*.md`）、测试（`tests/`）、CI 配置、版本号、元数据

**效果**：纯文档/测试改动的 gate 从 ~25min 降到 **<1 秒**。这是**最高杠杆**的优化。

**opt-out**：保留 `FORCE_FULL_BUILD=1` 环境变量，release 前强制全量验证。

### 优化 2：依赖层分离（核心提速，任何语言）

把上面的"核心原则"落地到 Dockerfile。下面是各语言的实现模板。

#### Rust（用 cargo-chef）

Rust 比其他语言复杂——workspace 的依赖图需要特殊处理。[cargo-chef](https://github.com/LukeMathWalker/cargo-chef)
是专门解决这个的工具，分三个 stage：

```dockerfile
# syntax=docker/dockerfile:1.4

# Stage 1: planner — 生成依赖配方（不 COPY 源码！）
FROM rust:<版本>-slim AS planner
WORKDIR /app
RUN cargo install cargo-chef --locked
COPY Cargo.toml Cargo.lock ./
COPY .cargo .cargo
COPY crates crates           # workspace 成员目录
# ⚠️ 不要 COPY src —— cargo chef prepare 只读 manifests
RUN cargo chef prepare --recipe-path recipe.json

# Stage 2: cooker — 编译全部依赖（核心缓存层）
FROM rust:<版本>-slim AS cooker
WORKDIR /app
RUN cargo install cargo-chef --locked
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# Stage 3: builder — 编译本项目（只编你的 crate）
FROM rust:<版本>-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY .cargo .cargo
COPY crates crates
COPY src src
COPY --from=cooker /app/target target   # 依赖已编译好
RUN cargo build --release -p <你的 binary>
```

> **Rust 为什么需要 cargo-chef 而不是简单的"先 COPY Cargo.toml 再 COPY src"？**
> 因为 Rust workspace 的依赖图跨多个 crate，`cargo build` 需要看到每个成员的
> `Cargo.toml` 和至少一个 dummy `lib.rs`/`main.rs` 才能解析依赖。简单 COPY
> `Cargo.toml` 不够——cargo 会报"找不到 lib.rs"。cargo-chef 自动生成占位源码来
> 跳过这个问题。其他语言（Go/Node/Python）没有这个限制，直接分层 COPY 即可。

#### Go

Go 的依赖在 `go.mod` / `go.sum`。直接分层：

```dockerfile
FROM golang:<版本> AS builder
WORKDIR /app
# 第一层：依赖
COPY go.mod go.sum ./
RUN go mod download
# 第二层：项目
COPY . .
RUN go build -o /myapp ./cmd/server
```

`go mod download` 把依赖缓存到 `$GOPATH/pkg/mod`，后续 `go build` 命中缓存。

#### Node.js

```dockerfile
FROM node:<版本> AS builder
WORKDIR /app
# 第一层：依赖
COPY package.json package-lock.json ./
RUN npm ci
# 第二层：项目
COPY . .
RUN npm run build
```

`npm ci` 严格按 lockfile 安装，比 `npm install` 更适合 CI（确定性 + 快）。

#### Python

```dockerfile
FROM python:<版本> AS builder
WORKDIR /app
# 第一层：依赖
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# 第二层：项目
COPY . .
```

或用 `pip-compile` + 可选的 cache mount（pip 的 cache mount 比 cargo 可靠，见下方
"cache mount vs layer cache"）。

#### Java (Maven)

```dockerfile
FROM maven:<版本> AS builder
WORKDIR /app
# 第一层：依赖（用 dummy pom 触发依赖下载）
COPY pom.xml ./
RUN mvn dependency:go-offline
# 第二层：项目
COPY src src
RUN mvn package -DskipTests
```

#### 通用原则

无论什么语言，模式一致：**先 COPY 依赖描述文件（lockfile / manifest），安装/编译
依赖（缓存层）；再 COPY 源码（项目层）。源码变动只触发项目层重建。**

### 优化 3：依赖层不 COPY 源码（让缓存跨 worktree/目录共享）

**适用条件**：你在多个目录/分支/worktree 里跑 docker build（CI 矩阵、git worktree、
monorepo 多子项目）。

**问题**：如果依赖层 COPY 了源码（即使是"顺便"COPY），那么：
- 源码改动 → COPY 层指纹变 → 依赖层失效 → 全量重装/重编依赖

**解决**：依赖层**绝对只 COPY 依赖描述文件**，不 COPY 任何源码。

**为什么这样能让缓存跨目录共享**：

BuildKit 的 layer cache 按 **"指令 + 输入文件内容指纹（SHA256）"** 做 key——
**不按 build context 路径**。两个不同目录里内容相同的文件，产生相同的 layer key。

```
目录 A:  /repo/worktrees/feature-x/    build context
目录 B:  /repo/worktrees/feature-y/    build context
```

两个目录的依赖描述文件（`Cargo.lock` / `go.sum` / `package-lock.json`）完全相同
（只有源码不同）。依赖层只 COPY 描述文件 → 依赖层指纹跨目录相同 → **缓存跨目录
自动共享**。

> **这是 recursive 项目从 ~12min/worktree 降到 ~1min/worktree 的关键改动**。
> recursive 的 cargo-chef planner 之前多 COPY 了一个 `src/`（虽然 `cargo chef
> prepare` 用不到它），导致 planner 层在源码变动时失效，连带 cooker（依赖编译）层
> 也失效。删掉那一个 COPY，跨 worktree 缓存立刻共享。

---

## 决策框架：该用哪个优化？

```
你的 docker build 慢吗？
│
├─ 否 → 不用优化
│
└─ 是（>5min）→
    │
    ├─ E2E/CI gate 每次都触发 docker build 吗？
    │   │
    │   └─ 是 → 加优化 1（diff-scope 短路）★ 任何语言，最高杠杆
    │
    ├─ Dockerfile 是 "COPY . . 然后 RUN build" 吗？
    │   │
    │   └─ 是 → 加优化 2（依赖层分离）★ 核心提速
    │           │
    │           ├─ Rust → 用 cargo-chef（workspace 需要）
    │           ├─ Go → go mod download 分层
    │           ├─ Node → npm ci 分层
    │           ├─ Python → pip install 分层
    │           └─ Java → mvn dependency:go-offline 分层
    │
    └─ 在多目录/worktree 里跑 build 吗？
        │
        └─ 是 → 确保优化 3（依赖层不 COPY 源码）★ 跨目录缓存共享
```

---

## 关键知识点（任何 Docker 项目都适用）

### 1. Docker layer cache 的 key 机制

BuildKit 的 layer cache 按 **"Dockerfile 指令 + 输入文件内容指纹"** 做 key：

- `COPY foo.txt ./` → key 包含 `foo.txt` 的 SHA256
- `RUN cargo build` → key 包含上一层的结果 + 这条指令文本
- **不包含 build context 的路径**——两个不同目录里内容相同的文件，产生相同 key

这就是跨 worktree/目录缓存共享的基础。**只要你的 layer 输入只依赖"稳定内容"
（依赖描述文件），不依赖"变动内容"（源码），缓存就能跨目录共享。**

### 2. cache mount vs layer cache（什么时候用哪个）

Docker 提供两种缓存机制：

| | `--mount=type=cache` | layer cache |
|---|---|---|
| 机制 | BuildKit 独立持久卷 | Docker 镜像层 |
| 失效 | 手动 prune 或 id 变 | 输入层内容变 |
| 可靠性 | 依赖 driver 实现 | Docker 原生，最可靠 |
| 跨 context | 需显式 id | 按内容指纹自动共享 |
| 适合 | 包管理器缓存（pip/npm/apt） | 编译产物缓存（cargo/go/javac） |

**判断标准**：
- 如果你的工具能"看到缓存就智能复用"（如 pip/npm/apt——简单解压包文件）→ cache mount
  可行且方便
- 如果复用逻辑复杂（如 cargo 的 fingerprint、go 的 build cache、javac 的增量编译）→
  优先用 layer cache（依赖层分离），更可靠

**教训**（来自 recursive 实战）：试过 `--mount=type=cache,target=/build/target`
持久化 cargo 的 `target/`——在 colima 上失败了（cache mount 有数据但 cargo 仍全量
重编）。原因是 cargo 的增量编译依赖 `target/` 里的 fingerprint，cache mount 虽然持久
化了文件但复用判断不可靠。改用 layer cache（cargo-chef）后立刻稳定。

### 3. 资源配置（macOS / Docker Desktop / colima）

macOS 上跑 Docker 通常用 colima（轻量）或 Docker Desktop。默认 CPU/内存保守：

```bash
# colima：重启时加资源（编译是 CPU 密集型）
colima stop && colima start --cpu 6 --memory 10

# Docker Desktop：Settings → Resources → 调 CPU/Memory
```

加 CPU 能让全量编译快 40-60%。零风险、立即生效。**先做这个——最简单的提速。**

### 4. 对照实验方法论（验证缓存共享）

验证缓存共享时，**不要只在 main checkout 测**——它会命中 context-local 缓存，掩盖
跨目录问题。一定要在新目录（模拟 worktree/CI）测一次：

```bash
# 复制 build context 到新目录（排除 target/.git 等重目录）
rsync -a --exclude='target/' --exclude='.git/' --exclude='node_modules/' \
  ./ /tmp/cache-test/
# 改一行源码
echo "// test" >> /tmp/cache-test/src/main.rs   # 或 .go / .ts / .py
# 在新目录 build
cd /tmp/cache-test && docker build -f Dockerfile -t test .
# 观察依赖层是否 CACHED（而不是重建）
```

- 新目录 build 和 main 一样快 → 缓存共享成功 ✅
- 新目录 build 很慢（依赖层重建）→ 缓存没共享，检查依赖层是否混入了源码 ❌

---

## 诊断清单：你的 Docker build 为什么慢

按这个顺序排查：

1. **build 时间花在哪一层？**
   ```bash
   docker build --progress=plain . 2>&1 | grep -E "^#[0-9]+ DONE"
   ```
   找 DONE 时间最长的层。如果是 `RUN <编译/安装命令>` → 是依赖处理，用分层方案。

2. **改源码后哪些层失效？**
   改一行源码，再 build，看哪些层从 CACHED 变成 DONE。如果依赖层失效了 → 你的 COPY
   把源码和依赖描述混在了同一层。

3. **缓存跨目录共享了吗？**
   用上面的"对照实验"。如果没 CACHED → 检查 COPY 顺序（依赖描述文件必须在源码之前
   COPY，且源码不能进入依赖层）。

4. **CPU 够吗？**
   build 时看 CPU 使用率（`top`）。CPU 打满但还慢 → 加 CPU。CPU 没打满（<50%）→
   可能在等 IO（下载依赖）或单线程阶段（release LTO 链接、单线程打包）。

---

## 反模式：不要这样做

1. **`COPY . .` 然后 `RUN build`**——把所有东西放一层，任何文件变动都让依赖重处理。
   这是最常见的 Docker 构建反模式（任何语言）。

2. **依赖层 COPY 源码**——即使"用不到"，COPY 本身会让 layer 指纹变，连线下游层失效。
   只 COPY 真正需要的东西。

3. **依赖 `--mount=type=cache` 在非标准 Docker driver 上**——colima、Podman、rootless
   Docker 的 cache mount 实现可能有微妙差异。对编译产物缓存，优先 layer cache。

4. **并发跑多个 docker build 来"加速"**——编译是 CPU 密集型，并发 build 争 CPU 和
   BuildKit 锁，总时间不降反升。优化单次 build 的缓存命中才是正道。

5. **只测 main checkout 的缓存**——main 会命中 context-local 缓存，掩盖跨目录问题。
   一定在新目录测跨 context 共享。

---

## 实战 checklist

- [ ] **gate 脚本加 diff-scope 短路**——定义"影响构建产物的路径白名单"
- [ ] **Dockerfile 分层**——先 COPY 依赖描述文件 + 安装依赖（缓存层），再 COPY 源码
      （项目层）
- [ ] **依赖层不 COPY 源码**——只 COPY 依赖描述文件（Cargo.lock / go.sum /
      package-lock.json / requirements.txt）
- [ ] **colima / Docker Desktop 加 CPU**（macOS）——`colima start --cpu 6 --memory 10`
- [ ] **用对照实验验证跨目录缓存共享**——新目录 build，依赖层应 CACHED
- [ ] **保留 `FORCE_FULL_BUILD=1` opt-out**——release 前全量验证
- [ ] **文档化你的白名单**——让团队知道哪些路径会触发 docker build

---

## 参考与延伸

- **cargo-chef**（Rust 专用）：https://github.com/LukeMathWalker/cargo-chef
- **Docker 多阶段构建**：https://docs.docker.com/build/building/multi-stage/
- **BuildKit cache mount**：https://docs.docker.com/build/cache/optimize/#use-cache-mounts
- **Docker layer cache 原理**：https://docs.docker.com/build/cache/
- **recursive 项目完整实战记录**（含三个对照实验原始数据、cache mount 失败诊断、
  cargo-chef 引入过程）：
  [recursive/docs/e2e-docker-build-speedup.md](https://github.com/jeffkit/recursive/blob/main/docs/e2e-docker-build-speedup.md)
