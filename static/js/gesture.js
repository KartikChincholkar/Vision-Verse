/**
 * VisionVerse — Gesture Display Controller
 * Listens for gesture_input SocketIO events and updates the UI.
 * Used alongside the exam page's main script.
 */
(function () {
    // This file is kept as a separate module for maintainability.
    // The core gesture SocketIO listener is embedded in exam.html
    // to keep the exam flow logic centralized..
    // Additional gesture UI helpers can be added here..

    /**
     * Animate the finger count display with a pop effect.
     */
    window.animateFingerCount = function (count) {
        const el = document.getElementById('finger-display');
        if (!el) return;
        el.textContent = count;
        el.style.transform = 'scale(1.3)';
        setTimeout(() => { el.style.transform = 'scale(1)'; }, 200);
    };
})();
