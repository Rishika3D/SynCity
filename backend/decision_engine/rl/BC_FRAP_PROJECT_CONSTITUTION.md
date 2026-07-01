# BC-FRAP Project Constitution

**Bangalore-Calibrated Fairness Reinforcement Adaptive Pressure**
*Permanent source of truth. Implementation may change; architecture evolves; research decisions remain documented forever.*

---

## How to read this document

Every section carries one of three statuses:

- 🟢 **IMPLEMENTED** — finalized, backed by code in this repository or by an explicitly recorded design decision.
- 🟡 **PLANNED** — researched proposal with alternatives and a recommendation. **Not final.** Critical choices inside remain OPEN DECISIONS.
- 🔴 **FUTURE RESEARCH** — intentionally out of current scope. Documented for vision continuity. Speculative, not a promise.

Every section ends with a status footer:
`Status · Priority · Complexity · Research risk · Implementation risk · Sprint`

**Sprint map** (aligned to `ARCHITECTURE.md` §5 timeline):
S0 = agent validation & setup · S1 = SUMO environment · S2 = reward + MetaRewardNet · S3 = baselines + experiments · S4 = paper writing · F = unscheduled future.

**The ownership contract (binding on all contributors, human or AI):**
Critical research decisions — observation space, action space, reward formulation, J_meta, algorithm selection, prediction architecture, meta-learning strategy, graph architecture, evaluation methodology — are **OPEN DECISIONS owned by Rishika Kherniwal**. Assistants educate, compare, critique, and recommend. They do not decide. See §42.

**Open decision registry:** Q1 state vector (§9) · Q2 action space (§10) · Q3 reward terms (§11) · Q4 J_meta (§11) · Q5 experiment matrix (§18) · Q6 exploration mechanism (§13) · Q7 logging backend (§26). Resolved decisions move to the decision log in §41 with dated rationale.

---

## 1. Executive Summary

BC-FRAP is a research-grade traffic-signal RL framework targeting the assumptions that public traffic-RL research makes and that heterogeneous Indian traffic violates: lane discipline, homogeneous vehicles (PCE = 1), weather-free operation, and throughput-only objectives. Version 0.1 (the workshop paper) trains a single-process Ape-X-style DQN on a SUMO intersection calibrated from real detector output, with a **normalized multi-term reward whose weights are a learned function of context** (meta-gradient, Xu et al. 2018) rather than hand-tuned constants. Fairness across vehicle classes is a first-class evaluated metric, not an afterthought. Everything beyond this — prediction, transfer, corridor coordination, deployment — is documented here as conditioned future work.

`Status: 🟢 · Priority: Critical · Complexity: — · Research risk: — · Impl risk: — · Sprint: —`

## 2. Vision

A traffic-control research platform for mixed-mode Indian cities in which (a) perception, state estimation, control, and evaluation are modular and separately replaceable; (b) every efficiency claim is accompanied by a fairness claim; (c) context (monsoon, air quality, zone) shapes *objectives*, not just observations; and (d) the system is honest about the sim-to-real gap instead of hiding it.

`Status: 🟢 · Priority: High · Complexity: — · Research risk: — · Impl risk: — · Sprint: —`

## 3. Problem Statement

**Purpose.** Signal control research optimizes homogeneous, lane-disciplined traffic. Indian urban traffic is ~60–75% two-wheelers (city-dependent; verify per-city figures before citing), with auto-rickshaws, buses, and trucks sharing unmarked effective lanes; two-wheelers filter to the stop line, invalidating lane-based queue features; monsoon changes both demand and safe control policy; and pure-throughput objectives systematically deprioritize the dominant mode when it carries fewer passengers per detected object than its PCE-weighted share.

**Formally:** learn a signal-control policy π(a|s) for a signalized intersection with heterogeneous vehicle classes k ∈ K, each with zone-conditioned passenger-car-equivalent weight PCE(k, z), optimizing a context-dependent multi-objective reward r = w(c)·φ(s), such that efficiency gains do not come at the cost of per-class delay disparity.

**Assumptions:** SUMO can represent heterogeneous kinematics well enough for relative policy comparison (R1, §33); detector-measured modal mix is a valid demand prior; a single intersection is a meaningful unit of study (supported by FRAP/PressLight precedent).

`Status: 🟢 · Priority: Critical · Complexity: — · Research risk: Low · Impl risk: — · Sprint: —`

## 4. Research Questions

- **RQ1 (primary).** Does context-conditioned reward weighting, trained by meta-gradient, outperform fixed-weight linear rewards on held-out objectives in heterogeneous-calibrated simulation — and does the learned w(c) surface admit a domain interpretation?
- **RQ2.** Do zone-conditioned PCE weights change learned policies and outcome distributions relative to uniform PCE, and in which regimes?
- **RQ3.** Can a modal-equity reward term reduce per-class delay disparity at bounded efficiency cost (quantify the trade-off curve)?
- **RQ4 (🔴).** Do policies trained under one context distribution transfer zero-/few-shot to unseen contexts (new intersection geometry, unseen weather mix)?

Each RQ maps to experiment cells in §18. RQ1–RQ3 are answerable in v0.1; RQ4 requires ≥3 intersection scenarios (§17 prerequisite).

`Status: 🟡 · Priority: Critical · Complexity: — · Research risk: Medium · Impl risk: — · Sprint: S3`

## 5. Literature Review

⚠️ **Citation protocol:** characterizations below are from the assistant's training knowledge and are believed accurate; **every entry must be verified against the primary source by the owner before appearing in the paper.** Priority reading order for the owner: Varaiya (2013) → Zheng et al. FRAP (2019) → Wei et al. PressLight (2019); then skim CoLight, MPLight, and Wei et al.'s traffic-RL survey (2019/2021).

