/**
 * Pricing, cut-offs and the cart.
 *
 * The important ones are the tampering tests. A browser can send anything it
 * likes, so the contract worth proving is that nothing it sends about money is
 * ever read: the server derives the SKU from its own catalogue and prices it
 * there.
 *
 * Bella Vigna runs LunArt's catalogue at LunArt's figures, and none of those
 * figures is confirmed for Bella Vigna yet: each one is a `placeholder` whose
 * `source` names LunArt. So two different things are proved here, and kept apart:
 *
 *   - Bella Vigna's real state: a production server sells none of it, a preview
 *     (GUIDE_PREVIEW or ALLOW_PLACEHOLDER_PRICES) sells all of it;
 *   - the mechanics — cut-offs, surcharges, upgrades, baskets — exactly as LunArt
 *     runs them, under `confirmed()`, because the day the operator confirms a
 *     price they must simply work.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateLine, priceCart, sanitiseLine, cutoffFor, leadMinutesFor,
  getProduct, getVariant, skuFor, paymentModeFor,
} from '../commerce/ordering.js';
import {
  resolvePrice, isSellable, applyPriceOverrides, pricingGaps, PRICES, WINE_PRICE_OVERRIDES,
  CELEBRATION_UPGRADES,
} from '../commerce/prices.js';
import {
  WINES, getWine, leadTimeMinutesFor, curatedWines, leadMinutesForWineOrder, WINE_LEAD_TIME,
} from '../commerce/wine.js';
import { PRODUCTS } from '../commerce/catalog.js';
import {
  PARTNERS, activePartners, benefitPartners, activatingPartners, partnerView, validationPath,
  BENEFIT_KINDS, PARTNER_CATEGORIES,
} from '../commerce/partners.js';
import { propertyTimeToInstant, propertyDate, addDays, lastDayOf } from '../commerce/time.js';
import { COMMERCE_CATEGORIES } from '../commerce/schema.js';
import { asIfConfirmed, confirmAllAgreements, restoreAgreements } from './support/property.mjs';

const NOW = new Date('2026-10-03T08:00:00Z');     // 10:00 in Florence
const soon = (days) => addDays(propertyDate(NOW), days);

/** A Bella Vigna room. A line only needs one to be named; which one is not priced. */
const ROOM = 'Deluxe';

const line = (over = {}) => ({
  productId: 'wine-in-room', variantId: 'brunello', quantity: 1,
  date: soon(3), slotId: 'w-1900', room: ROOM, ...over,
});

/** The Brunello, at LunArt's in-room price, which Bella Vigna carries as a placeholder. */
const BRUNELLO = 8900;

/**
 * A test body run as if the operator had confirmed LunArt's terms for Bella Vigna:
 * every placeholder price confirmed, every partner agreement in force. Put back
 * afterwards, pass or fail, so no other test ever sees a price nobody confirmed.
 */
const confirmed = (body) => async (t) => {
  const restore = asIfConfirmed();
  try {
    return await body(t);
  } finally {
    restore();
  }
};

/**
 * The config module reads the environment once, at import, so each reading of it
 * is a fresh import with the variables set, and the variables are put back after.
 * This is how the production and preview servers would actually be configured.
 */
