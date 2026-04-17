/**
 * VisionVerse — Client-Side Gesture Recognition Engine
 * Uses MediaPipe Hands (JS) to detect finger counts and thumb-up gestures
 * from the user's webcam directly in the browser.
 *
 * This replaces the server-side gesture_engine.py for cloud deployments
 * (e.g. Render) where no physical camera hardware is available.
 *
 * Gesture mapping (mirrors the Python engine):
 *   1 finger  → Option A
 *   2 fingers → Option B
 *   3 fingers → Option C
 *   4 fingers → Option D
 *   5 fingers → Previous Question
 *   Fist      → Next / Submit
 */

(function (root) {
    'use strict';

    // Landmark indices (same as Python engine)
    var FINGER_TIPS = [8, 12, 16, 20];   // Index, Middle, Ring, Pinky tip
    var FINGER_PIPS = [6, 10, 14, 18];   // Corresponding PIP joints

    // Smoothing
    var SMOOTHING_FRAMES   = 15;          // Consecutive frames for finger-count lock
    var FIST_SMOOTH_FRAMES = 12;          // Consecutive frames for fist lock

    // Cooldowns (seconds)
    var ANSWER_COOLDOWN = 1.5;
    var NEXT_COOLDOWN   = 2.0;

    /**
     * @param {Object} callbacks
     *   onGestureInput(option)  – option 1-4 confirmed
     *   onGestureNext()         – fist confirmed
     *   onGesturePrev()         – 5-finger confirmed
     *   onFingerDisplay(text)   – live finger-count display
     *   onError(message)        – when init fails
     */
    function ClientGestureEngine(callbacks) {
        this.callbacks = callbacks || {};
        this._gestureBuffer = [];
        this._fistBuffer    = [];
        this._lastAnswerTime = 0;
        this._lastNextTime   = 0;
        this.hands         = null;
        this.camera        = null;
        this.videoElement  = null;
        this.canvasElement = null;
        this.canvasCtx     = null;
        this.active        = false;
        this._initFailed   = false;
    }

    // ── Init ─────────────────────────────────────────────────────────────

    ClientGestureEngine.prototype.init = async function (videoElement, canvasElement) {
        this.videoElement  = videoElement;
        this.canvasElement = canvasElement;
        this.canvasCtx     = canvasElement.getContext('2d');

        if (typeof Hands === 'undefined') {
            console.error('ClientGestureEngine: MediaPipe Hands not loaded');
            this._initFailed = true;
            if (this.callbacks.onError) this.callbacks.onError('MediaPipe Hands library failed to load');
            return false;
        }

        try {
            var self = this;

            this.hands = new Hands({
                locateFile: function (file) {
                    return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + file;
                }
            });

            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.7
            });

            this.hands.onResults(function (results) {
                self._onResults(results);
            });

            this.camera = new Camera(this.videoElement, {
                onFrame: async function () {
                    if (self.active && self.hands) {
                        await self.hands.send({ image: self.videoElement });
                    }
                },
                width: 640,
                height: 480
            });

            return true;
        } catch (e) {
            console.error('ClientGestureEngine: init failed:', e);
            this._initFailed = true;
            if (this.callbacks.onError) this.callbacks.onError(e.message);
            return false;
        }
    };

    // ── Public controls ──────────────────────────────────────────────────

    ClientGestureEngine.prototype.start = function () {
        if (this._initFailed) return;
        this.active = true;
        this._gestureBuffer = [];
        this._fistBuffer    = [];
        if (this.camera) this.camera.start();
    };

    ClientGestureEngine.prototype.stop = function () {
        this.active = false;
        this._gestureBuffer = [];
        this._fistBuffer    = [];
        if (this.camera) this.camera.stop();
    };

    // ── Gesture helpers (ported from Python gesture_engine.py) ───────────

    ClientGestureEngine.prototype._countFingers = function (landmarks) {
        var count = 0;
        for (var i = 0; i < FINGER_TIPS.length; i++) {
            if (landmarks[FINGER_TIPS[i]].y < landmarks[FINGER_PIPS[i]].y) {
                count++;
            }
        }
        // 4 fingers + thumb extended = 5
        if (count === 4) {
            var dx1 = landmarks[4].x - landmarks[17].x;
            var dy1 = landmarks[4].y - landmarks[17].y;
            var d_tip = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            var dx2 = landmarks[2].x - landmarks[17].x;
            var dy2 = landmarks[2].y - landmarks[17].y;
            var d_base = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            if (d_tip > d_base) count = 5;
        }
        return count;
    };

    ClientGestureEngine.prototype._isFist = function (landmarks) {
        var thumbRaised = landmarks[4].y < landmarks[2].y - 0.04;
        var fingersFolded = true;
        for (var i = 0; i < FINGER_TIPS.length; i++) {
            if (landmarks[FINGER_TIPS[i]].y < landmarks[FINGER_PIPS[i]].y) {
                fingersFolded = false;
                break;
            }
        }
        return !thumbRaised && fingersFolded;
    };

    ClientGestureEngine.prototype._smoothGesture = function (count) {
        this._gestureBuffer.push(count);
        if (this._gestureBuffer.length > SMOOTHING_FRAMES) this._gestureBuffer.shift();
        if (this._gestureBuffer.length === SMOOTHING_FRAMES) {
            for (var i = 0; i < this._gestureBuffer.length; i++) {
                if (this._gestureBuffer[i] !== count) return null;
            }
            return count;
        }
        return null;
    };

    ClientGestureEngine.prototype._smoothFist = function (isFist) {
        this._fistBuffer.push(isFist);
        if (this._fistBuffer.length > FIST_SMOOTH_FRAMES) this._fistBuffer.shift();
        if (this._fistBuffer.length === FIST_SMOOTH_FRAMES) {
            for (var i = 0; i < this._fistBuffer.length; i++) {
                if (!this._fistBuffer[i]) return false;
            }
            return true;
        }
        return false;
    };

    // ── Frame-by-frame processing ────────────────────────────────────────

    ClientGestureEngine.prototype._onResults = function (results) {
        var canvas = this.canvasElement;
        var ctx    = this.canvasCtx;
        var w = this.videoElement.videoWidth  || 640;
        var h = this.videoElement.videoHeight || 480;
        canvas.width  = w;
        canvas.height = h;

        ctx.save();
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(results.image, 0, 0, w, h);

        var currentTime = Date.now() / 1000;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            var landmarks   = results.multiHandLandmarks[0];
            var fingerCount = this._countFingers(landmarks);
            var isFist      = this._isFist(landmarks);

            // Draw hand landmarks on canvas
            if (typeof drawConnectors !== 'undefined') {
                drawConnectors(ctx, landmarks, HAND_CONNECTIONS,
                               { color: '#00E68A', lineWidth: 2 });
            }
            if (typeof drawLandmarks !== 'undefined') {
                drawLandmarks(ctx, landmarks,
                              { color: '#00E68A', lineWidth: 1, radius: 3 });
            }

            // ── Fist → next / submit ─────────────────────────────────
            if (isFist) {
                this._gestureBuffer = [];
                var fistConfirmed = this._smoothFist(true);
                if (this.callbacks.onFingerDisplay) this.callbacks.onFingerDisplay('✊');

                if (fistConfirmed && currentTime - this._lastNextTime > NEXT_COOLDOWN) {
                    this._lastNextTime = currentTime;
                    this._fistBuffer   = [];
                    if (this.callbacks.onGestureNext) this.callbacks.onGestureNext();
                }

            // ── Finger count → select answer or previous ────────────────
            } else {
                this._fistBuffer = [];
                if (this.callbacks.onFingerDisplay) this.callbacks.onFingerDisplay(String(fingerCount));

                var confirmed = this._smoothGesture(fingerCount);
                if (confirmed === 5) {
                    if (currentTime - this._lastAnswerTime > ANSWER_COOLDOWN) {
                        this._lastAnswerTime = currentTime;
                        this._gestureBuffer  = [];
                        if (this.callbacks.onGesturePrev) this.callbacks.onGesturePrev();
                    }
                } else if (confirmed && confirmed >= 1 && confirmed <= 4) {
                    if (currentTime - this._lastAnswerTime > ANSWER_COOLDOWN) {
                        this._lastAnswerTime = currentTime;
                        this._gestureBuffer  = [];
                        if (this.callbacks.onGestureInput) this.callbacks.onGestureInput(confirmed);
                    }
                }
            }
        } else {
            // No hand detected
            this._gestureBuffer = [];
            this._fistBuffer    = [];
            if (this.callbacks.onFingerDisplay) this.callbacks.onFingerDisplay('—');
        }

        ctx.restore();

        // Mirror processed frame to sidebar canvas (if present)
        var sbCanvas = document.getElementById('sb-camera-canvas');
        if (sbCanvas) {
            var sbCtx = sbCanvas.getContext('2d');
            sbCanvas.width  = w;
            sbCanvas.height = h;
            sbCtx.drawImage(canvas, 0, 0);
        }
    };

    // Export
    root.ClientGestureEngine = ClientGestureEngine;

})(window);
