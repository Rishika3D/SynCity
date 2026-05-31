"""
perception.py — Roboflow → BC-FRAP Vehicle Counter

Converts raw camera frames into structured vehicle counts
per approach (N, S, E, W) using the Roboflow Rapid model.

Model: rishikas-workspace-rrf4s/traffic-9g570
Classes (exactly 5, multi-class — no generic "vehicle" label):
    car | motorcycle | auto_rickshaw | bus | truck

Two output formats:

  1. Raw class counts (per frame, for logging/monitoring):
     {"car": 12, "motorcycle": 38, "auto_rickshaw": 7, "bus": 2, "truck": 4}

  2. Per-approach BC-FRAP counts (for the DQN):
     {"N": {"car": 3, "twowheel": 8, "heavy": 1},
      "S": {"car": 1, "twowheel": 7, "heavy": 0}, ...}

The second format aggregates motorcycle + auto_rickshaw → twowheel
and bus + truck → heavy, matching BC-FRAP's PCE model.

Pipeline:
    frame (image)
        ↓
    Roboflow API  (traffic-9g570)
        ↓
    raw detections  [{class, confidence, x, y, w, h}, ...]
        ↓  ← two outputs branch here
    [A] raw_class_counts()    → {"car":12, "motorcycle":38, ...}
    [B] per_approach_counts() → {"N": {"car":3, "twowheel":8, ...}, ...}
        ↓
    to_observation_vector()   → [12 floats] → DQN

Usage:
    counter = VehicleCounter(api_key="YOUR_KEY", lane_rois=SILK_BOARD_ROIS)

    # Raw counts for this frame (logging)
    raw = counter.raw_class_counts("frame_0001.jpg")
    # {"car": 12, "motorcycle": 38, "auto_rickshaw": 7, "bus": 2, "truck": 4}

    # Per-approach counts + DQN vector
    counts, obs = counter.count_and_vectorise("frame_0001.jpg")
"""
from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests


# ── Roboflow model config ─────────────────────────────────────────────────

WORKSPACE   = "rishikas-workspace-rrf4s"
PROJECT     = "traffic-9g570"
VERSION     = 1          # bump this when you retrain
CONFIDENCE  = 0.40       # minimum confidence to accept a detection
OVERLAP     = 0.30       # max overlap before NMS suppresses a duplicate

ROBOFLOW_URL = (
    f"https://detect.roboflow.com/{PROJECT}/{VERSION}"
    f"?api_key={{api_key}}"
    f"&confidence={int(CONFIDENCE * 100)}"
    f"&overlap={int(OVERLAP * 100)}"
    f"&labels=true"
)


# ── Exact Roboflow class labels (5 classes, multi-class model) ───────────
# These must match exactly what the model outputs.
# No generic "vehicle" class — each detection is one of these five.

ROBOFLOW_CLASSES: tuple[str, ...] = (
    "car",
    "motorcycle",
    "auto_rickshaw",
    "bus",
    "truck",
)

# ── Class → BC-FRAP vehicle type mapping ─────────────────────────────────
# Maps Roboflow class labels to (bcfrap_type, pce_weight).
#
# motorcycle + auto_rickshaw → "twowheel" (different PCE weights)
# bus + truck                → "heavy"
#
# We keep PCE weights here even though the DQN env has its own
# zone-specific PCE — these are used for the raw count logging only.

CLASS_MAP: dict[str, tuple[str, float]] = {
    "car":           ("car",      1.00),
    "motorcycle":    ("twowheel", 0.30),
    "auto_rickshaw": ("twowheel", 0.50),   # higher than motorcycle — wider, slower
    "bus":           ("heavy",    2.50),
    "truck":         ("heavy",    2.50),
}

APPROACHES = ["N", "S", "E", "W"]


# ── Lane ROI (Region of Interest) ─────────────────────────────────────────

@dataclass
class LaneROI:
    """
    Defines a polygon region in image coordinates for one approach.

    Coordinates are (x, y) pixel values normalised to 0-1 range
    (fraction of image width/height). This makes them camera-resolution
    independent.

    How to define:
        Open a frame in Preview/Photoshop. Click the 4 corners of the
        road segment feeding into the intersection from each direction.
        Divide pixel coords by image width/height to normalise.

    Example — Silk Board junction, North approach:
        If the Northern road occupies pixels (200,0)→(400,300) in a
        640×480 image, normalised = [(0.31,0), (0.63,0), (0.63,0.63), (0.31,0.63)]
    """
    approach:    str                      # "N", "S", "E", "W"
    polygon:     list[tuple[float, float]]  # normalised (x, y) pairs, ≥3 points

    def contains(self, nx: float, ny: float) -> bool:
        """
        Point-in-polygon test (ray casting).
        nx, ny are normalised (0-1) centre coordinates of a detection.
        """
        n    = len(self.polygon)
        inside = False
        px, py = nx, ny
        j = n - 1
        for i in range(n):
            xi, yi = self.polygon[i]
            xj, yj = self.polygon[j]
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
                inside = not inside
            j = i
        return inside