async function settingsUnder(vars) {
  const before = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    const { config } = await import(`../server/config.js?commerce=${Math.random()}`);
    return config;
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Every SKU whose figure came from LunArt, by its own `source`, wines included. */
const lunartSourced = () => [
  ...Object.entries(PRICES)
    .filter(([, entry]) => /LunArt/.test(entry.source ?? ''))
    .map(([sku]) => sku),
  ...Object.entries(WINE_PRICE_OVERRIDES)
    .filter(([, entry]) => /LunArt/.test(entry.source ?? ''))
    .map(([id]) => `wine:${id}`),
];

/* ── Prices ──────────────────────────────────────────────────────────────── */

/** What LunArt confirmed for itself, and what Bella Vigna starts from. */
const LUNART_FIGURES = {
  'transfer-airport': 9000,
  'transfer-airport:oversized': 1500,
  'privilege-card:2d': 1500,
  'privilege-card:5d': 2500,
  'privilege-card:8d': 3500,
  'hair-service:men-cut': 4900,
  'hair-service:men-beard': 3500,
  'hair-service:men-cut-beard': 6900,
  'hair-service:women-blowdry': 7900,
  'hair-service:women-cut-blow': 9500,
  'hair-service:women-evening': 8900,
  'light-breakfast': 4900,
  'brunch:opera': 6900,
  'brunch:mare': 6900,
  'luggage-transfer:smn': 5000,
  'luggage-transfer:centro': 6000,
  'luggage-transfer:airport': 9000,
  'luggage-transfer:comune': 10000,
  'luggage-transfer:oversized': 1500,
  'celebration:romantic': 12900,
  'celebration:signature': 21900,
  'celebration:champagne': 27900,
};

test('every LunArt figure is carried at its amount, as a placeholder that says where it came from', () => {
  for (const [sku, amount] of Object.entries(LUNART_FIGURES)) {
    const price = resolvePrice(sku);
    assert.equal(price.amount, amount, sku);
    assert.equal(price.status, 'placeholder', `${sku} is not confirmed for Bella Vigna`);
    assert.match(price.source, /LunArt/, `${sku} names its provenance`);
    assert.equal(isSellable(sku), false, `${sku} must not sell on a production server`);
    assert.equal(isSellable(sku, { allowPlaceholders: true }), true, `${sku} sells in the preview`);
  }
});

test('a figure that still names LunArt as its source is never marked confirmed', () => {
  // Confirming a price for Bella Vigna is one word in `commerce/prices.js`, and the
  // provenance goes with it. A line reading "confirmed" with LunArt's name still on
  // it would be a price nobody at Bella Vigna actually agreed.
  const skus = lunartSourced();
  assert.ok(skus.length >= Object.keys(LUNART_FIGURES).length + curatedWines().length,
    'the whole catalogue and the whole wine list came from LunArt');
  for (const sku of skus) {
    assert.equal(resolvePrice(sku).status, 'placeholder', sku);
  }
  // Every figure in the list above is one of them.
  for (const sku of Object.keys(LUNART_FIGURES)) assert.ok(skus.includes(sku), sku);
});

test('production settings refuse every LunArt-sourced price, and a preview allows them', async () => {
  const skus = lunartSourced();
  // The champagne upgrades are not written down: they are derived from two of the
  // bottles above, so they inherit their status.
  const upgrades = Object.values(CELEBRATION_UPGRADES).flat().map((id) => `celebration:upgrade-${id}`);

  const production = await settingsUnder({
    NODE_ENV: 'production', GUIDE_PREVIEW: '', ALLOW_PLACEHOLDER_PRICES: '',
  });
  assert.equal(production.mode, 'production');
  assert.equal(production.allowPlaceholderPrices, false, 'off unless somebody asks for it');
  for (const sku of [...skus, ...upgrades]) {
    assert.equal(isSellable(sku, { allowPlaceholders: production.allowPlaceholderPrices }), false,
      `${sku} would be charged on a production server`);
  }

  // The two ways a staging server is told to walk every purchase with test money.
  for (const vars of [{ GUIDE_PREVIEW: '1' }, { GUIDE_PREVIEW: '', ALLOW_PLACEHOLDER_PRICES: '1' }]) {
    const staging = await settingsUnder(vars);
    assert.equal(staging.allowPlaceholderPrices, true, JSON.stringify(vars));
    for (const sku of [...skus, ...upgrades]) {
      assert.equal(isSellable(sku, { allowPlaceholders: staging.allowPlaceholderPrices }), true,
        `${sku} under ${JSON.stringify(vars)}`);
    }
  }

  // And LunArt's own variable names are not read at all: a Bella Vigna service set
  // up by copying LunArt's environment stays a production server.
  const copied = await settingsUnder({ GUIDE_PREVIEW: '', ALLOW_PLACEHOLDER_PRICES: '', LUNART_PREVIEW: '1' });
  assert.equal(copied.allowPlaceholderPrices, false, 'LUNART_PREVIEW is not GUIDE_PREVIEW');
});

test('confirmed, LunArt’s figures sell on a production server at exactly those amounts', confirmed(() => {
  for (const [sku, amount] of Object.entries(LUNART_FIGURES)) {
    const price = resolvePrice(sku);
    assert.equal(price.amount, amount, sku);
    assert.equal(price.status, 'confirmed', sku);
    assert.ok(isSellable(sku), `${sku} should sell on a production server`);
  }
}));

test('the card ladder gets better value the longer it runs', () => {
  const perDay = (sku, days) => resolvePrice(sku).amount / days;
  assert.ok(perDay('privilege-card:5d', 5) < perDay('privilege-card:2d', 2));
  assert.ok(perDay('privilege-card:8d', 8) < perDay('privilege-card:5d', 5));
});

test('a haircut and a beard together cost less than the two apart', () => {
  const apart = resolvePrice('hair-service:men-cut').amount + resolvePrice('hair-service:men-beard').amount;
  assert.ok(resolvePrice('hair-service:men-cut-beard').amount < apart, `${apart} should beat the combined price`);
});

test('an unconfirmed price never sells on a production server', () => {
  // A bottle LunArt has not set a selling price for falls back to the carta figure,
  // which is somebody else's number and is refused on its own.
  assert.equal(resolvePrice('wine:morellino').status, 'placeholder');
  assert.equal(isSellable('wine:morellino'), false, 'placeholder refused by default');
  assert.equal(isSellable('wine:morellino', { allowPlaceholders: true }), true, 'allowed when asked for');
});

test('a price nobody has set never sells, however the server is configured', () => {
  // Colour and highlights are not offered at all; ceremony styling waits on the
  // provider, so it renders and says so rather than being quietly buyable.
  for (const sku of ['sunrise-breakfast', 'chianti-experience', 'hair-service:ceremony']) {
    assert.equal(resolvePrice(sku).status, 'to-configure', sku);
    assert.equal(isSellable(sku), false, sku);
    assert.equal(isSellable(sku, { allowPlaceholders: true }), false, `${sku} with placeholders`);
  }
});

test('a bottle LunArt has priced carries that price, and the rest fall back to the carta', () => {
  for (const bottle of WINES) {
    const price = resolvePrice(`wine:${bottle.id}`);
    const own = WINE_PRICE_OVERRIDES[bottle.id];
    // Unconfirmed either way: LunArt's selling price is not yet Bella Vigna's, and
    // the carta figure is nobody's selling price at all.
    assert.equal(price.status, 'placeholder', bottle.name);
    if (own) {
      assert.equal(price.amount, own.amount, bottle.name);
      assert.match(price.source, /LunArt/, bottle.name);
    } else {
      assert.equal(price.amount, bottle.sourcePrice, bottle.name);
      assert.match(price.source, /carta/, bottle.name);
    }
  }
});

test('confirming LunArt’s figures confirms the bottles LunArt priced, and no carta figure', confirmed(() => {
  for (const bottle of WINES) {
    const price = resolvePrice(`wine:${bottle.id}`);
    if (WINE_PRICE_OVERRIDES[bottle.id]) {
      assert.equal(price.status, 'confirmed', bottle.name);
      assert.equal(price.amount, WINE_PRICE_OVERRIDES[bottle.id].amount, bottle.name);
    } else {
      assert.equal(price.status, 'placeholder', `${bottle.name} has only the carta figure`);
    }
  }
}));

test('every bottle on the guide’s list carries LunArt’s price, and sells only in the preview', () => {
  for (const bottle of curatedWines()) {
    const sku = `wine:${bottle.id}`;
    assert.ok(WINE_PRICE_OVERRIDES[bottle.id], `${bottle.name} is offered without a selling price of its own`);
    assert.equal(resolvePrice(sku).status, 'placeholder', bottle.name);
    assert.equal(isSellable(sku), false, `${bottle.name} must not sell in production yet`);
    assert.equal(isSellable(sku, { allowPlaceholders: true }), true, bottle.name);
  }
});

test('confirmed, every bottle on the guide’s list sells on a production server', confirmed(() => {
  for (const bottle of curatedWines()) {
    const price = resolvePrice(`wine:${bottle.id}`);
    assert.equal(price.status, 'confirmed', `${bottle.name} is offered without a confirmed price`);
    assert.ok(isSellable(`wine:${bottle.id}`), bottle.name);
  }
}));

test('the champagne upgrade is the difference between the bottles, not a typed-in number', () => {
  const moet = resolvePrice('wine:moet-chandon').amount;
  const ruinart = resolvePrice('wine:ruinart-bdb').amount;
  const dom = resolvePrice('wine:dom-perignon').amount;
  assert.equal(resolvePrice('celebration:upgrade-ruinart-bdb').amount, ruinart - moet);
  assert.equal(resolvePrice('celebration:upgrade-dom-perignon').amount, dom - moet);
  // Derived from two unconfirmed bottles, the upgrade is unconfirmed too.
  assert.equal(resolvePrice('celebration:upgrade-dom-perignon').status, 'placeholder');

  // Move the wine price and the upgrade moves with it.
  applyPriceOverrides({ 'wine:ruinart-bdb': { amount: 40000, status: 'confirmed' } });
  assert.equal(resolvePrice('celebration:upgrade-ruinart-bdb').amount, 40000 - moet);
  // Confirming one of the two bottles is not confirming the difference.
  assert.equal(resolvePrice('celebration:upgrade-ruinart-bdb').status, 'placeholder',
    'the Moët it is measured against is still a placeholder');
  applyPriceOverrides({});
});

test('an unknown SKU resolves rather than throwing', () => {
  const price = resolvePrice('nonsense:sku');
  assert.equal(price.amount, null);
  assert.equal(price.missing, true);
});

test('everything still waiting on a decision is listed', () => {
  const gaps = pricingGaps();
  assert.ok(gaps.length > 0);
  assert.ok(gaps.every((gap) => gap.status !== 'confirmed'));
  assert.ok(gaps.some((gap) => gap.sku === 'hair-service:ceremony'));

  // The card has an amount — LunArt's — and is still waiting, because nobody has
  // confirmed that amount for Bella Vigna. The review screen shows both facts.
  for (const variant of ['2d', '5d', '8d']) {
    const gap = gaps.find((entry) => entry.sku === `privilege-card:${variant}`);
    assert.ok(gap, `privilege-card:${variant} is waiting on a decision`);
    assert.equal(gap.status, 'placeholder');
    assert.equal(typeof gap.amount, 'number', 'with the figure it would sell at');
    assert.match(gap.source, /LunArt/, 'and where that figure came from');
  }
  // As is every other figure carried over from LunArt.
  for (const sku of lunartSourced()) {
    assert.ok(gaps.some((gap) => gap.sku === sku), `${sku} is missing from the review`);
  }
});

/* ── The client cannot name a price ──────────────────────────────────────── */

test('anything resembling money is dropped on the way in', () => {
  const clean = sanitiseLine({
    productId: 'wine-in-room', variantId: 'brunello', quantity: 1,
    amount: 1, price: 1, unit_amount: 1, total: 1, sku: 'transfer-airport', currency: 'XXX',
  });
  for (const key of ['amount', 'price', 'unit_amount', 'total', 'sku', 'currency']) {
    assert.equal(key in clean, false, `${key} should not survive sanitising`);
  }
});

test('a tampered amount changes nothing about what is charged', () => {
  const honest = validateLine(line(), { now: NOW, allowPlaceholders: true });
  const tampered = validateLine({ ...line(), amount: 1, price: 1, total: 1 }, { now: NOW, allowPlaceholders: true });
  assert.equal(honest.amount, BRUNELLO);
  assert.equal(tampered.amount, BRUNELLO, 'the server priced it from the catalogue');
});

test('a tampered SKU cannot buy a cheap thing at another price', () => {
  // Claiming the privilege card's SKU on a wine line must not change either.
  const result = validateLine({ ...line(), sku: 'privilege-card:2d' }, { now: NOW, allowPlaceholders: true });
  assert.equal(result.line.sku, 'wine:brunello');
  assert.equal(result.amount, BRUNELLO);
});

test('quantity is clamped to what the product allows', () => {
  const tooMany = validateLine(line({ quantity: 99 }), { now: NOW, allowPlaceholders: true });
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.errors.some((e) => e.code === 'quantity-out-of-range'));
  assert.equal(tooMany.amount, 0, 'a refused line is worth nothing');

  const negative = validateLine(line({ quantity: -5 }), { now: NOW, allowPlaceholders: true });
  assert.equal(negative.ok, false);
  assert.equal(negative.amount, 0);
});

