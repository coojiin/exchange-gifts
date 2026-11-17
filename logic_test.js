// No dependencies: node logic_test.js. Exercise production code, not a copied algorithm.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
const elements = new Map();
function element() {
    const classes = new Set();
    return { textContent: '', disabled: false, inert: false, style: {},
        classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)) },
        focus() {}, querySelector() { return element(); } };
}
const context = { console: { ...console, log() {} }, setTimeout, requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 0),
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, querySelector() { return element(); } } };
vm.createContext(context);
vm.runInContext(source.replace('const app = new GiftExchangeApp();', 'this.App = GiftExchangeApp;'), context);
const App = context.App;
let states = 0, completed = 0;
function visit(app) {
    states++;
    const remaining = app.participants.filter(p => !app.history.some(h => h.spinner === p));
    if (!remaining.length) {
        assert.equal(new Set(app.history.map(h => h.receiver)).size, app.participants.length);
        assert(app.history.every(h => h.spinner !== h.receiver)); completed++; return;
    }
    for (const spinner of remaining) {
        const targets = app.getValidTargets(spinner);
        assert(targets.length > 0, 'Every possible next spinner must retain a valid target');
        for (const target of targets) {
            assert(!target.taken && target.owner !== spinner);
            target.taken = true; app.history.push({ spinner, receiver: target.owner });
            visit(app);
            app.history.pop(); target.taken = false;
        }
    }
}
for (let size = 2; size <= 5; size++) {
    const app = Object.create(App.prototype);
    app.participants = Array.from({ length: size }, (_, i) => String(i));
    app.gifts = app.participants.map(owner => ({ owner, taken: false })); app.history = [];
    visit(app);
}
console.log(`PASS ${states} reachable states and ${completed} complete games (2–5 people, every selection order and valid outcome)`);
function fixture() {
    const app = Object.create(App.prototype);
    app.participants = ['A', 'B', 'C']; app.gifts = app.participants.map(owner => ({ owner, taken: false })); app.history = [];
    app.isSpinning = false; app.isResolving = false; app.isTransitioning = false;
    app.reducedMotion = { matches: true };
    app.sound = { resume() {}, playSuccess() {}, playTick() {} };
    app.screens = { wheel: element(), dashboard: element() }; app.activeScreen = app.screens.wheel;
    app.wheel = { spinBtn: element(), title: element() };
    app.modal = { el: element(), spinner: element(), gift: element(), confirmBtn: element() };
    app.dashboard = { grid: { querySelectorAll() { return [element(), element()]; }, querySelector() { return element(); } } };
    app.animate = async () => {}; app.pause = async () => {}; app.triggerConfetti = () => {};
    app.switchScreen = async name => { app.activeScreen = app.screens[name]; };
    app.renderDashboard = () => {}; app.drawWheel = angle => { app.currentAngle = angle; };
    return app;
}
(async () => {
    const app = fixture(); app.currentSpinner = 'A'; app.targetOptions = app.getValidTargets('A');
    let calls = 0, result;
    const show = app.showResult;
    app.showResult = async gift => { calls++; result = gift; await show.call(app, gift); };
    await Promise.all([app.spinWheel(), app.spinWheel()]);
    assert.equal(calls, 1, 'Repeated spin only draws once');
    assert.equal(app.history.length, 0, 'Revealing does not write history');
    assert(app.gifts.every(g => !g.taken), 'Revealing does not take a gift');
    const arc = 2 * Math.PI / app.targetOptions.length;
    const index = app.targetOptions.indexOf(result);
    const center = (app.currentAngle + (index + .5) * arc) % (2 * Math.PI);
    assert(Math.abs(center - 1.5 * Math.PI) < 1e-9, 'Visual segment matches selected result at pointer');
    await Promise.all([app.confirmResult(), app.confirmResult()]);
    assert.equal(app.history.length, 1, 'Repeated confirm commits once');
    assert.equal(app.gifts.filter(g => g.taken).length, 1);
    assert.equal(app.isResolving, false);
    const last = fixture(); last.participants = ['A', 'B']; last.gifts = last.participants.map(owner => ({ owner, taken: false }));
    last.activeScreen = last.screens.dashboard;
    let wheelVisits = 0; last.switchScreen = async () => { wheelVisits++; };
    await Promise.all([last.selectSpinner('A', element()), last.selectSpinner('B', element())]);
    assert.equal(last.currentSpinner, 'A', 'Repeated selection keeps the first spinner');
    assert.equal(wheelVisits, 0, 'One valid candidate skips the wheel');
    assert.equal(last.currentResult.owner, 'B');
    assert.equal(last.modal.confirmBtn.disabled, false, 'Reduced motion still allows confirmation');
    console.log('PASS production spin/confirm guards, commit-on-confirm, pointer alignment, single-target skip, and reduced-motion result flow');
})().catch(error => { console.error(error); process.exitCode = 1; });
