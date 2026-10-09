/**
 * The cart, including the part that has to survive a closed browser.
 *
 * `cart.js` is a browser module, so these run against a small localStorage stand-in.
 * That is also what makes the failure modes testable: storage that throws, storage
 * holding nonsense, storage that is simply full — and a phone that also holds
 * LunArt's guide, whose basket must never turn up in this one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPriceOverrides } from '../commerce/prices.js';
import { DEV_PRICES } from '../commerce/prices.dev.js';
import { propertyDate, addDays } from '../commerce/time.js';

/**
 * Where this guide keeps its basket: under the property's own prefix, so two
 * guides on one phone never share a key. Written out rather than imported from
 * `data/brand.js`, because the literal is the thing being proved.
 */
const KEY = 'bellavigna.cart.v1';
const LUNART_KEY = 'lunart.cart.v1';
const soon = (days) => addDays(propertyDate(), days);

/** A localStorage that behaves, and can be made to misbehave. */
function fakeStorage({ failWrites = false, initial = null, others = {} } = {}) {
  const map = new Map([...Object.entries(others), ...(initial ? [[KEY, initial]] : [])]);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (failWrites) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key) => map.delete(key),
    get raw() { return map.get(KEY); },
    get keys() { return [...map.keys()]; },
    read: (key) => map.get(key),
  };
}

/** A fresh copy of the module, so each test gets its own state. */
async function loadCart(storage) {
  globalThis.localStorage = storage;
  applyPriceOverrides(DEV_PRICES);
  return import(`../src/commerce/cart.js?t=${Math.random()}`);
}

const wine = (over = {}) => ({
  productId: 'wine-in-room', variantId: 'brunello', quantity: 1,
  date: soon(3), slotId: 'w-1900', room: 'Deluxe', ...over,
});

/**
 * LunArt's in-room prices, carried by `commerce/prices.js` as placeholders for
 * Bella Vigna. The browser cart renders whatever table the server published —
 * placeholders included, because whether one may be charged is the server's
 * decision at checkout, not the basket's.
 */
const BRUNELLO = 8900;
const VERMENTINO = 4300;
const DOM = 59000;
const BRUNCH = 6900;

test('an empty cart is empty', async () => {
  const cart = await loadCart(fakeStorage());
  assert.equal(cart.count(), 0);
  assert.deepEqual(cart.getLines(), []);
  assert.equal(cart.review().empty, true);
});

test('adding the same thing twice counts it twice, not lists it twice', async () => {
  const cart = await loadCart(fakeStorage());
  cart.add(wine());
  cart.add(wine());
  assert.equal(cart.getLines().length, 1);
  assert.equal(cart.count(), 2);
  assert.equal(cart.review().total, BRUNELLO * 2);
});

test('the same bottle on a different evening is a different line', async () => {
  const cart = await loadCart(fakeStorage());
  cart.add(wine());
  cart.add(wine({ slotId: 'w-2000' }));
  assert.equal(cart.getLines().length, 2);
});

test('different products and variants stay apart and add up', async () => {
  const cart = await loadCart(fakeStorage());
  cart.add(wine());                                    // 89
  cart.add(wine({ variantId: 'vermentino' }));         // 43
  cart.add({ productId: 'brunch', variantId: 'opera', quantity: 1, date: soon(2),
             slotId: 'b-0900', room: 'Deluxe', options: { hotDrink: 'espresso' } });  // 69
  assert.equal(cart.getLines().length, 3);
  assert.equal(cart.review().total, BRUNELLO + VERMENTINO + BRUNCH);
});

test('quantity is clamped to what the product allows', async () => {
  const cart = await loadCart(fakeStorage());
  cart.add(wine({ quantity: 1 }));
  cart.setQuantity(0, 99);
  assert.equal(cart.getLines()[0].quantity, 4, 'wine tops out at four bottles');
  cart.setQuantity(0, 0);
  assert.equal(cart.getLines().length, 0, 'dropping to zero removes the line');
});

