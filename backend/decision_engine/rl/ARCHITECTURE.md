# BC-FRAP — Architecture

> **Subordinate document.** The permanent source of truth is
> [`BC_FRAP_PROJECT_CONSTITUTION.md`](BC_FRAP_PROJECT_CONSTITUTION.md); this file is
> the operational v0.1 work order. On conflict, the Constitution wins.
> Amendment via Constitution App. B: PCE-weighted **actuated MaxPressure** is added
> to the required baseline list in §2.7.

**Bangalore-Calibrated Fairness Reinforcement Adaptive Pressure.**
Traffic-signal RL for Indian mixed traffic: heterogeneous modal mix (two-wheeler
dominant), monsoon context, zone-heterogeneous PCE, fairness across modes and
approaches.

This document has two parts:

- **Part I — v0.1**: the workshop-paper system. Fully scoped, buildable by one
  person in ~2–3 weeks. This is the work order.
- **Part II — v2.0 roadmap**: the full-vision system (prediction, transfer
  meta-learning, corridor GNN, multi-agent, production deployment). Parked.
  Nothing in Part II may be started before Part I ships.

Design decisions marked **OPEN(Qn)** are owned by Rishika and collected in §6.
Decisions marked **DECIDED** were settled in working sessions and are recorded
with their rationale.

---

## Part I — v0.1 (the paper)

### 1. Overview

Two tracks. Real data **calibrates and validates**; simulation **trains and
evaluates**. The RL control loop never touches video at v0.1.

```
REAL-DATA TRACK (offline, calibration + validation only)
  aerial/CCTV clips
    └─► Roboflow detector (done, mAP50 92.97, 9 classes)
          └─► modal-mix distributions, per-class counts
                ├─► SUMO demand calibration
                └─► paper validation table

SIM TRACK (training + evaluation)
  SUMO single intersection (to build)
    └─► state vector s_t, context vector c_t
          ├─► MetaRewardNet w(c_t; θ)          [novelty]
          │     └─► r_t = w(c_t)·φ(s_t)
          └─► Ape-X DQN π (done, smoke-tested)
                └─► signal phase action
```

### 2. Components

#### 2.1 Perception — EXISTS

- Model: `vehicle-classification_1-gq172/1` (Roboflow), 9 classes,
  mAP50 92.97 / P 89.5 / R 88.9. Entry point `../video_detector.py`;
  `../workflow_detector.py` is fallback.
- v0.1 role: extract **modal-mix distributions** from available clips (all
  moving-camera, so per-frame counts only — no world-coordinate state; see
  `perception/README.md` and camera-motion triage results).
- Explicit non-role: perception is **not** in the control loop. The paper's
  claim is "sim demand calibrated from measured Indian modal mix", not
  "camera-in-the-loop control".
- ByteTrack, homography, lane-width estimation: **deferred to v2.0** until
  fixed-camera footage exists (self-shoot or RTI outcome).

#### 2.2 Environment — TO BUILD (next task)

- SUMO, one 4-arm signalized intersection built in `netedit`.
- Gymnasium API, matching the `make_env(seed)` contract in `apex/train.py` —
  the agent code does not change when the env is swapped in.
- Vehicle classes: two-wheeler, car, auto-rickshaw, bus, truck, with per-class
  SUMO vTypes (length, accel, sigma). Demand split initialized from published
  Indian arterial studies, then replaced by measured mix from §2.1.
- Safety invariants live **in the env, not the policy**: minimum green,
  yellow/all-red interphase, maximum red (starvation cap). The agent cannot
  select an unsafe or starving schedule even with a broken reward.
- Decision interval: agent acts every Δt sim-seconds (default 5 s).
- **OPEN(Q2)** — action space: (a) choose next phase from K phases, or
  (b) binary keep/switch on a fixed cycle order. (a) is FRAP-style and more
  expressive; (b) is easier to learn and analyze. Owner must pick and justify.

#### 2.3 State and context vectors

State `s_t` (candidate fields — **OPEN(Q1)**, owner finalizes the exact list
and justifies every field):

