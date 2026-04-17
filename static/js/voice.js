/**
 * VisionVerse — Voice Recognition Controller
 * Provides reusable voice recognition utilities.
 * Core voice logic is embedded in exam.html for centralized exam flow.
 */
(function () {
    /**
     * Check if Speech Recognition is available.
     */
    window.isSpeechAvailable = function () {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    };

    /**
     * Speak text using Web Speech API TTS.
     * @param {string} text - Text to speak
     * @param {Function} [onEnd] - Callback when speech ends
     */
    window.speakText = function (text, onEnd) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        if (onEnd) utterance.onend = onEnd;
        window.speechSynthesis.speak(utterance);
    };

    /**
     * Parse a voice transcript to extract a command.
     * @param {string} transcript - Lowercase transcript text
     * @returns {{ command: string, option?: string } | null}
     */
    window.parseVoiceCommand = function (transcript) {
        const t = transcript.toLowerCase().trim();

        // Option selection
        if (t.includes('option a') || t === 'a') return { command: 'select', option: 'A' };
        if (t.includes('option b') || t === 'b') return { command: 'select', option: 'B' };
        if (t.includes('option c') || t === 'c') return { command: 'select', option: 'C' };
        if (t.includes('option d') || t === 'd') return { command: 'select', option: 'D' };

        // Navigation
        if (t.includes('next')) return { command: 'next' };
        if (t.includes('previous') || t.includes('back')) return { command: 'previous' };
        if (t.includes('repeat')) return { command: 'repeat' };
        if (t.includes('submit')) return { command: 'submit' };

        return null;
    };
})();
