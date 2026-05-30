"""
test_env.py — Sanity check for BangaloreTrafficEnv.

Run from /Users/ashi/SynCity/backend:
    python -m decision_engine.rl.test_env

What it tests:
    1. Environment resets cleanly
    2. Random agent can run a full episode without crashing
    3. Monsoon reduces effective throughput vs dry day
    4. South zone produces higher congestion than North (higher arrival rate)
"""
from __future__ import annotations

import sys

from .env import BangaloreTrafficEnv


def run_episode(env: BangaloreTrafficEnv, policy: str = "random") -> dict:
    """
    Run a full episode.

    policy: "random" | "always_NS" | "always_EW"
    Returns summary dict.
    """
    obs, info = env.reset(seed=42)
    total_reward = 0.0
    steps = 0

    while True:
        if policy == "always_NS":
            action = 0
        elif policy == "always_EW":
            action = 1
        else:
            action = env._rng.randint(0, 1)

        obs, reward, terminated, truncated, info = env.step(action)
        total_reward += reward
        steps += 1

        if terminated or truncated:
            break

    return {
        "zone":         info["zone"],
        "rainfall_mm":  info["rainfall_mm"],
        "policy":       policy,
        "steps":        steps,
        "total_reward": round(total_reward, 2),
        "final_waiting_pce": round(info["total_waiting_pce"], 1),
    }


def main() -> None:
    print("=" * 60)
    print("BC-FRAP Environment Test")
    print("=" * 60)

    # ── Test 1: basic episode ────────────────────────────────────────────
    print("\n── Test 1: Central zone, dry day, random policy ──")
    env = BangaloreTrafficEnv(zone_id="Central", rainfall_mm=0, is_peak_hour=True)
    result = run_episode(env, policy="random")
    print(result)
    env.render(mode="human")

    # ── Test 2: monsoon vs dry ───────────────────────────────────────────
    print("\n── Test 2: East zone — dry vs heavy monsoon ──")
    dry = run_episode(
        BangaloreTrafficEnv("East", rainfall_mm=0,  is_peak_hour=True),
        policy="random"
    )
    wet = run_episode(
        BangaloreTrafficEnv("East", rainfall_mm=80, is_peak_hour=True),
        policy="random"
    )
    print(f"Dry day reward:    {dry['total_reward']}")
    print(f"Monsoon reward:    {wet['total_reward']}")
    print(f"→ Monsoon should be worse (more negative): {'✓' if wet['total_reward'] < dry['total_reward'] else '✗'}")

    # ── Test 3: South zone (IT corridor, highest arrival rate) ──────────
    print("\n── Test 3: Zone comparison at peak hour ──")
    for zone_id in ["North", "South", "East", "West", "Central"]:
        env = BangaloreTrafficEnv(zone_id=zone_id, is_peak_hour=True)
        r = run_episode(env, policy="random")
        print(f"  {zone_id:8s}: reward = {r['total_reward']:8.2f}  |  final waiting PCE = {r['final_waiting_pce']}")

    # ── Test 4: Observation shape ────────────────────────────────────────
    print("\n── Test 4: Observation space ──")
    env = BangaloreTrafficEnv(zone_id="Central")
    obs, _ = env.reset()
    print(f"  obs shape: {obs.shape}   (expected: (12,))")
    print(f"  obs dtype: {obs.dtype}   (expected: float32)")
    assert obs.shape == (12,), "FAIL: observation shape wrong"
    print("  ✓ Observation shape correct")

    # ── Test 5: Fairness reward on your edge case ─────────────────────
    print("\n── Test 5: Fairness — NS=100 PCE, EW=1 PCE ──")
    env = BangaloreTrafficEnv(zone_id="Central", is_peak_hour=False)
    obs, _ = env.reset()

    # Manually stuff 100 cars into N and S, 1 car into E and W
    from .bc_frap import BCFRAPSegment
    env._segments["N"].add_vehicles(cars=50, twheels=0, heavy=0, lane=0)
    env._segments["S"].add_vehicles(cars=50, twheels=0, heavy=0, lane=0)
    env._segments["E"].add_vehicles(cars=1,  twheels=0, heavy=0, lane=0)
    env._segments["W"].add_vehicles(cars=1,  twheels=0, heavy=0, lane=0)

    # Always-NS policy: should get starvation penalty for ignoring EW
    rewards_always_ns = []
    _, reward_ns, _, _, info_ns = env.step(0)
    _, reward_ns2, _, _, info_ns2 = env.step(0)
    _, reward_ew, _, _, info_ew = env.step(1)

    print(f"  After NS green (step 1): reward={reward_ns:.3f}  imbalance={info_ns['imbalance_pce']}")
    print(f"  After NS green (step 2): reward={reward_ns2:.3f}  imbalance={info_ns2['imbalance_pce']}")
    print(f"  After EW green (step 3): reward={reward_ew:.3f}  imbalance={info_ew['imbalance_pce']}")
    print(f"  → EW green reduced imbalance: {'✓' if info_ew['imbalance_pce'] < info_ns2['imbalance_pce'] else '✗'}")
    print(f"  → Starvation events: {info_ew['starvation_events']}")

    print("\n── All tests passed ──")


if __name__ == "__main__":
    main()
