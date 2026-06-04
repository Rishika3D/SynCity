"""
train.py — Training loop for BC-FRAP DQN agent

Trains the DQN agent inside the BangaloreTrafficEnv.
Logs progress every N episodes and saves the best model.

Run (from /Users/ashi/SynCity/backend):
    source ~/.venvs/roboflow/bin/activate
    python -m decision_engine.rl.train

    # With specific zone and rainfall:
    python -m decision_engine.rl.train --zone South --rain 30

    # Quick test (fewer episodes):
    python -m decision_engine.rl.train --episodes 100
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import numpy as np

# Add backend to path so imports work
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from decision_engine.rl.dqn_agent import DQNAgent, DQNConfig
from decision_engine.rl.env import BangaloreTrafficEnv


# ── Training config ───────────────────────────────────────────────────────

EPISODES     = 500       # total training episodes
LOG_EVERY    = 20        # print stats every N episodes
SAVE_EVERY   = 100       # save checkpoint every N episodes
MODELS_DIR   = Path(__file__).parent / "models"


def train(
    zone_id:     str   = "Central",
    rainfall_mm: float = 0.0,
    episodes:    int   = EPISODES,
    verbose:     bool  = True,
):
    MODELS_DIR.mkdir(exist_ok=True)

    # ── Setup ──────────────────────────────────────────────────────────────
    env   = BangaloreTrafficEnv(zone_id=zone_id, rainfall_mm=rainfall_mm, is_peak_hour=True)
    cfg   = DQNConfig()
    agent = DQNAgent(cfg)

    if verbose:
        print("=" * 60)
        print("BC-FRAP DQN Training")
        print("=" * 60)
        print(f"Zone:        {zone_id}")
        print(f"Rainfall:    {rainfall_mm}mm")
        print(f"Episodes:    {episodes}")
        print(f"Device:      {agent.device}")
        print(f"Network:     {cfg.obs_dim} → {cfg.hidden1} → {cfg.hidden2} → {cfg.n_actions}")
        print()

    # ── Training loop ──────────────────────────────────────────────────────
    reward_history:  list[float] = []
    loss_history:    list[float] = []
    best_reward      = -float("inf")
    t_start          = time.time()

    for episode in range(1, episodes + 1):

        obs, info = env.reset(seed=episode)
        episode_reward = 0.0
        episode_losses = []

        while True:
            # 1. Agent picks action
            action = agent.select_action(obs, training=True)

            # 2. Environment steps
            next_obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated

            # 3. Store experience in replay buffer
            agent.buffer.push(obs, action, reward, next_obs, done)

            # 4. Learn from a random batch
            loss = agent.learn()
            if loss is not None:
                episode_losses.append(loss)

            episode_reward += reward
            obs = next_obs

            if done:
                break

        # ── End of episode ─────────────────────────────────────────────────
        agent.decay_epsilon()

        # Update target network every cfg.target_update episodes
        if episode % cfg.target_update == 0:
            agent.update_target()

        reward_history.append(episode_reward)
        if episode_losses:
            loss_history.append(np.mean(episode_losses))

        # Save best model
        if episode_reward > best_reward:
            best_reward = episode_reward
            agent.save(str(MODELS_DIR / "best_model.pt"))

        # Periodic checkpoint
        if episode % SAVE_EVERY == 0:
            agent.save(str(MODELS_DIR / f"checkpoint_ep{episode}.pt"))

        # Logging
        if verbose and episode % LOG_EVERY == 0:
            recent        = reward_history[-LOG_EVERY:]
            avg_reward    = np.mean(recent)
            avg_loss      = np.mean(loss_history[-LOG_EVERY:]) if loss_history else 0
            elapsed       = time.time() - t_start
            starvation    = info.get("starvation_events", 0)
            waiting_pce   = info.get("total_waiting_pce", 0)

            print(
                f"Ep {episode:4d}/{episodes} | "
                f"Avg reward: {avg_reward:7.2f} | "
                f"Best: {best_reward:7.2f} | "
                f"ε: {agent.epsilon:.3f} | "
                f"Loss: {avg_loss:.4f} | "
                f"Waiting PCE: {waiting_pce:5.1f} | "
                f"Starvation: {starvation} | "
                f"Time: {elapsed:.0f}s"
            )

    # ── Final summary ──────────────────────────────────────────────────────
    elapsed = time.time() - t_start

    if verbose:
        print()
        print("=" * 60)
        print("Training complete")
        print("=" * 60)
        print(f"Total episodes: {episodes}")
        print(f"Best reward:    {best_reward:.2f}")
        print(f"Final epsilon:  {agent.epsilon:.3f}")
        print(f"Time elapsed:   {elapsed:.1f}s")
        print(f"Model saved to: {MODELS_DIR}/best_model.pt")
        print()

        # Show what the agent learned
        _evaluate(agent, zone_id, rainfall_mm, verbose=True)

    return agent, reward_history


# ── Evaluation ────────────────────────────────────────────────────────────

def _evaluate(
    agent:       DQNAgent,
    zone_id:     str   = "Central",
    rainfall_mm: float = 0.0,
    n_episodes:  int   = 5,
    verbose:     bool  = True,
) -> float:
    """
    Run the trained agent greedily (no exploration) and report performance.
    Compare against a random policy baseline.
    """
    env = BangaloreTrafficEnv(zone_id=zone_id, rainfall_mm=rainfall_mm, is_peak_hour=True)

    # Trained agent
    trained_rewards = []
    for ep in range(n_episodes):
        obs, _ = env.reset(seed=1000 + ep)
        total  = 0.0
        while True:
            action = agent.select_action(obs, training=False)  # greedy
            obs, reward, terminated, truncated, info = env.step(action)
            total += reward
            if terminated or truncated:
                break
        trained_rewards.append(total)

    # Random baseline
    random_rewards = []
    for ep in range(n_episodes):
        obs, _ = env.reset(seed=1000 + ep)
        total  = 0.0
        while True:
            action = env._rng.randint(0, 1)
            obs, reward, terminated, truncated, info = env.step(action)
            total += reward
            if terminated or truncated:
                break
        random_rewards.append(total)

    trained_avg = np.mean(trained_rewards)
    random_avg  = np.mean(random_rewards)
    improvement = ((trained_avg - random_avg) / abs(random_avg)) * 100

    if verbose:
        print("── Evaluation (greedy policy vs random baseline) ──")
        print(f"  Trained agent: {trained_avg:.2f}")
        print(f"  Random policy: {random_avg:.2f}")
        print(f"  Improvement:   {improvement:+.1f}%")

        if improvement > 0:
            print(f"  ✓ Agent learned to reduce congestion")
        else:
            print(f"  ✗ Agent needs more training")

    return trained_avg


# ── CLI ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train BC-FRAP DQN agent")
    parser.add_argument("--zone",     default="Central",
                        choices=["North", "South", "East", "West", "Central"])
    parser.add_argument("--rain",     type=float, default=0.0,
                        help="Rainfall in mm (0=dry, 80=heavy monsoon)")
    parser.add_argument("--episodes", type=int, default=EPISODES)
    args = parser.parse_args()

    train(
        zone_id     = args.zone,
        rainfall_mm = args.rain,
        episodes    = args.episodes,
    )
