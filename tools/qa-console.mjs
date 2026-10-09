#!/usr/bin/env node
/**
 * The Staff console in a real browser, on a phone-sized screen, with real
 * passkeys (Chromium's virtual authenticator: Face ID that always says yes).
 *
 *   CONSOLE_SETUP_CODE=… CONSOLE_STEP_UP_MINUTES=0.1 node tools/console-local.mjs   # in one shell
 *   CONSOLE_SETUP_CODE=… node tools/qa-console.mjs                                  # in another
 *
 * Walks the operator's brief: the owner's first passkey, invitations for
 * Valentina and Diego on their own "phones", one dashboard for both houses with
 * every row badged, Diego without the money buttons, Valentina's refund asking
 * for her passkey, the house filter, the access screen, signing out.
 */

import { chromium, devices } from 'playwright';
import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.CONSOLE_URL ?? 'http://localhost:4180').replace(/\/$/, '');
const SETUP = process.env.CONSOLE_SETUP_CODE ?? '';
const OUT = new URL('.qa-screens/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

async function launch() {
  try { return await chromium.launch(); } catch (error) {
    const root = '/opt/pw-browsers';
    if (!existsSync(root)) throw error;
    for (const dir of (await readdir(root)).filter((d) => d.startsWith('chromium-'))) {
      const bin = join(root, dir, 'chrome-linux', 'chrome');
      if (existsSync(bin)) return chromium.launch({ executablePath: bin });
    }
    throw error;
  }
}

let failures = 0;
const note = (ok, message) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`); };

const browser = await launch();
const errors = [];

/** A phone: its own browser profile, its own platform authenticator. */
async function phone(name) {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  // A 401 from /console/api/me is how a signed-out page learns it is signed out, and
  // a 403 "step-up-required" is how a refund asks for the passkey: both by design.
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 40[13]/.test(message.text())) errors.push(`${name}: ${message.text()}`);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
  page.on('dialog', (dialog) => dialog.accept());
  return { context, page };
}

const sheetGo = async (page) => {
  const go = page.locator('[data-sheet-go]');
  await go.waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-sheet-go]')?.disabled);
  await go.click();
  await page.locator('.sheet').waitFor({ state: 'detached' });
};

const badges = (page) => page.$$eval('#main .pill--house', (els) => [...new Set(els.map((el) => el.dataset.house))].sort());

/* ── Jacopo: the first passkey, from the setup code ────────────────────── */

console.log('\n── owner ──');
const jacopo = await phone('jacopo');
await jacopo.page.goto(BASE, { waitUntil: 'load' });
await jacopo.page.locator('#sign-in').waitFor();
note(await jacopo.page.locator('#gate').isVisible(), 'a stranger sees only the sign-in');
note(await jacopo.page.locator('#sign-in').isVisible(), 'and its one button: Accedi con passkey');
await jacopo.page.screenshot({ path: `${OUT}/console-gate-390.png` });

await jacopo.page.click('.gate__more summary');
await jacopo.page.fill('#setup-code', SETUP);
await jacopo.page.click('#setup-go');
await sheetGo(jacopo.page);
await jacopo.page.locator('#main .stat').first().waitFor();
note(!(await jacopo.page.locator('#gate').isVisible()), 'the owner is in after creating a passkey');
note(await jacopo.page.locator('#scope [data-scope]').count() === 3, 'filter: Tutte | LunArt | Bella Vigna');
note((await badges(jacopo.page)).includes('lunart'), 'today’s rows carry their house (LunArt arrival)');
await jacopo.page.screenshot({ path: `${OUT}/console-dashboard-390.png`, fullPage: true });

/* Invitations */
await jacopo.page.click('#account');
await jacopo.page.locator('[data-person="diego"]').waitFor();
note(await jacopo.page.locator('[data-person]').count() === 3, 'the owner sees the three people');
note(await jacopo.page.locator('text=Registro').count() > 0, 'and the log');
const links = {};
for (const id of ['diego', 'valentina']) {
  await jacopo.page.click(`[data-person="${id}"] [data-invite="enroll"]`);
  await jacopo.page.locator(`[data-person="${id}"] .link-out`).waitFor();
  links[id] = (await jacopo.page.locator(`[data-person="${id}"] .link-out`).textContent()).trim();
  note(/#invito=[\w-]{40,}$/.test(links[id]), `an invitation link for ${id}`);
}
await jacopo.page.screenshot({ path: `${OUT}/console-access-owner-390.png`, fullPage: true });

/* ── Diego, on his phone ──────────────────────────────────────────────── */

console.log('\n── front desk ──');
const diego = await phone('diego');
await diego.page.goto(links.diego, { waitUntil: 'load' });
await diego.page.locator('#invite-go').waitFor();
note(await diego.page.locator('text=Ciao Diego').isVisible(), 'the link greets Diego by name');
await diego.page.click('#invite-go');
await sheetGo(diego.page);
await diego.page.locator('#main .stat').first().waitFor();
note(!diego.page.url().includes('invito'), 'the invitation leaves the address bar');

await diego.page.click('[data-view="new"]');
await diego.page.locator('#main .row, #main .empty').first().waitFor();
note(await diego.page.locator('[data-action="refund"], [data-action="cancel"]').count() === 0, 'Diego has no refund or cancel button');
note((await badges(diego.page)).includes('lunart'), 'orders from LunArt, badged');

await diego.page.click('[data-view="reservations"]');
await diego.page.locator('#manual').waitFor();
note(await diego.page.locator('#manual select[name="property"] option').count() === 2, 'the manual form asks which house');
await diego.page.selectOption('#manual select[name="property"]', 'bella-vigna');
const rooms = await diego.page.$$eval('#manual select[name="room"] option', (os) => os.map((o) => o.value).filter(Boolean));
note(rooms.join(',') === 'Standard,Deluxe,Terrazza', `and offers that house’s rooms (${rooms.join(', ')})`);
await diego.page.fill('#manual [name="first_name"]', 'Giulia');
await diego.page.fill('#manual [name="last_name"]', 'Prova');
await diego.page.fill('#manual [name="check_in"]', '2026-11-20');
await diego.page.fill('#manual [name="check_out"]', '2026-11-22');
await diego.page.selectOption('#manual select[name="room"]', 'Terrazza');
await diego.page.click('#manual [type="submit"]');
await diego.page.locator('#manual-result .banner, #main .row[data-property="bella-vigna"]').first().waitFor();
await diego.page.waitForTimeout(400);
note(await diego.page.locator('#main details[data-property="bella-vigna"]').count() > 0, 'the new stay is listed under Bella Vigna');
await diego.page.screenshot({ path: `${OUT}/console-reservations-diego-390.png`, fullPage: true });

await diego.page.click('#account');
await diego.page.locator('text=Le tue passkey').waitFor();
note(await diego.page.locator('[data-person]').count() === 0, 'Diego does not manage access');
note(await diego.page.locator('text=Registro').count() === 0, 'nor read the log');

/* ── Valentina: a refund asks for her passkey ─────────────────────────── */

console.log('\n── direzione ──');
const valentina = await phone('valentina');
await valentina.page.goto(links.valentina, { waitUntil: 'load' });
await valentina.page.locator('#invite-go').waitFor();
await valentina.page.click('#invite-go');
await sheetGo(valentina.page);
await valentina.page.locator('#main .stat').first().waitFor();
// The QA console is started with a six-second passkey window: let it lapse.
await valentina.page.waitForTimeout(7000);
await valentina.page.click('[data-view="new"]');
await valentina.page.locator('[data-action="refund"]').first().waitFor();
await valentina.page.locator('[data-action="refund"]').first().click();
await valentina.page.locator('.sheet').waitFor();
note(await valentina.page.locator('text=Conferma con la passkey').isVisible(), 'a refund asks for a fresh passkey check');
await valentina.page.screenshot({ path: `${OUT}/console-stepup-390.png` });
await sheetGo(valentina.page);
await valentina.page.waitForTimeout(500);
note(!(await valentina.page.locator('.sheet').count()), 'and goes through after it');

/* ── The house filter, and signing out ────────────────────────────────── */

console.log('\n── filter ──');
await jacopo.page.click('[data-view="dashboard"]');
await jacopo.page.click('[data-scope="bella-vigna"]');
await jacopo.page.waitForTimeout(500);
const onlyBv = await badges(jacopo.page);
note(onlyBv.every((house) => house === 'bella-vigna'), `filter Bella Vigna shows only Bella Vigna (${onlyBv.join(', ') || 'no rows'})`);
await jacopo.page.click('[data-scope="all"]');
await jacopo.page.click('[data-view="sync"]');
await jacopo.page.locator('#main .focus').waitFor();
note(await jacopo.page.locator('#main .focus [data-focus]').count() === 2, 'sync is one house at a time, with a switch');

await diego.page.click('[data-sign-out]');
await diego.page.locator('#gate').waitFor();
note(await diego.page.locator('#gate').isVisible(), 'signing out returns to the passkey screen');
const after = await diego.page.evaluate(() => fetch('/console/api/me').then((r) => r.status));
note(after === 401, 'and the session is gone on the server');

note(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ') || 'none'})`);

await browser.close();
console.log(failures === 0 ? '\nALL CONSOLE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
