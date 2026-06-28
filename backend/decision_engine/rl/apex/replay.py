import numpy as np


class SumTree:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.tree = np.zeros(2 * capacity - 1, dtype=np.float64)
        self.size = 0
        self.ptr = 0

    def _propagate(self, idx: int, change: float) -> None:
        parent = (idx - 1) // 2
        self.tree[parent] += change
        if parent != 0:
            self._propagate(parent, change)

    def update(self, leaf_idx: int, priority: float) -> None:
        change = priority - self.tree[leaf_idx]
        self.tree[leaf_idx] = priority
        self._propagate(leaf_idx, change)

    def add(self, priority: float) -> int:
        leaf_idx = self.ptr + self.capacity - 1
        self.update(leaf_idx, priority)
        self.ptr = (self.ptr + 1) % self.capacity
        self.size = min(self.size + 1, self.capacity)
        return leaf_idx

    def _retrieve(self, idx: int, s: float) -> int:
        left = 2 * idx + 1
        right = left + 1
        if left >= len(self.tree):
            return idx
        if s <= self.tree[left]:
            return self._retrieve(left, s)
        return self._retrieve(right, s - self.tree[left])

    def sample(self, s: float) -> tuple[int, float]:
        leaf_idx = self._retrieve(0, s)
        return leaf_idx, self.tree[leaf_idx]

    @property
    def total(self) -> float:
        return float(self.tree[0])


class PrioritizedReplay:
    def __init__(self, capacity: int, obs_dim: int, alpha: float, eps: float, seed: int = 0):
        self.capacity = capacity
        self.alpha = alpha
        self.eps = eps
        self.rng = np.random.default_rng(seed)
        self.tree = SumTree(capacity)
        self.max_priority = 1.0

        self.obs = np.zeros((capacity, obs_dim), dtype=np.float32)
        self.next_obs = np.zeros((capacity, obs_dim), dtype=np.float32)
        self.actions = np.zeros(capacity, dtype=np.int64)
        self.rewards = np.zeros(capacity, dtype=np.float32)
        self.dones = np.zeros(capacity, dtype=np.float32)
        self.gammas = np.zeros(capacity, dtype=np.float32)
        self.leaf_to_data: dict[int, int] = {}
        self.data_ptr = 0

    def __len__(self) -> int:
        return self.tree.size

    def push(self, obs, action, reward, next_obs, done, gamma_n) -> None:
        idx = self.data_ptr
        self.obs[idx] = obs
        self.next_obs[idx] = next_obs
        self.actions[idx] = action
        self.rewards[idx] = reward
        self.dones[idx] = float(done)
        self.gammas[idx] = gamma_n
        leaf = self.tree.add(self.max_priority ** self.alpha)
        self.leaf_to_data[leaf] = idx
        self.data_ptr = (self.data_ptr + 1) % self.capacity

    def sample(self, batch_size: int, beta: float):
        total = self.tree.total
        segment = total / batch_size
        leaf_idxs = np.empty(batch_size, dtype=np.int64)
        data_idxs = np.empty(batch_size, dtype=np.int64)
        priorities = np.empty(batch_size, dtype=np.float64)

        for i in range(batch_size):
            s = self.rng.uniform(segment * i, segment * (i + 1))
            leaf, p = self.tree.sample(s)
            leaf_idxs[i] = leaf
            priorities[i] = p
            data_idxs[i] = self.leaf_to_data[leaf]

        probs = priorities / total
        weights = (len(self) * probs) ** (-beta)
        weights /= weights.max()

        return (
            self.obs[data_idxs],
            self.actions[data_idxs],
            self.rewards[data_idxs],
            self.next_obs[data_idxs],
            self.dones[data_idxs],
            self.gammas[data_idxs],
            weights.astype(np.float32),
            leaf_idxs,
        )

    def update_priorities(self, leaf_idxs: np.ndarray, td_errors: np.ndarray) -> None:
        new_p = (np.abs(td_errors) + self.eps) ** self.alpha
        for leaf, p in zip(leaf_idxs, new_p):
            self.tree.update(int(leaf), float(p))
        self.max_priority = max(self.max_priority, float(np.max(np.abs(td_errors) + self.eps)))


class NStepBuffer:
    def __init__(self, n: int, gamma: float):
        self.n = n
        self.gamma = gamma
        self.buf: list = []

    def push(self, transition) -> list:
        self.buf.append(transition)
        out = []
        if len(self.buf) >= self.n:
            out.append(self._make(self.n))
            self.buf.pop(0)
        return out

    def flush(self) -> list:
        out = []
        while self.buf:
            out.append(self._make(len(self.buf)))
            self.buf.pop(0)
        return out

    def _make(self, k: int):
        r, d, g = 0.0, False, 1.0
        for i in range(k):
            _, _, ri, _, di = self.buf[i]
            r += (self.gamma ** i) * ri
            g = self.gamma ** (i + 1)
            if di:
                d = True
                g = 0.0
                break
        o0, a0, _, _, _ = self.buf[0]
        _, _, _, on, _ = self.buf[min(k - 1, len(self.buf) - 1)]
        return (o0, a0, r, on, d, g)
