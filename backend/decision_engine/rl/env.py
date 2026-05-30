"""
env.py — BangaloreTrafficEnv

A single 4-way intersection in Bangalore.
Compatible with the Gymnasium (OpenAI Gym) API.

Observation:
    12-dimensional vector:
    [cars_N, twheels_N, heavy_N,
     cars_S, twheels_S, heavy_S,
     cars_E, twheels_E, heavy_E,
     cars_W, twheels_W, heavy_W]

Action:
    0 → North-South green  (East-West red)
    1 → East-West green    (North-South red)

Reward (Bangalore-specific — Throughput + Fairness):
    Two-term reward that prevents both global congestion and starvation.

    Term 1 — Throughput: -total_pce_waiting / 100
        Agent is penalised for every PCE unit sitting idle anywhere.
        Same as classic FRAP.

    Term 2 — Fairness: -imbalance / FAIRNESS_SCALE
        Agent is penalised when one axis (NS or EW) waits significantly
        more than the other. Prevents the DQN from ignoring low-traffic
        roads — which in Bangalore means ignoring autos, BMTC buses,
        and two-wheelers that have no rerouting option.

    Why fairness matters here but not in Hangzhou:
        Hangzhou City Brain optimises for cars on well-defined arterials.
        Vehicles can reroute. Bangalore's two-wheeler and auto population
        uses every road — a side street starved for 10 phases blocks
        people with no alternative.

Episode:
    One simulated hour at the intersection.
    Each step = one signal phase (green_duration_s seconds).

Usage:
    from backend.decision_engine.rl.env import BangaloreTrafficEnv

    env = BangaloreTrafficEnv(zone_id="South", rainfall_mm=30)
    obs, info = env.reset()
    for _ in range(100):
        action = env.action_space.sample()  # random agent
        obs, reward, terminated, truncated, info = env.step(action)
"""
from __future__ import annotations

import random
from typing import Any

import numpy as np

from .bc_frap import BCFRAPSegment, effective_lanes
from .zones import ZoneConfig, get_zone, DEFAULT_ZONE


# ── Tuning knobs ─────────────────────────────────────────────────────────

GREEN_DURATION_S:   float = 30.0   # seconds of green per phase step
YELLOW_DURATION_S:  float = 3.0    # transition time (no movement)
STEPS_PER_EPISODE:  int   = 120    # 120 steps × 33s = ~1 hour simulated
MAX_VEHICLES_LANE:  int   = 60     # observation clamp (prevents explosion)
ARRIVAL_NOISE:      float = 0.25   # ±25% random noise on arrival rates

# Fairness
# Scale factor for the imbalance penalty. Lower = harsher fairness enforcement.
# At 150: imbalance of 100 PCE adds -0.67 to reward (meaningful but not dominant).
# Tune this to trade off throughput vs fairness.
FAIRNESS_SCALE:     float = 150.0

# Starvation threshold: phases without a green before we call it starvation.
# At 30s/phase, 8 phases = 4 minutes of waiting — unacceptable for Bangalore.
STARVATION_PHASES:  int   = 8


