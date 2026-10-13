# ags-orphan-sweep 失败复现与定位（2026-10-13）

**结论先行**：当前失败**不是** AGS 故障、**不是**凭据问题、**不是**代理问题。
是 **e2b 客户端的传输栈（pyqwest/httpx）在本机对该主机的兼容性问题**。
**不要**把它误报成"AGS 挂了"。

## 症状

```
launchctl: cc.agentstudio.ags-orphan-sweep → last exit code = 1
日志：
httpx.ConnectError: Request failed: error sending request for url
  (https://api.ap-guangzhou.tencentags.com/v2/sandboxes):
  client error (Connect): tls handshake eof
```

## 分层实测（同一台机、同一主机、同一时刻）

| 方法 | 结果 |
|---|---|
| `curl` | **401** ✅ 完成 HTTP 往返 |
| python 裸 `ssl` 握手（ALPN None / http1.1 / h2 / h2+http1.1） | **全部成功**，证书链有效（DigiCert → 腾讯） |
| python 裸 socket + 手写 HTTP/1.1（**复刻 httpx 的 ALPN/UA/keep-alive**） | **401** ✅ |
| python **`httpx` 0.28.1** | ❌ `SSL: UNEXPECTED_EOF_WHILE_READING` |
| python **`httpx` 0.27.2**（另建 venv 验证） | ❌ 同样失败 ⇒ **不是版本问题** |
| python **`pyqwest`**（e2b 实际用的） | ❌ `tls handshake eof` |
| DNS 解析 | 正常（43.144.100.185 / 43.140.50.80） |
| TCP 443 | 可连 |
| 清掉 `http_proxy` 后重试 | ❌ 仍失败 ⇒ **不是代理问题** |

⇒ **网络 / DNS / TCP / TLS / 服务端全部正常**；只有 Python 的 HTTP 客户端栈失败，
且失败发生在**握手之后**（裸 socket 同参数可正常收发）。

## 排除项（都实测过，不是推测）

- **不是代理**：`http_proxy=http://127.0.0.1:7897` 确实存在且 `NO_PROXY` 不含该域名，
  带它时 `curl` 得 `000`；但**清掉代理后 httpx 仍失败** ⇒ 代理不是根因（只是另一条独立问题）；
- **不是 httpx 版本**：0.27.2 与 0.28.1 表现相同；
- **不是 ALPN 协商**：四种 ALPN 组合裸握手全部成功；
- **不是凭据**：`curl`/裸 socket 得到的是 **401 Unauthorized**（服务端在正常应答）。

## 已做的改动

`issue-keeper/bin/ags-orphan-sweep-wrapper.sh`：**显式 unset 代理变量**。
理由是它虽非根因，但**确实是真实存在的第二个问题**（带代理时该主机不通），
且不该依赖调用方环境。**代码注释里同时写明了"清代理并不能修好本脚本"**，
以免后人误以为已修复。

## 未解决 / 下一步

需要让 e2b 走一条可用的传输栈（升级/降级 `pyqwest`，或改用 `requests` 传输）。
在修好之前：

- **AGS 孤儿沙箱不会被自动清理** ⇒ **按量计费会持续累积**；
- 建议：**人工定期检查** AGS 控制台，或在别的机器上跑该脚本。

## 与其它"静默的坏"的关系

本问题的表现具有**误导性**：`tls handshake eof` 读起来像"对端故障"，
而实际是本机传输栈问题。**若不去分层实测，很容易误判成 AGS 服务挂了**
（或反过来，把 401 当成已修好）。同类教训在本会话已出现多次：
`#124` 伪造满分、`ags-orphan-sweep` 静默死 14h、`launchctl list` 空输出被当成"未加载"。

---

## 更新（2026-10-13 07:10）：**已自愈 —— 原判断"需换传输栈"是错的**

**实测**：launchd 的 `last exit code = 0`，日志 `汇总：实例 0，孤儿击杀 0，保留 0`；
**连续手动跑 3 次全部成功**。

⇒ 我此前"需要让 e2b 换一条可用传输栈"的结论**不准确**。
真实情况是**间歇性失败**（intermittent），而不是"httpx/pyqwest 在这台机器上不可用"。

