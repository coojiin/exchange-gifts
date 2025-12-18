
// Mocking the App state structure for testing
class GiftExchangeLogic {
    constructor() {
        this.participants = [];
        this.gifts = [];
        this.history = [];
    }

    getValidTargets(spinnerName) {
        // 1. Basic Candidates: Not taken, Not own gift
        const candidates = this.gifts.filter(g => !g.taken && g.owner !== spinnerName);

        const remainingSpinners = this.participants.filter(p =>
            !this.history.some(h => h.spinner === p)
        );

        if (remainingSpinners.length <= 1) return candidates;

        if (remainingSpinners.length === 2) {
            const lastPerson = remainingSpinners.find(p => p !== spinnerName);

            return candidates.filter(gift => {
                const allAvailable = this.gifts.filter(g => !g.taken);
                const remainingForLast = allAvailable.filter(g => g.owner !== gift.owner);

                const validForLast = remainingForLast.filter(g => g.owner !== lastPerson);

                if (validForLast.length === 0) {
                    // Deadlock detected
                    return false;
                }
                return true;
            });
        }
        return candidates;
    }
}

// Global assert
function assert(condition, msg) {
    if (!condition) {
        console.error("FAIL: " + msg);
        process.exit(1);
    } else {
        console.log("PASS: " + msg);
    }
}

const app = new GiftExchangeLogic();

// Scenario 1: Basic 3 People A, B, C
// A takes B.
console.log("Running Scenario 1 (3 People, A->B)...");
app.participants = ['A', 'B', 'C'];
app.gifts = [
    { owner: 'A', taken: false },
    { owner: 'B', taken: true },
    { owner: 'C', taken: false }
];
app.history = [{ spinner: 'A', receiver: 'B' }];

// B spins. Rem: B, C. Avail: A, C.
// If B takes A, C gets C -> Deadlock.
// B Must take C.
const targetsB = app.getValidTargets('B');
console.log("Targets for B:", targetsB.map(g => g.owner));
assert(targetsB.length === 1 && targetsB[0].owner === 'C', "B must satisfy lookahead and pick C");

// Scenario 2: 3 People A, B, C.
// A takes C.
console.log("Running Scenario 2 (3 People, A->C)...");
app.participants = ['A', 'B', 'C'];
app.gifts = [
    { owner: 'A', taken: false },
    { owner: 'B', taken: false },
    { owner: 'C', taken: true }
];
app.history = [{ spinner: 'A', receiver: 'C' }];

// B spins. Rem: B, C. Avail: A, B.
// B cannot take B.
// Candidate: A.
// If B takes A, C gets B. Valid.
const targetsB2 = app.getValidTargets('B');
console.log("Targets for B:", targetsB2.map(g => g.owner));
assert(targetsB2.length === 1 && targetsB2[0].owner === 'A', "B takes A (Only valid option anyway)");


// Scenario 3: 4 People A, B, C, D.
// A->C, B->D.
console.log("Running Scenario 3 (4 People, A->C, B->D)...");
app.participants = ['A', 'B', 'C', 'D'];
app.gifts = [
    { owner: 'A', taken: false },
    { owner: 'B', taken: false },
    { owner: 'C', taken: true },
    { owner: 'D', taken: true }
];
app.history = [
    { spinner: 'A', receiver: 'C' },
    { spinner: 'B', receiver: 'D' }
];
// C spins. Rem: C, D. Avail: A, B.
// C can take A (D gets B) -> OK.
// C can take B (D gets A) -> OK.
const targetsC = app.getValidTargets('C');
console.log("Targets for C:", targetsC.map(g => g.owner));
assert(targetsC.length === 2, "C has 2 valid options");

console.log("All Tests Passed!");