| System | Core idea | Key assumptions | Strengths | Weaknesses | Heterogeneous-traffic applicability |
|---|---|---|---|---|---|
| **Webster** (1958) | Analytic delay-minimizing cycle & splits from demand/saturation ratios | Poisson arrivals, stable demand, known saturation flow, homogeneous units | Zero training, interpretable, universal baseline | Static; saturation-flow concept degrades without lane discipline | PCE-adjusted Webster is our strongest classical baseline |
| **SCATS** (1970s–, Sydney) | Adaptive plan selection from stop-line detectors | Lane-based detection; cycle-centric | Deployed at scale for decades | Reactive, plan-library-bound, proprietary tuning | Stop-line loop counts mismeasure 2W filtering |
| **SCOOT** (1981–, UK) | Incremental cycle/split/offset optimization from upstream detectors | Smooth demand drift; detector placement | Continuous small adaptations | Slow under surges; infrastructure-heavy | Same detector-model mismatch |
| **Max Pressure** (Varaiya 2013) | Serve movement with max upstream−downstream queue differential; provably throughput-optimal under assumptions | Known turn ratios, **infinite queue capacity**, unweighted vehicles | Decentralized, theory-backed, no training | Spillback violates capacity assumption; vehicle-count pressure ignores heterogeneity | **PCE-weighted pressure is a natural BC-FRAP reward candidate** (§11) |
| **FRAP** (Zheng et al., CIKM 2019) | Phase-competition network invariant to symmetry/rotation of movements | Movement-level queues from lane detectors; homogeneous vehicles | Sample-efficient; strong single-intersection results | Lane-discipline dependency; no context | Architecture idea survives; its input features don't |
| **PressLight** (Wei et al., KDD 2019) | MaxPressure theory as RL reward | Same as MaxPressure + DQN assumptions | Principled reward; arterial results | Homogeneous pressure; no fairness | Direct ancestor of our PCE-pressure term |
| **CoLight** (Wei et al., CIKM 2019) | Graph attention over neighboring intersections | Multi-intersection network; communication | Coordination without hand-crafted offsets | Training cost; needs network-scale sim | 🔴 deferred to corridor phase (§16) |
| **MPLight** (Chen et al., AAAI 2020) | FRAP + pressure + parameter sharing at 1000+ signal scale | Homogeneous; shared dynamics across intersections | City-scale demonstration | Same heterogeneity blindness | Parameter sharing idea relevant to §17 |
| **SUMO-RL / RESCO** (Alegre; Ault & Sharon 2021) | Gym wrappers + benchmark scenarios | SUMO fidelity | Reproducible baselines, community standard | Default scenarios are homogeneous | Our env should follow its API conventions for comparability |

`Status: 🟡 (verify-before-cite) · Priority: High · Complexity: Low · Research risk: Low · Impl risk: — · Sprint: S4 (related work), reading in S1`

## 6. Research Gaps

**Demonstrated in literature** (citable after verification):
- G1. Standard PCE values are contested for Indian conditions; Indian-specific PCE studies (CRRI, IIT transportation groups) show context dependence — supports zone-conditioned PCE.
- G2. Traffic-RL benchmarks (RESCO scenarios, CityFlow configs) are homogeneous-vehicle; no public benchmark evaluates per-class fairness.
- G3. MaxPressure's stability proof assumes unweighted vehicles and unbounded queues — formally inapplicable to spillback-prone heterogeneous approaches.

**Hypotheses requiring validation** (our experiments must earn these):
- H1. Fixed-weight rewards are Pareto-dominated by context-conditioned weights across regimes (RQ1).
- H2. Monsoon regime shifts the optimal weight vector materially (the w(c) heatmap either shows this or falsifies it — both are results).
- H3. Uniform-PCE training measurably harms two-wheeler delay relative to PCE-aware training (RQ2/RQ3).

Do not present H1–H3 as facts anywhere until the corresponding experiment exists.

`Status: 🟡 · Priority: Critical · Complexity: — · Research risk: Medium · Impl risk: — · Sprint: S3–S4`

## 7. Research Contributions

| # | Contribution | Novelty | Impact | Difficulty | Evaluation | Effort | Risk | Evidence required |
|---|---|---|---|---|---|---|---|---|
| C1 | Zone-conditioned PCE state & reward weighting | Application-novel (PCE known in traffic eng.; unused in traffic RL) | Medium-high for Indian deployment realism | Low | RQ2 ablation | days | Low | uniform-vs-zoned PCE result table |
| C2 | Meta-gradient context-conditioned reward weights for signal control | Method transfer (Xu 2018) to a new domain + interpretable w(c) | High — the headline | High | RQ1 grid + heatmap | 1–2 wk | Med-high (R2) | learned-w beats fixed-w with CIs; heatmap |
| C3 | Modal-fairness evaluation protocol for mixed traffic | New evaluation lens; no public benchmark does per-class equity | Medium; reusable by others | Low | per-class delay + disparity metrics everywhere | days | Low | full metric suite in all tables |
| C4 | Detector-calibrated Indian demand for SUMO (9-class pipeline) | Engineering contribution | Medium; reproducibility asset | Low-med | calibration sensitivity analysis | days | Low (R4) | modal-mix validation table |

Honest framing: **C2 is the paper.** C1/C3/C4 make C2 credible and Indian-specific. If C2's meta-gradient fails (R2), fallback: C1+C3 with a fixed-weight context-*switched* scheme — a weaker but real paper.

`Status: 🟡 · Priority: Critical · Complexity: — · Research risk: Medium · Impl risk: — · Sprint: S2–S3`

## 8. System Architecture

Two tracks; real data calibrates and validates, simulation trains and evaluates (Path-B decision, session log 2026-06).

```
REAL-DATA TRACK (offline)                       SIM TRACK (training/eval)
 clips ─► detector 🟢 ─► modal mix ──┐           SUMO env 🟡
          (Roboflow 9-class,         ├─calibrate─►  ├─► s_t, c_t
           mAP50 92.97)              │              ├─► MetaRewardNet w(c;θ) 🟡
          tracking (ByteTrack) 🔴 ───┘              │     └─► r = w·φ(s)
          homography / lane width 🔴                ├─► Ape-X DQN 🟢
                                                    └─► signal phase
 prediction (TFT/TGNN) 🔴        multi-agent / GAT 🔴        deployment stack 🔴
 experiment engine 🟡 (configs, seeds, runners, stats)
 storage 🟡 (runs/ as versioned artifacts; DB 🔴)
 monitoring 🟡 (training curves) / 🔴 (production)
 dashboard: SynCity frontend may *demo* results; never paper-critical
```

Module rationale: perception exists and is deliberately out of the control loop (claim discipline, R4/R5); env isolates safety invariants from learning (§12); reward module isolates the contribution for ablation; experiment engine enforces §18 statistics; everything 🔴 has entry conditions in Part II sections.

`Status: 🟡 (skeleton 🟢) · Priority: Critical · Complexity: Medium · Research risk: Low · Impl risk: Medium · Sprint: S1–S3`

## 9. State Representation — **OPEN DECISION Q1**