**为什么会误判**：我当时**只做了单次采样**就下结论。单次失败 + 分层现象
（curl/裸 socket 成功、httpx 失败）看起来像"栈不兼容"，但**不足以区分
"永久不兼容"与"间歇性失败"**——**要区分这两者，必须重复采样。**

这与本会话反复出现的教训是**同一个**：
- `#124`：单次初筛被当成满分证据；
- 变异测试：单次测量不足以判定等价；
- 这里：**单次失败不足以判定"不可用"。**

**⇒ 修正后的结论**：
- AGS 端点的失败是**间歇性**的（可能是网络路径/对端抖动）；
- `unset` 代理**可能**有助于降低失败率（代理确实是另一条真实存在的问题），
  但**不能断言是它修好的** —— 没有对照实验；
- **仍建议保留人工检查 AGS 控制台的习惯**，因为间歇性失败意味着
  **某次 sweep 可能静默漏掉孤儿实例**（退出码 1 时我的巡检会报，这层是好的）。

---

## 更正之二（2026-10-13 08:12）：**"间歇性"这个更正本身是错的 —— 回到原始结论**

**我在两小时内下了两次相反的结论，两次都是单次/少次采样造成的。** 记录在此以免再翻。

### 决定性证据（同一时刻、并排、各 5 次）

```
curl  : 401 401 401 401 401     ← 全部成功
httpx : FAIL FAIL FAIL FAIL FAIL ← 全部失败
```

**而且 httpx 连续 10 次全失败（0/10）。** ⇒ 现象是**确定性、客户端特有**的，
**不是**间歇性网络抖动。

### 为什么我上一轮判断成"间歇性"

我在 07:10 手动跑了 **3 次全成功**，就改口说"已自愈、是间歇性失败"。
**那 3 次成功处在一个可用的窗口里**，而我没有继续采样就改了结论。

⇒ **"3 次成功"同样不能证明"间歇"** —— 要区分"永久不可用"与"间歇失败"，
必须**在足够长的时间跨度上采样**，而不是"连续跑 3 次"。
我的两次错误是**同一个方法学缺陷的两个方向**：
- 第一次：1 次失败 ⇒ 断言"永久不兼容"（其实可能间歇）；
- 第二次：3 次成功 ⇒ 断言"间歇/已自愈"（其实持续失败）。

### 修正后的结论（第三次，附可复验方法）

| 层 | 状态 |
|---|---|
| DNS / TCP 443 | 正常 |
| TLS 握手（openssl、python 裸 `ssl`，含各 ALPN） | **正常**，证书链有效 |
| `curl` HTTP 往返 | **正常**（401 = 服务端在应答） |
| python 裸 socket + 手动 HTTP/1.1 | **正常**（401） |
| **python `httpx` / `pyqwest`** | **确定性失败** |

⇒ **网络、TLS、服务端全部正常；失败的只有 httpx/pyqwest 这条客户端栈。**
根因仍在客户端，**修法是换/降级该传输栈**（或让 e2b 走别的 client）。

**可复验命令**（任何人可重跑，不依赖我的描述）：
```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://api.ap-guangzhou.tencentags.com/v2/sandboxes   # 401
plaita/.venv/bin/python -c "import httpx; print(httpx.get('https://api.ap-guangzhou.tencentags.com/v2/sandboxes', timeout=10).status_code)"  # 失败
```

**影响不变**：AGS 孤儿沙箱无法自动清理 ⇒ **按量计费持续累积** ⇒ **需人工查 AGS 控制台**。
我的巡检会在 `SWEEP_ERR` 时报告（这一层始终有效）。

---

## 可用性矩阵（2026-10-13 08:15 实测）—— **有绕行方案**

同一时刻、同一主机、同一 URL，逐个客户端实测：

| 客户端 | 结果 |
|---|---|
| `curl` | **401** ✅（×5 稳定） |
| python 裸 `ssl` 握手（ALPN: None / http1.1 / h2 / h2+http1.1） | **全部成功**，证书链有效 |
| python 裸 socket + 手写 HTTP/1.1 | **401** ✅ |
| **`requests`** | **401** ✅ ← **可用的绕行方案** |
| `httpx` 0.28.1 + httpcore 1.0.9（本仓 venv） | ❌ FAIL（×5 稳定失败） |
| `httpx` 0.28.1 + **httpcore 1.0.7**（另建 venv） | ❌ FAIL（排除版本回归） |
| `httpx` 0.27.2（另建 venv） | ❌ FAIL |
| `httpx` 强制 `maximum_version` = TLS1.2 / TLS1.3 | ❌ 均 FAIL |
| `httpx` 强制 ALPN = `http/1.1` | ❌ FAIL |
| 清空 `http_proxy` 后 httpx | ❌ 仍 FAIL（**不是代理**） |

