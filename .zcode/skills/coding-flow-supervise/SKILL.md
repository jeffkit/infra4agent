---
type: Skill
name: coding-flow-supervise
description: "ZCode-as-supervisor playbook for running flowcast's pge flow (examples/pge.flow.js) end-to-end on ANY sub-repo of the infra4agent monorepo. Use when the user wants YOU (not the agent inside the flow) to drive a feature from raw requirement → implementation → acceptance: pick a repo, frame the goal, launch pge, watch it to verdict via background-poll, intervene only on problems it can't self-heal, then verify the product independently. Location-independent: auto-resolves the flowcast path and target repo. Event-driven: arm ONE Bash watcher with run_in_background:true; the kernel wakes you with a <task-notification> at verdict or on crash. The target repo needs a configured .flowcast/ trio (gates.json + agents.json + hygiene.md) — see the 'Repo readiness' section."
mode: trigger
triggers: coding-flow, coding flow, 跑个需求, 跑一个需求, pge, plan-generate-eval, 开发一个功能, 从需求开发, drive a feature
---

# coding-flow-supervise — ZCode drives flowcast's pge flow on any sub-repo

## What this skill is

The **supervisor layer** on top of flowcast's `pge.flow.js`. You (ZCode) act as
supervisor: take a raw requirement, point pge at a target repo, launch it,
monitor to verdict, intervene only when it can't self-heal, then verify the
product independently. The **product** of the run is a code change in the
target sub-repo.

```
raw requirement (1-4 sentences)
  → YOU frame the --goal text
  → launch pge.flow.js against <repo> (backgrounds into a run dir)
  → background-poll state.json → verdict
  → YOU verify the product (run the headline gate / test independently)
  → report
```

This is the **pge counterpart** of `self-improve-supervise`. The difference:

| | self-improve-supervise | coding-flow-supervise (this skill) |
|---|---|---|
| Flow | recursive's `self-improve.flow.js` | flowcast's `examples/pge.flow.js` |
| Starting point | A written **goal file** (file:line fix task) | A **raw requirement** (1-4 sentences) |
| Has a Planner? | No (goal pre-defined) | **Yes** — Planner expands requirement into spec/sprints |
| What it produces | Maintenance fix on existing code | New feature / multi-sprint implementation |
| Target repo | recursive only | **Any** sub-repo with `.flowcast/` configured |

> **Load `self-improve-supervise` if you want the maintenance pattern.** This
> skill is for *building new things* from a requirement.

## When to use

- User says "在 X 仓跑个需求" / "drive a feature" / "用 pge 实现 Y"
- User has a **raw product requirement** (not a precise fix task) and wants it
  built end-to-end with quality gates
- User wants to validate that a repo's `.flowcast/` trio (gates/agents/hygiene)
  works by running a real feature through it

## When NOT to use

- Precise bug fix with known file:line → use `self-improve-supervise` (recursive)
  or just do the fix directly.
- User wants a periodic quality sweep (find problems) → `self-improve-cycle`.
- Target repo has no `.flowcast/` configured yet → see "Repo readiness" below.

---

## Mental model — what you're supervising

`pge.flow.js` runs as a **Node process** (not tmux — pge doesn't require tmux
unless you choose to background it that way). It writes everything under
`<repo>/.flowcast/runs/<run-id>/` (or `~/.flowcast/runs/` if repo has no
.flowcast dir). The step chain:

```
Phase 1: Planner  — requirement → spec.md (sprints array)
Phase 2: per-sprint loop:
  Generator drafts sprint contract → Evaluator reviews (≤2 rounds negotiation)
  → Generator implements (with hygiene.md injected) → quality gates (gates.json)
  → Evaluator verdict (skeptical, per-criterion) → repair loop if fail (≤maxRounds)
  → next sprint (gated: current sprint must pass before next)
```

**Verdicts** (per sprint + overall): `completed` (all sprints passed evaluator) ·
`aborted` (a sprint failed after maxRounds — later sprints skipped, error raised).

**Key mechanism — sprint dependency gate:** if a sprint's verdict is `fail` after
`maxRounds` (default 5) repair attempts, pge **aborts** — it does NOT silently
roll into the next sprint accumulating half-broken code. The flow stops and
leaves the worktree for you to inspect.

**Hygiene injection:** the Generator's build/repair prompts include the target
repo's `.flowcast/hygiene.md` content (language-specific rules). If absent, a
generic language-agnostic fallback is used. This is how pge adapts to Rust vs
TS vs Python without code changes.

---

## Repo readiness (check before launching)

pge needs three files in `<repo>/.flowcast/`. Check they exist:

