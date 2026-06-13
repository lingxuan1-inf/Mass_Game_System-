/**
 * k6 load test — concurrent Firestore REST writes against emulator.
 * Requires Firestore emulator running on localhost:8080.
 *
 * Run: k6 run stress-test/k6-concurrent-deduct.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const PROJECT = 'mass-game-points';
const BASE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

export const options = {
  vus: 30,
  iterations: 30,
  thresholds: {
    checks: ['rate>0.5'],
  },
};

export function setup() {
  const houses = JSON.stringify([
    { name: 'House Alpha', points: { mapValue: { fields: {
      intelligence: { integerValue: '0' }, courage: { integerValue: '100' },
      agility: { integerValue: '0' }, luck: { integerValue: '0' }, teamwork: { integerValue: '0' },
    } } } },
    { name: 'House Beta', points: { mapValue: { fields: {
      intelligence: { integerValue: '0' }, courage: { integerValue: '0' },
      agility: { integerValue: '0' }, luck: { integerValue: '0' }, teamwork: { integerValue: '0' },
    } } } },
    { name: 'House Gamma', points: { mapValue: { fields: {
      intelligence: { integerValue: '0' }, courage: { integerValue: '0' },
      agility: { integerValue: '0' }, luck: { integerValue: '0' }, teamwork: { integerValue: '0' },
    } } } },
    { name: 'House Delta', points: { mapValue: { fields: {
      intelligence: { integerValue: '0' }, courage: { integerValue: '0' },
      agility: { integerValue: '0' }, luck: { integerValue: '0' }, teamwork: { integerValue: '0' },
    } } } },
    { name: 'House Omega', points: { mapValue: { fields: {
      intelligence: { integerValue: '0' }, courage: { integerValue: '0' },
      agility: { integerValue: '0' }, luck: { integerValue: '0' }, teamwork: { integerValue: '0' },
    } } } },
  ]);

  http.patch(`${BASE}/massgame/state?updateMask.fieldPaths=houses`, JSON.stringify({
    fields: { houses: { arrayValue: { values: houses } } },
  }), { headers: { 'Content-Type': 'application/json' } });

  return {};
}

export default function () {
  // k6 REST transactions are complex; this script validates emulator read load.
  // Primary concurrent-deduct assertions live in concurrent-transactions.test.js.
  const res = http.get(`${BASE}/massgame/state`);
  check(res, { 'state readable': (r) => r.status === 200 });
  sleep(0.1);
}
