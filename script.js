/** Gift Exchange · presentation refresh. Candidate selection rules are unchanged. */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = false;
    }

    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        this.ctx = new AudioContext();
        this.enabled = true;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTick() {
        if (!this.enabled || !this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.05);

            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.05);
        } catch (e) { }
    }

    playSuccess() {
        if (!this.enabled || !this.ctx) return;
        try {
            const now = this.ctx.currentTime;

            const playNote = (freq, start, duration) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + start);
                gain.gain.setValueAtTime(0, now + start);
                gain.gain.linearRampToValueAtTime(0.3, now + start + 0.05);
                gain.gain.linearRampToValueAtTime(0, now + start + duration);
                osc.start(now + start);
                osc.stop(now + start + duration);
            };

            // Little major chord "Ta-da!"
            playNote(523.25, 0, 0.2);     // C5
            playNote(659.25, 0.1, 0.2);   // E5
            playNote(783.99, 0.2, 0.5);   // G5
            playNote(1046.50, 0.3, 0.8);  // C6
        } catch (e) { }
    }
}

class GiftExchangeApp {
    constructor() {
        this.sound = new SoundManager();
        this.participants = [];
        this.gifts = [];
        this.history = [];
        this.currentSpinner = null;
        this.isSpinning = false;
        this.isTransitioning = false;
        this.isResolving = false;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.screens = Object.fromEntries(['setup', 'dashboard', 'wheel'].map(name => [name, document.getElementById(name + '-screen')]));
        this.activeScreen = this.screens.setup;
        this.inputs = { name: document.getElementById('name-input'), addBtn: document.getElementById('add-btn'), startBtn: document.getElementById('start-game-btn'), list: document.getElementById('participants-list') };
        this.dashboard = { count: document.getElementById('remaining-count'), grid: document.getElementById('spinner-selection-grid'), historyList: document.getElementById('history-list') };
        const canvas = document.getElementById('wheel-canvas');
        this.wheel = { canvas, ctx: canvas.getContext('2d'), spinBtn: document.getElementById('spin-btn'), title: document.getElementById('current-spinner-name') };
        this.modal = { el: document.getElementById('result-modal'), spinner: document.getElementById('result-spinner'), gift: document.getElementById('result-gift'), confirmBtn: document.getElementById('confirm-result-btn') };
        this.fireworksCanvas = document.getElementById('fireworks-canvas');
        this.fireworksCtx = this.fireworksCanvas.getContext('2d');
        this.particles = [];
        this.currentAngle = 0;
        this.soundOn = true;
        this.init();
    }
    init() {
        this.inputs.addBtn.addEventListener('click', () => this.addParticipant());
        this.inputs.name.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) this.addParticipant(); });
        this.inputs.startBtn.addEventListener('click', () => this.startGame());
        this.wheel.spinBtn.addEventListener('click', () => this.spinWheel());
        this.modal.confirmBtn.addEventListener('click', () => this.confirmResult());
        document.getElementById('sound-btn').addEventListener('click', e => {
            this.soundOn = !this.soundOn;
            this.sound.enabled = this.soundOn;
            e.currentTarget.textContent = this.soundOn ? '音效 開' : '音效 關';
            e.currentTarget.setAttribute('aria-pressed', String(this.soundOn));
            e.currentTarget.setAttribute('aria-label', this.soundOn ? '關閉音效' : '開啟音效');
        });
        this.modal.el.addEventListener('keydown', e => {
            if (e.key === 'Tab') { e.preventDefault(); if (!this.modal.confirmBtn.disabled) this.modal.confirmBtn.focus(); else this.modal.el.focus(); }
        });
        this.modal.el.tabIndex = -1;
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
    }
    async animate(el, frames, duration = 350) {
        if (this.reducedMotion.matches || !el.animate) return;
        try { await el.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)' }).finished; } catch (_) { /* Cancelled animation still completes navigation. */ }
    }
    pause(ms) { return new Promise(resolve => setTimeout(resolve, this.reducedMotion.matches ? 0 : ms)); }
    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.wheel.canvas.width = 300 * dpr;
        this.wheel.canvas.height = 300 * dpr;
        this.wheel.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (this.targetOptions?.length) this.drawWheel(this.currentAngle);
        const particleDpr = Math.min(dpr, 2);
        this.fireworksCanvas.width = window.innerWidth * particleDpr;
        this.fireworksCanvas.height = window.innerHeight * particleDpr;
        this.fireworksCtx.setTransform(particleDpr, 0, 0, particleDpr, 0, 0);
    }
    addParticipant() {
        if (this.isTransitioning || this.activeScreen !== this.screens.setup) return;
        const name = this.inputs.name.value.trim();
        const message = document.getElementById('input-message');
        if (!name) { message.textContent = '先輸入嘉賓名字吧。'; this.inputs.name.focus(); return; }
        if (this.participants.includes(name)) { message.textContent = '這個名字已經在名單裡囉。'; this.inputs.name.focus(); return; }
        this.participants.push(name);
        message.textContent = '';
        this.renderParticipantsList();
        this.inputs.name.value = '';
        this.inputs.name.focus();
        this.updateStartButton();
    }
    async removeParticipant(name) {
        if (this.isTransitioning || this.activeScreen !== this.screens.setup) return;
        const li = [...this.inputs.list.children].find(el => el.dataset.name === name);
        if (!li || li.dataset.removing) return;
        li.dataset.removing = 'true';
        li.querySelector('button').disabled = true;
        this.participants = this.participants.filter(p => p !== name);
        this.updateStartButton();
        await this.animate(li, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.9)' }], 180);
        const positions = new Map([...this.inputs.list.children].map(el => [el, el.getBoundingClientRect()]));
        li.remove();
        this.renderParticipantsList();
        this.animateLayout(positions);
        document.getElementById('empty-list').classList.toggle('hidden', this.participants.length > 0);
        if (this.activeScreen === this.screens.setup) this.inputs.name.focus();
    }
    animateLayout(positions) {
        for (const [el, old] of positions) {
            if (!el.isConnected) continue;
            const next = el.getBoundingClientRect();
            this.animate(el, [{ transform: `translate(${old.left - next.left}px, ${old.top - next.top}px)` }, { transform: 'translate(0,0)' }], 280);
        }
    }
    renderParticipantsList() {
        // Keep existing nodes so previous names do not replay their entrance animation.
        const existing = new Map([...this.inputs.list.children].map(el => [el.dataset.name, el]));
        this.participants.forEach(name => {
            if (existing.has(name)) return;
            const li = document.createElement('li');
            li.className = 'participant-item'; li.dataset.name = name;
            const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = Array.from(name)[0]; avatar.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span'); text.className = 'name'; text.textContent = name;
            const remove = document.createElement('button'); remove.className = 'remove-btn'; remove.textContent = '×'; remove.setAttribute('aria-label', '移除 ' + name); remove.onclick = () => this.removeParticipant(name);
            li.append(avatar, text, remove); this.inputs.list.append(li);
            this.animate(li, [{ opacity: 0, transform: 'translateY(10px) scale(.97)' }, { opacity: 1, transform: 'none' }]);
        });
        document.getElementById('empty-list').classList.toggle('hidden', this.participants.length > 0);
    }
    updateStartButton() {
        const count = this.participants.length;
        this.inputs.startBtn.textContent = `開始遊戲 (${count}人) →`;
        this.inputs.startBtn.disabled = count < 2;
        document.getElementById('participant-count').textContent = count + ' 位';
    }
    async startGame() {
        if (this.isTransitioning || this.participants.length < 2 || this.activeScreen !== this.screens.setup) return;
        this.sound.init(); this.sound.enabled = this.soundOn; this.sound.resume();
        this.gifts = this.participants.map(owner => ({ owner, taken: false }));
        this.renderDashboard();
        await this.switchScreen('dashboard');
        this.dashboard.grid.querySelector('button')?.focus({ preventScroll: true });
    }
    renderDashboard() {
        const remaining = this.participants.filter(p => !this.history.some(h => h.spinner === p));
        this.dashboard.count.textContent = remaining.length;
        document.getElementById('completed-count').textContent = `${this.history.length} / ${this.participants.length}`;
        document.getElementById('progress-fill').style.width = `${this.history.length / this.participants.length * 100}%`;
        const progress = document.getElementById('game-progress');
        progress.setAttribute('aria-valuemax', this.participants.length); progress.setAttribute('aria-valuenow', this.history.length);
        this.dashboard.grid.replaceChildren();
        remaining.forEach(name => {
            const card = document.createElement('button'); card.className = 'spinner-card';
            const icon = document.createElement('span'); icon.className = 'card-icon'; icon.textContent = '♧'; icon.setAttribute('aria-hidden', 'true');
            const title = document.createElement('h3'); title.textContent = name;
            const hint = document.createElement('p'); hint.textContent = '開啟我的驚喜';
            const arrow = document.createElement('span'); arrow.className = 'card-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
            card.append(icon, title, hint, arrow); card.onclick = () => this.selectSpinner(name, card);
            this.dashboard.grid.append(card);
        });
        document.getElementById('empty-history').classList.toggle('hidden', this.history.length > 0);
        // Only append new results; old records retain their position and animation state.
        while (this.dashboard.historyList.children.length < this.history.length) {
            const index = this.dashboard.historyList.children.length, h = this.history[index];
            const li = document.createElement('li'); li.className = 'history-new';
            const number = document.createElement('span'); number.className = 'history-number'; number.textContent = String(index + 1).padStart(2, '0');
            const names = document.createElement('span'); names.className = 'history-names';
            const from = document.createElement('span'); from.textContent = h.spinner + ' → ';
            const target = document.createElement('b'); target.textContent = h.receiver;
            const detail = document.createElement('small'); detail.textContent = '收到了這份用心準備的禮物';
            names.append(from, target, detail); li.append(number, names); this.dashboard.historyList.append(li);
            this.animate(li, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }]);
        }
        if (!remaining.length) this.showGameOver();
    }
    async selectSpinner(name, card) {
        if (this.isTransitioning || this.isResolving || this.isSpinning) return;
        if (this.history.some(h => h.spinner === name)) return;
        this.isResolving = true;
        this.dashboard.grid.querySelectorAll('button').forEach(el => el.disabled = true);
        card?.classList.add('is-selected');
        if (card) await this.animate(card, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], 280);
        this.currentSpinner = name;
        this.targetOptions = this.getValidTargets(name);
        this.wheel.title.textContent = name;
        if (this.targetOptions.length === 1) {
            await this.showResult(this.targetOptions[0]);
        } else {
            this.currentAngle = 0;
            this.drawWheel(0);
            document.querySelector('.wheel-stage').classList.remove('is-landed');
            this.wheel.spinBtn.disabled = false;
            this.wheel.spinBtn.textContent = '開始轉動 ✦';
            document.getElementById('wheel-status').textContent = '準備好了嗎？讓好運轉起來。';
            await this.switchScreen('wheel');
            this.isResolving = false;
            this.wheel.spinBtn.focus({ preventScroll: true });
        }
    }
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

    drawWheel(angleOffset) {
        if (!this.wheel.ctx) return;

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

        const colors = ['#903e48', '#29523e', '#b78a4d', '#e9d9b7'];

        this.targetOptions.forEach((gift, i) => {
            const startAngle = angleOffset + (i * sliceAngle);
            const endAngle = startAngle + sliceAngle;

            // Slice
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.fillStyle = colors[i % colors.length];
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#e3c58b44';
            ctx.stroke();

            // Text
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(startAngle + sliceAngle / 2);
            ctx.textAlign = "right";
            ctx.fillStyle = (i % colors.length === 3) ? '#283d31' : '#FFF6E5';
            ctx.font = "bold 16px 'Noto Sans TC'";
            const label = Array.from(gift.owner);
            ctx.fillText(label.length > 9 ? label.slice(0, 8).join('') + '…' : gift.owner, radius - 12, 5, 103);
            ctx.restore();
        });

        // Outer Ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#F8B229';
        ctx.stroke();
    } // End drawWheel


    async spinWheel() {
        if (this.isSpinning || this.isResolving || this.isTransitioning || this.activeScreen !== this.screens.wheel) return;
        if (!this.targetOptions?.length) return;
        this.isSpinning = true;
        this.wheel.spinBtn.disabled = true;
        this.wheel.spinBtn.textContent = '好運轉動中…';
        this.sound.resume();
        const stage = document.querySelector('.wheel-stage');
        stage.classList.add('is-spinning');
        const status = document.getElementById('wheel-status');
        status.textContent = '讓驚喜，再靠近一點。';
        // Choose exactly once from the original valid candidates. Animation only presents it.
        const randomIndex = Math.floor(Math.random() * this.targetOptions.length);
        const selectedGift = this.targetOptions[randomIndex];
        const sliceArc = 2 * Math.PI / this.targetOptions.length;
        const finalAngle = 8 * 2 * Math.PI + (1.5 * Math.PI - (randomIndex + .5) * sliceArc);
        const duration = this.reducedMotion.matches ? 0 : 5600;
        // A normalized integrated velocity curve: acceleration, cruise, then gentle deceleration.
        const ease = t => {
            const a = .12, b = .30, total = a / 2 + (b - a) + (1 - b) / 4;
            if (t < a) return t * t / (2 * a * total);
            if (t < b) return (a / 2 + t - a) / total;
            const u = (t - b) / (1 - b);
            return (a / 2 + b - a + (1 - b) * (1 - Math.pow(1 - u, 4)) / 4) / total;
        };
        let start, previous = 0, lastTick = -Infinity;
        try {
            await new Promise((resolve, reject) => {
                const frame = timestamp => {
                    try {
                    if (start === undefined) start = timestamp;
                    const t = duration ? Math.min((timestamp - start) / duration, 1) : 1;
                    this.currentAngle = finalAngle * ease(t);
                    this.drawWheel(this.currentAngle);
                    // Pointer crosses segment boundaries at the twelve-o'clock marker.
                    const boundary = Math.floor((this.currentAngle - 1.5 * Math.PI) / sliceArc);
                    const previousBoundary = Math.floor((previous - 1.5 * Math.PI) / sliceArc);
                    if (!this.reducedMotion.matches && boundary > previousBoundary && timestamp - lastTick > 65) {
                        this.sound.playTick(); lastTick = timestamp;
                        this.animate(document.querySelector('.wheel-arrow'), [{ transform: 'translateX(-50%) rotate(-13deg)' }, { transform: 'translateX(-50%) rotate(0deg)' }], 100);
                    }
                    previous = this.currentAngle;
                    if (t > .72 && status.textContent !== '答案，就在眼前。') status.textContent = '答案，就在眼前。';
                    if (t < 1) requestAnimationFrame(frame); else resolve();
                    } catch (error) { reject(error); }
                };
                requestAnimationFrame(frame);
            });
            stage.classList.remove('is-spinning'); stage.classList.add('is-landed');
            status.textContent = '心意已送達，準備揭曉。';
            await this.pause(450);
            await this.showResult(selectedGift);
        } catch (error) {
            console.error(error);
            this.wheel.spinBtn.disabled = false;
            this.wheel.spinBtn.textContent = '重新轉動 ✦';
            status.textContent = '轉盤暫時中斷，請再試一次。';
        } finally {
            this.isSpinning = false;
            stage.classList.remove('is-spinning');
        }
    }
    async showResult(gift) {
        this.isResolving = true;
        this.currentResult = gift;
        this.modal.spinner.textContent = this.currentSpinner;
        this.modal.gift.textContent = '';
        document.getElementById('result-title').textContent = '驚喜正在拆封';
        this.modal.confirmBtn.disabled = true;
        this.modal.el.classList.remove('hidden', 'is-revealed');
        this.modal.el.inert = false;
        this.modal.el.classList.add('is-opening');
        document.querySelector('.app-container').inert = true;
        this.modal.el.focus({ preventScroll: true });
        await this.animate(this.modal.el.querySelector('.modal-content'), [{ opacity: 0, transform: 'translateY(24px) scale(.94)' }, { opacity: 1, transform: 'none' }], 380);
        await this.pause(450);
        this.modal.el.classList.remove('is-opening'); this.modal.el.classList.add('is-revealed');
        this.modal.gift.textContent = gift.owner;
        document.getElementById('result-title').textContent = '這份心意，屬於你';
        this.sound.playSuccess();
        this.triggerConfetti();
        await this.pause(600);
        this.modal.confirmBtn.disabled = false;
        this.modal.confirmBtn.focus({ preventScroll: true });
    }
    async confirmResult() {
        if (!this.currentResult || this.modal.confirmBtn.disabled) return;
        this.modal.confirmBtn.disabled = true;
        // Commit the result only on confirmation, exactly as before.
        const gift = this.gifts.find(g => g.owner === this.currentResult.owner);
        if (!gift || gift.taken) return;
        gift.taken = true;
        this.history.push({ spinner: this.currentSpinner, receiver: gift.owner });
        this.currentResult = null;
        await this.animate(this.modal.el.querySelector('.modal-content'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px) scale(.96)' }], 220);
        this.modal.el.classList.add('hidden'); this.modal.el.classList.remove('is-revealed'); this.modal.el.inert = true;
        document.querySelector('.app-container').inert = false;
        await this.switchScreen('dashboard');
        this.renderDashboard();
        this.isResolving = false;
        const focus = this.dashboard.grid.querySelector('button, .game-over');
        focus?.focus({ preventScroll: true });
    }
    showGameOver() {
        const panel = document.createElement('div'); panel.className = 'game-over'; panel.tabIndex = -1;
        const star = document.createElement('span'); star.className = 'card-icon'; star.textContent = '✦';
        const title = document.createElement('h2'); title.textContent = '每份心意，都找到主人了。';
        const detail = document.createElement('p'); detail.textContent = '交換的是禮物，留下的是今晚的回憶。';
        panel.append(star, title, detail); this.dashboard.grid.replaceChildren(panel);
    }
    async switchScreen(name) {
        const target = this.screens[name], old = this.activeScreen;
        if (target === old) return;
        this.isTransitioning = true;
        old.inert = true;
        await this.animate(old, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-10px)' }], 180);
        old.classList.add('hidden'); old.classList.remove('active');
        target.classList.remove('hidden'); target.classList.add('active'); target.inert = false;
        this.activeScreen = target;
        await this.animate(target, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], 380);
        this.isTransitioning = false;
    }
    triggerConfetti() {
        if (this.reducedMotion.matches) return;
        const colors = ['#be5960', '#83a58c', '#e3c58b', '#fff2d3'];
        this.particles = Array.from({ length: 90 }, () => ({
            x: window.innerWidth / 2, y: window.innerHeight * .45,
            vx: (Math.random() - .5) * 480, vy: -100 - Math.random() * 300,
            color: colors[Math.floor(Math.random() * colors.length)], life: 1.8 + Math.random() * .8,
            rotation: Math.random() * Math.PI, spin: (Math.random() - .5) * 6
        }));
        if (this.confettiFrame) cancelAnimationFrame(this.confettiFrame);
        let last;
        const frame = now => {
            const dt = Math.min(last === undefined ? 1 / 60 : (now - last) / 1000, .05); last = now;
            const ctx = this.fireworksCtx;
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            this.particles.forEach(p => {
                p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 380 * dt; p.life -= dt; p.rotation += p.spin * dt;
                ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.fillStyle = p.color; ctx.fillRect(-3, -5, 6, 10); ctx.restore();
            });
            this.particles = this.particles.filter(p => p.life > 0);
            if (this.particles.length) this.confettiFrame = requestAnimationFrame(frame);
            else { ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); this.confettiFrame = null; }
        };
        this.confettiFrame = requestAnimationFrame(frame);
    }
}
const app = new GiftExchangeApp();