```bash
REPO=<target sub-repo path>   # e.g. lavs, hil-mcp, ilink-hub
ls "$REPO/.flowcast/gates.json" "$REPO/.flowcast/agents.json" "$REPO/.flowcast/hygiene.md" 2>&1
```

- **gates.json** present? → pge will run real quality gates (build/test/lint).
  Absent → pge runs with **no gates** (evaluator-only; risky — code may not
  even compile). Strongly recommended.
- **agents.json** present? → pge resolves planner/generator/evaluator profiles
  from it. Absent → falls back to `~/.flowcast/agents.json` (user-level).
- **hygiene.md** present? → Generator gets repo-specific rules. Absent → generic
  fallback (no mod.rs / tsc / pytest specifics).

Currently configured repos (as of 2026-08-04): `flowcast`, `ilink-hub`, `lavs`,
`hil-mcp`. For others, see `flowcast/examples/README.md` for how to add the trio.

---

## SOP

### 0. Resolve paths (do this first, every session)

```bash
# Monorepo root = where mona.yaml lives. pge.flow.js lives under flowcast/.
if   [ -f mona.yaml ]; then MONO=$(pwd)
elif [ -f ../mona.yaml ]; then MONO=$(dirname "$(pwd)")
else echo "ERROR: run from monorepo root or a sub-repo" >&2; exit 1; fi
PGE="$MONO/flowcast/examples/pge.flow.js"
echo "monorepo: $MONO | pge: $PGE"
```

The target repo is `$MONO/<repo>` (e.g. `$MONO/lavs`). All git targets the
sub-repo, never the monorepo root.

### 1. Frame the goal

Turn the user's raw requirement into a crisp `--goal` string. A good pge goal:

- **1-4 sentences**, product-level (what + why), not implementation-level (how).
  pge's Planner will expand it into sprints; you don't need to decompose.
- **State the target surface** if non-obvious (e.g. "TS runtime 侧" vs
  "Python SDK 侧" for lavs dual-SDK).
- **Avoid over-scoping** — the Planner is designed to be "appropriately
  ambitious". Give it room; don't pre-decompose into sub-tasks.

Bad (too implementation-level): "在 lavs/runtime/View.ts 第 42 行加一个 type 字段"
Good (product-level): "给 lavs View 协议加一个 type 字段，让 client 能根据 type
选择渲染组件。TS 和 Python 双端都要。"

**Tell the user the goal text and target repo before launching.** Confirm.

### 2. Pre-flight checks

Before burning LLM budget, verify the environment:

```bash
REPO="$MONO/<target>"
# (a) repo readiness (see above)
ls "$REPO/.flowcast/gates.json" 2>/dev/null || echo "WARN: no gates.json — pge will run gateless"
# (b) agents available — quick dry-run confirms the skeleton + config load
node "$PGE" --dry-run --repo "$REPO" --goal "smoke test" 2>&1 | tail -5
# (c) if the repo needs a build tool on PATH (rust/python/node), confirm it's there
```

If dry-run fails, fix the config before launching a real run. Dry-run costs
nothing (no API calls).

### 3. Launch (and capture run-id)

```bash
cd "$REPO"
node "$PGE" \
  --repo "$REPO" \
  --goal "<the goal text>" \
  --agent claude \
  --max-rounds 5 \
  --max-sprints 8
```