test('a refused line never contributes to a total', () => {
  const cart = priceCart([line(), line({ date: '2020-01-01' })], { now: NOW, allowPlaceholders: true });
  assert.equal(cart.ok, false);
  assert.equal(cart.total, BRUNELLO, 'only the good line counts');
});

/* ── Cut-offs ────────────────────────────────────────────────────────────── */

test('a wine order under EUR 90 needs twelve hours', () => {
  assert.equal(leadMinutesForWineOrder(0), 720);
  assert.equal(leadMinutesForWineOrder(WINE_LEAD_TIME.expressThreshold - 1), 720);

  const product = getProduct('wine-in-room');
  const variant = getVariant(product, 'vermentino');          // 43 EUR
  const { deadline, minutes } = cutoffFor(product, variant, { date: '2026-10-05', slotId: 'w-1900' }, { wineSubtotal: 4300 });
  assert.equal(minutes, 720);
  // Counted back from the end of the 19:00–20:00 window, in Florence time.
  assert.equal(
    deadline.toISOString(),
    new Date(propertyTimeToInstant('2026-10-05', '20:00').getTime() - 720 * 60_000).toISOString(),
  );
});

test('a wine order of EUR 90 or more is Express at ninety minutes', () => {
  assert.equal(leadMinutesForWineOrder(WINE_LEAD_TIME.expressThreshold), 90);
  assert.equal(leadMinutesForWineOrder(20000), 90);

  const product = getProduct('wine-in-room');
  const variant = getVariant(product, 'brunello');            // 89 EUR on its own
  const { minutes } = cutoffFor(product, variant, { date: '2026-10-05', slotId: 'w-2000' }, { wineSubtotal: BRUNELLO });
  assert.equal(minutes, 720, 'one Brunello is 89 EUR, which is not Express');

  const express = cutoffFor(product, variant, { date: '2026-10-05', slotId: 'w-2000' }, { wineSubtotal: 9000 });
  assert.equal(express.minutes, 90);
});