**Purpose.** Define what the agent sees. Every feature must earn its place: features cost sample efficiency (curse of dimensionality) and sim-to-real credibility (can a real deployment measure it?).

Candidate features (owner selects final set and records justification per feature in §41):

| Feature | Definition | Units | Normalization | Range | Source | Cost | Noise (real-world) | Importance | Removal candidate? |
|---|---|---|---|---|---|---|---|---|---|
| halting count | vehicles with v<0.1 m/s | count | ÷ capacity | 0–~50 | TraCI `getLastStepHaltingNumber` | free | med (occlusion) | high | no |
| PCE-weighted count | Σₖ PCE(k,z)·nₖ per approach | PCE units | ÷ PCE capacity | 0–~40 | TraCI + class table | free | med | **core (C1)** | no |
| cumulative wait | Σ per-vehicle accumulated wait per approach | s | z-score vs fixed-time stats | 0–~600 | TraCI | free | high in real world | high | no |
| current phase | one-hot | — | — | {0,1}ᴷ | controller | free | none | required | no |
| phase elapsed | time in current phase | s | ÷ max green | 0–1 | controller | free | none | high | no |
| time-of-day | (sin, cos) of hour | — | native | [−1,1] | clock | free | none | med | maybe |
| mean speed / approach | space-mean speed | m/s | ÷ v_max | 0–1 | TraCI | free | med | med | yes |
| occupancy / approach | detector occupancy | % | native | 0–1 | TraCI | free | med | med | yes (redundant w/ queue?) |
| spillback flag | queue reaches upstream edge | bool | — | {0,1} | TraCI geometry | cheap | high | med | keep if spillback term chosen (Q3) |

Context vector c_t (feeds MetaRewardNet; **decided separately from s_t**): monsoon flag, AQI bucket, zone type one-hot, peak flag, queue-pressure scalar. **DECIDED:** monsoon/AQI live in context, not as reward terms — the network learns context-appropriate weighting (session decision, 2026-06).

Interactions to note: PCE count partially subsumes halting count (correlated); occupancy vs queue redundancy should be checked by feature ablation. Recommendation: start minimal (rows 1–6), add only on evidence. **Owner decides.**

`Status: 🟡 OPEN(Q1) · Priority: Critical · Complexity: Low · Research risk: Low · Impl risk: Low · Sprint: S1 (blocks env)`

## 10. Action Space — **OPEN DECISION Q2**

| Option | Definition | Learning implications | Deployment implications | Used by |
|---|---|---|---|---|
| (a) Phase selection | choose any of K phases each Δt | Most expressive; larger exploration space; can produce erratic sequencing (mitigated by min-green in env) | Needs controller supporting acyclic phasing | FRAP, MPLight |
| (b) Keep/Switch | binary: extend current phase or advance in fixed cycle order | Small action space, fast learning, stable; cannot skip irrelevant phases (wasteful on empty approaches) | Trivially maps to existing controllers | PressLight variants |
| (c) Adaptive green | choose next phase **duration** from continuous/discretized set | Duration control decoupled from ordering; larger/continuous action space; DQN needs discretization | Natural for engineers | SCATS-like |
| (d) Hybrid (a)+(c) | select phase and duration | Most flexible; largest space, slowest learning | Complex | rare |

Critique: (a) is the research-standard for FRAP-family comparison and exposes the policy differences the reward contribution needs to show; (b) is the robust low-risk choice if training time becomes the bottleneck; (c)/(d) are over-scoped for v0.1. **Recommendation: (a), with (b) as documented fallback.** Trade-off accepted: (a)'s erratic-switching risk is bounded by env min-green/interphase invariants (§12). **Owner decides.**

`Status: 🟡 OPEN(Q2) · Priority: Critical · Complexity: Low · Research risk: Low · Impl risk: Low · Sprint: S1 (blocks env)`

## 11. Reward Engineering — **OPEN DECISIONS Q3 (terms), Q4 (J_meta)**

**Decided form** (session, 2026-06): `r_t = Σᵢ wᵢ(c_t;θ)·φᵢ(s_t)` with φᵢ z-scored against a frozen fixed-time-baseline rollout (`reward_stats.json`); w from MetaRewardNet softmax. Rationale: raw-unit linear sums optimize units, not preferences; softmax prevents weight collapse to unbounded values (but not to a one-hot — see hacking table).

**Candidate formulations compared:**

| Formulation | Intuition | Pros | Cons | Hacking risk | Interpretability | Complexity |
|---|---|---|---|---|---|---|
| F1: PCE-pressure only (PressLight-style, PCE-weighted) | serve max weighted queue differential | theory-adjacent (Varaiya), single term, hard to hack | no fairness, no context; single-objective | low | high | low |
| F2: fixed-weight linear multi-term | standard practice | simple, ablatable | weights arbitrary; context-blind — the gap we attack | med | med | low |
| F3: **meta-weighted multi-term (recommended)** | objectives depend on context | the contribution (C2); interpretable w(c) | meta-gradient instability (R2); two-timescale training | med (see below) | high (heatmap) | high |
| F4: constrained/Lagrangian (hard constraints as costs) | safety/starvation as constraints, not preferences | principled for non-tradeable requirements | heavier machinery; v0.1 gets same effect from env invariants | low | med | high |

F1 doubles as an *additional baseline* against F3 — include it in §18. F4 is 🔴 (idea bank).

**Candidate terms** (owner selects ~4; for each chosen term, owner writes the hacking analysis in §41):

| Term φᵢ | Measures | Hacking mode | Mitigation |
|---|---|---|---|
| PCE throughput | weighted clearance | starve minor approaches to farm the major | max-red env invariant + starvation metric always reported |
| total delay / queue | commuter pain | avoid switching (lost-time avoidance) → gridlock one approach | min/max green invariants |
| modal equity (per-class delay variance or Gini) | fairness across classes | equalize by serving everyone *badly*; or exploit variance's scale-dependence | pair with throughput term; report absolute per-class delays, never only the ratio |
| starvation penalty | max approach wait | — (backstopped by env max-red) | env invariant is primary; term shapes before cap binds |
| spillback indicator | upstream blockage | suppress detection by holding upstream red | keep as observation even if not a term |
| emergency preemption | — | **rejected as reward term** — belongs as env constraint (session decision) | — |

