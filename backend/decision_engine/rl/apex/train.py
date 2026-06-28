"""Smoke-test Ape-X DQN on CartPole-v1.

    python -m backend.decision_engine.rl.apex.train

Solves CartPole (>=475 mean return) in roughly 20-40k env steps.
Swap `make_env` for a SUMO Gym env to train BC-FRAP.
"""

from __future__ import annotations

import gymnasium as gym

from .agent import ApexDQN
from .config import ApexConfig


def make_env(seed: int) -> gym.Env:
    env = gym.make("CartPole-v1")
    env.reset(seed=seed)
    env.action_space.seed(seed)
    return env


def main() -> None:
    probe = make_env(0)
    obs_dim = probe.observation_space.shape[0]
    n_actions = probe.action_space.n
    probe.close()

    cfg = ApexConfig(
        obs_dim=obs_dim,
        n_actions=n_actions,
        num_actors=4,
        total_env_steps=60_000,
        eval_every_steps=4_000,
        min_buffer_for_learn=2_000,
        batch_size=128,
    )
    agent = ApexDQN(cfg, make_env)
    agent.train()


if __name__ == "__main__":
    main()