test('lines can be removed and the cart emptied', async () => {
  const cart = await loadCart(fakeStorage());
  cart.add(wine());
  cart.add(wine({ variantId: 'vermentino' }));
  cart.remove(0);
  assert.equal(cart.getLines().length, 1);
  assert.equal(cart.getLines()[0].variantId, 'vermentino');
  cart.clear();
  assert.equal(cart.count(), 0);
});

test('the cart is written to storage and read back', async () => {
  const storage = fakeStorage();
  const first = await loadCart(storage);
  first.add(wine());
  first.add(wine({ variantId: 'dom-perignon', slotId: 'w-2000' }));
  assert.ok(storage.raw, 'something was written');

  // A new module instance, as after a reload, reading the same storage.
  const second = await loadCart(storage);
  assert.equal(second.count(), 2);
  assert.equal(second.getLines()[1].variantId, 'dom-perignon');
  assert.equal(second.review().total, BRUNELLO + DOM);
  assert.deepEqual(storage.keys, [KEY], 'under this property’s key and no other');
});

test('a LunArt basket on the same phone is neither read nor overwritten', async () => {
  // Diego's guests may hold both guides. LunArt's basket is LunArt's: a Bella
  // Vigna guest must not open the shop to find someone else's Dom Pérignon in it.
  const theirs = JSON.stringify([{ ...wine({ variantId: 'dom-perignon' }), room: '303' }]);
  const storage = fakeStorage({ others: { [LUNART_KEY]: theirs } });
  const cart = await loadCart(storage);
  assert.equal(cart.count(), 0, 'nothing of theirs is in ours');

  cart.add(wine());
  assert.equal(storage.read(LUNART_KEY), theirs, 'and theirs is left exactly as it was');
  assert.equal(JSON.parse(storage.raw)[0].variantId, 'brunello');
});

test('no amount is ever stored or sent', async () => {
  const storage = fakeStorage();
  const cart = await loadCart(storage);
  cart.add({ ...wine(), amount: 1, price: 1, total: 1 });

  const stored = JSON.parse(storage.raw);
  for (const key of ['amount', 'price', 'total']) {
    assert.equal(key in stored[0], false, `${key} should not be stored`);
  }
  for (const key of ['amount', 'price', 'total']) {
    assert.equal(key in cart.payload()[0], false, `${key} should not be sent`);
  }
  assert.equal(cart.review().total, BRUNELLO, 'the price still comes from the catalogue');
});

test('nonsense in storage is discarded rather than crashing the guide', async () => {
  for (const junk of ['not json', '{"not":"an array"}', '[{"productId":42}]', '[{"quantity":"many"}]', 'null']) {
    const cart = await loadCart(fakeStorage({ initial: junk }));
    assert.deepEqual(cart.getLines(), [], `"${junk.slice(0, 20)}" should be ignored`);
  }
});

test('a cart still works when storage refuses to write', async () => {
  // Private browsing, or a full quota. The basket should work for this visit.
  const cart = await loadCart(fakeStorage({ failWrites: true }));
  cart.add(wine());
  assert.equal(cart.count(), 1);
  assert.equal(cart.review().total, BRUNELLO);
});

test('a cart with a stale date explains itself instead of silently failing', async () => {
  const cart = await loadCart(fakeStorage({ initial: JSON.stringify([{ ...wine(), date: '2020-01-01' }]) }));
  const review = cart.review();
  assert.equal(review.ok, false);
  assert.ok(review.lines[0].errors.some((e) => e.code === 'date-in-past'));
  assert.equal(review.total, 0);
});

test('changes are announced, so the badge can follow', async () => {
  const cart = await loadCart(fakeStorage());
  let seen = 0;
  const stop = cart.onCartChange(() => { seen += 1; });
  cart.add(wine());
  cart.setQuantity(0, 2);
  cart.remove(0);
  assert.equal(seen, 3);
  stop();
  cart.add(wine());
  assert.equal(seen, 3, 'and stop listening when asked');
});