**Meta-objective J_meta (Q4)** — trains θ; must be (a) measurable on held-out episodes, (b) not gameable by collapsing w to one-hot, (c) defensible:
- (i) mean delay/vehicle — simple, standard; risk: J_meta ≈ one φ term ⇒ w collapses toward that term (degenerate but *informative* — report it if it happens);
- (ii) p90 delay — tail-sensitive, equity-flavored; noisier gradient;
- (iii) fixed canonical weighted objective from a published study — decouples J_meta from any single term; provenance burden.
Recommendation: (i) primary + (ii) reported; consider (iii) as robustness check. **Owner decides.**

**Reward-hacking doctrine:** env-level invariants bound worst-case exploits (§12); normalization prevents scale domination; §18 ablations attribute behavior to terms; per-class and per-approach metrics are **always** reported so hacks are visible rather than hidden by aggregates.

`Status: 🟡 OPEN(Q3,Q4); form 🟢 · Priority: Critical · Complexity: High · Research risk: Med-High · Impl risk: Medium · Sprint: S2`

## 12. Environment Specification

- **API:** Gymnasium; must satisfy the `make_env(seed)` contract in `apex/train.py` (agent code unchanged on env swap). Follow SUMO-RL conventions where reasonable for comparability.
- **Scenario v0.1:** one 4-arm signalized intersection (netedit); per-class vTypes (two-wheeler, car, auto-rickshaw, bus, truck) with class kinematics; demand = time-varying Poisson per (approach, class), rates from calibrated modal mix (C4) with regime multipliers {dry/monsoon}×{peak/off-peak}.
- **Observation/action:** per Q1/Q2. **Decision interval:** Δt = 5 s sim (tunable).
- **Termination:** fixed episode length (default 3600 sim-s) or gridlock detection (all approaches saturated for > T_dead).
- **Safety invariants (in env, never in policy):** min green ≥ 10 s; yellow 3 s + all-red 2 s interphase inserted on every switch; max red per approach (starvation cap) — env force-serves a capped approach and flags the event; malformed actions masked. Rationale: a broken reward must not be able to produce an unsafe or starving schedule; also simplifies the learning problem.
- **Determinism:** seeded SUMO (`--seed`), seeded demand generation; config hash logged per run.

`Status: 🟡 · Priority: Critical · Complexity: Medium · Research risk: Low · Impl risk: Medium · Sprint: S1`

## 13. Reinforcement Learning

**Implemented 🟢:** single-process Ape-X-style DQN (`apex/`): vectorized actors with per-actor ε ladder (εᵢ = base^(1+i/(N−1)·α)), sum-tree prioritized replay with annealed IS-β, n-step returns, Double + Dueling heads, Polyak targets, grad-norm clipping, smooth-L1. Smoke-tested end-to-end; CartPole validation gate pending (S0).

**Comparison and rejection rationale:**

| Algo | Verdict | Reason |
|---|---|---|
| DQN / Double / Dueling | 🟢 absorbed | components of the implemented agent |
| Rainbow | partially absorbed | PER+n-step+double+dueling in; **distributional (C51)** and **NoisyNets** are OPEN(Q6) upgrades, evidence-gated |
| Ape-X | 🟢 chosen (single-process) | diverse parallel exploration + off-policy replay reuse fits slow SUMO steps; distributed plumbing deferred until >1 machine needed |
| R2D2 | rejected for v0.1 | recurrence targets partial observability; v0.1 state is (near-)fully observed; revisit if prediction/history features enter |
| PPO | rejected | on-policy sample cost is wrong for expensive sim steps; discards replay |
| IMPALA | rejected | V-trace + hundreds of actors across machines; wrong scale |
| SAC | rejected | continuous-control machinery; discrete-SAC less mature, no advantage here |
| TD3 | rejected | continuous actions only |

**OPEN(Q6):** exploration — keep ε-ladder vs replace with NoisyNets (Fortunato et al. 2018). Recommendation: keep ε-ladder for v0.1 (simpler, already validated); NoisyNets only if exploration provably stalls. **Owner decides when evidence exists.**

`Status: 🟢 (agent) / 🟡 (Q6) · Priority: Critical · Complexity: Medium · Research risk: Low · Impl risk: Low · Sprint: S0 gate, then S1`

## 14. Computer Vision

**Implemented 🟢:** Roboflow-hosted detector `vehicle-classification_1-gq172/1`, 9 Indian vehicle classes, mAP50 92.97 / P 89.5 / R 88.9; `video_detector.py` (primary), `workflow_detector.py` (fallback); class normalization map. Clip triage tool (`perception/check_camera_motion.py`) — result: **all current clips are moving-camera** ⇒ per-frame counts only, no world coordinates (R4).

**v0.1 role (decided):** offline calibration (modal mix → SUMO demand) and a validation table. Perception is **not** in the control loop; the paper claims sim-trained control with real-calibrated demand, nothing more.

**🔴 conditioned extensions:** ByteTrack tracking (needs fixed camera) → trajectories, speeds, per-vehicle delay from video; homography + lane-width measurement (needs fixed camera + ground reference) → *measured* geometry-conditioned PCE, upgrading C1 from zone-bucketed to measured. Alternative trackers (OC-SORT, BoT-SORT) to be compared **when** the prerequisite footage exists — comparison now would be speculation. YOLO11 self-hosted vs Roboflow-hosted: revisit only if API cost/latency blocks batch processing.

`Status: 🟢 (detector) / 🔴 (tracking, homography) · Priority: Med · Complexity: Med · Research risk: Low · Impl risk: Low · Sprint: S1 (calibration use)`

## 15. Prediction 🔴

**Purpose (future):** shift control from reactive to anticipatory by forecasting per-approach demand at 5/10/15/30 min horizons, appended to state.

| Architecture | Pros | Cons |
|---|---|---|
| historical-average / seasonal naive | trivial, honest baseline | no dynamics |
| LSTM/GRU seq2seq | simple, small-data-friendly | limited horizon interactions |
| Temporal Fusion Transformer (Lim et al. 2021) | multi-horizon, covariates, interpretable attention | data-hungry (weeks of demand), heavy |
| temporal GNN (DCRNN/ST-GCN family) | spatial structure across intersections | only meaningful with a *network* of sensors |

**Why not now:** no multi-week demand data exists; single intersection weakens spatial models; and predictive state is only justified when reactive control demonstrably saturates. **Entry conditions:** (1) v0.1 shipped; (2) ≥4 weeks of continuous demand data (RTI outcome or self-collection); (3) an experiment showing reactive-policy regret against an oracle-demand policy — if the oracle gap is small, prediction is not worth its complexity. **Prediction horizon choice is an OPEN DECISION when this activates.**