**⇒ 已排除**：网络、DNS、TCP、TLS 版本、ALPN、证书、代理、httpx/httpcore 版本。
**⇒ 仍未定位**：httpx/httpcore 在这台机器上、对该主机的具体失败点。

### 现在的可用结论

1. **根因确在 httpx/pyqwest 客户端栈**（不是 AGS 故障、不是凭据、不是网络）；
2. **有绕行方案**：`requests` 可正常完成 HTTP 往返 ⇒
   若能让 e2b 走 `requests` 传输（或把 sweep 改成用 `requests` 直接调 AGS REST，
   绕开 e2b SDK），**即可恢复自动清理**；
3. **这是本问题当前最优的推进方向** —— 比继续做根因分析更实际。

### 方法学教训（本轮最大的收获）

**我在两小时内下了两次互相矛盾的结论，两次都错，原因相同：采样不足。**

- 08:10 前：**1 次失败** ⇒ 断言"httpx 与本机永久不兼容"；
- 07:10：**连续 3 次成功** ⇒ 改口"已自愈、是间歇性失败"；
- 08:12：**并排 5v5 + httpx 10/10 失败** ⇒ 才确定"确定性、客户端特有"。

**"连续跑 N 次成功"与"在时间跨度上采样"是两件事** —— 前者只证明"那一小段时间可用"。
**要断言"间歇"，必须看失败率随时间的变化**，而不是看连续成功次数。

---

## 更正之三（08:35）：**"requests 可用"也是错的 —— 两个 Python 栈都失败**

我又犯了一次同类错误。`requests` 的"成功"是与**不同的代理环境**混在一起测的。
在**严格同条件**（全部清 proxy、各 3 次、同一时刻）下重测：

| 客户端 | 结果 |
|---|---|
| `curl` | **401 401 401** ✅ |
| `httpx` | **FAIL FAIL FAIL** ❌ |
| `requests` | **FAIL FAIL FAIL** ❌ |
| python 裸 socket + 手写 HTTP/1.1 | **401** ✅ |

⇒ **不是 httpx 特有**（我上一版写的"httpx/pyqwest 特有"也是错的）。
真正的分界是：**`curl` 与 python 裸 socket 可用；两个 python HTTP 库都不可用。**
这把嫌疑从"某个 HTTP 库"移到了**更下层**（python ssl 在这条特定请求路径上的行为）。

**而真正被证实的一个因素**（这一条可靠，两个方向都测了）：

```
curl 清 proxy : 401 ✅
curl 带 proxy : 000 ❌
```

⇒ **代理确实是"带它必失败"的一个独立因素**（`NO_PROXY` 不含该域名）。
wrapper 里 `unset` 代理是**必要**的 —— 但它**不足以**让 python 栈工作。

### 我在这个问题上的完整误判轨迹（三次，同因）

| # | 结论 | 依据 | 错在哪 |
|---|---|---|---|
| 1 | "httpx 与本机永久不兼容" | 1 次失败 | 采样太少 |
| 2 | "已自愈、间歇性" | 连续 3 次成功 | 连续成功 ≠ 时间跨度采样 |
| 3 | "requests 可用（有绕行）" | 1 次成功 | **与其它探针的代理环境不一致** |

**第 3 次的教训是新的**：不只采样次数不够，**还在于对照组的环境没对齐** ——
我把"清 proxy 下的 curl 成功"与"不同 proxy 条件下的 requests 成功"混为一谈。

⇒ **修正我的方法学规则**：诊断"是不是环境坏了"时，
**① 每个候选客户端重复采样；② 所有客户端在**同一份环境变量**下测；
③ 结论必须能被一条可复验命令重现。**

### 当前可靠结论

