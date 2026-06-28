import torch
import torch.nn as nn


class DuelingQNetwork(nn.Module):
    def __init__(self, obs_dim: int, n_actions: int, hidden: tuple = (256, 256)):
        super().__init__()
        layers = []
        in_dim = obs_dim
        for h in hidden:
            layers += [nn.Linear(in_dim, h), nn.ReLU(inplace=True)]
            in_dim = h
        self.trunk = nn.Sequential(*layers)
        self.value = nn.Linear(in_dim, 1)
        self.advantage = nn.Linear(in_dim, n_actions)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.trunk(x)
        v = self.value(h)
        a = self.advantage(h)
        return v + (a - a.mean(dim=-1, keepdim=True))


class QNetwork(nn.Module):
    def __init__(self, obs_dim: int, n_actions: int, hidden: tuple = (256, 256)):
        super().__init__()
        layers = []
        in_dim = obs_dim
        for h in hidden:
            layers += [nn.Linear(in_dim, h), nn.ReLU(inplace=True)]
            in_dim = h
        layers += [nn.Linear(in_dim, n_actions)]
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def build_q_net(obs_dim: int, n_actions: int, hidden: tuple, dueling: bool) -> nn.Module:
    cls = DuelingQNetwork if dueling else QNetwork
    return cls(obs_dim, n_actions, hidden)