# ── Default ROIs for Silk Board junction ─────────────────────────────────
# These are approximate. Calibrate by opening frame_0001.jpg and clicking
# the road polygon for each approach. Replace these values with yours.
#
# Coordinate system: (0,0) = top-left, (1,1) = bottom-right of image.

SILK_BOARD_ROIS: list[LaneROI] = [
    LaneROI("N", [(0.30, 0.00), (0.55, 0.00), (0.55, 0.40), (0.30, 0.40)]),
    LaneROI("S", [(0.30, 0.60), (0.55, 0.60), (0.55, 1.00), (0.30, 1.00)]),
    LaneROI("E", [(0.60, 0.30), (1.00, 0.30), (1.00, 0.60), (0.60, 0.60)]),
    LaneROI("W", [(0.00, 0.30), (0.35, 0.30), (0.35, 0.60), (0.00, 0.60)]),
]

# Generic fallback — splits the image into 4 quadrants.
# Use this if you don't have calibrated ROIs yet.
QUADRANT_ROIS: list[LaneROI] = [
    LaneROI("N", [(0.25, 0.00), (0.75, 0.00), (0.75, 0.45), (0.25, 0.45)]),
    LaneROI("S", [(0.25, 0.55), (0.75, 0.55), (0.75, 1.00), (0.25, 1.00)]),
    LaneROI("E", [(0.55, 0.25), (1.00, 0.25), (1.00, 0.75), (0.55, 0.75)]),
    LaneROI("W", [(0.00, 0.25), (0.45, 0.25), (0.45, 0.75), (0.00, 0.75)]),
]


# ── Detection dataclass ───────────────────────────────────────────────────

@dataclass
class Detection:
    class_name:  str
    confidence:  float
    cx:          float   # normalised centre x (0-1)
    cy:          float   # normalised centre y (0-1)
    width:       float   # normalised width (0-1)
    height:      float   # normalised height (0-1)


# ── VehicleCounter ────────────────────────────────────────────────────────