| Candidate field | Per | Notes |
|---|---|---|
| queue length (halting count) | approach | TraCI native |
| PCE-weighted count | approach × class | the heterogeneity story |
| cumulative waiting time | approach | delay signal |
| current phase (one-hot) + elapsed | intersection | |
| time-of-day (sin, cos) | global | |

Context `c_t` (feeds MetaRewardNet, *not* necessarily the policy):
monsoon flag, AQI bucket, zone type (CBD/arterial/residential), peak flag,
queue-pressure summary. **DECIDED**: monsoon is context, not a reward term —
the network should *learn* monsoon behaviour, not have it hardcoded.

PCE at v0.1: per-class, **zone-conditioned** constants (2W lower PCE in CBD
than highway). Lane-width-*measured* PCE requires homography → v2.0.

#### 2.4 Reward — the contribution

Form (**DECIDED**):

    r_t = Σᵢ wᵢ(c_t; θ) · φᵢ(s_t)

- `φᵢ`: reward terms, **normalized** (z-scored against a fixed-time baseline
  rollout; stats frozen in `reward_stats.json`). No raw-unit terms — linear
  sums over raw units optimize units, not preferences.
- `w(c_t; θ)`: softmax output of MetaRewardNet. Never hand-tuned.

Candidate terms (**OPEN(Q3)** — owner selects the final ~4 and writes, for
each: why it's in, what it measures, and how a policy could hack it):

| Term | Measures | Known hacking mode |
|---|---|---|
| PCE throughput | vehicles cleared, weighted | starve minor approaches |
| total delay / queue | commuter pain | never switch (avoid lost time) |
| modal equity | per-class delay variance | serve nobody equally badly |
| starvation / max-red penalty | fairness across approaches | (backed by env hard cap) |
| spillback indicator | queue reaching upstream | — |
| emergency priority | preemption events | belongs as env constraint, not term |

Reward-hacking mitigations (**DECIDED**): env-level hard constraints
(min/max green, max red) bound the worst exploits; normalization prevents
scale domination; ablations (§2.7) expose which term drives which behaviour.

**OPEN(Q4)** — meta objective `J_meta` for training θ (must be measurable,
not gameable by collapsing weight mass, defensible to reviewers):
(a) mean delay per vehicle on held-out episodes,
(b) p90 delay (fat tails punished — equity-flavoured),
(c) canonical fixed-weight objective from a published study.

#### 2.5 MetaRewardNet — DECIDED

- MLP: `c_t (~10–15) → 64 → 64 → n_terms`, softmax head.
- Trained by meta-gradient (Xu et al. 2018): inner loop trains DQN on
  `r = w·φ` for N steps; outer loop differentiates `J_meta` on held-out
  rollouts through the inner update (`create_graph=True`).
- Fallback if meta-gradient is unstable (**risk R2**): grid of fixed-weight
  configurations + context-switched lookup. Weaker but still a paper.
- Paper money-figure: heatmap of learned `w(c)` across
  {monsoon × peak × zone} — "the network shifts weight from throughput to
  equity during monsoon peaks" is the memorable result.

#### 2.6 Agent — EXISTS

`apex/` — single-process Ape-X-style DQN. Vectorized actors with per-actor
epsilon, prioritized replay (sum tree, annealed IS-β), n-step returns,
double + dueling, Polyak targets. See `apex/README.md` for the
component-to-paper mapping and the "why Ape-X vs Rainbow/R2D2/IMPALA/PPO/SAC"
defense. Gate: must solve CartPole-v1 (≥475 mean) before SUMO wiring.

#### 2.7 Baselines and experiments

Baselines (v0.1):

1. Fixed-time (static plan)
2. Webster (delay-minimizing cycle/splits from demand)
3. DQN, fixed equal weights
4. DQN, fixed hand-tuned weights
5. *Stretch:* FRAP from a public implementation — include only if it runs
   within 2 days of effort, else cite-and-defer.

Cut from v0.1 (→ roadmap): PressLight, CoLight, MPLight, QMIX, MAPPO — all
multi-intersection and/or multi-week reimplementations.

Experiment grid (**OPEN(Q5)** — owner commits to the final matrix):

- Conditions: {policy} × {dry/monsoon} × {peak/off-peak} — 4 regimes.
- 5 seeds per cell; report mean ± 95% CI.
- Metrics: mean delay, p90 delay, per-class delay (equity), PCE throughput,
  max approach wait (starvation).
- Stats: paired t-test vs strongest baseline per regime, Holm–Bonferroni
  correction across comparisons.
- Ablations: learned-w vs fixed-equal vs fixed-tuned; per-term knockouts;
  context-blind MetaRewardNet (shuffled c_t) as sanity control.

#### 2.8 Non-goals for v0.1

No production deployment stack, no live dashboard coupling (the SynCity
frontend may *demo* results later; it is not paper content), no
multi-intersection coordination, no traffic prediction, no camera-in-loop.

### 3. Repository layout (v0.1 target)

```
backend/decision_engine/rl/
├── apex/           # agent (exists)
├── perception/     # clip triage, modal-mix extraction (exists, partial)
├── env/            # SUMO Gym env, netedit files, vTypes      [next]
├── reward/         # terms φ, normalization stats, MetaRewardNet
├── baselines/      # fixed_time.py, webster.py
├── experiments/    # configs, seeds, runners, analysis notebooks
└── ARCHITECTURE.md # this file
```

### 4. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | SUMO realism questioned | sensitivity analysis over modal-mix ranges; measured-mix calibration |
| R2 | meta-gradient unstable | fixed-weight fallback (§2.5); still publishable |
| R3 | timeline slip | FRAP baseline is stretch-only; Part II frozen |
| R4 | footage is moving-camera only | claims limited to modal mix; state comes from sim; fixed-camera collection planned |
| R5 | "why not real data end-to-end" review | Path-B framing stated up front: calibrate + validate real, train in sim |

---

## Part II — v2.0 roadmap (parked; nothing starts before v0.1 ships)

| Subsystem | What it adds | Earns its way in when… |
|---|---|---|
| ByteTrack tracking | trajectories, speeds, per-vehicle delay from video | fixed-camera footage exists |
| Homography + lane-width PCE | *measured* geometry-conditioned PCE | fixed-camera footage exists |
| Traffic prediction (TFT / temporal GNN) | 5–30 min demand forecasts in state | v0.1 shows reactive control saturating |
| Transfer meta-learning (MAML/PEARL/RL²/Reptile) | fast adaptation to new intersections | ≥3 distinct intersection scenarios exist. **Note:** this is a *different* "meta" than MetaRewardNet — separate thread, separate paper |
| GAT over intersections | corridor-level state sharing | multi-intersection SUMO scenario exists |
| Multi-agent (QMIX/MAPPO) + credit assignment | network-level coordination, spillback control | paper #2 |
| Event-surge handling | festival/IT-corridor demand shocks | context vector v2 |
| Deployment (FastAPI, Docker, Redis, Kafka, PostgreSQL, Prometheus, Grafana) | production pipeline | a pilot partner exists; zero paper value before that |

---

## 5. Timeline (v0.1)

| Days | Work |
|---|---|
| 1 | CartPole validation of `apex/`; SUMO install; netedit intersection |
| 2–4 | `env/`: Gym wrapper, vTypes, demand calibration, safety invariants |
| 5 | `reward/`: terms φ, normalization, fixed-weight training runs |
| 6–8 | MetaRewardNet + meta-gradient; fallback path if unstable |
| 9–10 | baselines (fixed, Webster, fixed-weight DQNs) |
| 11–12 | experiment grid, 5 seeds, stats |
| 13–15 | writing + w(c) heatmap figure |

## 6. Open decisions — owner: Rishika

| Q | Decision | Options on the table | Needed by |
|---|---|---|---|
| Q1 | final state-vector fields + per-field justification | §2.3 table | before env build (day 2) |
| Q2 | action space | choose-phase vs keep/switch | before env build (day 2) |
| Q3 | final reward terms (~4) + hacking analysis each | §2.4 table | day 5 |
| Q4 | J_meta | mean delay / p90 delay / canonical fixed | day 6 |
| Q5 | experiment matrix commit | §2.7 grid | day 11 |

Answers get recorded here with rationale — this table is the interview-prep
artifact: every row is a "why did you choose X" question you can already answer.