`Status: 🔴 · Priority: Low · Complexity: High · Research risk: Med · Impl risk: Med · Sprint: F`

## 16. Multi-Agent Extension 🔴

**Purpose (future):** corridor/network coordination — green waves, spillback control across intersections.

Design space (documented for continuity, not decided): independent learners (simplest; non-stationarity issues) → parameter sharing (MPLight-style; scales, assumes homogeneous intersections) → CTDE with value factorization (QMIX monotonic mixing) or centralized critic (MAPPO) → learned communication via GAT (CoLight-style attention over neighbor states). Credit assignment options: difference rewards, counterfactual baselines (COMA). Local vs global reward: pressure-based local rewards have the cleanest theory bridge (Varaiya → PressLight) and decompose naturally; global delay reward creates credit-assignment pathologies at scale.

**Entry conditions:** v0.1 shipped; multi-intersection SUMO corridor built; single-agent policy shown to create *measurable* corridor-level pathologies (e.g., downstream spillback) that coordination could fix. **Graph architecture is an OPEN DECISION when this activates.** This is paper #2, and it changes the env, state, and experiment matrix — budget accordingly.

`Status: 🔴 · Priority: Low · Complexity: Research · Research risk: High · Impl risk: High · Sprint: F`

## 17. Transfer / Meta-Learning 🔴

⚠️ **Disambiguation (binding):** BC-FRAP's v0.1 "meta" is **meta-gradient reward weighting** (Xu et al. 2018) — learning *objective weights*. This section is about a different thread: **fast policy adaptation to new intersections**. Conflating them in any document or paper draft is an error.

| Method | Mechanism | Fit | Concern |
|---|---|---|---|
| MAML (Finn et al. 2017) | second-order gradients through inner adaptation | general | expensive, unstable second-order; on-policy flavored |
| Reptile (Nichol et al. 2018) | first-order approximation | cheap | weaker task adaptation signal |
| PEARL (Rakelly et al. 2019) | latent task variable inferred from context, off-policy (SAC-based) | **best fit**: off-policy ⇒ sample-efficient; intersection identity as latent context is natural | built on SAC (continuous); needs discrete adaptation |
| RL² (Duan et al. 2016) | recurrent policy, adaptation = hidden-state update | elegant | long-horizon credit assignment; sample-hungry |

Preliminary recommendation (to be re-argued when active): PEARL-style latent-context conditioning, adapted to the discrete value-based stack — its off-policy nature matches expensive SUMO sampling, and "intersection embedding" is interpretable. **Entry conditions:** ≥3 structurally distinct intersection scenarios; demonstrated failure of naive fine-tuning (if fine-tuning transfers in <1k episodes, meta-learning is unjustified complexity). **OPEN DECISION when activated.**

`Status: 🔴 · Priority: Low · Complexity: Research · Research risk: High · Impl risk: High · Sprint: F`

## 18. Experiment Design — **OPEN DECISION Q5 (final matrix commit)**

