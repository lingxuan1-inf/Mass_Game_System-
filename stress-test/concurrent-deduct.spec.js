import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'mass-game-points',
  apiKey: 'demo-api-key',
  authDomain: 'localhost',
};

function defaultHouses() {
  return [
    { name: 'House Alpha', points: { intelligence: 0, courage: 100, agility: 0, luck: 0, teamwork: 0 } },
    { name: 'House Beta', points: { intelligence: 0, courage: 0, agility: 0, luck: 0, teamwork: 0 } },
    { name: 'House Gamma', points: { intelligence: 0, courage: 0, agility: 0, luck: 0, teamwork: 0 } },
    { name: 'House Delta', points: { intelligence: 0, courage: 0, agility: 0, luck: 0, teamwork: 0 } },
    { name: 'House Omega', points: { intelligence: 0, courage: 0, agility: 0, luck: 0, teamwork: 0 } },
  ];
}

async function seedEmulator(courageBalance = 100) {
  const app = initializeApp(firebaseConfig, `playwright-seed-${Date.now()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const houses = defaultHouses();
  houses[0].points.courage = courageBalance;
  await setDoc(doc(db, 'massgame', 'state'), {
    houses,
    pwHash: 'test',
    pwSalt: 'test',
  });
}

async function waitForAppReady(page) {
  await page.goto('/?useEmulator=1');
  await page.waitForFunction(() => !document.getElementById('loadingOverlay').classList.contains('show'), { timeout: 30000 });
}

async function enterGuestAndDeduct(page) {
  await waitForAppReady(page);
  await page.locator('.mode-card.guest').click();
  await page.waitForSelector('#app', { state: 'visible' });
  await page.locator('.nav-tab[data-page="add"]').click();
  await page.locator('#addOp').selectOption('deduct');
  await page.locator('#addTrait').selectOption('courage');
  await page.locator('#addPoints').fill('10');
  await page.locator('#addSubmitBtn').click();
}

async function readCourageBalance(page) {
  await waitForAppReady(page);
  await page.locator('.mode-card.guest').click();
  await page.waitForSelector('#app', { state: 'visible' });
  await page.waitForSelector('.house-card .trait-val', { timeout: 15000 });
  const courageText = await page.locator('.house-card').first().locator('.trait-val').nth(1).textContent();
  return parseInt(courageText.trim(), 10);
}

test.describe('Concurrent deductions', () => {
  test.beforeEach(async () => {
    await seedEmulator(100);
  });

  test('Scenario A: concurrent deducts reach balance 0 without going negative', async ({ browser }) => {
    test.setTimeout(90000);
    const contexts = await Promise.all(
      Array.from({ length: 10 }, () => browser.newContext())
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));

    await Promise.all(pages.map((p) => enterGuestAndDeduct(p)));
    await new Promise((r) => setTimeout(r, 5000));

    const checkPage = await browser.newPage();
    const balance = await readCourageBalance(checkPage);

    expect(balance).toBeGreaterThanOrEqual(0);
    expect(balance).toBe(0);

    await Promise.all(contexts.map((c) => c.close()));
    await checkPage.close();
  });

  test('Scenario B: mixed deduct and add never goes negative', async ({ browser }) => {
    test.setTimeout(90000);
    await seedEmulator(25);

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const p3 = await ctx3.newPage();

    async function preparePage(page, op, pts) {
      await waitForAppReady(page);
      await page.locator('.mode-card.guest').click();
      await page.waitForSelector('#app', { state: 'visible' });
      await page.locator('.nav-tab[data-page="add"]').click();
      await page.locator('#addOp').selectOption(op);
      await page.locator('#addTrait').selectOption('courage');
      await page.locator('#addPoints').fill(String(pts));
    }

    await preparePage(p1, 'deduct', 15);
    await preparePage(p2, 'deduct', 15);
    await preparePage(p3, 'add', 10);

    await Promise.all([
      p1.locator('#addSubmitBtn').click(),
      p2.locator('#addSubmitBtn').click(),
      p3.locator('#addSubmitBtn').click(),
    ]);

    await new Promise((r) => setTimeout(r, 5000));

    const checkPage = await browser.newPage();
    const balance = await readCourageBalance(checkPage);

    expect(balance).toBeGreaterThanOrEqual(0);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
    await checkPage.close();
  });
});
