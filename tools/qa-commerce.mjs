#!/usr/bin/env node
/**
 * Walks the whole purchase in a real browser, on a phone-sized screen.
 *
 * Not a unit test: it clicks what a guest clicks. Pick a bottle, choose an
 * evening, add it, check out, pay on the stand-in, come back to a paid order —
 * then reach for the Privilege Card and find it honestly withheld: at Bella Vigna
 * no venue has confirmed an agreement yet, so there is nothing to buy, no card to
 * open and no venue page to validate it on. Those mechanics are proved by the unit
 * tests against a property fixture (`test/privilege-card.test.mjs`,
 * `test/card.test.mjs`, `test/card-qr-slot.test.mjs`).
 *
 * Needs the server running:
 *   npm run dev &
 *   npm install --no-save playwright && node tools/qa-commerce.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { propertyDate } from '../commerce/time.js';
import { storageKey } from '../data/brand.js';
import { ROOM_IDS } from '../commerce/rooms.js';
import { cardPartners, stayPartners, PROPERTY_AGREEMENTS, AGREEMENT } from '../commerce/partners.js';

/** Bella Vigna's rooms have names, not numbers: the guest types one of them. */
const ROOM = ROOM_IDS[0];
/** `bellavigna.cart.v1`: the basket lives under this property's own prefix. */
const CART_KEY = storageKey('cart.v1');

const OUT = new URL('.qa-screens/', import.meta.url).pathname;
const BASE = (process.env.BASE_URL ?? 'http://localhost:4173/').replace(/\/?$/, '/');
await mkdir(OUT, { recursive: true });

async function launch() {
  try { return await chromium.launch(); } catch (error) {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (!root) throw error;
    for (const dir of (await readdir(root)).filter((d) => d.startsWith('chromium-'))) {
      const bin = join(root, dir, 'chrome-linux', 'chrome');
      if (existsSync(bin)) return chromium.launch({ executablePath: bin });
    }
    throw error;
  }
}

let failures = 0;
const note = (ok, message) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`); };
/**
 * Today in Florence, not today in UTC.
 *
 * This was `new Date().toISOString().slice(0, 10)`, and between 22:00 UTC and
 * midnight it named yesterday: the server validates a card's start date against
 * the property day, so for two hours every evening the harness typed a date the
 * server had already passed and the form answered "That date has gone." A QA run
 * that fails by the clock teaches nobody anything.
 */
const today = propertyDate();
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const browser = await launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

/* ── The shop ─────────────────────────────────────────────────────────── */
console.log('\n── shop ──');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

note(await page.isVisible('[data-shop]'), 'the guide shows an Extras section');
await page.click('[data-shop]');
await page.waitForTimeout(500);
const productCount = await page.locator('[data-product]').count();
note(productCount >= 5, `the shop lists products (${productCount})`);

const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
note(overflow.doc <= overflow.win + 1, `no horizontal overflow (${overflow.doc} vs ${overflow.win})`);
await page.screenshot({ path: `${OUT}/shop-390.png` });

/* ── Buying a bottle ──────────────────────────────────────────────────── */
console.log('\n── wine ──');
await page.click('[data-product="wine-in-room"]');
await page.waitForTimeout(500);
note(await page.isVisible('.sheet[data-open="true"]'), 'the product sheet opens');

const addButton = page.locator('[data-add]');
note(await addButton.isDisabled(), 'cannot add before the choices are made');

await page.selectOption('select[name="variantId"]', 'brunello');
await page.fill('input[name="date"]', inDays(3));
await page.selectOption('select[name="slotId"]', 'w-1900');
await page.fill('input[name="room"]', ROOM);
await page.waitForTimeout(400);

const summary = await page.textContent('[data-summary]');
// The Brunello at the figure carried over from LunArt as a placeholder
// (`commerce/prices.js`), with the notice an order under ninety euros needs.
note(/89/.test(summary), `the sheet shows the price (${summary.replace(/\s+/g, ' ').trim().slice(0, 60)})`);
note(/12|ore|hours/.test(summary), 'and the notice the order needs');
note(/preavviso|notice/i.test(summary), 'it states the notice the bottle needs');
// A placeholder is sellable in the preview, and it says so rather than passing for
// Bella Vigna's own price.
const provisional = await page.textContent('.terms--warn').catch(() => '');
note(/non è ancora quello definitivo di Bella Vigna|not Bella Vigna’s final price/i.test(provisional),
  `and says the price is not Bella Vigna’s final one yet (${provisional.replace(/\s+/g, ' ').trim().slice(0, 50)})`);

// What happens if they change their mind, said before they decide rather than
// after. Drawn from the product's own policy, so it cannot drift from the rule the
// server applies when the cancellation actually arrives.
const policyLine = await page.textContent('.terms--policy').catch(() => '');
note(/annullabile|cancellable/i.test(policyLine), `the cancellation policy is stated up front (${policyLine.replace(/\s+/g, ' ').trim().slice(0, 60)})`);
note(/3 ore|3 hours/i.test(policyLine), 'and it is the bottle’s own three-hour rule');
await page.screenshot({ path: `${OUT}/product-390.png` });

note(!(await addButton.isDisabled()), 'adding is allowed once the form is complete');
await addButton.click();
await page.waitForTimeout(700);
note(await page.isVisible('.cart-line'), 'the cart opens with the bottle in it');

/* ── A second item, and the quantity stepper ──────────────────────────── */
await page.click('.sheet [data-close]');
await page.waitForTimeout(500);
await page.goto(`${BASE}#/product/brunch`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.check('input[name="variantId"][value="opera"]', { force: true });
await page.fill('input[name="date"]', inDays(2));
await page.selectOption('select[name="slotId"]', 'b-0900');
await page.selectOption('select[name="option:hotDrink"]', 'cappuccino');
await page.fill('input[name="room"]', ROOM);
await page.waitForTimeout(400);
await page.click('[data-add]');
await page.waitForTimeout(700);

