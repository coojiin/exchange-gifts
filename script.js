/**
 * Gift Exchange Web App Logic
 */

class GiftExchangeApp {
    constructor() {
        // State
        this.participants = []; // ['A', 'B', 'C']
        this.gifts = [];        // [{ owner: 'A', taken: false }]
        this.history = [];      // [{ spinner: 'A', receiver: 'B' }]

        this.currentSpinner = null;

        // DOM Elements
        this.screens = {
            setup: document.getElementById('setup-screen'),
            dashboard: document.getElementById('dashboard-screen'),
            wheel: document.getElementById('wheel-screen')
        };

        this.inputs = {
            name: document.getElementById('name-input'),
            addBtn: document.getElementById('add-btn'),
            startBtn: document.getElementById('start-game-btn'),
            list: document.getElementById('participants-list')
        };

        this.dashboard = {
            count: document.getElementById('remaining-count'),
            grid: document.getElementById('spinner-selection-grid'),
            historyList: document.getElementById('history-list')
        };

        this.wheel = {
            canvas: document.getElementById('wheel-canvas'),
            ctx: document.getElementById('wheel-canvas').getContext('2d'),
            container: document.getElementById('wheel-screen'),
            spinBtn: document.getElementById('spin-btn'),
            title: document.getElementById('current-spinner-name')
        };

        this.modal = {
            el: document.getElementById('result-modal'),
            spinner: document.getElementById('result-spinner'),
            gift: document.getElementById('result-gift'),
            confirmBtn: document.getElementById('confirm-result-btn')
        };

        this.fireworksCanvas = document.getElementById('fireworks-canvas');
        this.fireworksCtx = this.fireworksCanvas.getContext('2d');

        this.isSpinning = false; // Initialize explicitly
        this.init();
    }

