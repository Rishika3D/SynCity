# Ape-X DQN (intermediate, single-process)

Single-process Ape-X-style DQN for BC-FRAP. Captures the Ape-X ideas — per-actor epsilon, prioritized replay, n-step returns, double-dueling — without distributed plumbing. Plug in a SUMO Gym env when ready.

## What's in here

| File | Purpose |
|---|---|
| `config.py` | `ApexConfig` dataclass — all hyperparameters in one place |
| `network.py` | Dueling and plain MLP Q-networks |
| `replay.py` | `SumTree`, `PrioritizedReplay`, `NStepBuffer` |
| `agent.py` | `ApexDQN` — actors + learner + eval in one class |
| `train.py` | CartPole-v1 smoke test |

## Ape-X ideas, mapped to code

- **Distributed actors → vectorized actors.** `cfg.num_actors` envs step in lockstep each iteration. Each gets a different epsilon: `eps_i = base ** (1 + (i / (N-1)) * alpha)`. Actor 0 explores heavily, actor N−1 is near-greedy.
- **Prioritized replay.** TD-error magnitude drives sample probability via a sum-tree; importance-sampling weights (β annealed start→end) correct the bias.
- **N-step returns.** `NStepBuffer` packs n consecutive transitions into one (`s_t, a_t, R^(n), s_{t+n}, done, γ^n`).
- **Double DQN.** Online net picks the next action; target net evaluates it.
- **Dueling head.** Q(s,a) = V(s) + (A(s,a) − mean_a A(s,a)).
- **Polyak target updates** (`target_tau`) instead of hard copies.

What's *missing* vs full Ape-X (intentionally): no Ray/multiprocessing, no parameter server, no separate replay process. Bring those in only when you scale to many envs.

## Quick start

```bash
pip install -r backend/decision_engine/rl/apex/requirements.txt
python -m backend.decision_engine.rl.apex.train
```

Expected: CartPole solves (mean eval return ≥ 475) within ~20–40k env steps.

## Wiring SUMO later

Replace `make_env` in `train.py` with a function returning your `BCFrapEnv(gym.Env)` instance. Update `ApexConfig.obs_dim` and `n_actions` to match your state/action spaces. Nothing else changes.

## Caveats

- CPU is fine for low-dim state (CartPole, SUMO with hand-crafted features). Set `device="cuda"` for image-based observations.
- For SUMO, set `learner_steps_per_actor_step` higher (4–8) — sim steps are slow, learning is cheap.
- `eps` annealing per *actor* (Ape-X-style) is the only exploration; there is no global decay schedule.
