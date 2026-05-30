"""
zones.py — Bangalore zone configurations calibrated from VAHAN data.

Each zone captures vehicle composition, PCE weights, and flood risk.
These values come from VAHAN vehicle registration data across the
five BBMP zones.

Source: VAHAN National Vehicle Registry, Karnataka state data.

Zone fractions (approximate from registration data):
    - Two-wheelers dominate at ~68-72% across all zones
    - Heavy vehicles higher in North/East (industrial corridors)
    - Central zone has lowest heavy fraction (commercial core)
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ZoneConfig:
    """
    Bangalore zone characteristics derived from VAHAN data.

    PCE (Passenger Car Equivalent) values:
        - Car / 3-wheeler: 1.0  (baseline)
        - Two-wheeler:     0.30 (moves faster, takes less space)
        - Heavy vehicle:   2.50 (truck, bus, larger footprint)

    flood_susceptibility: 0.0 (no risk) → 1.0 (floods every heavy rain)
    peak_arrival_rate: vehicles/minute arriving at intersection during peak
    """
    zone_id:             str
    twowheel_fraction:   float  # 0-1 share of registered two-wheelers
    car_fraction:        float  # 0-1 share of cars / autos
    heavy_fraction:      float  # 0-1 share of trucks / buses
    pce_twowheel:        float  # PCE weight for two-wheelers
    pce_car:             float  # PCE weight for cars
    pce_heavy:           float  # PCE weight for heavy vehicles
    flood_susceptibility: float # how easily lanes reduce under rain
    peak_arrival_rate:   float  # vehicles/min during peak hour (per lane)
    offpeak_arrival_rate: float # vehicles/min off-peak (per lane)

    def effective_pce(self) -> float:
        """Weighted average PCE across vehicle types for this zone."""
        return (
            self.pce_twowheel * self.twowheel_fraction
            + self.pce_car     * self.car_fraction
            + self.pce_heavy   * self.heavy_fraction
        )


# ── Zone configurations ────────────────────────────────────────────────────
# Fractions must sum to 1.0 per zone.

ZONES: dict[str, ZoneConfig] = {

    # NH44 / Hebbal, Yelahanka, Devanahalli corridor
    # High heavy vehicle fraction: Devanahalli industrial zone + airport logistics
    "North": ZoneConfig(
        zone_id              = "North",
        twowheel_fraction    = 0.68,
        car_fraction         = 0.26,
        heavy_fraction       = 0.06,
        pce_twowheel         = 0.30,
        pce_car              = 1.00,
        pce_heavy            = 2.50,
        flood_susceptibility = 0.40,   # moderate — elevated terrain
        peak_arrival_rate    = 18.0,   # vehicles/min per lane (peak)
        offpeak_arrival_rate = 8.0,
    ),

    # Koramangala, BTM, Jayanagar, Bannerghatta Road
    # High car fraction: IT corridor, upscale residential
    "South": ZoneConfig(
        zone_id              = "South",
        twowheel_fraction    = 0.65,
        car_fraction         = 0.32,
        heavy_fraction       = 0.03,
        pce_twowheel         = 0.30,
        pce_car              = 1.00,
        pce_heavy            = 2.50,
        flood_susceptibility = 0.55,   # higher — low-lying areas, ORR flooding
        peak_arrival_rate    = 22.0,   # worst peak in the city (IT commute)
        offpeak_arrival_rate = 9.0,
    ),

    # Whitefield, KR Puram, Mahadevapura
    # Mixed: IT + industrial, rapid growth
    "East": ZoneConfig(
        zone_id              = "East",
        twowheel_fraction    = 0.70,
        car_fraction         = 0.24,
        heavy_fraction       = 0.06,
        pce_twowheel         = 0.30,
        pce_car              = 1.00,
        pce_heavy            = 2.50,
        flood_susceptibility = 0.60,   # worst — Varthur lake overflow risk
        peak_arrival_rate    = 20.0,
        offpeak_arrival_rate = 8.5,
    ),

    # Rajajinagar, Yeshwanthpur, Peenya
    # High heavy vehicle fraction: Peenya industrial area
    "West": ZoneConfig(
        zone_id              = "West",
        twowheel_fraction    = 0.69,
        car_fraction         = 0.24,
        heavy_fraction       = 0.07,
        pce_twowheel         = 0.30,
        pce_car              = 1.00,
        pce_heavy            = 2.50,
        flood_susceptibility = 0.45,
        peak_arrival_rate    = 16.0,
        offpeak_arrival_rate = 7.5,
    ),

    # MG Road, Commercial Street, City Market, Majestic
    # Lowest heavy fraction: restricted truck movement in commercial core
    "Central": ZoneConfig(
        zone_id              = "Central",
        twowheel_fraction    = 0.67,
        car_fraction         = 0.31,
        heavy_fraction       = 0.02,
        pce_twowheel         = 0.30,
        pce_car              = 1.00,
        pce_heavy            = 2.50,
        flood_susceptibility = 0.35,   # lower — better drainage historically
        peak_arrival_rate    = 24.0,   # highest density, constrained roads
        offpeak_arrival_rate = 12.0,
    ),
}

DEFAULT_ZONE = ZONES["Central"]


def get_zone(zone_id: str) -> ZoneConfig:
    """Return a ZoneConfig by name. Raises KeyError if not found."""
    if zone_id not in ZONES:
        raise KeyError(
            f"Unknown zone '{zone_id}'. Valid zones: {list(ZONES.keys())}"
        )
    return ZONES[zone_id]