    init() {
        // Event Listeners
        this.inputs.addBtn.addEventListener('click', () => this.addParticipant());
        this.inputs.name.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addParticipant();
        });

        this.inputs.startBtn.addEventListener('click', () => this.startGame());

        this.wheel.spinBtn.addEventListener('click', () => this.spinWheel());

        this.modal.confirmBtn.addEventListener('click', () => this.confirmResult());

        // Initial Canvas Sizing
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Load Fireworks
        this.initFireworks();
    }

    resizeCanvas() {
        // High DPI scaling for wheel
        const dpr = window.devicePixelRatio || 1;
        const rect = this.wheel.canvas.getBoundingClientRect();

        // We set the internal resolution to match display size * pixel ratio
        // But for simplicity in logic, we'll keep logical size 300x300 and scale via CSS/Transform
        // Actually, let's just make it crisp
        this.wheel.canvas.width = 300 * dpr;
        this.wheel.canvas.height = 300 * dpr;
        this.wheel.ctx.scale(dpr, dpr);

        this.fireworksCanvas.width = window.innerWidth;
        this.fireworksCanvas.height = window.innerHeight;
    }

    /* --- Setup Phase --- */

    addParticipant() {
        const name = this.inputs.name.value.trim();
        if (!name) return;

        if (this.participants.includes(name)) {
            alert('名字不能重複！');
            return;
        }

        this.participants.push(name);
        this.renderParticipantsList();
        this.inputs.name.value = '';
        this.inputs.name.focus();

        this.updateStartButton();
    }

    removeParticipant(name) {
        this.participants = this.participants.filter(p => p !== name);
        this.renderParticipantsList();
        this.updateStartButton();
    }

    renderParticipantsList() {
        this.inputs.list.innerHTML = '';
        this.participants.forEach(name => {
            const li = document.createElement('li');
            li.className = 'participant-item';
            li.innerHTML = `
                <span>${name}</span>
                <button class="remove-btn" onclick="app.removeParticipant('${name}')">×</button>
            `;
            this.inputs.list.appendChild(li);
        });
    }

    updateStartButton() {
        const count = this.participants.length;
        this.inputs.startBtn.textContent = `開始遊戲 (${count}人)`;
        this.inputs.startBtn.disabled = count < 2;
    }

    startGame() {
        if (this.participants.length < 2) return;

        // Initialize Gifts
        this.gifts = this.participants.map(p => ({
            owner: p,
            taken: false
        }));

        this.switchScreen('dashboard');
        this.renderDashboard();
    }

    /* --- Dashboard Phase --- */

    renderDashboard() {
        const remainingSpinners = this.participants.filter(p =>
            !this.history.some(h => h.spinner === p)
        );

        this.dashboard.count.textContent = remainingSpinners.length;

        this.dashboard.grid.innerHTML = '';
        remainingSpinners.forEach(p => {
            const card = document.createElement('div');
            card.className = 'spinner-card';
            card.innerHTML = `<h3>${p}</h3><p>點擊開始</p>`;
            card.onclick = () => this.selectSpinner(p);
            this.dashboard.grid.appendChild(card);
        });

        // update history
        this.dashboard.historyList.innerHTML = '';
        this.history.forEach(h => {
            const li = document.createElement('li');
            li.textContent = `${h.spinner} -> 抽到了 ${h.receiver} 的禮物`; // Conceal gift? No the requirement implies we see the result.
            this.dashboard.historyList.appendChild(li);
        });

        if (remainingSpinners.length === 0) {
            this.showGameOver();
        }
    }

    selectSpinner(name) {
        this.currentSpinner = name;
        this.switchScreen('wheel');
        this.wheel.title.textContent = name;
        this.wheel.spinBtn.disabled = false;

        this.prepareWheel();
    }

    /* --- Logic Core --- */

    getValidTargets(spinnerName) {
        // 1. Basic Candidates: Not taken, Not own gift
        const candidates = this.gifts.filter(g => !g.taken && g.owner !== spinnerName);

        // Anti-Deadlock Lookahead
        // If there are people left AFTER this spinner, we must ensure they have valid moves.
        // Specifically, the last person must not be left with ONLY their own gift.

        const remainingSpinners = this.participants.filter(p =>
            !this.history.some(h => h.spinner === p)
        );
        // remainingSpinners includes the current spinner.
        // If only 1 person left (current), no deadlock is possible (candidates check handles it).

        if (remainingSpinners.length <= 1) return candidates;

        // Find who acts last. (Simplification: We don't enforce order, BUT logically
        // if only 2 people are left, the one who isn't spinning now IS the last one.)
        // If > 2 people, deadlock is unlikely unless the graph is very constrained.
        // The most critical case is when 2 people remain (Current + Last).

        if (remainingSpinners.length === 2) {
            const lastPerson = remainingSpinners.find(p => p !== spinnerName);

            // Filter candidates: A candidate is VALID if taking it prevents the last person from being stuck.
            return candidates.filter(gift => {
                // SImulate taking this gift
                // Remaining gifts for LastPerson would be:
                // (Current Available - {gift})
                // Note: 'candidates' is a subset of 'all available'. We need checking 'all available'.

                const allAvailable = this.gifts.filter(g => !g.taken);
                const remainingForLast = allAvailable.filter(g => g.owner !== gift.owner);

                // Would LastPerson have any valid move?
                // Valid move for LastPerson = (remainingForLast) excluding (LastPerson's gift)
                const validForLast = remainingForLast.filter(g => g.owner !== lastPerson);

                if (validForLast.length === 0) {
                    // If I pick 'gift', LastPerson has 0 valid moves. Deadlock!
                    console.log(`[Anti-Deadlock] Preventing ${spinnerName} from picking ${gift.owner}'s gift.`);
                    return false;
                }
                return true;
            });
        }

        return candidates;
    }

    /* --- Wheel Phase --- */

    prepareWheel() {
        this.targetOptions = this.getValidTargets(this.currentSpinner);
        this.drawWheel(0);
    }

    drawWheel(angleOffset) {
        if (!this.wheel.ctx) {
            logToConsole("Err: Context missing!");
            return;
        }
        // ... Log once or verify dimensions
        if (this.wheel.canvas.width === 0) logToConsole("Warn: Canvas W=0");

        const ctx = this.wheel.ctx;
        const width = 300; // Logical width
        const height = 300;
        // Don't log every frame, too spammy.

        const cx = width / 2;
        const cy = height / 2;
        const radius = 140;

        ctx.clearRect(0, 0, width, height);

        const len = this.targetOptions.length;
        const sliceAngle = (2 * Math.PI) / len;

        const colors = ['#D42426', '#165B33', '#F8B229', '#FFFFFF'];

        this.targetOptions.forEach((gift, i) => {
            const startAngle = angleOffset + (i * sliceAngle);
            const endAngle = startAngle + sliceAngle;

            // Slice
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.fillStyle = colors[i % colors.length];
            ctx.fill();
            ctx.stroke();

            // Text
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(startAngle + sliceAngle / 2);
            ctx.textAlign = "right";
            ctx.fillStyle = (i % colors.length === 3) ? '#333' : '#FFF';
            ctx.font = "bold 16px 'Noto Sans TC'";
            ctx.fillText(gift.owner, radius - 10, 5);
            ctx.restore();
        });

        // Outer Ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#F8B229';
        ctx.stroke();
    }

    spinWheel() {
        try {
            if (this.isSpinning) return;
            logToConsole("Spin requested...");

            if (!this.targetOptions || this.targetOptions.length === 0) {
                logToConsole("Error: No targets!");
                alert("錯誤: 沒有可用的禮物選項！可能是名單邏輯問題，請重新開始嘗試。");
                return;
            }

            this.isSpinning = true;
            this.wheel.spinBtn.disabled = true;

            // Random outcome
            const randomIndex = Math.floor(Math.random() * this.targetOptions.length);
            const selectedGift = this.targetOptions[randomIndex];
            logToConsole(`Target: ${selectedGift.owner}`);

            // Animation
            const spinDuration = 4000; // 4s

            const sliceArc = (2 * Math.PI) / this.targetOptions.length;
            const targetMidAngle = (randomIndex + 0.5) * sliceArc;

            const extraRotations = 10 * (2 * Math.PI);
            const finalAngle = extraRotations - targetMidAngle;

            if (isNaN(finalAngle)) {
                throw new Error("角度計算錯誤 (NaN)");
            }

            let start = null;
            logToConsole("Starting anim loop...");

            const animate = (timestamp) => {
                try {
                    if (!start) start = timestamp;
                    const progress = timestamp - start;

                    if (progress < spinDuration) {
                        let t = progress / spinDuration;
                        const ease = (--t) * t * t + 1;

                        const currentRot = finalAngle * ease;
                        this.drawWheel(currentRot);
                        requestAnimationFrame(animate);
                    } else {
                        logToConsole("Anim done.");
                        this.drawWheel(finalAngle);
                        this.isSpinning = false;
                        setTimeout(() => this.showResult(selectedGift), 500);
                    }
                } catch (e) {
                    logToConsole("Anim Err: " + e.message);
                    this.isSpinning = false;
                    this.wheel.spinBtn.disabled = false;
                }
            };

            requestAnimationFrame(animate);
        } catch (e) {
            logToConsole("Spin Err: " + e.message);
            this.isSpinning = false;
            this.wheel.spinBtn.disabled = false;
        }
    }

    /* --- Result Phase --- */

    showResult(gift) {
        this.currentResult = gift;
        this.modal.spinner.textContent = this.currentSpinner;
        this.modal.gift.textContent = gift.owner;
        this.modal.el.classList.remove('hidden');

        this.triggerConfetti();
    }

    confirmResult() {
        // Update State
        const giftIndex = this.gifts.findIndex(g => g.owner === this.currentResult.owner);
        this.gifts[giftIndex].taken = true;

        this.history.push({
            spinner: this.currentSpinner,
            receiver: this.currentResult.owner
        });

        this.modal.el.classList.add('hidden');
        this.switchScreen('dashboard');
        this.renderDashboard();
    }

    showGameOver() {
        this.dashboard.grid.innerHTML = '<div style="width:100%; text-align:center;"><h2>🎄 遊戲結束 🎄</h2><p>大家都抽完禮物了！</p></div>';
    }

    /* --- Utilities --- */

    switchScreen(screenName) {
        Object.values(this.screens).forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('active');
        });
        const target = this.screens[screenName];
        target.classList.remove('hidden');
        // Small delay to allow display:block to apply before opacity transition
        setTimeout(() => target.classList.add('active'), 10);
    }

    initFireworks() {
        // Simple particle system
        this.particles = [];
    }

    triggerConfetti() {
        const colors = ['#D42426', '#165B33', '#F8B229', '#FFF'];
        for (let i = 0; i < 100; i++) {
            this.particles.push({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1.0
            });
        }
        this.animateFireworks();
    }

    animateFireworks() {
        if (this.particles.length === 0) return;

        const ctx = this.fireworksCtx;
        ctx.clearRect(0, 0, this.fireworksCanvas.width, this.fireworksCanvas.height);

        this.particles.forEach((p, i) => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;

            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
        });

        this.particles = this.particles.filter(p => p.life > 0);

        if (this.particles.length > 0) {
            requestAnimationFrame(() => this.animateFireworks());
        } else {
            ctx.clearRect(0, 0, this.fireworksCanvas.width, this.fireworksCanvas.height);
        }
    }
}

// Debug Logger
function logToConsole(msg) {
    const el = document.getElementById('debug-console');
    if (el) {
        const line = document.createElement('div');
        line.textContent = `> ${msg}`;
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
    }
    console.log(msg);
}

// Global instance for onclick handlers
const app = new GiftExchangeApp();

window.onerror = function (msg, url, line, col, error) {
    if (msg.includes('ResizeObserver')) return;
    logToConsole(`Sys Err: ${msg} @ L${line}`);
    alert(`Error: ${msg}`); // Fallback
};
