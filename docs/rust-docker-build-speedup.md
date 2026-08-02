# Rust 项目 Docker 构建提速指南

> 任何「Rust + Docker + 有重 E2E/集成测试」的项目都能复用的方法论。
> 从 recursive 项目的实战中提炼——那里把每次 ~25 分钟的 docker build 优化到了
> src/ 改动 ~1 分钟、纯测试改动 0.4 秒跳过。完整战斗记录见
> [recursive/docs/e2e-docker-build-speedup.md](https://github.com/jeffkit/recursive/blob/main/docs/e2e-docker-build-speedup.md)。
>
> 本文聚焦**可迁移的部分**：去掉项目特有细节，留下任何 Rust 项目都能直接套用的
> 模板、诊断方法、和决策框架。

---

## 问题画像：你的项目是否中招？

如果你的项目同时满足以下条件，本文的方法直接适用：

1. **Rust 项目**，用 cargo workspace（一个或多个 crate）
2. **Docker 构建产物**是 release binary（`cargo build --release`）
3. **CI / E2E 测试**在 Docker 里跑（每次改动触发一次 docker build）
4. **依赖很多**（Cargo.lock 几百个 crate——AWS SDK / tokio / reqwest 这类大家伙）
5. docker build 慢到**拖慢迭代节奏**（>5 分钟/次）

典型症状：改一行 `src/lib.rs`，docker build 要 10-25 分钟，因为容器里从零编译全部
依赖。本地 `cargo build` 是增量的（秒级），但 Docker 容器的 `target/` 每次都是空的。

---

## 核心洞察：为什么 Docker 里的 Rust 编译这么慢

### 根本原因：Dockerfile 分层把"依赖编译"和"项目编译"混在一起

大部分 Rust Dockerfile 长这样：

```dockerfile
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo build --release
```

`COPY src/` 和 `RUN cargo build` 在同一层失效边界。src/ 改一行 → COPY src 层指纹变
→ RUN cargo build 层失效 → cargo 重新编译**全部依赖**（即使依赖源码没变）。

容器里没有增量编译——每次都是干净的 `target/`，cargo 看不到上次的编译产物，只能
全量编译。

### 编译量的分布

一个典型 Rust workspace：
- **依赖 crate**（crates.io registry）：几百个，编译产物占 ~99%。源码由 Cargo.lock
  锁定，跨改动几乎不变。
- **本项目 crate**（workspace 成员）：几个，编译产物占 ~1%。源码是每次改动的对象。

为 1% 的改动重编 99% 的依赖——这是浪费的根源。优化的本质就是**把两者分离到不同的
Docker layer**，让依赖编译层在项目代码变动时保持缓存。

---

## 解决方案：三层优化，按杠杆排序

### 优化 1：E2E gate 的 diff-scope 短路（最高杠杆，不限语言）

**适用条件**：你的 CI/E2E gate 有"改动不触及关键路径就跳过"的能力。

**思路**：很多改动（文档、测试、配置、版本号）根本不可能影响 Docker 构建的 binary
行为。在 docker build 之前加一道 diff 检测：如果改动路径不在白名单内，直接绿灯跳过
整个 docker build。

**通用模板**（bash，可嵌入任何 gate 脚本）：

```bash
# 定义"会影响 binary 行为"的路径白名单（按你的项目调整）
RUN_BUILD_IF_CHANGED="src/|crates/[^/]+/src/|<你的关键路径>/"

if [[ "${FORCE_FULL_BUILD:-0}" != "1" ]]; then
  CHANGED=$( { git diff --name-only main...HEAD 2>/dev/null; git diff --name-only; } | sort -u )
  RELEVANT=$(echo "$CHANGED" | grep -E "$RUN_BUILD_IF_CHANGED" || true)
  if [[ -z "$RELEVANT" ]]; then
    echo "[gate] skip: 改动未触及 binary 关键路径，跳过 docker build"
    exit 0  # 绿灯
  fi
fi
# ... 继续 docker build ...
```

**怎么定义白名单**：问自己"改这个路径会不会改变 binary 的运行时行为？"——
- 会：源码（`src/`、`crates/*/src/`）、build script（`build.rs`）、编译期配置
- 不会：文档（`*.md`）、测试（`tests/`）、CI 配置、版本号、`.dev/` 元数据

**效果**：纯文档/测试改动的 gate 从 ~25min 降到 **<1 秒**。

**opt-out**：保留 `FORCE_FULL_BUILD=1` 环境变量，release 前强制全量验证。

> **注意**：这个优化不依赖 Rust——任何语言的 E2E gate 都能用，只要你能定义"哪些路径
> 影响 binary 行为"。

### 优化 2：cargo-chef 三阶段 Dockerfile（Rust 专用，核心提速）

**适用条件**：Rust workspace + Docker release 构建。

[cargo-chef](https://github.com/LukeMathWalker/cargo-chef) 是专门解决 Rust Docker
依赖缓存的工具。原理：把 docker build 分成三个 stage——

```
planner（生成依赖配方）→ cooker（编译全部依赖）→ builder（编译本项目）
```

cooker 层只依赖"配方"（manifests + lock），不依赖源码——所以项目代码变动时 cooker
层保持 CACHED，只有 builder 层（编译几个本项目 crate）重建。

**通用 Dockerfile 模板**——复制后改 3 处即可用：

```dockerfile
# syntax=docker/dockerfile:1.4

# ═══ Stage 1: planner — 生成依赖配方（不 COPY 源码！）═══
# 这个 stage 的输出 recipe.json 只依赖 manifests，跨改动/跨 worktree 稳定。
FROM rust:<你的版本>-slim AS planner
WORKDIR /app
RUN cargo install cargo-chef --locked
# COPY 全部 workspace 成员的 Cargo.toml + Cargo.lock + .cargo 配置
# 根据你的 workspace 结构调整——关键是 COPY manifests，不 COPY src
COPY Cargo.toml Cargo.lock ./
COPY .cargo .cargo          # 如果有 .cargo/config.toml（cargo 配置）
COPY crates crates           # 如果是 workspace（COPY 全部成员目录）
# ⚠️ 不要 COPY src —— cargo chef prepare 只读 manifests，不需要源码
RUN cargo chef prepare --recipe-path recipe.json

# ═══ Stage 2: cooker — 编译全部依赖（核心缓存层）═══
# 这层只在 recipe.json 变（即 Cargo.toml/Cargo.lock 变）时重建。
# src/ 改动不影响这层 → 依赖编译被缓存。
FROM rust:<你的版本>-slim AS cooker
WORKDIR /app
RUN cargo install cargo-chef --locked
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# ═══ Stage 3: builder — 编译本项目（只编你的 crate）═══
FROM rust:<你的版本>-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY .cargo .cargo
COPY crates crates
COPY src src                 # 真实源码
COPY --from=cooker /app/target target   # 依赖已编译好
RUN cargo build --release <你的 -p 参数>

# ═══ Stage 4: runtime — 最终镜像 ═══
FROM debian:bookworm-slim      # 或你的 runtime base
# ... 装 runtime 依赖 ...
COPY --from=builder /app/target/release/<你的 binary> /usr/local/bin/<binary>
# ...
```

**要改的 3 处**：
1. `rust:<版本>-slim` → 你的 Rust 版本
2. `cargo build --release <你的 -p 参数>` → 你的构建目标（如 `-p my-cli`）
3. `COPY --from=builder .../<binary>` → 你的 binary 路径

**关键：planner 绝对不要 COPY src**。这是整个优化的命门——后面解释为什么。

**效果**：src/ 改动的 docker build 从 ~10-25min 降到 **~1-3min**（只编译本项目 crate
+ 链接）。

### 优化 3：planner 不 COPY src（让缓存跨 worktree/目录共享）

**适用条件**：你在多个目录/分支/worktree 里跑 docker build（CI 矩阵、git worktree、
monorepo 多子项目）。

**问题**：如果 planner COPY 了 src，那么：
- src/ 改动 → planner 的 `COPY src` 层失效
- planner 的 `RUN cargo chef prepare` 层也失效（即使 recipe.json 内容不变）
- cooker 的 `COPY --from=planner recipe.json` 看到一个"新"层 → cooker 层失效
- 全量重编依赖（~10-25min）

**解决**：删掉 planner 的 `COPY src`。`cargo chef prepare` 只读 manifests（已验证：
无 src/ 时生成的 recipe.json 与有 src/ 时完全相同）。

**为什么这样能让缓存跨目录共享**：

BuildKit 的 layer cache 按 **"指令 + 输入文件内容指纹（SHA256）"** 做 key——
**不按 build context 路径**。两个不同目录里内容相同的文件，产生相同的 layer key。

```
目录 A 的 build context:  /repo/worktrees/feature-x/
目录 B 的 build context:  /repo/worktrees/feature-y/
```

两个目录的 `Cargo.toml` / `Cargo.lock` / `.cargo/config.toml` / `crates/*/Cargo.toml`
完全相同（只有 `src/` 不同）。planner 不 COPY src 后，planner 的输入只有 manifests
→ planner layer 指纹跨目录相同 → cooker 的 recipe.json 输入相同 → cooker layer 指纹
相同 → **cooker 缓存跨目录自动共享**。

只有 builder stage（COPY src + cargo build）每个目录不同——但它只编几个本项目 crate。

**效果**：从"每个 worktree/目录都要 ~12min 全量编译依赖"变成"所有目录共享 cooker
缓存，每个只需 ~1min"。

---

## 决策框架：该用哪个优化？

```
你的 docker build 慢吗？
│
├─ 否 → 不用优化
│
└─ 是（>5min）→
    │
    ├─ 是 Rust 项目吗？
    │   │
    │   ├─ 是 → 用优化 2（cargo-chef 三阶段）
    │   │       │
    │   │       └─ 在多目录/worktree 里跑 build 吗？
    │   │           │
    │   │           ├─ 是 → 加优化 3（planner 不 COPY src）★ 关键
    │   │           └─ 否 → 优化 2 即可
    │   │
    │   └─ 否（Go/Node/Python/...）→
    │       用等价的依赖缓存分层（见下方"非 Rust 项目"）
    │
    └─ E2E/CI gate 每次都触发 docker build 吗？
        │
        └─ 是 → 加优化 1（diff-scope 短路）★ 任何语言都适用
```

---

## 非 Rust 项目：等价的依赖缓存模式

cargo-chef 是 Rust 专用的，但**"依赖编译层 vs 项目编译层分离"的原则通用**。其他
语言的等价方案：

### Node.js

```dockerfile
# 只 COPY package.json + lock，npm install（依赖层）
COPY package.json package-lock.json ./
RUN npm ci --production
# 再 COPY 源码（项目层）
COPY src/ src/
```
Node 的依赖天然在 `node_modules/`，COPY package.json + npm install 是标准模式。
不需要额外工具。

### Go

Go 的依赖在 `go.mod` / `go.sum`。利用 Docker 的多阶段 + `go mod download`：
```dockerfile
COPY go.mod go.sum ./
RUN go mod download      # 依赖层
COPY . .
RUN go build ./...       # 项目层
```

### Python

```dockerfile
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt   # 依赖层
COPY . .
```
或用 `pip-compile` + `--mount=type=cache,target=/root/.cache/pip`（pip 的 cache mount
比 cargo 的可靠，因为 pip cache 是简单的包文件，不像 cargo target/ 有复杂的
fingerprint）。

**原则一致**：先 COPY 依赖描述文件（`requirements.txt` / `go.mod` / `package.json`），
安装依赖（缓存层）；再 COPY 源码（项目层）。源码变动只触发项目层重建。

---

## 关键知识点（任何 Docker 项目都适用）

### 1. Docker layer cache 的 key 机制

BuildKit 的 layer cache 按 **"Dockerfile 指令 + 输入文件内容指纹"** 做 key：

- `COPY foo.txt ./` → key 包含 `foo.txt` 的 SHA256
- `RUN cargo build` → key 包含上一层的结果 + 这条指令文本
- **不包含 build context 的路径**——两个不同目录里内容相同的文件，产生相同 key

这就是跨 worktree/目录缓存共享的基础。**只要你的 layer 输入只依赖"稳定内容"
（manifests），不依赖"变动内容"（src），缓存就能跨目录共享。**

### 2. cache mount vs layer cache（为什么我们放弃 cache mount）

| | `--mount=type=cache` | layer cache |
|---|---|---|
| 机制 | BuildKit 独立持久卷 | Docker 镜像层 |
| 失效 | 手动 prune 或 id 变 | 输入层内容变 |
| 可靠性 | 依赖 driver（colima 等非标准 driver 下不可靠）| Docker 原生，最可靠 |
| 跨 context | 需显式 id | 按内容指纹自动共享 |
| 适合 | 包管理器缓存（pip/npm） | 编译产物缓存（cargo/go） |

**教训**：我们试过 `--mount=type=cache,target=/build/target` 持久化 cargo 的
`target/`——在 colima 上失败了（cache mount 有数据但 cargo 仍全量重编）。原因是
cargo 的增量编译依赖 `target/` 里的 fingerprint，cache mount 虽然持久化了文件但
cargo 的复用判断不可靠。**layer cache（cargo-chef）靠 Docker 最成熟的机制，更稳。**

**判断标准**：如果你的编译工具能"看到缓存就智能复用"（如 npm、pip——简单解压包），
cache mount 可行。如果复用逻辑复杂（如 cargo 的 fingerprint、go 的 build cache），
优先用 layer cache。

### 3. colima / Docker Desktop 的资源配置

macOS 上跑 Docker 通常用 colima（轻量）或 Docker Desktop。默认 CPU/内存保守：

```bash
# colima：重启时加资源（编译是 CPU 密集型）
colima stop && colima start --cpu 6 --memory 10

# Docker Desktop：Settings → Resources → 调 CPU/Memory
```

加 CPU 能让全量编译快 40-60%。零风险、立即生效。这是**最简单的提速**——先做这个。

### 4. 对照实验方法论

验证缓存共享时，**不要只在 main checkout 测**——它会命中 context-local 缓存，掩盖
跨目录问题。一定要在新目录（模拟 worktree/CI）测一次：

```bash
# 复制 build context 到新目录（排除 target/.git 等重目录）
rsync -a --exclude='target/' --exclude='.git/' ./ /tmp/cache-test/
# 改一行 src
echo "// test" >> /tmp/cache-test/src/lib.rs
# 在新目录 build
cd /tmp/cache-test && docker build -f Dockerfile -t test .
# 观察 cooker/依赖层是否 CACHED（而不是重建）
```

如果新目录的 build 和 main 一样快 → 缓存共享成功。
如果新目录的 build 很慢（依赖层重建）→ 缓存没共享，检查你的 COPY 是否混入了变动内容。

---

## 诊断清单：你的 Docker build 为什么慢

按这个顺序排查：

1. **build 时间花在哪一层？**
   ```bash
   docker build --progress=plain . 2>&1 | grep -E "^#[0-9]+ DONE"
   ```
   找 DONE 时间最长的层。如果是最长的 `RUN cargo build`/`npm install`/`go build` →
   是依赖编译，用上面的分层方案。

2. **改 src 后哪些层失效？**
   改一行 src，再 build 一次，看哪些层从 CACHED 变成 DONE。如果依赖编译层失效了 →
   你的 COPY 把 src 和依赖混在了同一层。

3. **缓存跨目录共享了吗？**
   用上面的"对照实验"——在新目录 build，看依赖层是否 CACHED。如果没 CACHED →
   检查 COPY 顺序（依赖描述文件必须在 src 之前 COPY，且 src 不能进入依赖层）。

4. **CPU 够吗？**
   看 build 时的 CPU 使用率（`top` / Activity Monitor）。如果 CPU 打满但还慢 →
   加 CPU。如果 CPU 没打满（<50%）→ 可能在等 IO（网络下载依赖、磁盘读写）或
   单线程阶段（release LTO 链接）。

---

## 反模式：不要这样做

1. **`COPY . .` 然后 `RUN cargo build`**——把所有东西放一层，任何文件变动都让依赖
   重编。这是最常见的 Rust Docker 反模式。

2. **planner / 依赖层 COPY src**——即使"用不到"，COPY 本身会让 layer 指纹变，连带
   下游层失效。只 COPY 真正需要的东西。

3. **依赖 `--mount=type=cache` 在非标准 Docker driver 上**——colima、Podman、
   rootless Docker 的 cache mount 实现可能有微妙差异。生产环境优先 layer cache。

4. **并发跑多个 docker build 来"加速"**——编译是 CPU 密集型，并发 build 争 CPU 和
   BuildKit 锁，总时间不降反升。优化单次 build 的缓存命中才是正道。

5. **只测 main checkout 的缓存**——main 会命中 context-local 缓存，掩盖跨目录问题。
   一定在新目录测跨 context 共享。

---

## 实战 checklist：给你的项目应用这些优化

- [ ] **gate 脚本加 diff-scope 短路**——定义"影响 binary 行为的路径白名单"，不在
      白名单内的改动直接跳过 docker build
- [ ] **colima/Docker Desktop 加 CPU**（macOS）——`colima start --cpu 6 --memory 10`
- [ ] **Dockerfile 改 cargo-chef 三阶段**（Rust）或等价依赖分层（其他语言）
- [ ] **planner / 依赖层不 COPY src**——只 COPY manifests
- [ ] **用对照实验验证跨目录缓存共享**——新目录 build，依赖层应 CACHED
- [ ] **保留 `FORCE_FULL_BUILD=1` opt-out**——release 前全量验证
- [ ] **文档化你的白名单**——让团队知道哪些路径会触发 docker build

---

## 参考与延伸

- **cargo-chef**：https://github.com/LukeMathWalker/cargo-chef
- **BuildKit cache mount 文档**：https://docs.docker.com/build/cache/optimize/#use-cache-mounts
- **Docker 多阶段构建**：https://docs.docker.com/build/building/multi-stage/
- **recursive 项目的完整实战记录**：
  [docs/e2e-docker-build-speedup.md](https://github.com/jeffkit/recursive/blob/main/docs/e2e-docker-build-speedup.md)
  （含 cargo-chef 引入过程、cache mount 失败诊断、三个对照实验的原始数据）