test('the rule is about the order, so two bottles together can be Express', () => {
  const two = priceCart([line({ variantId: 'vermentino' }), line({ variantId: 'vernaccia' })], { now: NOW });
  assert.equal(two.wineSubtotal, 4300 + 5900);
  assert.ok(two.wineSubtotal >= 9000, 'together they pass the threshold');
  for (const priced of two.lines) assert.equal(priced.cutoff.minutes, 90);

  const one = priceCart([line({ variantId: 'vermentino' })], { now: NOW });
  assert.equal(one.lines[0].cutoff.minutes, 720, 'alone it does not');
});

test('the last Express order for the same evening is 19:30', () => {
  const product = getProduct('wine-in-room');
  const lastSlot = product.deliverySlots.at(-1);
  assert.equal(lastSlot.from, '20:00');
  assert.equal(lastSlot.to, '21:00', 'wine goes up until nine');

  const { deadline } = cutoffFor(product, getVariant(product, 'brunello'),
    { date: '2026-10-05', slotId: lastSlot.id }, { wineSubtotal: 12000 });
  assert.equal(deadline.toISOString(), propertyTimeToInstant('2026-10-05', '19:30').toISOString());
});

test('wine is delivered between eleven and nine, and nowhere else', () => {
  const slots = getProduct('wine-in-room').deliverySlots;
  assert.equal(slots[0].from, '11:00');
  assert.equal(slots.at(-1).to, '21:00');
  for (const slot of slots) {
    assert.ok(slot.from >= '11:00' && slot.to <= '21:00', slot.id);
  }
});

test('a bottle can still state its own notice, whatever the order is worth', () => {
  // The order-total rule is the commercial default. A bottle kept off site has a
  // physical constraint, and that beats the default in either direction.
  assert.equal(leadTimeMinutesFor({ id: 'x', sourcePrice: 3000, leadTimeMinutes: 2880 }), 2880);
  assert.equal(leadTimeMinutesFor({ id: 'y', sourcePrice: 50000 }), null, 'no opinion of its own');

  const product = getProduct('wine-in-room');
  assert.equal(leadMinutesFor(product, { id: 'z', leadTimeMinutes: 15 }, product.cutoff, { wineSubtotal: 0 }), 15);
});

test('ordering a bottle too late is refused', confirmed(() => {
  const now = new Date('2026-10-05T16:00:00Z');      // 18:00 in Florence
  // One Vermentino: 43 EUR, so twelve hours, so this evening is long gone.
  const late = priceCart(
    [{ productId: 'wine-in-room', variantId: 'vermentino', quantity: 1, date: '2026-10-05', slotId: 'w-1900', room: ROOM }],
    { now },
  );
  assert.equal(late.ok, false);
  assert.ok(late.errors.some((e) => e.code === 'past-cutoff'));

  // A basket over ninety euros is Express, and the ten o'clock window is still open.
  const inTime = priceCart(
    [{ productId: 'wine-in-room', variantId: 'dom-perignon', quantity: 1, date: '2026-10-05', slotId: 'w-2000', room: ROOM }],
    { now },
  );
  assert.equal(inTime.ok, true, JSON.stringify(inTime.errors));
}));

test('breakfast closes at noon the day before, Florence time', confirmed(() => {
  const product = getProduct('brunch');
  const { deadline, kind } = cutoffFor(product, null, { date: '2026-10-06' });
  assert.equal(kind, 'dayBefore');
  assert.equal(deadline.toISOString(), propertyTimeToInstant('2026-10-05', '12:00').toISOString());

  const base = { productId: 'brunch', variantId: 'opera', quantity: 1, date: '2026-10-06', slotId: 'b-0900', room: ROOM, options: { hotDrink: 'espresso' } };
  const justInTime = validateLine(base, { now: new Date('2026-10-05T09:59:00Z') });   // 11:59 local
  const tooLate   = validateLine(base, { now: new Date('2026-10-05T10:01:00Z') });   // 12:01 local
  assert.equal(justInTime.ok, true, JSON.stringify(justInTime.errors));
  assert.equal(tooLate.ok, false);
  assert.ok(tooLate.errors.some((e) => e.code === 'past-cutoff'));
}));

test('the light breakfast is two bowls and a juice, and brings no hot drink', confirmed(() => {
  const product = getProduct('light-breakfast');
  assert.equal(resolvePrice('light-breakfast').amount, 4900);
  assert.equal(product.maxGuests, 2);
  assert.equal((product.options ?? []).some((o) => o.id === 'hotDrink'), false,
    'the room has a Nespresso machine and a kettle');
  assert.ok(product.includes.it.some((item) => /special bowl/i.test(item)));
  assert.ok(product.includes.en.some((item) => /juice/i.test(item)));
  // And it can still be bought by noon the day before.
  const ok = validateLine({
    productId: 'light-breakfast', quantity: 1, date: '2026-10-06', slotId: 'b-0900', room: ROOM,
  }, { now: new Date('2026-10-05T09:00:00Z') });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.equal(ok.amount, 4900);
}));

test('the deadline is a wall clock in Florence, not UTC', () => {
  // Summer and winter give different instants for the same stated hour.
  const winter = cutoffFor(getProduct('brunch'), null, { date: '2026-01-16' }).deadline;
  const summer = cutoffFor(getProduct('brunch'), null, { date: '2026-07-16' }).deadline;
  assert.equal(winter.toISOString(), '2026-01-15T11:00:00.000Z');
  assert.equal(summer.toISOString(), '2026-07-15T10:00:00.000Z');
});

