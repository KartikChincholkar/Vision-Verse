/**
 * VisionVerse — Sidebar Controller
 * Populates student info from /api/student and manages the live timer.
 */
(function () {
    // ─── Populate Sidebar ────────────────────────────────────
    async function loadSidebarData() {
        try {
            const res = await fetch('/api/student');
            if (!res.ok) return;
            const data = await res.json();

            const avatar = document.getElementById('sb-avatar');
            const name = document.getElementById('sb-name');
            const email = document.getElementById('sb-email');
            const sid = document.getElementById('sb-id');
            const disability = document.getElementById('sb-disability');
            const mode = document.getElementById('sb-mode');
            const status = document.getElementById('sb-status');

            if (avatar && data.name) {
                const initials = data.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                avatar.textContent = initials;
            }
            if (name) name.textContent = data.name || 'Student';
            if (email) email.textContent = data.email || '—';
            if (sid) sid.textContent = data.student_id || '—';

            if (disability) {
                const badgeMap = {
                    'Motor Impairment': 'badge-purple',
                    'Speech Impairment': 'badge-cyan',
                    'Visual Impairment': 'badge-yellow',
                    'None': 'badge-green'
                };
                const cls = badgeMap[data.disability_type] || 'badge-cyan';
                disability.innerHTML = `<span class="badge ${cls}">${data.disability_type || '—'}</span>`;
            }

            if (mode) {
                if (data.exam_mode === 'gesture') mode.innerHTML = '<span class="badge badge-cyan">📷 Gesture</span>';
                else if (data.exam_mode === 'voice') mode.innerHTML = '<span class="badge badge-purple">🎙️ Voice</span>';
                else mode.textContent = '—';
            }

            if (status) {
                const statusMap = {
                    'Not Started': 'badge-yellow',
                    'In Progress': 'badge-cyan',
                    'Completed': 'badge-green'
                };
                const cls = statusMap[data.exam_status] || 'badge-yellow';
                status.innerHTML = `<span class="badge ${cls}">${data.exam_status || 'Not Started'}</span>`;
            }
        } catch (e) {
            // Silently fail on auth pages
        }
    }

    // ─── Timer ───────────────────────────────────────────────
    let timerInterval = null;
    let timerSeconds = 0;

    window.startSidebarTimer = function () {
        const timerEl = document.getElementById('sb-timer');
        if (!timerEl) return;
        timerEl.classList.remove('hidden');
        timerSeconds = 0;

        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timerSeconds++;
            const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
            const s = String(timerSeconds % 60).padStart(2, '0');
            timerEl.textContent = `${m}:${s}`;
        }, 1000);
    };

    window.stopSidebarTimer = function () {
        if (timerInterval) clearInterval(timerInterval);
        return timerSeconds;
    };

    // Init
    loadSidebarData();
})();