- **AGS sweep 目前持续失败**（不是间歇），孤儿沙箱**不会被自动清理 ⇒ 按量计费累积**；
- **代理是必要排除项**（wrapper 已 unset）；
- 根因仍未定位到底，但**已知 python 的两个主流 HTTP 库都失败、curl 与裸 socket 可用**；
- **下一步**：在 python 里逐层比对与 curl 的差异（HTTP 头顺序、TLS 扩展、socket 选项），
  或直接用 **subprocess 调 curl** 作为务实绕行（sweep 只需 GET 列表）。

---

## 更正之四（08:50）：**找到了可用路径，且它是 stdlib 的**

| 客户端 | 结果（清 proxy，重复采样） |
|---|---|
| `curl` | **401** ✅ |
| **`urllib.request`（stdlib）** | **200 `[]`** ✅ ← **可用** |
| python 裸 socket + 手写 HTTP/1.1 | 401 ✅ |
| `httpx` | ❌ 确定性失败 |
| `requests` | ❌ 确定性失败 |

**⇒ `urllib` 可用**，而它是 python 标准库、**且 `ags-orphan-sweep.py` 本来就已经 import 了它**
（`import urllib.request` 在第 16 行，用于 `console_exec`）。

**⇒ 结论收窄**：不是"python 不能用"，而是
**`httpx` / `requests` 这两个库在这台机器上、对该主机的 TLS/HTTP 行为有问题**；
python 自带的 `ssl` + `urllib` **完全可用**。

### 务实修法（比根因分析更快恢复）

把 `ags-orphan-sweep.py` 里的两处 e2b 调用改成 `urllib` 直连 AGS REST：
- `Sandbox.list(SandboxQuery(metadata={}))` → `GET /v2/sandboxes`（已验证返回 `[]`）；
- `Sandbox.kill(sid)` → `DELETE /v2/sandboxes/{id}`（待验证）。

**这只影响"列出/击杀沙箱"两个动作，不改变清理语义**；
且 `urllib` 是 stdlib，**不引入新依赖**。

### ⚠ 但要先确认一件事

**必须先在 AGS 上验证 `DELETE /v2/sandboxes/{id}` 的行为**（尤其鉴权头与幂等性），
**不能拿"list 通了"推断"kill 也通"** —— 这正是我这几轮反复犯的错
（用一次成功推断一个结论）。**kill 的验证要用一个真实或可控的沙箱做**。

在验证 kill 之前，**我只改 list、不动 kill**，或**两者都改但先在 dry-run 下跑**。

---

## 更正之五（09:15）：**"urllib 可用"也是错的 —— 分界是 `curl` vs「全部 Python」**

**同秒交替 4 轮**（curl 与 python 在同一条命令里轮流发同一请求）：

```
轮1  curl=401  urllib=URLError
轮2  curl=401  urllib=URLError
轮3  curl=401  urllib=URLError
轮4  curl=401  urllib=URLError
```

单进程内 `urllib` **6/6 失败**。⇒ **不是 httpx/requests 特有，是 python 整体**。

### 我为什么又一次误判"urllib 可用"

因为我看到 `_list_sandboxes()` 的警告行**没出现**，就断定"走的是 urllib 且成功了"。
**实际那一轮是 e2b 自己成功了**（该路径本来就是间歇的），**urllib 根本没被调用**。
⇒ 我把"没报错"当成了"这条路径可用"，而**没有直接确认它真的被走到**。

### 五次误判的完整轨迹（全部同因：没有控制好"我到底测了什么"）

| # | 结论 | 依据 | 错在哪 |
|---|---|---|---|
| 1 | httpx 永久不兼容 | 1 次失败 | 采样不足 |
| 2 | 已自愈/间歇 | 连续 3 次成功 | 连续成功 ≠ 时间采样 |
| 3 | requests 可用 | 1 次成功 | 对照组代理环境不一致 |
| 4 | urllib 可用 | 未见警告行 | **误以为它被调用**（实际 e2b 成功） |
| 5 | 现结论：`curl` ✅ / 全部 Python ❌ | **同秒交替 4 轮 + 单进程 6 次** | —— |

### 当前唯一可靠结论

**同一秒内交替验证**：`curl` 稳定 401；**python 的 urllib / httpx / requests 全部失败**。
⇒ 问题在 **python 的 ssl/网络栈与本机/该主机的组合**，而不是某个 HTTP 库。
⇒ **务实修法：让 sweep 走 `curl` 子进程**（sweep 只需 GET 列表 + DELETE 单个 id）。