/* ── Validation of everything else a line needs ──────────────────────────── */

test('a line is checked for all of its requirements at once', () => {
  const bare = validateLine({ productId: 'brunch', quantity: 1 }, { now: NOW, allowPlaceholders: true });
  const codes = bare.errors.map((e) => e.code);
  assert.ok(codes.includes('variant-required'));
  assert.ok(codes.includes('date-required'));
  assert.ok(codes.includes('slot-required'));
  assert.ok(codes.includes('room-required'));
  assert.ok(codes.includes('option-required'));
});

test('an option that is not on the menu is refused', () => {
  const result = validateLine({
    productId: 'brunch', variantId: 'opera', quantity: 1, date: soon(2),
    slotId: 'b-0900', room: ROOM, options: { hotDrink: 'champagne' },
  }, { now: NOW, allowPlaceholders: true });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === 'option-invalid'));
});

const transferFields = (over = {}) => ({
  passengerName: 'Jacopo', passengers: '2',
  largeSuitcases: '2', trolleys: '2', personalBags: '2', phone: '+39392', ...over,
});

test('the transfer needs the details a driver actually needs', confirmed(() => {
  const missing = validateLine({
    productId: 'transfer-airport', variantId: 'to-airport', quantity: 1, date: soon(5), time: '09:30',
  }, { now: NOW });
  const fields = missing.errors.filter((e) => e.code === 'field-required').map((e) => e.field);
  assert.deepEqual(fields.sort(), ['largeSuitcases', 'passengerName', 'passengers', 'personalBags', 'phone', 'trolleys']);

  const complete = validateLine({
    productId: 'transfer-airport', variantId: 'to-airport', quantity: 1, date: soon(5), time: '09:30',
    fields: transferFields(),
  }, { now: NOW });
  assert.equal(complete.ok, true, JSON.stringify(complete.errors));
  assert.equal(complete.amount, 9000);
}));

test('the transfer carries five passengers at most', () => {
  const field = getProduct('transfer-airport').requiresFields.find((f) => f.id === 'passengers');
  assert.equal(field.max, 5);
  const six = validateLine({
    productId: 'transfer-airport', variantId: 'to-airport', quantity: 1, date: soon(5), time: '09:30',
    fields: transferFields({ passengers: '6' }),
  }, { now: NOW });
  assert.equal(six.ok, false);
  assert.ok(six.errors.some((e) => e.code === 'field-out-of-range' && e.field === 'passengers'));
});

test('an oversized case is fifteen euros, and the client only says how many', confirmed(() => {
  const one = validateLine({
    productId: 'transfer-airport', variantId: 'to-airport', quantity: 1, date: soon(5), time: '09:30',
    fields: transferFields({ oversizedItems: '1' }),
  }, { now: NOW });
  assert.equal(one.ok, true, JSON.stringify(one.errors));
  assert.equal(one.amount, 9000 + 1500);

  const two = validateLine({
    productId: 'transfer-airport', variantId: 'to-airport', quantity: 1, date: soon(5), time: '09:30',
    fields: transferFields({ oversizedItems: '2' }),
  }, { now: NOW });
  assert.equal(two.amount, 9000 + 3000);
  assert.equal(two.surcharges[0].sku, 'transfer-airport:oversized');
  assert.equal(two.surcharges[0].unit, 1500, 'the price came from the table, not the payload');
}));

test('a number field outside its range is refused', () => {
  const result = validateLine({
    productId: 'transfer-airport', variantId: 'to-airport', quantity: 1, date: soon(5), time: '09:30',
    fields: transferFields({ passengers: '40' }),
  }, { now: NOW });
  assert.ok(result.errors.some((e) => e.code === 'field-out-of-range' && e.field === 'passengers'));
});

/* ── Luggage transfer ────────────────────────────────────────────────────── */

