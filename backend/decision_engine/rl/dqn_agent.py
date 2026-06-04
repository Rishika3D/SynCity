"""
dqn_agent.py — Deep Q-Network for Bangalore Traffic Signal Control

Architecture: MLP (not CNN) because our observation is a 12-dim vector,
not an image. There is no spatial structure to exploit.

    Input (12):  [cars_N, twheels_N, heavy_N,
                  cars_S, twheels_S, heavy_S,
                  cars_E, twheels_E, heavy_E,
                  cars_W, twheels_W, heavy_W]
        ↓
    Hidden (128): ReLU
        ↓
    Hidden (64):  ReLU
        ↓
    Output (2):   Q-value for NS-green, Q-value for EW-green

The agent picks whichever action has the higher Q-value.
During training it sometimes picks randomly (epsilon-greedy) to explore.

Key DQN concepts used:
    - Replay buffer:   stores past experiences, breaks correlation between steps
    - Target network:  a frozen copy of Q-network, updated every N steps
                       prevents the moving-target problem that destabilises training
    - Epsilon-greedy:  explore (random) vs exploit (best known action)
    - Bellman update:  Q(s,a) ← r + γ · max Q(s', a')
"""
from __future__ import annotations

import random
from collections import deque
from dataclasses import dataclass

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim


# ── Hyperparameters ───────────────────────────────────────────────────────

@dataclass
class DQNConfig:
    # Network
    obs_dim:        int   = 12      # observation size (fixed by environment)
    n_actions:      int   = 2       # NS green or EW green
    hidden1:        int   = 128
    hidden2:        int   = 64

    # Training
    lr:             float = 1e-3    # learning rate
    gamma:          float = 0.95    # discount factor (how much future rewards matter)
    batch_size:     int   = 64      # samples per training step
    buffer_size:    int   = 10_000  # replay buffer capacity

    # Exploration
    epsilon_start:  float = 1.0     # start fully random
    epsilon_end:    float = 0.05    # end mostly greedy
    epsilon_decay:  float = 0.995   # multiply epsilon each episode

    # Target network
    target_update:  int   = 10      # update target network every N episodes


# ── Q-Network ─────────────────────────────────────────────────────────────

class QNetwork(nn.Module):
    """
    MLP that maps observation → Q-values for each action.

    Why this architecture:
        128 → 64 is standard for small discrete-action problems.
        Bigger networks don't help here — we only have 12 inputs.
        Smaller networks underfit the fairness/throughput trade-off.
    """

    def __init__(self, cfg: DQNConfig):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(cfg.obs_dim,  cfg.hidden1),
            nn.ReLU(),
            nn.Linear(cfg.hidden1,  cfg.hidden2),
            nn.ReLU(),
            nn.Linear(cfg.hidden2,  cfg.n_actions),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ── Replay Buffer ─────────────────────────────────────────────────────────