class VehicleCounter:
    """
    Calls the Roboflow API on a frame, assigns detections to lane ROIs,
    and returns structured vehicle counts compatible with BangaloreTrafficEnv.
    """

    def __init__(
        self,
        api_key:   str,
        lane_rois: list[LaneROI] = None,
    ):
        self.api_key   = api_key
        self.lane_rois = lane_rois or QUADRANT_ROIS
        self._url      = ROBOFLOW_URL.format(api_key=api_key)

    # ── Public API ────────────────────────────────────────────────────────

    def count_from_file(self, image_path: str | Path) -> dict[str, dict[str, int]]:
        """
        Run detection on a local image file.
        Returns counts per approach per vehicle type.
        """
        image_path = Path(image_path)
        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode("utf-8")
        return self._count(image_b64)

    def count_from_url(self, image_url: str) -> dict[str, dict[str, int]]:
        """Run detection on a remote image URL."""
        resp = requests.get(image_url, timeout=10)
        resp.raise_for_status()
        image_b64 = base64.b64encode(resp.content).decode("utf-8")
        return self._count(image_b64)

    def to_observation_vector(
        self,
        counts: dict[str, dict[str, int]],
    ) -> list[float]:
        """
        Convert counts dict → 12-dim DQN observation vector.

        Order matches BangaloreTrafficEnv:
        [cars_N, twheels_N, heavy_N, cars_S, ..., cars_W, twheels_W, heavy_W]
        """
        obs = []
        for approach in APPROACHES:
            c = counts.get(approach, {"car": 0, "twowheel": 0, "heavy": 0})
            obs.extend([
                float(c.get("car",      0)),
                float(c.get("twowheel", 0)),
                float(c.get("heavy",    0)),
            ])
        return obs

    def count_and_vectorise(self, image_path: str | Path) -> tuple[dict, list[float]]:
        """Convenience: returns (per_approach_counts, obs_vector) together."""
        counts = self.count_from_file(image_path)
        return counts, self.to_observation_vector(counts)

    def raw_class_counts(self, image_path: str | Path) -> dict[str, int]:
        """
        Return per-frame vehicle counts in raw 5-class format.

        This is the format your signal-control monitoring dashboard needs:
            {"car": 12, "motorcycle": 38, "auto_rickshaw": 7, "bus": 2, "truck": 4}

        Does NOT aggregate to twowheel/heavy — keeps all 5 classes separate.
        Useful for logging, Roboflow workflow output, and retraining feedback.
        """
        image_path = Path(image_path)
        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode("utf-8")

        detections = self._call_api(image_b64)

        # Start with zero counts for all 5 classes
        counts: dict[str, int] = {cls: 0 for cls in ROBOFLOW_CLASSES}
        for det in detections:
            if det.class_name in counts:
                counts[det.class_name] += 1

        return counts

    def full_report(self, image_path: str | Path) -> dict:
        """
        Complete per-frame report combining both output formats.

        Returns:
            {
                "raw_counts":      {"car": 12, "motorcycle": 38, ...},
                "approach_counts": {"N": {"car": 3, "twowheel": 8, ...}, ...},
                "obs_vector":      [3.0, 8.0, 1.0, ...],  # 12 floats for DQN
                "total_vehicles":  63,
            }
        """
        image_path = Path(image_path)
        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode("utf-8")

        detections       = self._call_api(image_b64)
        approach_counts  = self._assign_to_lanes(detections)
        obs_vector       = self.to_observation_vector(approach_counts)

        # Raw 5-class counts (no aggregation)
        raw_counts: dict[str, int] = {cls: 0 for cls in ROBOFLOW_CLASSES}
        for det in detections:
            if det.class_name in raw_counts:
                raw_counts[det.class_name] += 1

        return {
            "raw_counts":      raw_counts,
            "approach_counts": approach_counts,
            "obs_vector":      obs_vector,
            "total_vehicles":  sum(raw_counts.values()),
        }

    # ── Internal ──────────────────────────────────────────────────────────

    def _call_api(self, image_b64: str) -> list[Detection]:
        """POST base64 image to Roboflow, parse response."""
        resp = requests.post(
            self._url,
            data    = image_b64,
            headers = {"Content-Type": "application/x-www-form-urlencoded"},
            timeout = 15,
        )
        resp.raise_for_status()
        data = resp.json()

        detections = []
        for pred in data.get("predictions", []):
            detections.append(Detection(
                class_name = pred["class"].lower().replace(" ", "_"),
                confidence = pred["confidence"],
                cx         = pred["x"] / data["image"]["width"],
                cy         = pred["y"] / data["image"]["height"],
                width      = pred["width"]  / data["image"]["width"],
                height     = pred["height"] / data["image"]["height"],
            ))
        return detections

    def _assign_to_lanes(
        self,
        detections: list[Detection],
    ) -> dict[str, dict[str, int]]:
        """Assign each detection to an approach ROI and count by type."""
        counts: dict[str, dict[str, int]] = {
            approach: {"car": 0, "twowheel": 0, "heavy": 0}
            for approach in APPROACHES
        }

        for det in detections:
            if det.class_name not in CLASS_MAP:
                continue   # unknown class — skip

            bcfrap_type, _ = CLASS_MAP[det.class_name]

            for roi in self.lane_rois:
                if roi.contains(det.cx, det.cy):
                    counts[roi.approach][bcfrap_type] += 1
                    break   # each vehicle belongs to one approach only

        return counts

    def _count(self, image_b64: str) -> dict[str, dict[str, int]]:
        detections = self._call_api(image_b64)
        return self._assign_to_lanes(detections)


# ── JSON output helper ────────────────────────────────────────────────────

def counts_to_json(counts: dict[str, dict[str, int]]) -> str:
    """Pretty-print counts as JSON. Useful for logging and debugging."""
    return json.dumps(counts, indent=2)


# ── Quick test ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    api_key    = os.getenv("ROBOFLOW_API_KEY", "")
    image_path = sys.argv[1] if len(sys.argv) > 1 else None

    if not api_key:
        print("Set ROBOFLOW_API_KEY env variable first.")
        print("  export ROBOFLOW_API_KEY=your_key_here")
        sys.exit(1)

    if not image_path:
        print("Usage: python -m decision_engine.rl.perception <image_path>")
        sys.exit(1)

    counter = VehicleCounter(api_key=api_key, lane_rois=QUADRANT_ROIS)
    report  = counter.full_report(image_path)

    print("\n── Raw class counts (5-class, per frame) ──")
    print(counts_to_json(report["raw_counts"]))

    print(f"\n── Total vehicles detected: {report['total_vehicles']} ──")

    print("\n── Per-approach counts (BC-FRAP format) ──")
    print(counts_to_json(report["approach_counts"]))

    print("\n── DQN observation vector (12-dim) ──")
    labels = [f"{t}_{d}" for d in ["N","S","E","W"] for t in ["cars","2W","heavy"]]
    for label, val in zip(labels, report["obs_vector"]):
        print(f"  {label:12s}: {int(val)}")