test('the luggage transfer is priced by where it goes', confirmed(() => {
  const expected = { smn: 5000, centro: 6000, airport: 9000, comune: 10000 };
  for (const [variantId, amount] of Object.entries(expected)) {
    const result = validateLine({
      productId: 'luggage-transfer', variantId, quantity: 1, date: soon(3), time: '10:00', room: ROOM,
      fields: { contactName: 'Marta', address: 'Via dei Neri 4', largeSuitcases: '2', trolleys: '1', personalBags: '1', phone: '+39348' },
    }, { now: NOW });
    assert.equal(result.ok, true, `${variantId}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.amount, amount, variantId);
  }
}));

test('the luggage transfer closes at noon the day before and charges for oversized items', confirmed(() => {
  const product = getProduct('luggage-transfer');
  assert.deepEqual(product.cutoff, { kind: 'dayBefore', hour: 12 });

  const withExtra = validateLine({
    productId: 'luggage-transfer', variantId: 'airport', quantity: 1, date: '2026-10-06', time: '09:00', room: ROOM,
    fields: { contactName: 'Marta', address: 'Aeroporto', largeSuitcases: '3', trolleys: '2', personalBags: '2', oversizedItems: '2', phone: '+39348' },
  }, { now: new Date('2026-10-05T09:00:00Z') });
  assert.equal(withExtra.ok, true, JSON.stringify(withExtra.errors));
  assert.equal(withExtra.amount, 9000 + 3000);

  const tooLate = validateLine({
    productId: 'luggage-transfer', variantId: 'airport', quantity: 1, date: '2026-10-06', time: '09:00', room: ROOM,
    fields: { contactName: 'Marta', address: 'Aeroporto', largeSuitcases: '1', trolleys: '0', personalBags: '0', phone: '+39348' },
  }, { now: new Date('2026-10-05T10:30:00Z') });
  assert.equal(tooLate.ok, false);
  assert.ok(tooLate.errors.some((e) => e.code === 'past-cutoff'));
}));

/* ── Romantic and celebration ────────────────────────────────────────────── */

const celebration = (over = {}) => ({
  productId: 'celebration', variantId: 'romantic', quantity: 1, date: soon(3), room: ROOM,
  options: { when: 'arrival', bottle: 'prosecco-cuvee' }, ...over,
});

test('the three celebration tiers are priced from the table, once confirmed', confirmed(() => {
  assert.equal(validateLine(celebration(), { now: NOW }).amount, 12900);
  assert.equal(validateLine(celebration({
    variantId: 'signature', options: { when: 'arrival', bottle: 'franciacorta-saten' },
  }), { now: NOW }).amount, 21900);
  assert.equal(validateLine(celebration({
    variantId: 'champagne', options: { when: 'arrival', bottle: 'moet-chandon' },
  }), { now: NOW }).amount, 27900);
}));

test('a tier only offers the bottles it comes with', () => {
  // The Brunello is a real choice on the Signature tier, and not on the Romantic one.
  const wrong = validateLine(celebration({ options: { when: 'arrival', bottle: 'brunello' } }), { now: NOW });
  assert.equal(wrong.ok, false);
  assert.ok(wrong.errors.some((e) => e.code === 'option-not-available' && e.field === 'bottle'));

  // And a bottle that is on no tier's list is simply not a choice at all.
  const unknown = validateLine(celebration({ options: { when: 'arrival', bottle: 'dom-perignon' } }), { now: NOW });
  assert.ok(unknown.errors.some((e) => e.code === 'option-invalid' && e.field === 'bottle'));
});

test('the champagne upgrade costs the difference between the bottles', confirmed(() => {
  const upgraded = validateLine(celebration({
    variantId: 'champagne',
    options: { when: 'arrival', bottle: 'moet-chandon', upgrade: 'dom-perignon' },
  }), { now: NOW });
  assert.equal(upgraded.ok, true, JSON.stringify(upgraded.errors));
  const difference = resolvePrice('wine:dom-perignon').amount - resolvePrice('wine:moet-chandon').amount;
  assert.equal(upgraded.amount, 27900 + difference);
}));

test('a set-up during the stay needs a time, one before arrival does not', confirmed(() => {
  const during = validateLine(celebration({ options: { when: 'during', bottle: 'prosecco-cuvee' } }), { now: NOW });
  assert.equal(during.ok, false);
  assert.ok(during.errors.some((e) => e.code === 'slot-required'));

  const timed = validateLine(celebration({
    options: { when: 'during', bottle: 'prosecco-cuvee' }, slotId: 'c-1930',
  }), { now: NOW });
  assert.equal(timed.ok, true, JSON.stringify(timed.errors));

  const onArrival = validateLine(celebration(), { now: NOW });
  assert.equal(onArrival.ok, true, JSON.stringify(onArrival.errors));
}));

test('a requested set-up time runs from noon to nine, in half hours', () => {
  const slots = getProduct('celebration').deliverySlots;
  assert.equal(slots[0].from, '12:00');
  assert.equal(slots.at(-1).to, '21:00');
  assert.equal(slots.length, 18);
});

test('a celebration closes at noon the day before', confirmed(() => {
  const inTime = validateLine(celebration({ date: '2026-10-06' }), { now: new Date('2026-10-05T09:00:00Z') });
  const late = validateLine(celebration({ date: '2026-10-06' }), { now: new Date('2026-10-05T11:00:00Z') });
  assert.equal(inTime.ok, true, JSON.stringify(inTime.errors));
  assert.equal(late.ok, false);
  assert.ok(late.errors.some((e) => e.code === 'past-cutoff'));
}));

/* ── Bella Vigna, before anything is confirmed ───────────────────────────── */

/**
 * The same lines the tests above buy, as Bella Vigna's own servers see them today.
 *
 * Every one of them is complete and in time, so the only thing wrong with it is
 * the price — which is exactly the point: production refuses it for that reason
 * alone, and a preview sells it at LunArt's figure. If a line were refused for
 * anything else here, the gate would be hiding a real fault behind the price.
 */
test('on Bella Vigna’s production settings a complete, timely line is refused for its price alone', () => {
  const PRICE_ONLY = new Set(['price-not-confirmed', 'surcharge-not-priced']);
  const cases = [
    [line(), BRUNELLO],
    [{ productId: 'brunch', variantId: 'opera', quantity: 1, date: soon(2), slotId: 'b-0900', room: ROOM, options: { hotDrink: 'espresso' } }, 6900],
    [{ productId: 'light-breakfast', quantity: 1, date: soon(2), slotId: 'b-0900', room: ROOM }, 4900],
    [{ productId: 'transfer-airport', variantId: 'to-airport', quantity: 1, date: soon(5), time: '09:30', fields: transferFields({ oversizedItems: '1' }) }, 9000 + 1500],
    [{ productId: 'luggage-transfer', variantId: 'smn', quantity: 1, date: soon(3), time: '10:00', room: ROOM,
      fields: { contactName: 'Marta', address: 'Via dei Neri 4', largeSuitcases: '1', trolleys: '0', personalBags: '0', phone: '+39348' } }, 5000],
    [celebration(), 12900],
  ];

  for (const [raw, amount] of cases) {
    const production = validateLine(raw, { now: NOW });
    const label = `${raw.productId}${raw.variantId ? `:${raw.variantId}` : ''}`;
    assert.equal(production.ok, false, `${label} sold on a production server`);
    assert.ok(production.errors.some((e) => e.code === 'price-not-confirmed'), label);
    assert.deepEqual(production.errors.filter((e) => !PRICE_ONLY.has(e.code)), [],
      `${label} is refused for something other than its price`);
    assert.equal(production.amount, 0, 'a refused line is worth nothing');

    const preview = validateLine(raw, { now: NOW, allowPlaceholders: true });
    assert.equal(preview.ok, true, `${label} in the preview: ${JSON.stringify(preview.errors)}`);
    assert.equal(preview.amount, amount, `${label} at LunArt's figure`);
  }
});

/**
 * Privilege is the one line with a second gate: no venue honours the card at Bella
 * Vigna yet, so the checkout refuses it even where placeholders are sold — the same
 * rule the catalogue uses to hide it, enforced where the money is decided. With an
 * agreement confirmed it falls back to the price gate like everything else.
 */
test('Privilege is refused at Bella Vigna for having no venue behind it, before its price is even asked', () => {
  const raw = { productId: 'privilege-card', variantId: '2d', quantity: 1, date: soon(1), fields: { holderName: 'Marta Venturi' } };
  for (const allowPlaceholders of [false, true]) {
    const result = validateLine(raw, { now: NOW, allowPlaceholders });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === 'not-on-sale' && e.reason === 'no-card-partner'), JSON.stringify(result.errors));
  }
  confirmAllAgreements();
  const restore = restoreAgreements;
  try {
    const production = validateLine(raw, { now: NOW });
    assert.deepEqual(production.errors.map((e) => e.code), ['price-not-confirmed']);
    const preview = validateLine(raw, { now: NOW, allowPlaceholders: true });
    assert.equal(preview.ok, true, JSON.stringify(preview.errors));
    assert.equal(preview.amount, 1500, 'at LunArt’s figure');
  } finally { restore(); }
});