class ReplayBuffer:
    """
    Stores (state, action, reward, next_state, done) tuples.

    Why we need this:
        Without a replay buffer, the agent trains on consecutive steps
        which are highly correlated (frame N and frame N+1 are similar).
        Random sampling from the buffer breaks this correlation and
        stabilises training — a key DQN innovation from DeepMind (2015).
    """

    def __init__(self, capacity: int):
        self._buf = deque(maxlen=capacity)

    def push(
        self,
        state:      np.ndarray,
        action:     int,
        reward:     float,
        next_state: np.ndarray,
        done:       bool,
    ) -> None:
        self._buf.append((state, action, reward, next_state, done))

    def sample(self, batch_size: int) -> tuple:
        batch = random.sample(self._buf, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        return (
            np.array(states,      dtype=np.float32),
            np.array(actions,     dtype=np.int64),
            np.array(rewards,     dtype=np.float32),
            np.array(next_states, dtype=np.float32),
            np.array(dones,       dtype=np.float32),
        )

    def __len__(self) -> int:
        return len(self._buf)


# ── DQN Agent ─────────────────────────────────────────────────────────────

class DQNAgent:
    """
    DQN agent that learns to control Bangalore traffic signals.

    Two networks:
        q_net:      updated every step — the learning network
        target_net: frozen copy, updated every cfg.target_update episodes
                    used to compute stable target Q-values

    Why two networks?
        If we use the same network to compute both current Q-values and
        target Q-values, the targets keep changing as we update — like
        chasing a moving target. The frozen target_net gives stable
        targets for cfg.target_update episodes at a time.
    """

    def __init__(self, cfg: DQNConfig = None):
        self.cfg     = cfg or DQNConfig()
        self.device  = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Networks
        self.q_net      = QNetwork(self.cfg).to(self.device)
        self.target_net = QNetwork(self.cfg).to(self.device)
        self.target_net.load_state_dict(self.q_net.state_dict())
        self.target_net.eval()

        # Optimiser and loss
        self.optimiser = optim.Adam(self.q_net.parameters(), lr=self.cfg.lr)
        self.loss_fn   = nn.MSELoss()

        # Replay buffer
        self.buffer  = ReplayBuffer(self.cfg.buffer_size)

        # Exploration
        self.epsilon = self.cfg.epsilon_start

        # Stats
        self.steps_done  = 0
        self.losses: list[float] = []

    # ── Action selection ──────────────────────────────────────────────────

    def select_action(self, state: np.ndarray, training: bool = True) -> int:
        """
        Epsilon-greedy action selection.

        During training:
            With probability epsilon  → random action (explore)
            With probability 1-epsilon → best known action (exploit)

        During evaluation (training=False):
            Always picks the best known action.
        """
        if training and random.random() < self.epsilon:
            return random.randint(0, self.cfg.n_actions - 1)

        state_t = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        with torch.no_grad():
            q_values = self.q_net(state_t)
        return int(q_values.argmax(dim=1).item())

    # ── Learning step ─────────────────────────────────────────────────────

    def learn(self) -> float | None:
        """
        Sample a batch from the replay buffer and update Q-network.

        Bellman equation:
            target Q(s, a) = r + γ · max_a' Q_target(s', a')

        We minimise MSE between predicted Q(s,a) and target Q(s,a).

        Returns loss value (for logging), or None if buffer too small.
        """
        if len(self.buffer) < self.cfg.batch_size:
            return None

        states, actions, rewards, next_states, dones = self.buffer.sample(
            self.cfg.batch_size
        )

        states_t      = torch.FloatTensor(states).to(self.device)
        actions_t     = torch.LongTensor(actions).to(self.device)
        rewards_t     = torch.FloatTensor(rewards).to(self.device)
        next_states_t = torch.FloatTensor(next_states).to(self.device)
        dones_t       = torch.FloatTensor(dones).to(self.device)

        # Current Q-values: Q(s, a) for the actions actually taken
        current_q = self.q_net(states_t).gather(1, actions_t.unsqueeze(1)).squeeze(1)

        # Target Q-values: r + γ · max Q_target(s', a')
        with torch.no_grad():
            max_next_q = self.target_net(next_states_t).max(dim=1)[0]
            target_q   = rewards_t + self.cfg.gamma * max_next_q * (1 - dones_t)

        loss = self.loss_fn(current_q, target_q)

        self.optimiser.zero_grad()
        loss.backward()
        # Gradient clipping: prevents exploding gradients
        nn.utils.clip_grad_norm_(self.q_net.parameters(), max_norm=1.0)
        self.optimiser.step()

        self.steps_done += 1
        loss_val = loss.item()
        self.losses.append(loss_val)
        return loss_val

    # ── Epsilon decay ─────────────────────────────────────────────────────

    def decay_epsilon(self) -> None:
        """Call once per episode to reduce exploration over time."""
        self.epsilon = max(self.cfg.epsilon_end, self.epsilon * self.cfg.epsilon_decay)

    # ── Target network update ─────────────────────────────────────────────

    def update_target(self) -> None:
        """Copy Q-network weights into target network."""
        self.target_net.load_state_dict(self.q_net.state_dict())

    # ── Save / Load ───────────────────────────────────────────────────────

    def save(self, path: str) -> None:
        torch.save({
            "q_net":      self.q_net.state_dict(),
            "target_net": self.target_net.state_dict(),
            "epsilon":    self.epsilon,
            "steps_done": self.steps_done,
            "config":     self.cfg,
        }, path)
        print(f"Model saved → {path}")

    def load(self, path: str) -> None:
        ckpt = torch.load(path, map_location=self.device)
        self.q_net.load_state_dict(ckpt["q_net"])
        self.target_net.load_state_dict(ckpt["target_net"])
        self.epsilon    = ckpt["epsilon"]
        self.steps_done = ckpt["steps_done"]
        print(f"Model loaded ← {path}")
