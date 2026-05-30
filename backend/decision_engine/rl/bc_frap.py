"""
bc_frap.py — Bangalore-Calibrated Fundamental Relation with Adaptive Parametrization

Modifies classical LWR (Lighthill-Whitham-Richards) flow theory for Bangalore:

Gap 1 — Two-wheeler shear layer:
    70% of vehicles are two-wheelers. They don't follow LWR because they
    weave laterally and can move even in dense traffic. We model them as a
    separate, faster flow regime that adds "bonus" throughput.

Gap 2 — Monsoon capacity collapse:
    Flooding reduces effective lanes. Each 10mm of rainfall above threshold
    reduces lane capacity proportionally based on zone flood_susceptibility.

Gap 3 — PCE heterogeneity by zone:
    Classic FRAP uses global Passenger Car Equivalents. We use zone-specific
    vehicle compositions from VAHAN data so "20 vehicles in North zone" and
    "20 vehicles in Central zone" produce different effective congestion.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from .zones import ZoneConfig


# ── Constants ──────────────────────────────────────────────────────────────

# Vehicles per km at complete standstill (jam density).
# Bangalore roads: typically 180-220 PCE/km. We use 200 as calibrated default.
JAM_DENSITY_PCE_KM: float = 200.0

# Minimum rainfall (mm) before flooding starts reducing lane capacity.
FLOOD_RAIN_THRESHOLD_MM: float = 5.0

# How aggressively rainfall reduces lanes (fraction per 100mm per unit susceptibility).
FLOOD_REDUCTION_RATE: float = 0.15

# Saturation flow rate: vehicles that can discharge per lane per hour at a green signal.
# Standard HCM value for cars: 1800 PCE/hr. Two-wheelers discharge faster (~2200).
# We'll use a zone-adjusted value.
BASE_SATURATION_FLOW_PCE_HR: float = 1800.0


@dataclass
class LaneState:
    """
    Snapshot of one lane's traffic state.

    counts: vehicles currently waiting, by type
        {"car": N, "twowheel": N, "heavy": N}
    """
    counts:          dict[str, int] = field(default_factory=lambda: {"car": 0, "twowheel": 0, "heavy": 0})
    speed_kmh:       float = 50.0
    density_pce_km:  float = 0.0
    flow_pce_hr:     float = 0.0

    def total_vehicles(self) -> int:
        return sum(self.counts.values())

    def total_pce(self, zone: ZoneConfig) -> float:
        """Weighted vehicle count using zone-specific PCE."""
        return (
            self.counts.get("car",      0) * zone.pce_car
            + self.counts.get("twowheel", 0) * zone.pce_twowheel
            + self.counts.get("heavy",    0) * zone.pce_heavy
        )


# ── Gap 2: Monsoon capacity collapse ──────────────────────────────────────

def effective_lanes(base_lanes: int, rainfall_mm: float, zone: ZoneConfig) -> float:
    """
    Reduce effective lane capacity under monsoon flooding.

    Args:
        base_lanes:   Physical lane count on this road segment.
        rainfall_mm:  Current rainfall in mm (0 = dry day).
        zone:         Zone config (contains flood_susceptibility).

    Returns:
        Effective lane count (float, may be fractional).

    Example:
        base_lanes=3, rainfall_mm=80, zone.flood_susceptibility=0.6
        → lanes drop to ~2.04  (one lane nearly unusable)
    """
    if rainfall_mm < FLOOD_RAIN_THRESHOLD_MM:
        return float(base_lanes)

    # Each 100mm of rain reduces lanes by (susceptibility * FLOOD_REDUCTION_RATE)
    reduction = (rainfall_mm / 100.0) * zone.flood_susceptibility * FLOOD_REDUCTION_RATE * base_lanes
    return max(0.5, float(base_lanes) - reduction)


# ── Gap 1 + 3: Two-wheeler shear + zone PCE ───────────────────────────────

def fundamental_relation(
    density_pce_km: float,
    zone: ZoneConfig,
    free_flow_speed_kmh: float = 50.0,
) -> tuple[float, float]:
    """
    Bangalore-calibrated fundamental diagram: density → (flow, speed).

    Modifications vs classical LWR:
        - Two-wheeler bonus: extra throughput at low density because
          two-wheelers can laterally shuffle and clear gaps faster.
        - Zone-specific jam density: high two-wheeler zones can pack
          slightly more vehicles before full stop.

    Args:
        density_pce_km:      Current density in PCE per km per lane.
        zone:                Zone configuration.
        free_flow_speed_kmh: Speed limit / ideal free-flow speed.

    Returns:
        (flow_pce_per_hour, speed_kmh)
    """
    # Two-wheeler shear bonus: if zone has >50% two-wheelers,
    # free-flow speed gets a small boost because they shuffle through.
    # Max bonus: +10% speed when zone is 100% two-wheelers.
    twowheel_excess = max(0.0, zone.twowheel_fraction - 0.50)
    shear_bonus     = twowheel_excess * 0.20  # up to +10% speed

    # Adjusted jam density: high two-wheeler zones pack denser
    jam_density = JAM_DENSITY_PCE_KM * (1.0 + twowheel_excess * 0.15)

    if density_pce_km <= 0:
        speed = free_flow_speed_kmh * (1 + shear_bonus)
        return 0.0, speed

    # Greenshields linear speed-density model (simple but interpretable)
    # v = v_free * (1 - k/k_jam)
    speed_ratio = 1.0 - (density_pce_km / jam_density)
    speed_ratio = max(0.02, min(1.0, speed_ratio))  # clamp: never zero, never above free-flow

    speed    = free_flow_speed_kmh * speed_ratio * (1 + shear_bonus)
    flow_pce = density_pce_km * speed  # vehicles/hr per lane (in PCE)

    return flow_pce, speed


# ── Segment: full road segment with BC-FRAP dynamics ──────────────────────

class BCFRAPSegment:
    """
    A single road segment (one approach to an intersection).

    Tracks vehicles by type in each lane and computes BC-FRAP flow.
    """

    def __init__(
        self,
        segment_id:          str,
        zone:                ZoneConfig,
        lanes:               int   = 2,
        length_m:            float = 200.0,
        free_flow_speed_kmh: float = 50.0,
    ):
        self.segment_id          = segment_id
        self.zone                = zone
        self.lanes               = lanes
        self.length_m            = length_m
        self.free_flow_speed_kmh = free_flow_speed_kmh

        # One LaneState per lane
        self.lane_states: list[LaneState] = [LaneState() for _ in range(lanes)]

    # ── Arrival ────────────────────────────────────────────────────────────

    def add_vehicles(self, cars: int, twheels: int, heavy: int, lane: int = 0) -> None:
        """Add arriving vehicles to a lane."""
        s = self.lane_states[lane]
        s.counts["car"]      += cars
        s.counts["twowheel"] += twheels
        s.counts["heavy"]    += heavy

    # ── Departure (green phase) ────────────────────────────────────────────

    def saturation_flow(self, rainfall_mm: float = 0.0) -> float:
        """
        Compute effective saturation flow rate for this segment (PCE/hr).

        Two modifications vs standard HCM value:
          1. Two-wheeler bonus: high two-wheeler zones discharge faster
             because they queue more efficiently and accelerate quicker.
          2. Monsoon reduction: rain reduces effective capacity via
             lane flooding and poor visibility.

        This is BC-FRAP Gap 1 (two-wheelers) and Gap 2 (monsoon) applied
        to the signal discharge model, not just the free-flow model.
        """
        # Gap 1: Two-wheeler shear bonus on saturation flow
        # Two-wheelers clear intersections faster than cars (~20% higher throughput)
        twowheel_excess = max(0.0, self.zone.twowheel_fraction - 0.50)
        shear_bonus     = twowheel_excess * 0.20  # up to +10% throughput

        # Gap 2: Monsoon reduces effective lanes → proportionally reduces flow
        eff_lanes   = effective_lanes(self.lanes, rainfall_mm, self.zone)
        rain_factor = eff_lanes / self.lanes  # 1.0 dry, <1.0 flooded

        sat_flow = BASE_SATURATION_FLOW_PCE_HR * (1 + shear_bonus) * rain_factor * self.lanes
        return sat_flow

    def discharge(self, green_duration_s: float, rainfall_mm: float = 0.0) -> float:
        """
        Simulate vehicles discharging during a green phase.

        Uses saturation flow rate (standard signal engineering approach)
        rather than LWR density-flow model. At a traffic signal, the queue
        discharges at a fixed rate regardless of how long it is — the LWR
        model is for mid-link flow, not intersection discharge.

        Returns total PCE discharged (used for reward computation).
        """
        sat_flow_pce_hr = self.saturation_flow(rainfall_mm)
        discharged      = 0.0

        # PCE that can leave in green_duration_s across all lanes
        pce_capacity = sat_flow_pce_hr * (green_duration_s / 3600.0)

        # Distribute capacity across lane states (all lanes together form one queue)
        remaining_capacity = pce_capacity
        for state in self.lane_states:
            total_pce = state.total_pce(self.zone)
            if total_pce == 0 or remaining_capacity <= 0:
                continue

            pce_discharged     = min(total_pce, remaining_capacity)
            remaining_capacity -= pce_discharged

            # Remove vehicles proportionally across types
            ratio = pce_discharged / total_pce
            for vtype in state.counts:
                removed = int(state.counts[vtype] * ratio)
                state.counts[vtype] = max(0, state.counts[vtype] - removed)

            # Update speed (rough estimate based on how cleared the queue is)
            clearance_ratio     = 1.0 - (state.total_pce(self.zone) / max(total_pce, 1))
            state.speed_kmh     = self.free_flow_speed_kmh * clearance_ratio
            state.flow_pce_hr   = sat_flow_pce_hr
            discharged         += pce_discharged

        return discharged

    # ── Observation ────────────────────────────────────────────────────────

    def waiting_pce(self) -> float:
        """Total PCE waiting at this segment (all lanes)."""
        return sum(s.total_pce(self.zone) for s in self.lane_states)

    def waiting_vehicles(self) -> dict[str, int]:
        """Total vehicle counts waiting (all lanes summed)."""
        totals: dict[str, int] = {"car": 0, "twowheel": 0, "heavy": 0}
        for s in self.lane_states:
            for vtype, count in s.counts.items():
                totals[vtype] += count
        return totals

    def observation_vector(self) -> list[float]:
        """
        Flat observation vector for the RL agent.
        Returns [cars, twheels, heavy] waiting (all lanes combined).
        """
        w = self.waiting_vehicles()
        return [float(w["car"]), float(w["twowheel"]), float(w["heavy"])]