test('things not on sale cannot be bought', () => {
  const coming = validateLine({ productId: 'chianti-experience', quantity: 1, date: soon(10) }, { now: NOW, allowPlaceholders: true });
  assert.equal(coming.ok, false);
  assert.ok(coming.errors.some((e) => e.code === 'not-on-sale'));

  const onRequest = validateLine({ productId: 'sunrise-breakfast', quantity: 1, date: soon(3), room: ROOM }, { now: NOW, allowPlaceholders: true });
  assert.equal(onRequest.ok, false);
  assert.ok(onRequest.errors.some((e) => e.code === 'request-only'));
});

test('a coming-soon product is a word and nothing else', () => {
  const chianti = getProduct('chianti-experience');
  assert.equal(chianti.comingSoon, true);
  assert.equal(chianti.summary.it, '', 'no copy invented to fill the tile');
  assert.equal(chianti.description, undefined);
  assert.equal(resolvePrice('chianti-experience').amount, null);
});

/* ── Baskets ─────────────────────────────────────────────────────────────── */

test('a basket of several different things adds up', () => {
  const cart = priceCart([
    line(),                                                   // Brunello, 70
    line({ variantId: 'vermentino', slotId: 'w-2000' }),      // Vermentino, 34
    { productId: 'brunch', variantId: 'opera', quantity: 1, date: soon(2), slotId: 'b-0900', room: ROOM, options: { hotDrink: 'espresso' } },
  ], { now: NOW, allowPlaceholders: true });

  assert.equal(cart.ok, true, JSON.stringify(cart.errors));
  assert.equal(cart.lines.length, 3);
  assert.equal(cart.total, BRUNELLO + 4300 + 6900);
  assert.equal(cart.currency, 'EUR');
});

test('quantity multiplies', () => {
  const cart = priceCart([line({ quantity: 3 })], { now: NOW, allowPlaceholders: true });
  assert.equal(cart.total, BRUNELLO * 3);
});

test('an empty basket is not a valid one', () => {
  const cart = priceCart([], { now: NOW });
  assert.equal(cart.ok, false);
  assert.equal(cart.empty, true);
  assert.equal(cart.total, 0);
});

test('a basket holding the transfer is authorised rather than charged', () => {
  const withTransfer = priceCart([
    line(),
    { productId: 'transfer-airport', variantId: 'to-airport', quantity: 1, date: soon(5), time: '09:30',
      fields: { passengerName: 'J', passengers: '1', largeSuitcases: '1', trolleys: '0', personalBags: '1', phone: '+39' } },
  ], { now: NOW, allowPlaceholders: true });
  assert.equal(paymentModeFor(withTransfer.lines), 'authorize-then-capture');
  assert.equal(paymentModeFor(priceCart([line()], { now: NOW, allowPlaceholders: true }).lines), 'instant');
});

/* ── Catalogue integrity ─────────────────────────────────────────────────── */

test('every product is complete and bilingual', () => {
  const categories = new Set(COMMERCE_CATEGORIES.map((c) => c.id));
  for (const product of PRODUCTS) {
    // A coming-soon product is deliberately bare: a title, and nothing written to
    // make it look finished.
    const fields = product.comingSoon ? ['title'] : ['title', 'summary', 'description', 'terms'];
    for (const field of fields) {
      assert.ok(product[field]?.it?.trim(), `${product.id}.${field} is missing Italian`);
      assert.ok(product[field]?.en?.trim(), `${product.id}.${field} is missing English`);
    }
    assert.ok(categories.has(product.category), `${product.id} has an unknown category`);
    assert.ok(['always', 'cutoff', 'timeslots', 'manual-confirm', 'external', 'request'].includes(product.availabilityMode), product.id);
    assert.ok(['instant', 'authorize-then-capture', 'external-checkout', 'request-only'].includes(product.purchaseMode), product.id);
  }
});

test('every variant resolves to a SKU the pricing table knows about', () => {
  for (const product of PRODUCTS) {
    for (const variant of product.variants ?? []) {
      const sku = skuFor(product, variant);
      const price = resolvePrice(sku);
      assert.ok(!price.missing, `${sku} has no price entry at all`);
    }
  }
});

test('the wine selection is a subset of the carta, and on sale', () => {
  const curated = curatedWines();
  assert.equal(curated.length, 14, 'exactly the bottles LunArt has priced');
  // "On sale" is the bottle's own flag. Whether its price may be charged is the
  // price table's question, answered above.
  assert.ok(curated.length < WINES.length, 'curated, not the whole list');
  for (const bottle of curated) {
    assert.equal(bottle.available, true);
    assert.ok(WINES.includes(bottle));
  }
  // Taking a bottle off sale removes it from the selection without deleting it.
  const first = curated[0];
  first.available = false;
  assert.ok(!curatedWines().includes(first));
  first.available = true;
});

