"""
config.py — All tuneable constants in one place.

Nothing else in the system hardcodes numbers. If a threshold
or weight changes, it changes here and nowhere else.
"""
from __future__ import annotations
from typing import TypedDict


# ── Scoring weights (must sum to 1.0) ─────────────────────────────────────────

class Weights(TypedDict):
    eta:        float
    congestion: float
    weather:    float
    stability:  float


DEFAULT_WEIGHTS: Weights = {
    "eta":        0.40,
    "congestion": 0.25,
    "weather":    0.15,
    "stability":  0.20,
}


# ── Reroute thresholds ────────────────────────────────────────────────────────

class Thresholds(TypedDict):
    min_time_saving_s:       int    # candidate must save at least this many seconds
    min_traffic_increase_pct: float  # current route congestion must have grown by this %
    min_congestion_delta:    float  # candidate must be this many points clearer
    min_score_improvement:   float  # composite score must improve by this fraction


# ── City profiles ─────────────────────────────────────────────────────────────
#
# Bangalore: historically high baseline congestion, heavy monsoon, frequent
# construction detours. Thresholds are more tolerant to avoid alert fatigue.

CITY_PROFILES: dict[str, dict] = {
    "bangalore": {
        "weights": Weights(
            eta=0.35, congestion=0.20, weather=0.20, stability=0.25,
        ),
        "thresholds": {
            "peak": Thresholds(
                min_time_saving_s=240,
                min_traffic_increase_pct=0.35,
                min_congestion_delta=15.0,
                min_score_improvement=0.12,
            ),
            "off_peak": Thresholds(
                min_time_saving_s=150,
                min_traffic_increase_pct=0.25,
                min_congestion_delta=12.0,
                min_score_improvement=0.10,
            ),
        },
        "cooldown_s": 300,   # 5 min minimum between reroutes
    },

    "default": {
        "weights": DEFAULT_WEIGHTS,
        "thresholds": {
            "peak": Thresholds(
                min_time_saving_s=180,
                min_traffic_increase_pct=0.25,
                min_congestion_delta=12.0,
                min_score_improvement=0.10,
            ),
            "off_peak": Thresholds(
                min_time_saving_s=120,
                min_traffic_increase_pct=0.18,
                min_congestion_delta=10.0,
                min_score_improvement=0.08,
            ),
        },
        "cooldown_s": 180,   # 3 min
    },
}


# ── Peak / off-peak / night ────────────────────────────────────────────────────
# Used by both the rule-based engine and the state encoder.

PEAK_HOURS   = [(7, 10), (17, 20)]   # (start_hour inclusive, end_hour exclusive)
NIGHT_HOURS  = (22, 6)               # 22:00–06:00


def classify_time_of_day(hour: int) -> str:
    """Returns 'peak' | 'off_peak' | 'night'."""
    for start, end in PEAK_HOURS:
        if start <= hour < end:
            return "peak"
    if hour >= NIGHT_HOURS[0] or hour < NIGHT_HOURS[1]:
        return "night"
    return "off_peak"


# ── Weather code → penalty (WMO codes, used by Open-Meteo) ───────────────────

def weather_code_to_penalty(code: int) -> float:
    if code == 0:               return 0.00   # Clear sky
    if code == 1:               return 0.02   # Mainly clear
    if code == 2:               return 0.03   # Partly cloudy
    if code == 3:               return 0.05   # Overcast
    if code in (45, 48):        return 0.18   # Fog
    if 51 <= code <= 57:        return 0.22   # Drizzle
    if 61 <= code <= 67:        return 0.38   # Rain
    if 71 <= code <= 77:        return 0.65   # Snow
    if 80 <= code <= 82:        return 0.30   # Showers
    if code == 95 or 96 <= code <= 99: return 0.80  # Thunderstorm
    return 0.00


# ── PostGIS corridor radius ───────────────────────────────────────────────────
CORRIDOR_RADIUS_M  = 1_500   # metres around route geometry to search for readings
STABILITY_SAMPLE_N = 20      # points to sample for route similarity

# ── RL hyperparameters ────────────────────────────────────────────────────────
RL_LEARNING_RATE       = 0.10
RL_DISCOUNT            = 0.95
RL_EPSILON             = 0.15    # exploration rate during training
RL_CONFIDENCE_VISITS   = 10     # minimum visits before RL is trusted
RL_CONFIDENCE_THRESHOLD = 0.70  # min confidence for RL to override rule-based

# ── Reward shaping ────────────────────────────────────────────────────────────
REWARD_DELAY_PER_SECOND     = -0.10   # cost per second of delay
REWARD_UNNECESSARY_REROUTE  = -50.0   # switching when it wasn't worth it
REWARD_GOOD_REROUTE_BONUS   = +30.0   # bonus when reroute saves >= threshold
REWARD_GOOD_REROUTE_MIN_S   = 180     # 3 minutes saved = "good reroute"

# ── Q-table persistence ───────────────────────────────────────────────────────
import os
QTABLE_PATH = os.path.join(os.path.dirname(__file__), "data", "qtable.json")
