"""
video_detector.py — Roboflow vehicle detector for video files and RTSP streams.

Requires Python 3.12 venv:
    source ~/.venvs/roboflow/bin/activate

Usage:
    # Video file
    python video_detector.py --source /path/to/video.mp4

    # RTSP stream
    python video_detector.py --source rtsp://camera_ip:554/stream

    # With API key
    python video_detector.py --source video.mp4 --api-key YOUR_KEY
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import cv2
from inference_sdk import InferenceHTTPClient

# ── Config ────────────────────────────────────────────────────────────────

WORKSPACE  = "rishikas-workspace-rrf4s"
MODEL_ID   = "traffic-9g570/1"
API_URL    = "https://serverless.roboflow.com"

CLASSES    = ("car", "motorcycle", "auto_rickshaw", "bus", "truck")
CONFIDENCE = 0.40   # minimum confidence threshold

# Colours for each class (BGR)
COLOURS = {
    "car":           (0,   255, 0),    # green
    "motorcycle":    (0,   200, 255),  # yellow
    "auto_rickshaw": (0,   128, 255),  # orange
    "bus":           (255, 0,   0),    # blue
    "truck":         (128, 0,   255),  # purple
}


# ── Detector ──────────────────────────────────────────────────────────────

class BangaloreVehicleDetector:
    """
    Detects 5 vehicle classes in each frame using the Roboflow Rapid model.
    Works with video files and RTSP streams.
    """

    def __init__(self, api_key: str):
        self.client = InferenceHTTPClient(
            api_url = API_URL,
            api_key = api_key,
        )

    def detect(self, frame) -> tuple[dict[str, int], list[dict]]:
        """
        Run detection on a single OpenCV frame.

        Returns:
            counts:     {"car": 3, "motorcycle": 12, "auto_rickshaw": 2, ...}
            detections: raw list of prediction dicts from Roboflow
        """
        # Encode frame as JPEG for API
        _, buf  = cv2.imencode(".jpg", frame)
        import base64
        img_b64 = base64.b64encode(buf).decode("utf-8")

        result      = self.client.infer(img_b64, model_id=MODEL_ID)
        predictions = result.get("predictions", [])

        counts: dict[str, int] = {cls: 0 for cls in CLASSES}
        for pred in predictions:
            cls  = pred.get("class", "").lower()
            conf = pred.get("confidence", 0)
            if cls in counts and conf >= CONFIDENCE:
                counts[cls] += 1

        return counts, predictions

    def annotate(self, frame, predictions: list[dict]) -> object:
        """Draw bounding boxes and labels on frame."""
        for pred in predictions:
            cls  = pred.get("class", "").lower()
            conf = pred.get("confidence", 0)
            if conf < CONFIDENCE:
                continue

            x = int(pred["x"] - pred["width"]  / 2)
            y = int(pred["y"] - pred["height"] / 2)
            w = int(pred["width"])
            h = int(pred["height"])

            colour = COLOURS.get(cls, (255, 255, 255))
            cv2.rectangle(frame, (x, y), (x + w, y + h), colour, 2)
            label = f"{cls} {conf:.0%}"
            cv2.putText(frame, label, (x, y - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 1)
        return frame


# ── Main loop ─────────────────────────────────────────────────────────────

def run(source: str, api_key: str, show: bool = True, save: str | None = None):
    """
    Process a video file or RTSP stream frame by frame.

    Args:
        source:  path to video file OR rtsp:// URL
        api_key: Roboflow API key
        show:    display annotated frames in a window
        save:    path to save output video (optional)
    """
    detector = BangaloreVehicleDetector(api_key)
    cap      = cv2.VideoCapture(source)

    if not cap.isOpened():
        print(f"Error: cannot open source: {source}")
        sys.exit(1)

    fps    = cap.get(cv2.CAP_PROP_FPS) or 25
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    writer = None
    if save:
        writer = cv2.VideoWriter(
            save,
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps, (width, height),
        )

    frame_id    = 0
    total_counts: dict[str, int] = {cls: 0 for cls in CLASSES}
    t_start     = time.time()

    print(f"Source: {source}")
    print(f"Press Q to quit\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_id += 1

        # Run detection
        counts, predictions = detector.detect(frame)

        # Accumulate totals
        for cls, n in counts.items():
            total_counts[cls] += n

        # Annotate frame
        annotated = detector.annotate(frame.copy(), predictions)

        # Overlay count text
        y_offset = 30
        for cls in CLASSES:
            text   = f"{cls}: {counts[cls]}"
            colour = COLOURS.get(cls, (255, 255, 255))
            cv2.putText(annotated, text, (10, y_offset),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, colour, 2)
            y_offset += 25

        # Frame counter
        cv2.putText(annotated, f"Frame {frame_id}", (10, height - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        # Print counts to console
        print(f"Frame {frame_id:04d}: {json.dumps(counts)}")

        if writer:
            writer.write(annotated)

        if show:
            cv2.imshow("Bangalore Traffic Detector", annotated)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    # Summary
    elapsed = time.time() - t_start
    print(f"\n── Summary ──────────────────────────")
    print(f"Frames processed: {frame_id}")
    print(f"Time elapsed:     {elapsed:.1f}s")
    print(f"Avg fps:          {frame_id / elapsed:.1f}")
    print(f"Total detections: {json.dumps(total_counts, indent=2)}")

    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()


# ── CLI ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bangalore vehicle detector")
    parser.add_argument("--source",  required=True,
                        help="Video file path or rtsp:// URL")
    parser.add_argument("--api-key", default=os.getenv("ROBOFLOW_API_KEY"),
                        help="Roboflow API key (or set ROBOFLOW_API_KEY env var)")
    parser.add_argument("--save",    default=None,
                        help="Save annotated output to this path")
    parser.add_argument("--no-show", action="store_true",
                        help="Don't display window (useful for headless servers)")
    args = parser.parse_args()

    if not args.api_key:
        print("Error: provide --api-key or set ROBOFLOW_API_KEY")
        sys.exit(1)

    run(
        source  = args.source,
        api_key = args.api_key,
        show    = not args.no_show,
        save    = args.save,
    )
