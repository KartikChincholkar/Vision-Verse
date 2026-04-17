"""
VisionVerse — Gesture Recognition Engine
Uses MediaPipe HandLandmarker (Tasks API, mediapipe >= 0.10) to detect
finger counts and thumb-up gestures from the webcam via MJPEG stream.

Gesture → SocketIO mapping
  1 finger  → gesture_input  {option: 1}  → Option A
  2 fingers → gesture_input  {option: 2}  → Option B
  3 fingers → gesture_input  {option: 3}  → Option C
  4 fingers → gesture_input  {option: 4}  → Option D
  Thumb up  → gesture_next   {}           → Next question / Submit
"""

import os
import logging
import threading
import time

logger = logging.getLogger(__name__)

# ── Optional heavy imports ────────────────────────────────────────────────────
try:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision
    AVAILABLE = True
except ImportError as _e:
    logger.warning("GestureEngine: cv2 / mediapipe not available: %s", _e)
    AVAILABLE = False

try:
    from eventlet import sleep as eventlet_sleep
except ImportError:
    from time import sleep as eventlet_sleep


# ── Engine ────────────────────────────────────────────────────────────────────

class GestureEngine:
    # Landmark indices
    FINGER_TIPS = [8, 12, 16, 20]   # Index, Middle, Ring, Pinky tip
    FINGER_PIPS = [6, 10, 14, 18]   # Corresponding PIP joints

    # Smoothing
    SMOOTHING_FRAMES   = 15          # Consecutive frames for finger-count lock
    THUMB_SMOOTH_FRAMES = 12         # Consecutive frames for thumb-up lock

    # Cooldowns (seconds)
    ANSWER_COOLDOWN = 1.5            # Between finger-count emissions
    NEXT_COOLDOWN   = 2.0            # Between thumb-up emissions

    # Model path (same directory as this file)
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")

    # ── Init ──────────────────────────────────────────────────────────────────

    def __init__(self, socketio):
        self.socketio = socketio
        self._lock           = threading.Lock()
        self._landmarks_lock = threading.Lock()
        self.active          = False

        self._gesture_buffer = []   # finger-count smoothing
        self._thumb_buffer   = []   # thumb-up smoothing
        self._latest_landmarks = None

        self._last_answer_time = 0.0
        self._last_next_time   = 0.0

        self._landmarker = None

        if not AVAILABLE:
            logger.warning("GestureEngine: skipping init — cv2/mediapipe missing")
            return

        if not os.path.exists(self.MODEL_PATH):
            logger.warning("GestureEngine: hand_landmarker.task not found at %s", self.MODEL_PATH)
            return

        try:
            def _on_result(result, output_image, timestamp_ms):
                if result.hand_landmarks:
                    with self._landmarks_lock:
                        self._latest_landmarks = result.hand_landmarks[0]
                else:
                    with self._landmarks_lock:
                        self._latest_landmarks = None

            base_opts = mp_python.BaseOptions(model_asset_path=self.MODEL_PATH)
            opts = mp_vision.HandLandmarkerOptions(
                base_options=base_opts,
                running_mode=mp_vision.RunningMode.LIVE_STREAM,
                num_hands=1,
                min_hand_detection_confidence=0.7,
                min_hand_presence_confidence=0.7,
                min_tracking_confidence=0.7,
                result_callback=_on_result,
            )
            self._landmarker = mp_vision.HandLandmarker.create_from_options(opts)
            logger.info("GestureEngine: HandLandmarker ready")
        except Exception as exc:
            logger.error("GestureEngine: failed to create HandLandmarker: %s", exc)
            self._landmarker = None

    # ── Public controls ───────────────────────────────────────────────────────

    def start(self):
        with self._lock:
            self.active = True
            self._gesture_buffer = []
            self._thumb_buffer   = []

    def stop(self):
        with self._lock:
            self.active = False
            self._gesture_buffer = []
            self._thumb_buffer   = []

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _count_fingers(self, landmarks):
        """Count raised fingers. Returns 1-4, or 5 if thumb is also extended."""
        count = 0
        for tip, pip in zip(self.FINGER_TIPS, self.FINGER_PIPS):
            if landmarks[tip].y < landmarks[pip].y:
                count += 1
        
        if count == 4:
            import math
            d_tip = math.hypot(landmarks[4].x - landmarks[17].x, landmarks[4].y - landmarks[17].y)
            d_base = math.hypot(landmarks[2].x - landmarks[17].x, landmarks[2].y - landmarks[17].y)
            if d_tip > d_base:
                count = 5
                
        return count

    def _is_thumb_up(self, landmarks):
        """
        Thumb-up: thumb tip (4) is clearly above thumb MCP (2)
        AND all four fingers are folded (tips below their PIP joints).
        """
        thumb_raised   = landmarks[4].y < landmarks[2].y - 0.04
        fingers_folded = all(
            landmarks[tip].y >= landmarks[pip].y
            for tip, pip in zip(self.FINGER_TIPS, self.FINGER_PIPS)
        )
        return thumb_raised and fingers_folded

    def _smooth_gesture(self, count):
        """Return count if same value held for SMOOTHING_FRAMES, else None."""
        self._gesture_buffer.append(count)
        if len(self._gesture_buffer) > self.SMOOTHING_FRAMES:
            self._gesture_buffer.pop(0)
        if (len(self._gesture_buffer) == self.SMOOTHING_FRAMES
                and all(c == count for c in self._gesture_buffer)):
            return count
        return None

    def _smooth_thumb(self, is_up):
        """Return True if thumb-up held for THUMB_SMOOTH_FRAMES, else False."""
        self._thumb_buffer.append(is_up)
        if len(self._thumb_buffer) > self.THUMB_SMOOTH_FRAMES:
            self._thumb_buffer.pop(0)
        return (len(self._thumb_buffer) == self.THUMB_SMOOTH_FRAMES
                and all(self._thumb_buffer))

    @staticmethod
    def _open_camera():
        """Try camera indices 0-3; return the first that opens."""
        for idx in range(4):
            cap = cv2.VideoCapture(idx)
            if cap.isOpened():
                logger.info("GestureEngine: opened camera index %d", idx)
                return cap
            cap.release()
        return None

    # ── MJPEG generator ───────────────────────────────────────────────────────

    def generate_frames(self):
        """
        Generator that yields MJPEG frames.
        Falls back gracefully when camera or model is unavailable.
        """
        if not AVAILABLE or self._landmarker is None:
            logger.warning("GestureEngine: generate_frames called but engine not ready")
            return

        with self._lock:
            self.active = True          # auto-start on first frame request

        cap = None
        consecutive_failures = 0
        MAX_FAILURES = 30
        frame_count  = 0

        try:
            cap = self._open_camera()
            if cap is None:
                logger.error(
                    "Cannot open any camera. "
                    "On macOS: System Preferences → Privacy & Security → Camera."
                )
                return

            logger.info("GestureEngine: streaming frames…")
            start_ts = int(time.time() * 1000)

            while True:
                with self._lock:
                    if not self.active:
                        break

                ok, frame = cap.read()
                if not ok or frame is None:
                    consecutive_failures += 1
                    if consecutive_failures >= MAX_FAILURES:
                        logger.error("Too many consecutive frame failures — stopping")
                        break
                    eventlet_sleep(0.033)
                    continue

                consecutive_failures = 0
                frame_count += 1
                frame = cv2.flip(frame, 1)

                # Feed to async landmarker
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image  = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                timestamp_ms = start_ts + frame_count * 33
                self._landmarker.detect_async(mp_image, timestamp_ms)

                current_time = time.time()

                # Read latest landmarks set by the async callback
                with self._landmarks_lock:
                    landmarks = self._latest_landmarks

                h_px, w_px = frame.shape[:2]

                if landmarks:
                    finger_count = self._count_fingers(landmarks)
                    thumb_up     = self._is_thumb_up(landmarks)

                    # Draw landmark dots
                    for lm in landmarks:
                        cx, cy = int(lm.x * w_px), int(lm.y * h_px)
                        cv2.circle(frame, (cx, cy), 5, (0, 230, 138), -1)

                    # ── Thumb-up → next / submit ──────────────────────────
                    if thumb_up:
                        self._gesture_buffer = []
                        thumb_confirmed = self._smooth_thumb(True)
                        cv2.putText(frame, "👍 NEXT", (10, 40),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 200, 0), 3)
                        if thumb_confirmed:
                            if current_time - self._last_next_time > self.NEXT_COOLDOWN:
                                self._last_next_time = current_time
                                logger.info("Gesture: thumb up → next/submit")
                                self.socketio.emit("gesture_next", {}, namespace="/")
                                self._thumb_buffer = []

                    # ── Finger count → select answer or previous ───────────
                    else:
                        self._thumb_buffer = []
                        opt_map = {1: "A", 2: "B", 3: "C", 4: "D"}
                        if finger_count == 5:
                            label = "5 fingers -> Previous"
                        else:
                            label = (
                                f"{finger_count} finger(s)"
                                + (f" → Option {opt_map[finger_count]}" if finger_count in opt_map else "")
                            )
                        cv2.putText(frame, label, (10, 40),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 230, 138), 2)

                        confirmed = self._smooth_gesture(finger_count)
                        if confirmed == 5:
                            if current_time - self._last_answer_time > self.ANSWER_COOLDOWN:
                                self._last_answer_time = current_time
                                logger.info("Gesture: 5 fingers → Previous")
                                self.socketio.emit("gesture_prev", {}, namespace="/")
                                self._gesture_buffer = []
                        elif confirmed and 1 <= confirmed <= 4:
                            if current_time - self._last_answer_time > self.ANSWER_COOLDOWN:
                                self._last_answer_time = current_time
                                logger.info("Gesture: %d finger(s) → Option %s",
                                            confirmed, opt_map[confirmed])
                                self.socketio.emit(
                                    "gesture_input", {"option": confirmed}, namespace="/"
                                )
                                self._gesture_buffer = []

                else:
                    self._gesture_buffer = []
                    self._thumb_buffer   = []
                    cv2.putText(
                        frame,
                        "No hand detected | Show 1-4 fingers or 👍",
                        (10, 36),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (60, 60, 220), 2,
                    )

                ret, buffer = cv2.imencode(".jpg", frame,
                                          [cv2.IMWRITE_JPEG_QUALITY, 80])
                if not ret:
                    continue

                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                    + buffer.tobytes()
                    + b"\r\n"
                )

                # Yield control to eventlet so Socket.IO pings/emits flow
                eventlet_sleep(0.005)

        finally:
            if cap is not None:
                cap.release()
            logger.info("GestureEngine: camera released")
