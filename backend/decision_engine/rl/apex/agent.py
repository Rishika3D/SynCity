from __future__ import annotations

import math
from typing import Callable, Iterable

import numpy as np
import torch
import torch.nn.functional as F

from .config import ApexConfig
from .network import build_q_net
from .replay import NStepBuffer, PrioritizedReplay


class ApexDQN:
    """Single-process Ape-X-style DQN.

    Captures the Ape-X ideas — per-actor epsilon, prioritized replay, n-step,
    double-dueling — without the distributed-systems plumbing. Actors run as
    a vectorized batch in the main process; one learner step per env step by
    default. Plug a SUMO Gym env in via `make_env`.
    """

    def __init__(
        self,
        config: ApexConfig,
        make_env: Callable[[int], "gym.Env"],  # noqa: F821
    ):
        self.cfg = config
        torch.manual_seed(config.seed)
        np.random.seed(config.seed)

        self.device = torch.device(config.device)
        self.online = build_q_net(
            config.obs_dim, config.n_actions, config.hidden_sizes, config.dueling
        ).to(self.device)
        self.target = build_q_net(
            config.obs_dim, config.n_actions, config.hidden_sizes, config.dueling
        ).to(self.device)
        self.target.load_state_dict(self.online.state_dict())
        for p in self.target.parameters():
            p.requires_grad_(False)

        self.optim = torch.optim.Adam(self.online.parameters(), lr=config.lr)

        self.replay = PrioritizedReplay(
            capacity=config.buffer_size,
            obs_dim=config.obs_dim,
            alpha=config.priority_alpha,
            eps=config.priority_eps,
            seed=config.seed,
        )

        self.envs = [make_env(config.seed + i) for i in range(config.num_actors)]
        self.actor_eps = self._make_actor_epsilons(config)
        self.nstep_bufs = [NStepBuffer(config.n_step, config.gamma) for _ in range(config.num_actors)]
        self.eval_env = make_env(config.seed + 10_000)

        self.global_step = 0
        self.gamma_n = config.gamma ** config.n_step

    @staticmethod
    def _make_actor_epsilons(cfg: ApexConfig) -> np.ndarray:
        if cfg.num_actors == 1:
            return np.array([cfg.actor_epsilon_base], dtype=np.float32)
        i = np.arange(cfg.num_actors, dtype=np.float32)
        return cfg.actor_epsilon_base ** (1.0 + (i / (cfg.num_actors - 1)) * cfg.actor_epsilon_alpha)

    @torch.no_grad()
    def _act(self, obs_batch: np.ndarray) -> np.ndarray:
        obs_t = torch.from_numpy(obs_batch).float().to(self.device)
        q = self.online(obs_t).cpu().numpy()
        greedy = q.argmax(axis=1)
        rand = np.random.randint(0, self.cfg.n_actions, size=greedy.shape)
        mask = np.random.random(greedy.shape) < self.actor_eps
        return np.where(mask, rand, greedy)

    def _reset_all(self) -> np.ndarray:
        obs = []
        for env in self.envs:
            o, _ = env.reset()
            obs.append(o)
        return np.asarray(obs, dtype=np.float32)

    def _step_actors(self, obs_batch: np.ndarray):
        actions = self._act(obs_batch)
        next_obs = np.zeros_like(obs_batch)
        ep_returns = []
        for i, env in enumerate(self.envs):
            o, r, term, trunc, _ = env.step(int(actions[i]))
            done = bool(term or trunc)
            for tr in self.nstep_bufs[i].push((obs_batch[i], int(actions[i]), float(r), o, done)):
                self.replay.push(*tr)
            if done:
                for tr in self.nstep_bufs[i].flush():
                    self.replay.push(*tr)
                o, _ = env.reset()
                ep_returns.append(getattr(env, "_episode_return", None))
            next_obs[i] = o
        return next_obs, ep_returns

    def _beta(self) -> float:
        frac = min(1.0, self.global_step / max(1, self.cfg.total_env_steps))
        return self.cfg.priority_beta_start + frac * (
            self.cfg.priority_beta_end - self.cfg.priority_beta_start
        )

    def _learn(self) -> dict | None:
        if len(self.replay) < self.cfg.min_buffer_for_learn:
            return None
        obs, act, rew, next_obs, done, gamma_n, w, leaf_idxs = self.replay.sample(
            self.cfg.batch_size, self._beta()
        )
        obs_t = torch.from_numpy(obs).to(self.device)
        next_obs_t = torch.from_numpy(next_obs).to(self.device)
        act_t = torch.from_numpy(act).to(self.device)
        rew_t = torch.from_numpy(rew).to(self.device)
        done_t = torch.from_numpy(done).to(self.device)
        gamma_t = torch.from_numpy(gamma_n).to(self.device)
        w_t = torch.from_numpy(w).to(self.device)

        q = self.online(obs_t).gather(1, act_t.unsqueeze(1)).squeeze(1)
        with torch.no_grad():
            next_actions = self.online(next_obs_t).argmax(dim=1, keepdim=True)
            next_q = self.target(next_obs_t).gather(1, next_actions).squeeze(1)
            target = rew_t + gamma_t * (1.0 - done_t) * next_q

        td = q - target
        loss = (w_t * F.smooth_l1_loss(q, target, reduction="none")).mean()

        self.optim.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.online.parameters(), self.cfg.grad_clip_norm)
        self.optim.step()

        with torch.no_grad():
            tau = self.cfg.target_tau
            for tp, op in zip(self.target.parameters(), self.online.parameters()):
                tp.data.mul_(1 - tau).add_(tau * op.data)

        self.replay.update_priorities(leaf_idxs, td.detach().cpu().numpy())
        return {"loss": float(loss.item()), "td_abs_mean": float(td.abs().mean().item())}

    @torch.no_grad()
    def evaluate(self, episodes: int) -> dict:
        returns = []
        for _ in range(episodes):
            o, _ = self.eval_env.reset()
            done, ep_r = False, 0.0
            while not done:
                q = self.online(torch.from_numpy(np.asarray(o, dtype=np.float32)).to(self.device).unsqueeze(0))
                a = int(q.argmax(dim=1).item())
                o, r, term, trunc, _ = self.eval_env.step(a)
                done = term or trunc
                ep_r += float(r)
            returns.append(ep_r)
        return {"mean_return": float(np.mean(returns)), "std_return": float(np.std(returns))}

    def train(self, log_cb: Callable[[dict], None] | None = None) -> None:
        obs = self._reset_all()
        while self.global_step < self.cfg.total_env_steps:
            obs, _ = self._step_actors(obs)
            self.global_step += self.cfg.num_actors
            for _ in range(self.cfg.learner_steps_per_actor_step):
                stats = self._learn()
            if self.global_step % self.cfg.eval_every_steps < self.cfg.num_actors:
                eval_stats = self.evaluate(self.cfg.eval_episodes)
                row = {
                    "step": self.global_step,
                    "buffer": len(self.replay),
                    "beta": self._beta(),
                    **(stats or {}),
                    **eval_stats,
                }
                if log_cb:
                    log_cb(row)
                else:
                    print(row)

    def save(self, path: str) -> None:
        torch.save(
            {
                "online": self.online.state_dict(),
                "target": self.target.state_dict(),
                "optim": self.optim.state_dict(),
                "step": self.global_step,
                "config": self.cfg.__dict__,
            },
            path,
        )

    def load(self, path: str) -> None:
        ckpt = torch.load(path, map_location=self.device)
        self.online.load_state_dict(ckpt["online"])
        self.target.load_state_dict(ckpt["target"])
        self.optim.load_state_dict(ckpt["optim"])
        self.global_step = int(ckpt.get("step", 0))