note((await page.locator('.cart-line').count()) === 2, 'the cart holds two different lines');
const badge = await page.textContent('.cart-button__count').catch(() => '');
note(badge.trim() === '2', `the header badge counts them (${badge.trim()})`);

await page.click('.cart-line .stepper__button[data-step="1"]');
await page.waitForTimeout(400);
const totalText = await page.textContent('.cart-total');
// Two Brunello on top of the brunch: 2 x 89 + 69.
note(/247/.test(totalText.replace(/\s/g, '')), `the total follows the stepper (${totalText.replace(/\s+/g, ' ').trim()})`);
await page.click('.cart-line .stepper__button[data-step="-1"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/cart-390.png` });

/* ── Checkout ─────────────────────────────────────────────────────────── */
console.log('\n── checkout ──');
await page.fill('input[name="name"]', 'Jacopo Lunardi');
await page.fill('input[name="email"]', 'jacopo@example.com');
await page.fill('input[name="room"]', ROOM);
await page.click('.checkout-form button[type="submit"]');
await page.waitForURL(/mock-checkout/, { timeout: 8000 });
note(true, 'checkout hands over to the payment page');
note(await page.isVisible('.banner'), 'the stand-in is labelled as a test environment');
await page.screenshot({ path: `${OUT}/checkout-390.png` });

await page.click('[data-pay]');
await page.waitForURL(/#\/order\//, { timeout: 8000 });
await page.waitForTimeout(900);
const status = await page.textContent('.status-pill');
note(/pagato|paid/i.test(status), `the order comes back confirmed (${status.trim()})`);
await page.screenshot({ path: `${OUT}/order-390.png` });

/* ── Changing their mind ──────────────────────────────────────────────── */
console.log('\n── cancelling a line ──');
// The brunch is for the day after tomorrow, so it is inside its own window; the
// Brunello is three days out and inside its own.
const cancelButtons = page.locator('.cart-line__cancel');
note((await cancelButtons.count()) >= 1, `the guest is offered a cancellation (${await cancelButtons.count()})`);
const deadlineNote = (await page.locator('.cart-line__note').allTextContents()).join(' ');
note(/fino al|until/i.test(deadlineNote), 'with the deadline printed next to it');

// The confirmation is in front of the request, not behind it: this is the one
// button in the guide that moves money.
let asked = '';
page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
const linesBefore = await page.locator('.cart-line').count();
await cancelButtons.first().click();
await page.waitForTimeout(1200);

note(/rimborsiamo|refund/i.test(asked), `it asks first, in money terms (${asked.replace(/\s+/g, ' ').slice(0, 70)})`);
note((await page.locator('.cart-line--cancelled').count()) >= 1, 'the cancelled line stays, struck through');
note((await page.locator('.cart-line').count()) === linesBefore, 'nothing is removed from the record');
const afterCancel = (await page.locator('.cart-line__note').allTextContents()).join(' ');
note(/annullato|cancelled/i.test(afterCancel), 'and it says it was cancelled');
note(/rimborsat|refunded/i.test(afterCancel), 'and what came back');
await page.screenshot({ path: `${OUT}/order-cancelled-390.png` });

// The Privilege Card is sold outright, so it is never offered a cancel button.
await page.goto(`${BASE}#/product/privilege-card`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const cardPolicy = await page.textContent('.terms--policy').catch(() => '');
note(/non annullabile|not cancellable/i.test(cardPolicy), `the card says it cannot be cancelled (${cardPolicy.replace(/\s+/g, ' ').trim().slice(0, 60)})`);
await page.click('.sheet [data-close]');
await page.waitForTimeout(400);

/* ── Persistence ──────────────────────────────────────────────────────── */
console.log('\n── cart persistence ──');
await page.goto(`${BASE}#/product/wine-in-room`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.selectOption('select[name="variantId"]', 'vermentino');
await page.fill('input[name="date"]', inDays(4));
await page.selectOption('select[name="slotId"]', 'w-2000');
await page.fill('input[name="room"]', ROOM);
await page.waitForTimeout(300);
await page.click('[data-add]');
await page.waitForTimeout(600);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const afterReload = await page.textContent('.cart-button__count').catch(() => '0');
note(afterReload.trim() === '1',
  `the paid basket was emptied and the new bottle survives a reload (${afterReload.trim()})`);

/* ── The Privilege Card, withheld ─────────────────────────────────────────
   At LunArt this bought a five-day card, opened it, and scanned it at L'Opera
   Caffè. At Bella Vigna none of that can exist yet: the venues are LunArt's, and
   until each one confirms that its agreement covers Bella Vigna guests
   (`PROPERTY_AGREEMENTS`) no benefit stands behind the card — so the upgrade is
   withheld everywhere, preview included, rather than sold empty. What a guest
   meets is that honest state, and it is walked the same way a purchase would be:
   the tile, the sheet, the button, and the checkout behind the button.

   The card screen, its rotating QR and the venue's verdict are proved by the unit
   tests against a property fixture (test/privilege-card.test.mjs,
   test/card.test.mjs, test/card-qr-slot.test.mjs). The first check below is the
   tripwire: the day a venue is confirmed it fails, and that is the signal to walk
   the purchase here again rather than to keep asserting it cannot happen. */
console.log('\n── privilege card (no agreement confirmed yet) ──');
const pending = Object.entries(PROPERTY_AGREEMENTS)
  .filter(([, agreement]) => agreement.status !== AGREEMENT.confirmed)
  .map(([id]) => id);
note(cardPartners().length === 0 && stayPartners().length === 0 && pending.length > 0,
  `no venue has a confirmed agreement for Bella Vigna yet (${pending.length} pending: ${pending.join(', ')})`);

await page.evaluate((key) => localStorage.removeItem(key), CART_KEY);
await page.goto(`${BASE}#/shop`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const cardTile = page.locator('#main .card[data-product="privilege-card"]');
note((await cardTile.count()) === 1, 'the shop still shows the Privilege Card rather than hiding it');
const tileText = (await cardTile.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
note(/Prezzo da definire|Price to be set/i.test(tileText), `marked as not on sale yet (…${tileText.slice(-30)})`);
note(!/€\s?\d|\d\s?€/.test(tileText), 'with no price on the tile');

await page.goto(`${BASE}#/product/privilege-card`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
// The sheet says why, and offers nothing to fill in: no lengths, no prices, no
// total and no basket button for a card that no venue honours yet.
const cardSheet = (await page.textContent('.sheet__body').catch(() => '')).replace(/\s+/g, ' ').trim();
note(/nessun locale ha ancora confermato|no venue has confirmed/i.test(cardSheet),
  `the sheet says why it is not on sale (…${cardSheet.match(/(Non è ancora in vendita|Not on sale yet)[^.]*\./)?.[0] ?? 'missing'})`);
note((await page.locator('.sheet__body form.product-form, .sheet__body input[name="variantId"], .sheet__body [data-add]').count()) === 0,
  'and shows no form, no card lengths and no basket button');
note(!/€\s?\d|\d\s?€/.test(cardSheet), 'and no price at all');
await page.screenshot({ path: `${OUT}/card-withheld-390.png` });

// Not only the button: the checkout behind it refuses the line as well, so a
// request that skips the form gets the same answer and no card is ever issued.
// Asked from here rather than from the page, because a refusal is the expected
// answer and the browser would log it as an error.
const direct = await fetch(new URL('api/checkout', BASE), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    lang: 'en',
    customer: { name: 'Jacopo Lunardi', email: 'jacopo@example.com' },
    lines: [{ productId: 'privilege-card', variantId: '5d', quantity: 1, date: today, fields: { holderName: 'Jacopo Lunardi' } }],
  }),
}).then(async (response) => ({ status: response.status, ...(await response.json().catch(() => ({}))) }));
note(direct.status === 422 && (direct.errors ?? []).some((e) => e.reason === 'no-card-partner'),
  `the checkout refuses it too, for the reason that is true (${direct.status} ${(direct.errors ?? []).map((e) => e.reason ?? e.code).join(', ')})`);
note(!direct.accessToken && !direct.checkoutUrl, 'so no order, no payment page and no card exist');
await page.click('.sheet [data-close]');
await page.waitForTimeout(400);

/* ── The venue's own page ─────────────────────────────────────────────────
   A venue page is a scanner, and a scanner with no agreement behind it would be a
   door promising a discount nobody agreed to. So a venue whose agreement for
   Bella Vigna is pending has none: the page shell loads, finds no partner, and
   offers neither the venue's name nor a home-screen install, while its API and
   manifest answer 404. A code shown at the generic page is still checked — and an
   invented one is still refused, in the agreed words. */
console.log('\n── partner pages ──');
const venue = await context.newPage();
for (const id of pending) {
  // Not `networkidle`: the page reads the 404's status and never its body, and
  // Playwright counts an unread body as a request still in flight.
  await venue.goto(`${BASE}partner/${id}`, { waitUntil: 'load' });
  await venue.waitForFunction(() => document.getElementById('partner-name')?.textContent.trim() !== '—', null, { timeout: 8000 })
    .catch(() => {});
  await venue.waitForTimeout(300);
  const venueName = (await venue.textContent('#partner-name')).trim();
  note(/sconosciuto/i.test(venueName), `${id} → the page does not present itself as that venue's scanner (${venueName})`);
  note((await venue.locator('link[rel="manifest"]').count()) === 0, `${id} → and offers no home-screen install`);
  const [info, manifest] = await Promise.all([
    fetch(new URL(`api/partners/${id}`, BASE)).then((r) => r.status),
    fetch(new URL(`partner/${id}/manifest.webmanifest`, BASE)).then((r) => r.status),
  ]);
  note(info === 404 && manifest === 404, `${id} → nothing behind it to scan against (${info}, ${manifest})`);
}

// The preview's front door says the same thing in words, rather than listing a
// scanner that would answer "unknown partner".
await venue.goto(`${BASE}preview`, { waitUntil: 'networkidle' });
const frontDoor = await venue.evaluate(() => ({
  scanners: document.querySelectorAll('a[href*="/partner/"]').length,
  text: document.body.innerText.replace(/\s+/g, ' '),
}));
note(frontDoor.scanners === 0, `the preview index lists no venue scanner (${frontDoor.scanners})`);
note(/Nessun partner ha ancora un accordo confermato/.test(frontDoor.text), 'and says why, in words');

await venue.goto(`${BASE}validate-card?c=ZZZZZZ&k=ZZZZZZ`, { waitUntil: 'networkidle' });
await venue.waitForTimeout(900);
note((await venue.getAttribute('#verdict', 'data-tone')) === 'bad', 'an invented code is refused');
note(/CARD NOT VALID/.test(await venue.textContent('#verdict')), 'in the agreed words');
await venue.screenshot({ path: `${OUT}/partner-invalid-390.png` });
await venue.close();

/* ── Private Hair Service ─────────────────────────────────────────────── */
console.log('\n── private hair service ──');
await page.evaluate((key) => localStorage.removeItem(key), CART_KEY);
await page.goto(`${BASE}#/product/hair-service`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

note(await page.isVisible('.product-form'), 'the hair service opens');
const services = await page.locator('.chip--choice').count();
note(services === 6, `every bookable service is listed (${services})`);
const serviceText = await page.textContent('.product-form');
note(!/cerimonia|ceremony/i.test(serviceText), 'the ceremony styling is not shown at all');
// Colour is absent from the choices; the terms do mention it, to say it is not
// available, which is the point.
const serviceLabels = await page.locator('.chip--choice').allTextContents();
note(!serviceLabels.some((label) => /colore|colour|highlight|balayage/i.test(label)),
  'no colour service is offered');
// Every `.terms` paragraph, not the first one: the sheet now opens its small print
// with the cancellation policy, and the prose this is looking for is below it.
const serviceTerms = (await page.locator('.terms').allTextContents()).join(' ');
note(/non sono al momento disponibili|are not available at the moment/i.test(serviceTerms),
  'and the terms say so plainly');

const dayOptions = await page.locator('select[name="date"] option').count();
note(dayOptions > 1, `only days the professional is free are offered (${dayOptions - 1})`);
note(await page.locator('select[name="time"]').isDisabled(), 'the time cannot be picked before the day');

// Chosen by value, not by label: this browser runs in English.
await page.check('input[name="variantId"][value="women-cut-blow"]', { force: true });
await page.selectOption('select[name="date"]', { index: 1 });
await page.waitForTimeout(900);
const timeOptions = await page.locator('select[name="time"] option').count();
note(timeOptions > 1, `times appear once a day is chosen (${timeOptions - 1})`);

await page.selectOption('select[name="time"]', { index: 1 });
await page.fill('input[name="room"]', ROOM);
await page.fill('input[name="field:guestName"]', 'Jacopo Lunardi');
await page.fill('input[name="field:phone"]', '+39 392 472 5263');
await page.waitForTimeout(500);
const hairSummary = await page.textContent('[data-summary]');
note(/95/.test(hairSummary), `the price follows the service (${hairSummary.replace(/\s+/g, ' ').trim().slice(0, 36)})`);
await page.screenshot({ path: `${OUT}/hair-390.png` });

await page.click('[data-add]');
await page.waitForTimeout(700);
note(await page.isVisible('.cart-line'), 'it goes in the basket');
await page.fill('input[name="name"]', 'Jacopo Lunardi');
await page.fill('input[name="email"]', 'jacopo@example.com');
await page.click('.checkout-form button[type="submit"]');
await page.waitForURL(/mock-checkout/, { timeout: 8000 });
await page.click('[data-pay]');
await page.waitForURL(/#\/order\//, { timeout: 8000 });
await page.waitForTimeout(900);
note(/pagato|paid/i.test(await page.textContent('.status-pill')), 'the booking is paid');
note(/Hair Service/i.test(await page.textContent('.sheet__body')), 'the order names the service');
await page.screenshot({ path: `${OUT}/hair-order-390.png` });

note(errors.length === 0, `no page errors during interaction (${errors.slice(0, 2).join(' | ') || 'none'})`);

/* ── With no commerce server behind it ────────────────────────────────── */
{
  const offline = await browser.newContext({ ...devices['iPhone 13'] });
  const shop = await offline.newPage();
  const errs = [];
  shop.on('pageerror', (e) => errs.push(String(e)));
  // The guide is served as static files from GitHub Pages with no API behind it.
  // It has to stay useful: a guest looking for the Wi-Fi password should not pay
  // for a shop they did not open.
  await shop.route('**/api/**', (route) => route.abort());

  console.log('\n── no commerce server ──');
  await shop.goto(BASE, { waitUntil: 'domcontentloaded' });
  await shop.waitForTimeout(1500);

  note((await shop.locator('.card').count()) > 10, 'the guide still renders in full');
  note((await shop.locator('.quick .quick__item').count()) === 4, 'quick actions are there');
  note((await shop.locator('[data-shop]').count()) === 0, 'the extras teaser stays out of the way');
  note(await shop.locator('#cart-button').isHidden(), 'the cart button is hidden');

  await shop.goto(`${BASE}#/shop`, { waitUntil: 'domcontentloaded' });
  await shop.waitForTimeout(900);
  const explained = await shop.textContent('.section__blurb').catch(() => '');
  note(/non sono raggiungibili|not reachable/i.test(explained), 'the shop explains itself and points at a person');
  note(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ') || 'none'})`);
  await offline.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL COMMERCE CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