test('partner benefits are not assumed to be a house percentage', () => {
  const kinds = new Set(PARTNERS.flatMap((p) => p.benefits.map((b) => b.kind)));
  assert.ok(kinds.size >= 4, 'the model carries several shapes of benefit');
  const categories = new Set(Object.keys(PARTNER_CATEGORIES));
  for (const partner of PARTNERS) {
    assert.ok(partner.partner_id, 'every partner has an id');
    assert.ok(partner.name, `${partner.partner_id} has a name`);
    assert.ok(categories.has(partner.category), `${partner.partner_id} has a known category`);
    // A business in the network being set up has no benefit yet, by construction.
    assert.ok(Array.isArray(partner.benefits), `${partner.partner_id} keeps a benefits list`);
    for (const benefit of partner.benefits) {
      assert.ok(BENEFIT_KINDS.includes(benefit.kind), `${partner.partner_id}/${benefit.benefit_id}`);
      assert.ok(benefit.headline?.it && benefit.headline?.en, `${benefit.benefit_id} headline`);
    }
  }
  for (const partner of activePartners()) {
    assert.notEqual(partner.example, true, 'an example must never be active');
    // At Bella Vigna no agreement is confirmed yet, so no live venue promises
    // anything: the benefit shapes above belong to the model, not to a guest.
    assert.deepEqual(partner.benefits, [], `${partner.partner_id} promises a benefit nobody agreed for Bella Vigna`);
  }
  assert.equal(partnerView('example-bar'), null, 'inactive partners give nothing');
});

/** Every venue with a benefit has a scanner page, and every venue without one has none. */
function assertScannerPages() {
  for (const partner of benefitPartners()) {
    assert.equal(validationPath(partner.partner_id), `/partner/${partner.partner_id}`);
    const view = partnerView(partner.partner_id, 'https://guide.example');
    assert.equal(view.validation_url, `https://guide.example/partner/${partner.partner_id}`);
  }
  // A venue with no agreement for this property has no door to check a card against.
  for (const partner of activatingPartners()) {
    assert.equal(partnerView(partner.partner_id, 'https://guide.example').validation_url, null,
      partner.partner_id);
  }
}

test('at Bella Vigna no venue has a scanner page yet, because no agreement is confirmed', () => {
  assert.equal(benefitPartners().length, 0, 'nothing a venue could be asked to honour');
  assert.ok(activatingPartners().length > 0, 'the network is shown, in attivazione');
  assertScannerPages();
});

test('once agreements are confirmed, every partner with a benefit has its own scanner page, and no other does', () => {
  confirmAllAgreements();
  try {
    assert.ok(benefitPartners().length > 0, 'the agreements LunArt holds, as if they covered Bella Vigna');
    assertScannerPages();
  } finally {
    restoreAgreements();
  }
});

test('internal partner notes never reach a guest or a venue', () => {
  for (const partner of activePartners()) {
    const view = partnerView(partner.partner_id);
    assert.equal('notes' in view, false, partner.partner_id);
    assert.equal('verify' in view, false, partner.partner_id);
    assert.equal('active' in view, false, partner.partner_id);
    assert.equal('example' in view, false, partner.partner_id);
    assert.equal(JSON.stringify(view).includes('listino'), false,
      'the house prices behind a negotiation are not a guest-facing price table');
    // The internal note on a venue in attivazione says whose agreement it really
    // is. That is for the operator: a Bella Vigna guest is never told about LunArt.
    assert.equal(JSON.stringify(view).includes('LunArt'), false, partner.partner_id);
  }
});

test('price overrides replace the table and can be taken away again', () => {
  const before = resolvePrice('transfer-airport').amount;
  applyPriceOverrides({ 'transfer-airport': { amount: 12345, status: 'confirmed' } });
  assert.equal(resolvePrice('transfer-airport').amount, 12345);
  applyPriceOverrides({});
  assert.equal(resolvePrice('transfer-airport').amount, before);
  assert.equal(PRICES['transfer-airport'].amount, 9000, 'the file itself is untouched');
});

test('a card runs to the end of its last day, inclusive', () => {
  assert.equal(lastDayOf('2026-10-05', 1), '2026-10-05');
  assert.equal(lastDayOf('2026-10-05', 2), '2026-10-06');
  assert.equal(lastDayOf('2026-10-05', 5), '2026-10-09');
  assert.equal(lastDayOf('2026-10-05', 8), '2026-10-12');
  assert.equal(lastDayOf('2026-12-30', 5), '2027-01-03', 'across a year end');
});

/**
 * Both languages, on everything a guest can actually buy.
 *
 * An untranslated title is not a cosmetic slip: it is an English sentence in the
 * middle of an Italian page, and it got into the catalogue once already — the wine
 * went on sale titled "Wine in your room" in both. The coming-soon products are
 * exempt from having a summary on purpose: a service nobody has defined yet has no
 * copy, and inventing some to fill the field is the thing that rule exists to stop.
 */
test('every product a guest can buy reads in both languages', () => {
  const gaps = [];
  for (const product of PRODUCTS.filter((p) => p.active)) {
    for (const field of ['title', 'summary']) {
      const value = product[field];
      // A coming-soon product carries no summary, and must not be given one.
      if (field === 'summary' && (product.comingSoon || product.status === 'coming-soon')) continue;
      if (typeof value?.it !== 'string' || value.it.trim() === '') gaps.push(`${product.id}.${field}: no Italian`);
      if (typeof value?.en !== 'string' || value.en.trim() === '') gaps.push(`${product.id}.${field}: no English`);
    }
  }
  assert.deepEqual(gaps, []);
});

/**
 * And the Italian is Italian.
 *
 * A title identical in both columns is usually an English string someone forgot —
 * which is exactly how the wine shipped as "Wine in your room" to Italian guests.
 * Three names are the same in both languages because LunArt calls them that: the
 * card carries the house name, and the hair and celebration services were named in
 * English on purpose, the way "Experiences & Extras" is. Everything else has to be
 * translated, and this list is the place to say so deliberately rather than let a
 * forgotten one pass as a brand.
 */
test('no product title is left in one language and copied into the other', () => {
  const NAMED_IN_ENGLISH = new Set(['privilege-card', 'hair-service', 'celebration']);
  const copied = PRODUCTS
    .filter((p) => p.active && p.title.it === p.title.en && !NAMED_IN_ENGLISH.has(p.id))
    .map((p) => `${p.id}: "${p.title.it}"`);
  assert.deepEqual(copied, []);
});