class BangaloreTrafficEnv:
    """
    Gymnasium-compatible environment for Bangalore traffic signal control.

    Each episode simulates a 4-way intersection for one hour.
    The agent controls which road pair gets the green phase.
    """

    # Gymnasium API constants
    metadata = {"render_modes": ["human", "ansi"]}

    def __init__(
        self,
        zone_id:       str   = "Central",
        rainfall_mm:   float = 0.0,
        is_peak_hour:  bool  = True,
        seed:          int | None = None,
    ):
        self.zone:          ZoneConfig = get_zone(zone_id)
        self.rainfall_mm:   float      = rainfall_mm
        self.is_peak_hour:  bool       = is_peak_hour

        # Arrivals per step per approach
        base_rate = (
            self.zone.peak_arrival_rate
            if is_peak_hour
            else self.zone.offpeak_arrival_rate
        )
        self._arrival_pct_per_step = base_rate * GREEN_DURATION_S / 60.0

        # Action space: 0 = NS green, 1 = EW green
        # (We define this ourselves since we're not importing gymnasium)
        self.n_actions: int = 2

        # Observation space: 4 approaches × 3 vehicle types = 12 dims
        self.obs_dim: int = 12

        self._rng = random.Random(seed)
        self._np_rng = np.random.default_rng(seed)

        # Internal state
        self._step_count:    int = 0
        self._current_phase: int = 0   # 0=NS, 1=EW
        self._segments: dict[str, BCFRAPSegment] = {}
        self._total_reward:        float = 0.0
        self._phases_since_ns:     int   = 0   # steps since NS got a green
        self._phases_since_ew:     int   = 0   # steps since EW got a green
        self._starvation_events:   int   = 0   # total starvation events this episode

        self._build_intersection()

    # ── Setup ──────────────────────────────────────────────────────────────

    def _build_intersection(self) -> None:
        """Create 4 road segments (one per approach)."""
        for direction in ["N", "S", "E", "W"]:
            self._segments[direction] = BCFRAPSegment(
                segment_id=f"{self.zone.zone_id}_{direction}",
                zone=self.zone,
                lanes=2,
                length_m=200.0,
                free_flow_speed_kmh=50.0,
            )

    # ── Gymnasium API ──────────────────────────────────────────────────────

    def reset(
        self,
        seed: int | None = None,
        options: dict | None = None,
    ) -> tuple[np.ndarray, dict]:
        if seed is not None:
            self._rng = random.Random(seed)
            self._np_rng = np.random.default_rng(seed)

        self._step_count         = 0
        self._current_phase      = 0
        self._total_reward       = 0.0
        self._phases_since_ns    = 0
        self._phases_since_ew    = 0
        self._starvation_events  = 0
        self._build_intersection()

        obs  = self._get_observation()
        info = self._get_info()
        return obs, info

    def step(self, action: int) -> tuple[np.ndarray, float, bool, bool, dict]:
        """
        Execute one signal phase.

        Args:
            action: 0 = give NS green, 1 = give EW green

        Returns:
            (observation, reward, terminated, truncated, info)
        """
        assert action in (0, 1), f"Invalid action {action}. Must be 0 or 1."

        # ── 1. Arrive: new vehicles join all approaches ───────────────────
        self._arrive_vehicles()

        # ── 2. Discharge: green approaches clear traffic ──────────────────
        green_dirs  = ["N", "S"] if action == 0 else ["E", "W"]
        discharged  = 0.0
        for d in green_dirs:
            discharged += self._segments[d].discharge(
                green_duration_s=GREEN_DURATION_S,
                rainfall_mm=self.rainfall_mm,
            )

        # ── 3. Reward: Throughput + Fairness (Bangalore-specific) ────────────

        # Term 1 — Throughput: penalise all waiting PCE
        ns_pce = (self._segments["N"].waiting_pce()
                + self._segments["S"].waiting_pce())
        ew_pce = (self._segments["E"].waiting_pce()
                + self._segments["W"].waiting_pce())
        total_waiting_pce = ns_pce + ew_pce

        throughput_reward = -total_waiting_pce / 100.0

        # Term 2 — Fairness: penalise imbalance between NS and EW
        # When one axis has far more waiting PCE than the other,
        # the agent must be nudged to share green time more equitably.
        imbalance      = abs(ns_pce - ew_pce)
        fairness_penalty = -imbalance / FAIRNESS_SCALE

        # Term 3 — Starvation: hard penalty when one axis is ignored too long
        # This directly encodes the Bangalore constraint: an auto or bus
        # cannot wait indefinitely even on a low-traffic road.
        starvation_penalty = 0.0
        if action == 0:  # NS got green
            self._phases_since_ns = 0
            self._phases_since_ew += 1
        else:            # EW got green
            self._phases_since_ew = 0
            self._phases_since_ns += 1

        if self._phases_since_ns >= STARVATION_PHASES:
            starvation_penalty    = -1.0   # sharp penalty
            self._starvation_events += 1
        if self._phases_since_ew >= STARVATION_PHASES:
            starvation_penalty    = -1.0
            self._starvation_events += 1

        reward = throughput_reward + fairness_penalty + starvation_penalty

        self._total_reward  += reward
        self._current_phase  = action
        self._step_count    += 1

        # ── 4. Termination ────────────────────────────────────────────────
        terminated = False
        truncated  = self._step_count >= STEPS_PER_EPISODE

        obs  = self._get_observation()
        info = self._get_info(discharged=discharged, total_waiting_pce=total_waiting_pce)

        return obs, reward, terminated, truncated, info

    # ── Internal helpers ───────────────────────────────────────────────────

    def _arrive_vehicles(self) -> None:
        """
        Generate arriving vehicles for all approaches.
        Vehicle types are sampled from zone composition.
        Adds ±ARRIVAL_NOISE random variation.
        """
        for direction, seg in self._segments.items():
            # Noisy arrival total
            noise  = 1.0 + self._rng.uniform(-ARRIVAL_NOISE, ARRIVAL_NOISE)
            n_total = max(0, int(self._arrival_pct_per_step * noise))

            # Split by vehicle type using zone fractions
            n_twowheel = int(n_total * self.zone.twowheel_fraction)
            n_heavy    = int(n_total * self.zone.heavy_fraction)
            n_car      = n_total - n_twowheel - n_heavy

            # Add to first lane (simplified: single-lane queueing)
            seg.add_vehicles(
                cars=max(0, n_car),
                twheels=max(0, n_twowheel),
                heavy=max(0, n_heavy),
                lane=0,
            )

    def _get_observation(self) -> np.ndarray:
        """
        Build 12-dim observation vector.
        [cars_N, twheels_N, heavy_N, cars_S, twheels_S, heavy_S, ...]
        Clipped to MAX_VEHICLES_LANE.
        """
        obs = []
        for direction in ["N", "S", "E", "W"]:
            vec = self._segments[direction].observation_vector()
            obs.extend(vec)

        obs_arr = np.array(obs, dtype=np.float32)
        return np.clip(obs_arr, 0, MAX_VEHICLES_LANE)

    def _get_info(self, discharged: float = 0.0, total_waiting_pce: float = 0.0) -> dict:
        ns_pce = (self._segments["N"].waiting_pce()
                + self._segments["S"].waiting_pce())
        ew_pce = (self._segments["E"].waiting_pce()
                + self._segments["W"].waiting_pce())
        return {
            "step":               self._step_count,
            "phase":              "NS" if self._current_phase == 0 else "EW",
            "zone":               self.zone.zone_id,
            "rainfall_mm":        self.rainfall_mm,
            "is_peak_hour":       self.is_peak_hour,
            "discharged_pce":     discharged,
            "total_waiting_pce":  total_waiting_pce,
            "ns_waiting_pce":     round(ns_pce, 1),
            "ew_waiting_pce":     round(ew_pce, 1),
            "imbalance_pce":      round(abs(ns_pce - ew_pce), 1),
            "starvation_events":  self._starvation_events,
            "phases_since_ns":    self._phases_since_ns,
            "phases_since_ew":    self._phases_since_ew,
            "cumulative_reward":  self._total_reward,
            "effective_pce":      self.zone.effective_pce(),
        }

    # ── Rendering ──────────────────────────────────────────────────────────

    def render(self, mode: str = "ansi") -> str | None:
        """Print a simple ASCII snapshot of intersection state."""
        lines = [
            f"Step {self._step_count}/{STEPS_PER_EPISODE} | "
            f"Zone: {self.zone.zone_id} | "
            f"Rain: {self.rainfall_mm}mm | "
            f"Phase: {'NS' if self._current_phase == 0 else 'EW'} green",
            "",
        ]
        for d, seg in self._segments.items():
            w = seg.waiting_vehicles()
            pce = seg.waiting_pce()
            lines.append(
                f"  {d}: {w['car']:3d} cars  {w['twowheel']:3d} 2W  {w['heavy']:2d} heavy  "
                f"= {pce:5.1f} PCE"
            )
        out = "\n".join(lines)
        if mode == "human":
            print(out)
        return out

    def close(self) -> None:
        pass
