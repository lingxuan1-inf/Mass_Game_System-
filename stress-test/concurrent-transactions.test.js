/**
 * Stress tests against Firestore emulator.
 * Run: pnpm emulator (terminal 1) && pnpm test:stress (terminal 2)
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  collection,
  setDoc,
  getDoc,
  runTransaction,
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'mass-game-points',
  apiKey: 'fake-api-key',
  authDomain: 'localhost',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const stateRef = doc(db, 'massgame', 'state');
const logCol = collection(db, 'massgame', 'state', 'log');

function defaultHouses() {
  return [
    { name: 'House Alpha', points: { intelligence: 0, courage: 100, agility: 0, luck: 0, teamwork: 0 } },
    { name: 'House Beta', points: { intelligence: 0, courage: 0, agility: 0, luck: 0, teamwork: 0 } },
    { name: 'House Gamma', points: { intelligence: 0, courage: 0, agility: 0, luck: 0, teamwork: 0 } },
    { name: 'House Delta', points: { intelligence: 0, courage: 0, agility: 0, luck: 0, teamwork: 0 } },
    { name: 'House Omega', points: { intelligence: 0, courage: 0, agility: 0, luck: 0, teamwork: 0 } },
  ];
}

class InsufficientPointsError extends Error {
  constructor(balance) {
    super('Insufficient points');
    this.balance = balance;
  }
}

async function applyPointTransaction(hIdx, trait, change, type, reason) {
  const pts = Math.abs(change);
  const isDeduct = change < 0;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(stateRef);
    const data = snap.data();
    const houses = JSON.parse(JSON.stringify(data.houses));
    const balance = houses[hIdx].points[trait] || 0;

    if (isDeduct && balance < pts) {
      throw new InsufficientPointsError(balance);
    }

    houses[hIdx].points[trait] = balance + change;
    transaction.update(stateRef, { houses });

    const logRef = doc(logCol);
    transaction.set(logRef, {
      ts: new Date().toISOString(),
      hIdx,
      house: houses[hIdx].name,
      trait,
      change,
      type,
      reason,
    });
  });
}

async function resetState(courageBalance = 100) {
  const houses = defaultHouses();
  houses[0].points.courage = courageBalance;
  await setDoc(stateRef, {
    houses,
    pwHash: 'test',
    pwSalt: 'test',
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

async function scenarioA_concurrentDeductions() {
  console.log('\nScenario A: 30 concurrent deducts (balance 100, deduct 10 each)');
  await resetState(100);

  const results = await Promise.allSettled(
    Array.from({ length: 30 }, (_, i) =>
      applyPointTransaction(0, 'courage', -10, 'deduct', `GM-${i}`)
    )
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;

  const snap = await getDoc(stateRef);
  const balance = snap.data().houses[0].points.courage;

  assert(succeeded === 10, `expected 10 successes, got ${succeeded}`);
  assert(rejected === 20, `expected 20 rejections, got ${rejected}`);
  assert(balance === 0, `expected balance 0, got ${balance}`);
  assert(balance >= 0, `balance went negative: ${balance}`);

  console.log(`  ✓ ${succeeded} succeeded, ${rejected} rejected, final balance = ${balance}`);
}

async function scenarioB_mixedDeductAndAdd() {
  console.log('\nScenario B: 2 concurrent deducts + 1 concurrent add (balance 25)');
  await resetState(25);

  const ops = [
    applyPointTransaction(0, 'courage', -15, 'deduct', 'deduct-A'),
    applyPointTransaction(0, 'courage', -15, 'deduct', 'deduct-B'),
    applyPointTransaction(0, 'courage', 10, 'add', 'add-C'),
  ];

  const results = await Promise.allSettled(ops);
  const snap = await getDoc(stateRef);
  const balance = snap.data().houses[0].points.courage;

  assert(balance >= 0, `balance went negative: ${balance}`);
  console.log(`  ✓ final balance = ${balance} (never negative)`);
  console.log(`  ✓ fulfilled: ${results.filter((r) => r.status === 'fulfilled').length}, rejected: ${results.filter((r) => r.status === 'rejected').length}`);
}

async function scenarioC_noNegativeAfterRace() {
  console.log('\nScenario C: 50 rapid mixed ops on balance 50');
  await resetState(50);

  const promises = [];
  for (let i = 0; i < 25; i++) {
    promises.push(applyPointTransaction(0, 'courage', -5, 'deduct', `d-${i}`));
  }
  for (let i = 0; i < 25; i++) {
    promises.push(applyPointTransaction(0, 'courage', 3, 'add', `a-${i}`));
  }

  await Promise.allSettled(promises);
  const snap = await getDoc(stateRef);
  const balance = snap.data().houses[0].points.courage;

  assert(balance >= 0, `balance went negative: ${balance}`);
  console.log(`  ✓ final balance = ${balance} after 50 concurrent ops`);
}

async function main() {
  console.log('Mass Game stress tests (Firestore emulator)');
  try {
    await scenarioA_concurrentDeductions();
    await scenarioB_mixedDeductAndAdd();
    await scenarioC_noNegativeAfterRace();
    console.log('\nAll stress tests passed.\n');
    process.exit(0);
  } catch (e) {
    console.error('\n' + e.message + '\n');
    process.exit(1);
  }
}

main();
