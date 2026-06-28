from dataclasses import dataclass


@dataclass
class ApexConfig:
    obs_dim: int
    n_actions: int

    num_actors: int = 8
    actor_epsilon_base: float = 0.4
    actor_epsilon_alpha: float = 7.0

    gamma: float = 0.99
    n_step: int = 3

    hidden_sizes: tuple = (256, 256)
    dueling: bool = True

    buffer_size: int = 200_000
    batch_size: int = 256
    min_buffer_for_learn: int = 5_000

    priority_alpha: float = 0.6
    priority_beta_start: float = 0.4
    priority_beta_end: float = 1.0
    priority_eps: float = 1e-6

    lr: float = 2.5e-4
    grad_clip_norm: float = 10.0
    target_tau: float = 5e-3

    learner_steps_per_actor_step: int = 1

    total_env_steps: int = 200_000
    eval_every_steps: int = 5_000
    eval_episodes: int = 5

    device: str = "cpu"
    seed: int = 42