- **Policies:** fixed-time; Webster (PCE-adjusted); F1 PCE-pressure DQN; F2 fixed-equal weights; F2' fixed hand-tuned weights; F3 meta-weighted (ours). *Stretch:* FRAP (public impl; include only if running within 2 days' effort, else cite-and-defer).
- **Regimes:** {dry, monsoon} × {peak, off-peak} = 4 (monsoon ⇒ demand multiplier + reduced vTypes speed/accel — calibration assumption to be stated).
- **Seeds:** ≥5 per cell (10 if variance high). **Metrics:** mean delay/vehicle, p90 delay, per-class delay + disparity (C3), PCE throughput, max approach wait, switch frequency.
- **Statistics:** mean ± 95% CI (t-based; bootstrap if non-normal); paired tests vs strongest baseline per regime; Holm–Bonferroni across comparisons; report **effect sizes (Cohen's d)** not just p-values.
- **Ablations:** learned-w vs fixed-equal vs fixed-tuned; per-term knockouts; context-shuffled MetaRewardNet (sanity control — must degrade to fixed-weight performance, else w(c) isn't using context); uniform vs zone-conditioned PCE (RQ2).
- **Robustness:** demand-scale sweep (±25%); modal-mix sensitivity (R1); OOD context test — hold out one regime from meta-training, evaluate w(c) extrapolation (honest few-shot/zero-shot within v0.1's reach; full transfer is §17).
- **Hyperparameters:** report sensitivity on lr, n-step, PER α/β, target τ (coarse grid, primary config frozen *before* final runs to avoid test-set tuning).
- **Reproducibility checklist:** pinned dependency versions; config-as-artifact (hash logged); seeds logged; deterministic torch flags where feasible; all run artifacts under `experiments/runs/<timestamp>_<hash>/`; one-command reproduction per table/figure.

`Status: 🟡 OPEN(Q5) · Priority: Critical · Complexity: Medium · Research risk: Low · Impl risk: Medium · Sprint: S3`

## 19. Dataset Specification

**Held now 🟢:** 9-class detector (see §14); ~6 clips (Silk Board night drone ×2 incl. annotated, Bangalore arterial day, Bangalore metro aerial, Mumbai elevated, street-level) — **all moving-camera** (triage result); detection JSONs reproducible via `video_detector.py`.
**Planned 🟡:** modal-mix distribution files per clip (schema: `{clip_id, frame, class, count, confidence}` aggregated to `{clip_id, class, share, ci}`); published Indian modal-mix priors as calibration cross-check (verify sources); self-shot fixed-camera footage (owner's city, tripod, flyover — unblocks 🔴 CV items); RTI outcome (filed/pending — signal plans, archived-footage procedure).
**Rules:** raw video never committed to git (size, privacy); derived JSONs + stats committed; every dataset artifact carries provenance (source, date, license note).

`Status: 🟢/🟡 · Priority: High · Complexity: Low · Research risk: Low (R4 scoped) · Impl risk: Low · Sprint: S1`

## 20. Software Architecture & 21. Folder Structure

```
backend/decision_engine/rl/
├── apex/            🟢 agent (config/network/replay/agent/train)
├── perception/      🟢 partial — triage; modal-mix extractor 🟡
├── env/             🟡 S1 — sumo files, vtypes, gym wrapper, invariants
├── reward/          🟡 S2 — terms.py, normalization, meta_reward_net.py, meta_grad.py
├── baselines/       🟡 S3 — fixed_time.py, webster.py, pressure_dqn.py
├── experiments/     🟡 S3 — configs/, runners, analysis/, runs/ (gitignored artifacts)
├── ARCHITECTURE.md      operational v0.1 work order (subordinate to this file)
└── BC_FRAP_PROJECT_CONSTITUTION.md   ← this file (source of truth)
```

Principles: module boundaries follow the ablation boundaries (anything we ablate is a swappable unit); no cross-module imports except through declared interfaces (`env` exposes Gym API; `reward` exposes `compute(s, c) -> float` + `phi(s) -> vec`); frontend (SynCity Next.js app) consumes *exported results only*.

`Status: 🟡 · Priority: High · Complexity: Low · Research risk: — · Impl risk: Low · Sprint: S1–S3`

## 22. API Specification 🔴 · 23. Database Design 🔴

No service API and no database exist or are needed for v0.1 — experiment artifacts are versioned files (§18), which beats a DB for reproducibility at this scale. **Entry conditions:** a pilot partner or multi-user need (API: FastAPI serving policy inference + state ingestion; DB: PostgreSQL for time-series demand + run registry — design *then*, against real requirements, not speculation). The existing SynCity FastAPI backend may host a *demo* endpoint post-paper; that is product, not research.

`Status: 🔴 · Priority: Low · Complexity: Med · Research risk: — · Impl risk: Med · Sprint: F`

## 24. Configuration Management

One dataclass/YAML pair per module (`ApexConfig` 🟢 is the pattern); full config serialized into every run directory; config hash in every result row; no hidden defaults changed without a §41 journal entry.

`Status: 🟡 (pattern 🟢) · Priority: High · Complexity: Low · Research risk: — · Impl risk: Low · Sprint: S1`

## 25. Coding Standards · 26. Logging · 27. Testing Strategy

- **Standards:** Python ≥3.11, type hints on public signatures, ruff for lint/format, docstrings state *why* not *what*, match existing module idiom (`apex/` sets the style).
- **Logging (OPEN Q7):** JSONL per-run metrics + stdout summaries (recommended: no external service dependency) vs TensorBoard vs W&B. Recommendation: JSONL primary + optional TensorBoard; W&B only if collaboration needs it. **Owner decides.**
- **Testing:** unit tests for the pure-logic cores — sum-tree invariants, n-step return arithmetic (hand-computed cases), reward-term math, normalization stats, Webster formula; env invariant tests (min-green cannot be violated by any action sequence; max-red always force-serves); one slow integration test = 200-step training smoke run (already exists ad hoc; formalize in `tests/`). RL results themselves are validated by §18 statistics, not unit tests.

`Status: 🟡 · Priority: High (testing: Critical for replay/env) · Complexity: Low · Research risk: — · Impl risk: Low · Sprint: S1–S2`

## 28. Deployment 🔴 · 29. Monitoring 🔴(prod) 🟡(training) · 30. Security 🔴

- **Deployment (🔴):** Docker/FastAPI/Redis/Kafka/Prometheus/Grafana stack documented as v2.0 vision; **zero paper value**; entry condition = pilot partner. Sim-to-real safety gate: any real deployment requires shadow-mode operation (policy recommends, human controls) before actuation — non-negotiable.
- **Monitoring:** training monitoring 🟡 = metrics JSONL + divergence alarms (Q-value explosion, priority collapse — see §35). Production monitoring 🔴.
- **Security (🔴 for prod; 🟢 hygiene now):** API keys in `.gitignore`'d `.env` (already enforced — see git history: `backend/.env` untracked); no raw footage in the repo; if a service API ever exists: authn, rate-limiting, signed model artifacts.

`Status: mixed · Priority: Low (prod) / High (hygiene) · Complexity: Med · Research risk: — · Impl risk: Med · Sprint: F`

## 31. Ethics

- **Privacy:** aerial/CCTV footage of public roads contains people and plates; no PII extraction, plate-level data never stored; publish derived statistics, not raw frames with identifiable individuals (blur if frames appear in the paper).
- **Fairness framing:** modal equity is distributive justice — two-wheeler riders skew lower-income in Indian cities (verify before citing); a throughput-only controller is a regressive policy instrument. This motivates C3 and belongs (carefully) in the paper.
- **Deployment ethics (🔴):** signal control failures have safety consequences; hence env invariants (§12), shadow-mode requirement (§28), and refusal to claim deployment-readiness from sim results (§32).
- **Data provenance:** stock/YouTube footage used only under license/fair-research use with citation; RTI-obtained data handled per its terms.

`Status: 🟡 · Priority: High · Complexity: Low · Research risk: — · Impl risk: — · Sprint: S4 (paper section)`

## 32. Limitations (to be stated openly in the paper)

Sim-only control evaluation (calibrated, not validated closed-loop); single intersection; monsoon modeled as demand/kinematics multipliers, not physics; PCE zone-conditioning is bucketed expert-informed, not measured (until 🔴 homography lands); moving-camera footage limits real-data claims to modal mix; SUMO's car-following models approximate but do not reproduce Indian gap-filling behavior (heterogeneous vTypes narrow, don't close, this gap).

`Status: 🟢 (accepted) · Priority: High · Complexity: — · Research risk: — · Impl risk: — · Sprint: S4`

## 33. Risks & 34. Failure Modes

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | SUMO realism challenged | med | high | sensitivity analysis over modal mix & demand (±25%); relative-comparison claims only |
| R2 | meta-gradient unstable / w collapses | med-high | high | fallback: context-switched fixed weights (C1+C3 paper); collapse itself reported as a finding |
| R3 | timeline slip | med | med | FRAP is stretch-only; Part II frozen; sprint gates in §40 |
| R4 | no fixed-camera footage in time | med | med | claims pre-scoped to modal mix; self-shoot planned (owner's city) |
| R5 | "why not end-to-end real data" review | certain | med | Path-B framing stated in intro; §32 limitations |
| R6 | detector distribution shift (night/monsoon clips) | med | low-med | report per-clip detection confidence; calibrate from high-confidence clips only |
| R7 | reward hacking undetected | low-med | high | §11 doctrine: invariants + always-on disaggregated metrics |

**Failure modes (technical):** Q-divergence (targets explode) → check target-update τ, reward normalization, grad clip; priority collapse (few transitions dominate) → inspect priority histogram, α too high; actor-ε ladder too greedy for sparse regimes → widen base/α; SUMO deadlock states poisoning replay → gridlock termination + episode filtering; meta-gradient variance → longer inner windows, smaller outer lr, gradient clipping on θ.

`Status: 🟡 · Priority: High · Complexity: — · Research risk: — · Impl risk: — · Sprint: continuous`

## 35. Debugging Playbook (living — grows with encountered bugs)

1. **Agent won't learn on CartPole** → bug is in `apex/`, not the env: check n-step gamma bookkeeping, PER weight application, target sync.
2. **Learns CartPole, not SUMO** → inspect reward scale (φ z-scores ~N(0,1)?), episode length vs n-step, action masking, decision interval too fine/coarse.
3. **Learns, then collapses** → priority histogram, Q-value magnitude curve, replay staleness after env changes.
4. **Meta-weights saturate to one-hot early** → outer lr too high; J_meta too correlated with one term (Q4 revisit); softmax temperature.
5. **Baselines beat DQN** → do not tune DQN first; verify Webster demand inputs and fixed-time plan are *fairly* configured — a mis-specified baseline invalidates everything downstream.
Every debugging episode gets a §41 journal entry: symptom → hypothesis → test → resolution.

`Status: 🟡 (template) · Priority: Med · Complexity: — · Research risk: — · Impl risk: — · Sprint: continuous`

## 36. Performance Metrics (system, not traffic)

Sim throughput (env steps/s) — budget: full experiment grid must run in <72h on the owner's machine (else cut seeds *transparently* or rent compute); detector batch throughput (frames/s vs Roboflow rate limits); training wall-clock per 100k steps (logged per run).

`Status: 🟡 · Priority: Med · Complexity: Low · Research risk: — · Impl risk: Low · Sprint: S1`

## 37. Scalability Plan 🔴

Single machine suffices through v0.1 by design. Scaling ladder, each rung evidence-gated: (1) SUMO libsumo instead of TraCI socket (~an order of magnitude step-rate; adopt early if cheap); (2) parallel env processes for the experiment grid; (3) true distributed Ape-X (Ray) — only when actor throughput, not learner, is the bottleneck *and* multi-machine budget exists; (4) network-scale sim (CityFlow evaluation vs SUMO) — decision point at multi-agent activation (§16).

`Status: 🔴 (except libsumo note 🟡) · Priority: Low · Complexity: Med-High · Research risk: — · Impl risk: Med · Sprint: F`

## 38. Paper Outline (workshop, 4–6 pp + appendix)

1. Intro — heterogeneity gaps (G1–G3), contributions C1–C4. 2. Related work — §5 table, verified. 3. Method — PCE-conditioned state; reward form; MetaRewardNet + meta-gradient; safety invariants. 4. Setup — calibration pipeline (C4), regimes, baselines, stats protocol. 5. Results — main grid; **w(c) heatmap (money figure)**; equity–efficiency trade-off curve (RQ3); ablations. 6. Limitations (§32) & ethics (§31). 7. Future work — Part II conditions, one paragraph.
Target venues (verify deadlines): NeurIPS/ICML workshop cycles, ITSC, ECML urban/transport workshops, KDD UrbComp.

`Status: 🟡 · Priority: High · Complexity: — · Research risk: — · Impl risk: — · Sprint: S4`

## 39. Interview Preparation — question bank

**Deliberately unanswered** (ownership contract): memorized ghost-written answers fail under follow-ups. Each question lists where the answer material lives; the owner writes answers in their own words after making the corresponding decision, and re-derives them cold before interviews.

- Why Ape-X over PPO/Rainbow/R2D2/IMPALA? (§13 — owner already has the capsule; re-derive from memory)
- Why is your reward a *learned-weight* sum, not fixed weights or pure pressure? What breaks with raw-unit sums? (§11)
- How does the meta-gradient actually flow — write the chain rule for ∂J_meta/∂θ. (Xu 2018; §11)
- How could a policy hack each of your reward terms, and what stops it? (§11 hacking table + owner's Q3 analysis)
- Why is emergency preemption a constraint, not a reward term? (§11, §12)
- Why sim-trained instead of end-to-end real data? Defend Path B. (§8, §32)
- What does MaxPressure's optimality proof assume, and which assumption does Indian traffic break first? (§5, §6-G3)
- Why per-actor ε instead of a decay schedule? What does the ladder buy? (§13, `apex/README.md`)
- Your equity term could be satisfied by serving everyone badly — show me the metric that catches this. (§11)
- What would falsify H2 (monsoon shifts weights)? What result would make you *drop* the meta-network? (§6, R2)
- Why 5 seeds? Why Holm correction? What's your effect-size threshold for "matters"? (§18 — owner sets the threshold)
- What's the first thing you check when Q-values diverge? (§35)

`Status: 🟡 (bank grows; answers = owner's) · Priority: High · Complexity: — · Research risk: — · Impl risk: — · Sprint: continuous`

## 40. Definition of Done

| Subsystem | Done means |
|---|---|
| apex/ 🟢 | CartPole-v1 mean eval return ≥475 across 3 seeds (**S0 gate — pending**) |
| env/ | invariant tests pass; fixed-time policy runs 10 episodes deterministically per seed; step-rate ≥50 steps/s |
| calibration | modal-mix JSONs per usable clip + sensitivity range documented |
| reward/ | φ terms unit-tested; `reward_stats.json` frozen; fixed-weight DQN beats fixed-time (sanity) |
| meta | learned-w run completes without divergence; w(c) heatmap renders; ablation vs fixed-w executed (either outcome is a result) |
| baselines | Webster + fixed-time + F1 + F2/F2' reproduce from config hash |
| experiments | full Q5 grid, ≥5 seeds, CIs + corrected tests + effect sizes; one-command reproduction per table/figure |
| paper | draft through Results; §32 limitations included; every citation verified against primary source |

`Status: 🟡 · Priority: Critical · Complexity: — · Research risk: — · Impl risk: — · Sprint: gates S0–S4`

## 41. Research Journal & Decision Log

Location: `experiments/JOURNAL.md`, newest first. **Resolved OPEN DECISIONS are recorded here and referenced from the §"How to read" registry.**

```markdown
## YYYY-MM-DD — <title>
**Type:** decision | experiment | bug | pivot
**Context:** what prompted this
**Options considered:** (for decisions)
**Choice + rationale:** (owner's words — this is interview prep)
**Evidence:** run ids / config hashes / figures
**Consequences:** what this changes downstream; sections of this Constitution updated
```

`Status: 🟡 (template 🟢) · Priority: High · Complexity: Low · Research risk: — · Impl risk: — · Sprint: S0 onward`

## 42. AI Collaboration Protocol (binding on all future assistants)

1. **Read this file first.** It overrides assistant priors about how this project "should" be built.
2. **Never decide OPEN DECISIONS.** Compare, critique, recommend, then stop. The owner chooses. Q1–Q7 and any decision listed in the registry are the owner's.
3. **Never change architecture silently.** Any structural change requires a §41 entry *before* implementation.
4. **Never invent datasets, results, or citations.** Unverified literature claims carry a verify-before-cite flag. Experimental numbers come only from run artifacts.
5. **Never change equations or reward definitions without written justification** referencing the affected sections.
6. **Critique before implementing.** If the owner's request conflicts with this Constitution or the paper timeline, say so plainly before doing it (this document itself was scoped through exactly such a challenge).
7. **Preserve reproducibility:** configs as artifacts, seeds logged, pinned versions; no result without a config hash.
8. **Preserve the pedagogy contract:** the owner must be able to defend every decision in an interview. Prefer Socratic questioning on core research decisions; ghost-write boilerplate only.
9. **Status discipline:** 🟢 requires code or a recorded decision; 🟡 requires alternatives + recommendation + open questions; 🔴 requires entry conditions. Never promote a section's status silently.
10. **If uncertain, ask before implementing.**

`Status: 🟢 · Priority: Critical · Complexity: — · Research risk: — · Impl risk: — · Sprint: permanent`

---

## Appendix A — Research Idea Bank 🔴 (intentionally speculative; nothing here enters the architecture without a §41 decision)

| Idea | What it is | Maturity | Difficulty | Potential for BC-FRAP | Why it might fail here | Read first |
|---|---|---|---|---|---|---|
| Hierarchical RL | high-level regime policy over low-level phase policies | med | high | natural fit: context regimes as options | MetaRewardNet may already capture the useful hierarchy more cheaply | Sutton et al. 1999 (options); Bacon 2017 (option-critic) |
| World models | learn dynamics, plan/train in imagination | med-high | research | huge sample-efficiency win over slow SUMO | traffic stochasticity + long horizons strain learned models | Ha & Schmidhuber 2018; Hafner Dreamer v2/v3 |
| Transformer traffic prediction (TFT) | multi-horizon attention forecasting | high | med | §15 primary candidate | data-hungry; needs weeks of demand | Lim et al. 2021 |
| Graph transformers | attention over intersection graphs | med | high | CoLight successor for §16 | needs network-scale data/sim | Ying et al. 2021 (Graphormer) |
| Diffusion traffic forecasting | generative probabilistic demand scenarios | low-med | research | scenario sampling for robustness training | overkill vs bootstrap resampling of real demand | recent diffusion-forecasting surveys (verify) |
| Federated learning | cross-city training without sharing raw data | med | high | privacy story for multi-city BBMP-type partners | no partners yet; premature | McMahan et al. 2017 |
| Foundation models for traffic | pretrained spatio-temporal encoders | low | research | transfer without per-city training | field immature; benchmarks unsettled | survey literature (verify currency) |
| Digital twins | live sim mirroring the real intersection | med (industry) | high | continuous calibration; SynCity frontend synergy | calibration data doesn't exist yet | Kamel Boulos 2021 or newer (verify) |
| Causal RL | causal structure in policy/effect estimation | low-med | research | defensible "signal change *caused* delay drop" claims | causal ID in messy traffic data is hard | Bareinboim's course/papers |
| Safe RL (constrained MDPs) | formal constraint satisfaction during learning | med-high | high | principled successor to env invariants (F4, §11) | v0.1 invariants may be sufficient in practice | Altman 1999; Achiam CPO 2017 |
| Offline RL | learn from logged data without interaction | high | med-high | if RTI ever yields historical signal+detector logs | such logs may never materialize | Levine et al. 2020 tutorial |
| Imitation / inverse RL | recover expert policy/reward from traffic-police behavior | med | med | IRL was **explicitly rejected** for v0.1 (reward identifiability erases the C2 novelty — session decision); imitation of manual peak-hour control could seed policies | identifiability; expert data collection | Ng & Russell 2000; Ho & Ermon GAIL 2016 |
| Quantum optimization | QAOA/annealing for signal plans | very low | research | honest assessment: none foreseeable; classical methods are not the bottleneck | hardware + formulation immaturity; listed for completeness only | skip until field matures |

---

## Appendix B — Adversarial Self-Review (three reviewers attempt rejection)

**Reviewer 1 (novelty):** *"Meta-gradient reward learning is Xu et al. 2018; PCE is 1960s traffic engineering. Composition ≠ contribution."*
→ Response: the contribution is the demonstrated *interaction* — that context-conditioned objectives materially change control policy in heterogeneous traffic (H1/H2), plus the first fairness-evaluated mixed-traffic benchmark protocol (C3, gap G2). **Fix now:** paper intro must claim composition-with-evidence, never method novelty. **Addressed:** §7 framing.

**Reviewer 2 (rigor):** *"Sim-only, single intersection, self-calibrated demand — the calibration and evaluation are circular."*
→ Partially valid. Demand calibration (inputs) and policy evaluation (outcomes) are separable; sensitivity analysis (±25%, modal-mix sweep) tests conclusions' robustness to calibration error. Single intersection follows FRAP/PressLight precedent for a first paper. **Fix now:** sensitivity analysis is mandatory, not stretch (§18). **Residual (future):** closed-loop real validation — Part II.

**Reviewer 3 (baselines/stats):** *"No FRAP baseline; 5 seeds is thin; where is MaxPressure itself?"*
→ **Fix now:** add **actuated MaxPressure (PCE-weighted) as a required non-RL baseline** — it is cheap (no training) and is the strongest fair classical comparator; this Constitution so amends §18's baseline list. FRAP stays stretch (reimplementation risk exceeds its evidential value at workshop scope — cite-and-defer). Seeds: 5 minimum with CIs and effect sizes; escalate to 10 where CIs overlap. **Addressed:** §18 amended.

**Issues acknowledged, deferred with conditions:** real-world closed loop (needs pilot, §28 shadow-mode gate); multi-intersection generality (§16 conditions); measured lane-width PCE (fixed-camera footage, §14).

---

*End of Constitution. Subordinate documents: `ARCHITECTURE.md` (operational v0.1 work order). Next actions live there: S0 gate (CartPole validation) and OPEN DECISIONS Q1, Q2.*