**Capture** the `run-id` from stdout (it's printed early, format `pge-<timestamp>`)
and the run dir (`<repo>/.flowcast/runs/<run-id>/` or `~/.flowcast/runs/<run-id>/`).

> **Do NOT launch and walk away.** Arm the background watcher (step 4) in the
> SAME turn so you're notified at verdict. Otherwise the process runs
> unmonitored and you'll find it dead hours later.

**Backgrounding:** pge runs in the foreground by default (the Node process
blocks until verdict). To run it unattended:
- Option A (preferred): launch with `run_in_background: true` on the Bash call.
  The kernel wakes you when the process exits.
- Option B: nohup + redirect to a log file, then poll the log (see step 4).

### 4. Monitor — arm a background watcher (event-driven)

**Default path:** one Bash call with `run_in_background: true` that polls
`state.json` until the flow reaches a terminal state or the Node process dies.
The kernel wakes you with a `<task-notification>` at exit.

```bash
RID=pge-XXXXXXXXX
RUNDIR="$REPO/.flowcast/runs/$RID"   # or ~/.flowcast/runs/$RID
STALE_THRESHOLD=600   # state.json 10 分钟没更新 = 可能卡死
for i in $(seq 1 80); do
  sleep 90
  # ── liveness check ──
  # 注意：不要用 pgrep -f "pge.flow.js.*$RID"——RID 在命令行里被 --goal 文本隔开，
  # 匹配会失败。用宽松模式查 node + pge.flow.js：
  pgrep -f "pge.flow.js" >/dev/null 2>&1 || { echo "node gone (tick $i)"; break; }
  # ── staleness check：state.json 多久没更新了？ ──
  state_mtime=$(python3 -c "import os,time;print(int(time.time()-os.path.getmtime('$RUNDIR/state.json')))" 2>/dev/null || echo 999)
  if [ "$state_mtime" -gt "$STALE_THRESHOLD" ]; then
    echo "STALE (tick $i): state.json $state_mtime 秒未更新，flow 可能卡死在 agent 调用"
    echo "检查：tail -20 $RUNDIR/run.log.jsonl  看最后事件；pgrep -af claude 看 agent 子进程"
    # 不 break——让 pge 的 wall-clock failsafe 或 agent timeout 最终处理
  fi
  # ── progress read ──
  python3 -c "
import json
try:
  d=json.load(open('$RUNDIR/state.json'))
  print(d.get('status'), d.get('verdict','-'), d.get('currentStep','-'))
  done=[s['key'] for s in d.get('steps',[]) if s.get('status')=='done']
  print('done:', done[-6:] if len(done)>6 else done)
except Exception as e: print('read err:', e)
" 2>&1
  # break on terminal
  st=$(python3 -c "import json;d=json.load(open('$RUNDIR/state.json'));print(d.get('status',''))" 2>/dev/null)
  [ "$st" = "completed" ] && { echo "TERMINAL: completed"; break; }
done
```

Arm this with `run_in_background: true`. You spend one tool call to arm, get
woken at the end.

> **Wall-clock failsafe (recommended):** launch pge with
> `PGE_WALL_CLOCK_MS=1800000` (30 min) env var to hard-cap the total runtime.
> pge will force-exit (code 3) if it exceeds this, writing `wallClockTimeout:
> true` to state. Without this, a stuck agent call can hang the flow until the
> agent's per-call timeout (default 5-10 min) fires.

**Tick cadence:** Planner phase is fast (~1-2 min). Each sprint's Generator
implementation is the long phase (5-15 min depending on scope). Lean 90-120s
between ticks when stable; shorter after a state change.

**Liveness — two-layer check (the #1 failure mode):**
A dead flow looks identical to an idle flow. Before ever saying "healthy, no
intervention", check BOTH layers:
```bash
pgrep -f "pge.flow.js"        # Layer 1: node process alive?
pgrep -af "claude\|codex"     # Layer 2: agent subprocess alive? (if node alive but no agent subprocess = stuck)
```
If the process is gone AND state.json still says `running` AND no terminal
event was emitted → **the flow crashed.** Read the log tail and intervene.
If the process is alive but state.json hasn't updated in >10 min → **the flow
is stuck** (agent call hung). Wait for the per-call timeout, or kill +
resume with `--run-id`.

### 5. Intervene only when it can't self-heal

- **Sprint aborted (verdict fail after maxRounds)** → read
  `sprint-<N>-verdict.json` + `sprint-<N>-bugs.md` in the run dir. The Evaluator
  left a per-criterion bug list with file/line/note. Decide: (a) the bug list
  is fixable → re-frame the goal or adjust maxRounds and re-run; (b) the spec
  was wrong → revise the goal text; (c) it's a real blocker → report to user.
- **Crash (process gone, no verdict)** → read `run.log.jsonl` tail for the
  stack trace. Apply minimal fix (config, PATH, missing dep), then **resume**
  with `--run-id <id>` (pge is checkpoint-resumable — completed sprints are
  skipped, it resumes from the failed one).
- **Gate repeatedly red** → check if it's an environment issue (missing CLI,
  wrong PATH) vs a real code issue. The repair loop handles code issues
  (maxRounds=5); only step in if the gate itself is misconfigured.
- **Decision only a human can make** → stop the watcher, ask the user crisply.

### 6. Reach verdict, verify, report

When `status: completed`:

1. **Read the report**: `<RUNDIR>/report.md` — shows sprint breakdown + verdicts.
2. **Verify the product independently** (don't just trust the green gates):
   - `cd "$REPO" && git log --oneline -5` — did the Generator's changes land?
     (pge doesn't auto-commit to main by default; changes may be in the
     working tree or a worktree. Check `git status`.)
   - Run the **headline gate** yourself: e.g. for lavs `pnpm test`, for
     hil-mcp `cd packages/hitl-server && uv run pytest`, for ilink-hub
     `cargo test --all-features`.
   - **Confirm the requirement is met**, not just that gates pass. Read the
     diff: `git -C "$REPO" diff` (or the worktree diff). Does it actually
     implement what the goal asked for?
3. **Hygiene compliance check**: scan the diff for violations of the repo's
   `hygiene.md` rules (e.g.裸 `unwrap()` in ilink-hub, missing Alembic migration
   in hil-mcp, TS/Python drift in lavs). The Evaluator should catch these, but
   verify independently — especially for rules the gates don't enforce.
4. **Report** to the user:
   - Goal + repo + run-id
   - Sprints planned vs completed, verdict
   - Key files changed (with the diff summary)
   - Any hygiene concerns or follow-ups
   - **Do NOT commit/push unless the user explicitly asks.** "Land" and
     "publish" are different actions.

---

## Discipline (the lessons — read once, apply always)

1. **Dry-run before real run.** Always. It catches config errors (bad
   gates.json, missing agents.json, syntax errors in the flow) for free.
   A real run that fails on config wastes LLM budget.
2. **Liveness before "healthy".** A crashed pge emits nothing; checking only
   `state.json == running` will have you narrate progress over a corpse.
   `pgrep -f pge.flow.js` first, every tick.
3. **Capture run-id at launch.** You need it for the watcher, for resume, and
   for reading the run dir. Derive the run dir path from it.
4. **The Evaluator is skeptical by design.** A `fail` verdict is not a bug in
   the flow — it's the Evaluator doing its job. Read the per-criterion
   findings before concluding the run "failed"; the Generator may have done
   90% right and the Evaluator caught a real gap.
5. **Sprint dependency gate is strict.** If sprint N fails, sprint N+1 doesn't
   run. Don't expect partial progress across sprints — expect a clean stop.
   Resume with `--run-id` after fixing the blocker.
6. **Verify the product yourself.** Green gates ≠ correct code. Re-run the
   headline test. Read the diff. Confirm the requirement is actually met,
   not just that something compiled.
7. **Hygiene.md is the customisation point.** If the Generator produces
   Rust-idiomatic code for a Python repo (or vice versa), the hygiene.md is
   missing or weak. Fix the hygiene.md, not the flow code.
8. **All git in the sub-repo.** The monorepo root only owns `mona.yaml` +
   docs. pge's changes land in the target sub-repo's git history.
9. **Push only when the user asks.** pge runs don't auto-push. Confirm the
   remote state first if asked to push.
10. **Cost awareness.** A real pge run makes many LLM calls (Planner +
    per-sprint Generator build + Evaluator + repair rounds). A 3-sprint
    feature with 2 repair rounds each ≈ 15-20 agent calls. Warn the user
    if the goal seems large (maxSprints > 4) before launching.

---

## Quick reference

```bash
# ── resolve paths ──
MONO=$(pwd)   # if at monorepo root
PGE="$MONO/flowcast/examples/pge.flow.js"
REPO="$MONO/<target-sub-repo>"

# ── dry-run (free, catches config errors) ──
node "$PGE" --dry-run --repo "$REPO" --goal "smoke"

# ── launch real run (with wall-clock failsafe) ──
cd "$REPO"
PGE_WALL_CLOCK_MS=1800000 node "$PGE" --repo "$REPO" --goal "..." \
  --agent minimax --max-rounds 5 --max-sprints 3
# capture run-id from stdout (format: pge-<timestamp>)
# NOTE: --agent minimax auto-falls-back to 'minimax' for all 3 roles if
#        minimax-planner/minimax-evaluator don't exist (pge >=2026-08-04)

# ── background-poll to terminal (arm with run_in_background:true) ──
# NOTE: pgrep uses "pge.flow.js" (not RID) — RID is buried in --goal text and won't match.
RID=pge-XXXX
RUNDIR="$REPO/.flowcast/runs/$RID"
for i in $(seq 1 80); do
  sleep 90
  pgrep -f "pge.flow.js" >/dev/null 2>&1 || { echo "node gone (tick $i)"; break; }
  python3 -c "import json;d=json.load(open('$RUNDIR/state.json'));print(d['status'],d.get('verdict','-'),d.get('currentStep','-'));print('done:',[s['key'] for s in d['steps'] if s['status']=='done'][-6:])" 2>&1
  st=$(python3 -c "import json;print(json.load(open('$RUNDIR/state.json')).get('status',''))" 2>/dev/null)
  [ "$st" = completed ] && break
done

# ── resume after crash/intervention (completed sprints skipped) ──
node "$PGE" --run-id "$RID" --repo "$REPO" --goal "..." --agent claude

# ── verify product ──
git -C "$REPO" log --oneline -5
git -C "$REPO" diff          # or worktree diff
# run the headline gate yourself (see repo's gates.json for the command)

# ── read sprint verdict details ──
cat "$RUNDIR/sprint-1-verdict.json" | python3 -m json.tool
cat "$RUNDIR/sprint-1-bugs.md"       # evaluator's bug list (if fail)
cat "$RUNDIR/report.md"              # overall report
```
