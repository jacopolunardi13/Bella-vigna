/**
 * Partners, entitlements and who can use what.
 *
 * These are the tests that stop the two expensive mistakes.
 *
 * The first is commercial: letting a benefit a guest paid for leak to a guest who
 * did not, or — worse the other way — listing something the stay already includes
 * as a reason to buy the upgrade. The Opera Caffè 30% is free for everybody, Le
 * Firme and Blue Velvet are not, and nothing may blur that line.
 *
 * The second is structural: deciding eligibility twice. `passState()` in
 * `server/pass.js` is the only thing in this codebase that knows what day it is in
 * Florence. A second date engine would drift from it, and the drift would be silent
 * until a guest was turned away at a door.
 *
 * The last block is about a product that does not exist. The Shopping add-on is
 * modelled and deliberately not for sale, and the test asserts both halves: that
 * moving a partner behind it would be a data change, and that nothing today sells
 * it.
 *
 * ── Bella Vigna ─────────────────────────────────────────────────────────────
 *
 * Bella Vigna runs LunArt's network, and none of LunArt's three agreements is
 * confirmed for Bella Vigna yet (`PROPERTY_AGREEMENTS`). So there are two registers
 * here and the tests keep them apart:
 *
 *   NETWORK    the agreements as LunArt wrote them — the terms, the copy, the
 *              rules — waiting to be confirmed for this property.
 *   PARTNERS   the register in force: those three venues published as being set
 *              up, with nothing claimable and the Privilege upgrade off sale.
 *
 * The real state is asserted as it is. The mechanism — who can use what, what is
 * locked, what is drawn — is asserted under `confirmed()`, which puts the process
 * "as if" every agreement and price were confirmed, through the seams the server
 * uses, and always puts the real register back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NETWORK, PARTNERS, PROPERTY_AGREEMENTS, AGREEMENT, PARTNERSHIP_STATUS,
  PARTNER_CATEGORIES, BENEFIT_KINDS,
  ENTITLEMENTS, ENTITLEMENT_NAMES, ENTITLEMENTS_ON_SALE, PASS_STATES, ACCESS,
  STAY_ELIGIBILITY, PRIVILEGE_ELIGIBILITY,
  activePartners, cardPartners, stayPartners, partnersRequiring, statusOf,
  eligibilityOf, entitlementsRequiredBy, inclusionOf, benefitAccess,
  partnerView, benefitPartnerView, cardBenefits, stayBenefits, allGuestBenefits,
  directionsUrl, applyPartners, passContextOf,
} from '../commerce/partners.js';
import { PASS_STATE, entitlementsOf, passFor, passState } from '../server/pass.js';
import { PRICES, isSellable } from '../commerce/prices.js';
import { PRODUCTS } from '../commerce/catalog.js';
import { isPurchasable } from '../commerce/index.js';
import { privilegeSection, stayBenefitsSection, accessFor } from '../src/commerce/ui/partners.js';
import { UI } from '../src/i18n.js';
import { brand } from '../data/brand.js';
import {
  asIfConfirmed, confirmAllAgreements, restoreAgreements, confirmAllPrices, restorePrices,
} from './support/property.mjs';

/** The register in force for Bella Vigna. */
const byId = (id) => PARTNERS.find((partner) => partner.partner_id === id);
/** The same venue as LunArt agreed it: where the terms waiting for Bella Vigna live. */
const agreed = (id) => NETWORK.find((partner) => partner.partner_id === id);
const benefitById = (id) => NETWORK.flatMap((p) => p.benefits ?? []).find((b) => b.benefit_id === id);

/** Both registers, for the checks that must hold of whichever one is in force. */
const REGISTERS = [['NETWORK', NETWORK], ['PARTNERS', PARTNERS]];

/** The three venues LunArt has an agreement with, in register order. */
const AGREED_IDS = NETWORK
  .filter((p) => p.active && statusOf(p) === PARTNERSHIP_STATUS.active && p.benefits?.length)
  .map((p) => p.partner_id);

const privilegeCard = () => PRODUCTS.find((product) => product.id === 'privilege-card');

/** The two Pass shapes every eligibility question is asked about. */
const standardPass = (state = 'active') => ({ state, entitlements: [] });
const privilegePass = (state = 'active') => ({ state, entitlements: [ENTITLEMENTS.privilege] });

/**
 * A test about the mechanism rather than about Bella Vigna's terms.
 *
 * Every LunArt agreement and price confirmed for the length of the body, and the
 * real register put back afterwards whatever the body did, so the next test in this
 * file sees Bella Vigna as it is.
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
 * The register as it would stand the day the operator confirms exactly one
 * agreement for Bella Vigna: that venue's LunArt record, everyone else as they are
 * today. Built locally — `PROPERTY_AGREEMENTS` itself is never touched.
 */
const registerWithAgreement = (id) =>
  NETWORK.map((partner) => (partner.partner_id === id ? partner : byId(partner.partner_id)));

/* ── The data model ──────────────────────────────────────────────────────── */

test('every partner id is unique', () => {
  const ids = PARTNERS.map((partner) => partner.partner_id);
  assert.equal(new Set(ids).size, ids.length, 'two partners cannot share an id');
  assert.ok(ids.every(Boolean), 'and none may be missing one');
  // The register in force is the network, venue for venue and in the same order:
  // Bella Vigna changes what a record promises, never which records there are.
  assert.deepEqual(ids, NETWORK.map((partner) => partner.partner_id));
});

test('every benefit id is unique across the whole register', () => {
  for (const [label, register] of REGISTERS) {
    const ids = register.flatMap((partner) => (partner.benefits ?? []).map((b) => b.benefit_id));
    assert.equal(new Set(ids).size, ids.length, `${label}: a benefit id identifies one benefit, everywhere`);
    assert.ok(ids.every(Boolean), label);
  }
});

test('every partner states its eligibility rather than inheriting a default', () => {
  // The default is deliberately the paid tier, so a record that forgets this locks
  // rather than gives itself away. Nothing in either register may rely on it.
  for (const [label, register] of REGISTERS) {
    for (const partner of register) {
      // A business with no benefit has nothing to be eligible for, and must not
      // pretend otherwise by carrying a rule.
      if (!partner.benefits?.length) {
        assert.equal(partner.eligibility, undefined, `${label}: ${partner.partner_id} promises nothing yet`);
        continue;
      }
      assert.ok(partner.eligibility, `${label}: ${partner.partner_id} states no eligibility rule`);
    }
  }
  assert.deepEqual(eligibilityOf({}), PRIVILEGE_ELIGIBILITY, 'and the fallback fails closed');
  assert.deepEqual(eligibilityOf({ eligibility: STAY_ELIGIBILITY }), STAY_ELIGIBILITY);
});

test('every eligibility rule is in the schema, and names only known entitlements', () => {
  let rules = 0;
  for (const [, register] of REGISTERS) {
    for (const partner of register) {
      for (const benefit of partner.benefits ?? []) {
        const rule = eligibilityOf(partner, benefit);
        rules += 1;
        assert.ok(PASS_STATES.includes(rule.passState),
          `${benefit.benefit_id} asks for an unknown Pass state: ${rule.passState}`);
        assert.ok(Array.isArray(rule.entitlementsAll));
        for (const name of rule.entitlementsAll) {
          assert.ok(ENTITLEMENT_NAMES.includes(name),
            `${benefit.benefit_id} asks for an entitlement that does not exist: ${name}`);
        }
        assert.ok(BENEFIT_KINDS.includes(benefit.kind), `${benefit.benefit_id} is an unknown kind`);
      }
    }
  }
  assert.ok(rules > 0, 'there are rules to check: the agreements waiting in the network');
});

test('the Pass states eligibility can ask for are the ones the Pass actually has', () => {
  // Two lists, because this module is shared with the browser and must not import
  // the server. They are allowed to be two lists; they are not allowed to differ.
  assert.deepEqual([...PASS_STATES].sort(), Object.values(PASS_STATE).sort());
});

test('a partner offering directions has an address to send a guest to', () => {
  for (const [, register] of REGISTERS) {
    for (const partner of register) {
      if (!partner.directions) continue;
      assert.ok(partner.address, `${partner.partner_id} offers directions with no address`);
      const url = directionsUrl(partner);
      assert.ok(url.startsWith('https://www.google.com/maps/dir/'), url);
      assert.ok(url.includes(encodeURIComponent(partner.address)),
        'the destination is the address and nothing invented');
    }
  }
  assert.equal(directionsUrl({ address: 'Somewhere' }), null, 'and it is opt-in');
  assert.equal(directionsUrl({ directions: true }), null, 'never a link to nowhere');
});

test('the model carries one partner with many benefits, not many partners with one', () => {
  // The agreement LunArt wrote down is the proof of the shape; it is the record
  // Bella Vigna will publish the day its own agreement is confirmed.
  const blueVelvet = agreed('blue-velvet');
  assert.ok(blueVelvet.benefits.length > 1, 'Blue Velvet is the proof');
  assert.equal(agreed('le-firme').benefits.length, 1, 'and one is still a list');
  for (const [label, register] of REGISTERS) {
    for (const partner of register) {
      assert.ok(Array.isArray(partner.benefits), `${label}: ${partner.partner_id} keeps its benefits as a list`);
    }
  }
});

test('Blue Velvet is one venue, with one address, however many doors it has', () => {
  // Bella Vigna, today: the venue is published, its benefits are not.
  const matching = PARTNERS.filter((partner) => /blue\s*velvet/i.test(partner.name));
  assert.equal(matching.length, 1, 'two adjacent entrances are not two clubs');

  const view = partnerView('blue-velvet');
  assert.equal(view.address, 'Via del Castello d\'Altafronte 14R–16R, Firenze');
  assert.equal(view.partnership_status, PARTNERSHIP_STATUS.activating);
  assert.deepEqual(view.benefits, [], 'nothing to claim until the agreement covers Bella Vigna');
  assert.ok(view.directions_url, 'and still one place to be sent to');
  // Both numbers on one line, which is what gets a guest to the door. Which of the
  // two is open tonight is operational, lives in `staff_note`, and stays there.
  assert.ok(view.address.includes('14R') && view.address.includes('16R'));
  assert.equal('note' in view, false, 'a partner has no guest-facing note of its own');
});

test('Blue Velvet, once its agreement holds, is still one venue with both benefits', confirmed(() => {
  assert.equal(activePartners().filter((partner) => /blue\s*velvet/i.test(partner.name)).length, 1);

  const view = partnerView('blue-velvet');
  assert.equal(view.address, 'Via del Castello d\'Altafronte 14R–16R, Firenze');
  assert.equal(view.benefits.length, 2);
  assert.equal(new Set([view.directions_url]).size, 1, 'and one place to be sent to');
  assert.equal('note' in view, false, 'a partner has no guest-facing note of its own');
}));

test('Le Firme gives ten per cent, in both languages', () => {
  // The terms are LunArt's, carried for Bella Vigna in the network record.
  const partner = agreed('le-firme');
  assert.equal(partner.category, 'shopping');
  assert.ok(PARTNER_CATEGORIES.shopping, 'and shopping is a category the model knows');
  assert.equal(partner.address, 'Via Il Prato 49R, Firenze');
  assert.equal(partner.area.it, 'Porta al Prato');

  const [benefit] = partner.benefits;
  assert.equal(benefit.kind, 'percentage');
  assert.equal(benefit.value, 10);
  assert.equal(benefit.emphasis, '10% OFF');
  assert.equal(benefit.headline.it, '10% di sconto');
  assert.equal(benefit.headline.en, '10% off');
  assert.equal(benefit.subline.it, 'Moda e shopping a Porta al Prato.');
  assert.equal(benefit.subline.en, 'Fashion and shopping near Porta al Prato.');

  // And Bella Vigna publishes the shop — the same facts — without the ten per cent.
  const here = byId('le-firme');
  assert.equal(here.category, partner.category);
  assert.equal(here.address, partner.address);
  assert.deepEqual(here.area, partner.area);
  assert.deepEqual(here.benefits, []);
});

test('the Blue Velvet entry is a capped price with a drink, at any hour', () => {
  const benefit = benefitById('blue-velvet-entry');
  assert.equal(benefit.kind, 'guestlist');
  assert.deepEqual(benefit.cap, { amount: 1500, per: 'person' }, 'a ceiling, in eurocents');
  assert.equal(benefit.emphasis, '€15 MAX + DRINK');
  assert.equal(benefit.description.it,
    'Ingresso in lista a massimo €15 a persona, con una consumazione inclusa, a qualsiasi ora della serata.');
  assert.equal(benefit.description.en,
    'Guest-list entry for no more than €15 per person, with one drink included, at any time of the night.');
  // Named after the upgrade this property sells, not the one LunArt does.
  assert.equal(benefit.subline.en, `All night · ${brand.privilegeName}`);
  assert.equal(benefit.subline.en, 'All night · Bella Vigna Privilege');
  assert.equal(/lunart/i.test(JSON.stringify(benefit)), false, 'no other house is named to a guest');
});

test('the Blue Velvet table discount is a second, separate benefit', () => {
  const benefit = benefitById('blue-velvet-tables');
  assert.notEqual(benefit, benefitById('blue-velvet-entry'));
  assert.equal(benefit.kind, 'percentage');
  assert.equal(benefit.value, 20);
  assert.equal(benefit.emphasis, '20% OFF');
  assert.equal(benefit.description.it, '20% di sconto su tavoli / bottle service.');
  assert.equal(benefit.description.en, '20% off table / bottle service.');
  assert.equal(benefit.subline.en, 'Table service');

  // Not collapsed into the entry's sentence, which is the mistake being guarded.
  assert.equal(/20\s*%/.test(benefitById('blue-velvet-entry').description.it), false);
});

test('both new partners are reserved for Privilege, and neither comes with the stay', confirmed(() => {
  for (const id of ['le-firme', 'blue-velvet']) {
    const partner = agreed(id);
    assert.deepEqual(entitlementsRequiredBy(partner), [ENTITLEMENTS.privilege], id);
    assert.equal(inclusionOf(partner), 'card', id);
    assert.equal(stayPartners().some((p) => p.partner_id === id), false,
      `${id} must never be listed as included with the stay`);
  }
  assert.deepEqual(cardPartners().map((p) => p.partner_id), ['le-firme', 'blue-velvet']);
}));

test('nothing invents a fact a partner did not give', async () => {
  // Today's register and the confirmed one: neither may carry a contact nobody gave.
  const check = () => {
    for (const id of ['le-firme', 'blue-velvet']) {
      const view = partnerView(id);
      const text = JSON.stringify(view);
      assert.equal(view.maps, null, 'no map link was supplied for these two');
      assert.equal(/tel:|telefono|phone|whatsapp|https?:\/\/(?!www\.google\.com\/maps)/i.test(text), false,
        `${id} carries a contact or a website that nobody gave us`);
      assert.equal(/prenota|booking|reserve a table/i.test(text), false,
        `${id} offers a booking flow that does not exist`);
    }
  };
  check();
  await confirmed(check)();
});

/* ── Bella Vigna, today ──────────────────────────────────────────────────── */

test('every LunArt agreement is still pending for Bella Vigna', () => {
  // Exactly the venues LunArt has a benefit with, and not one confirmed here. The
  // day one is, this test changes on purpose, alongside the line that confirmed it.
  assert.deepEqual(AGREED_IDS, ['opera-caffe', 'le-firme', 'blue-velvet']);
  assert.deepEqual(Object.keys(PROPERTY_AGREEMENTS).sort(), [...AGREED_IDS].sort());
  for (const id of AGREED_IDS) {
    assert.equal(PROPERTY_AGREEMENTS[id].status, AGREEMENT.pending, id);
    assert.ok(PROPERTY_AGREEMENTS[id].note?.trim(), `${id} says what is still to confirm`);
    assert.equal(statusOf(byId(id)), PARTNERSHIP_STATUS.activating, `${id} is published as being set up`);
  }
});

test('with the real register no benefit is claimable by anybody, and Privilege is not for sale', () => {
  // The claimable lists, every one of them empty.
  assert.deepEqual(cardPartners(), []);
  assert.deepEqual(stayPartners(), []);
  assert.deepEqual(cardBenefits(), []);
  assert.deepEqual(stayBenefits(), []);
  assert.deepEqual(allGuestBenefits(), []);
  assert.deepEqual(partnersRequiring(ENTITLEMENTS.privilege), []);

  // Every venue, every kind of Pass: there is no row a guest could claim.
  const passes = [
    null,
    ...PASS_STATES.flatMap((state) => [standardPass(state), privilegePass(state)]),
  ];
  for (const partner of activePartners()) {
    assert.equal(benefitPartnerView(partner.partner_id), null, `${partner.partner_id} has no scanner view`);
    const view = partnerView(partner.partner_id);
    assert.equal(view.validation_url, null, `${partner.partner_id} has no scanner page`);
    for (const pass of passes) {
      assert.deepEqual(accessFor(view, pass), [], `${partner.partner_id}: nothing to claim`);
    }
  }

  // And the upgrade withholds itself, in production and in the preview alike:
  // placeholder prices are allowed there, an upgrade worth nothing is not.
  const card = privilegeCard();
  assert.equal(card.requiresPartners, true, 'the rail is what withholds it');
  assert.equal(isPurchasable(card), false);
  assert.equal(isPurchasable(card, { allowPlaceholders: true }), false);

  // So the guide draws no Privilege section and no button to buy it, and no stay
  // benefit either, for any guest.
  for (const lang of ['it', 'en']) {
    for (const pass of passes) {
      assert.equal(privilegeSection(cardBenefits(), pass, lang), '');
      assert.equal(stayBenefitsSection(stayBenefits(), pass, lang), '');
    }
  }
});

test('confirming one agreement makes exactly that venue claimable', () => {
  const card = privilegeCard();
  try {
    for (const id of AGREED_IDS) {
      applyPartners(registerWithAgreement(id));

      assert.deepEqual(allGuestBenefits().map((view) => view.partner_id), [id], `${id} and nobody else`);
      assert.ok(benefitPartnerView(id), `${id} gets a scanner`);
      assert.equal(partnerView(id).validation_url, `/partner/${id}`);
      for (const other of AGREED_IDS.filter((x) => x !== id)) {
        assert.equal(benefitPartnerView(other), null, `${other} is still being set up`);
        assert.deepEqual(partnerView(other).benefits, [], `${other} still promises nothing`);
      }

      // It lands on the side of the line its own rule puts it.
      const side = inclusionOf(agreed(id));
      assert.deepEqual(cardPartners().map((p) => p.partner_id), side === 'card' ? [id] : []);
      assert.deepEqual(stayPartners().map((p) => p.partner_id), side === 'stay' ? [id] : []);

      // A card venue is what makes the upgrade worth selling — and the price is
      // still a placeholder, so only a preview could sell it. A stay venue is not a
      // reason to sell anything.
      assert.equal(isPurchasable(card, { allowPlaceholders: true }), side === 'card', id);
      assert.equal(isPurchasable(card), false, `${id}: no Bella Vigna price is confirmed`);
    }
  } finally {
    restoreAgreements();
  }
  assert.deepEqual(allGuestBenefits(), [], 'and back to nothing claimable');
});

test('Privilege is for sale only when an agreement and a price are both confirmed', () => {
  const card = privilegeCard();
  try {
    // A confirmed venue, LunArt's price still a placeholder: a preview could sell
    // it, production cannot.
    confirmAllAgreements();
    assert.equal(isPurchasable(card), false);
    assert.equal(isPurchasable(card, { allowPlaceholders: true }), true);

    // A confirmed price with no venue behind it: nobody can.
    restoreAgreements();
    confirmAllPrices();
    assert.equal(isPurchasable(card), false);
    assert.equal(isPurchasable(card, { allowPlaceholders: true }), false);

    // Both: production sells it.
    confirmAllAgreements();
    assert.equal(isPurchasable(card), true);
  } finally {
    restoreAgreements();
    restorePrices();
  }
  assert.equal(isPurchasable(card, { allowPlaceholders: true }), false, 'and back off sale');
});

/* ── Eligibility ─────────────────────────────────────────────────────────── */

test('an active standard Pass keeps Opera Caffè and finds Privilege locked', confirmed(() => {
  const pass = standardPass('active');

  const opera = partnerView('opera-caffe');
  assert.equal(accessFor(opera, pass)[0].access.state, ACCESS.available,
    'what comes with the stay is usable with no upgrade at all');

  assert.ok(cardBenefits().length > 0);
  for (const view of cardBenefits()) {
    for (const row of accessFor(view, pass)) {
      assert.equal(row.access.state, ACCESS.locked, `${view.partner_id}/${row.benefit.benefit_id}`);
      assert.deepEqual(row.access.missing, [ENTITLEMENTS.privilege]);
    }
  }
}));

test('an active Privilege Pass unlocks all three', confirmed(() => {
  const pass = privilegePass('active');
  const everything = [...stayBenefits(), ...cardBenefits()];
  assert.equal(everything.length, 3, 'Opera Caffè, Le Firme, Blue Velvet');

  for (const view of everything) {
    for (const row of accessFor(view, pass)) {
      assert.equal(row.access.state, ACCESS.available, `${view.partner_id}/${row.benefit.benefit_id}`);
      assert.deepEqual(row.access.missing, []);
    }
  }
}));

test('a Pass that has not started, has ended or was called off makes nothing usable', confirmed(() => {
  const views = [...stayBenefits(), ...cardBenefits()];
  assert.equal(views.length, 3, 'there is something to be refused');
  for (const state of ['not-started', 'expired', 'cancelled', 'unknown']) {
    for (const pass of [standardPass(state), privilegePass(state)]) {
      for (const view of views) {
        for (const row of accessFor(view, pass)) {
          assert.equal(row.access.state, ACCESS.unavailable,
            `${state}: ${view.partner_id}/${row.benefit.benefit_id} must not read as usable`);
        }
      }
    }
  }
}));

test('eligibility is the Pass state and the entitlement, never one or the other', () => {
  const access = (rule, pass) => benefitAccess(rule, passContextOf(pass)).state;

  // A live Pass with nothing bought is not enough.
  assert.equal(access(PRIVILEGE_ELIGIBILITY, standardPass('active')), ACCESS.locked);
  // And an entitlement on a Pass that is not live is not enough either.
  assert.equal(access(PRIVILEGE_ELIGIBILITY, privilegePass('expired')), ACCESS.unavailable);
  // Both: usable.
  assert.equal(access(PRIVILEGE_ELIGIBILITY, privilegePass('active')), ACCESS.available);
  // The stay's own rule needs no entitlement, only a live Pass.
  assert.equal(access(STAY_ELIGIBILITY, standardPass('active')), ACCESS.available);
  assert.equal(access(STAY_ELIGIBILITY, standardPass('expired')), ACCESS.unavailable);
  // A rule asking for something that does not exist fails closed.
  assert.equal(access({ passState: 'active', entitlementsAll: ['not-a-thing'] }, privilegePass('active')),
    ACCESS.locked);
  // And a Pass nobody handed over is nothing, not everything.
  assert.equal(benefitAccess(PRIVILEGE_ELIGIBILITY, passContextOf(null)).state, ACCESS.unavailable);
  assert.equal(benefitAccess(PRIVILEGE_ELIGIBILITY).state, ACCESS.unavailable);
});

test('the entitlements come from the card, and a revoked card carries none', () => {
  assert.deepEqual(entitlementsOf(null), [], 'a Pass nobody upgraded');
  assert.deepEqual(entitlementsOf({ status: 'active' }), [ENTITLEMENTS.privilege]);
  assert.deepEqual(entitlementsOf({ status: 'revoked' }), [], 'withdrawn is withdrawn');
});

const reservation = { first_name: 'Ada', check_in: '2026-11-10', check_out: '2026-11-14', room: 'Standard' };
const during = new Date('2026-11-11T12:00:00Z');

test('on Bella Vigna\'s register a Pass is promised nothing, and its state still comes from the stay', () => {
  const plain = passFor(reservation, { now: during });
  assert.deepEqual(plain.entitlements, []);
  assert.deepEqual(plain.privileges, []);
  assert.deepEqual(plain.included, [], 'no stay benefit is agreed for Bella Vigna yet');

  // Ownership is a fact about the card, not about the register: it is reported as
  // it is, and it unlocks nothing that is not there.
  const upgraded = passFor(reservation, { card: { status: 'active' }, now: during });
  assert.deepEqual(upgraded.entitlements, [ENTITLEMENTS.privilege]);
  assert.deepEqual(upgraded.privileges, []);
  assert.deepEqual(upgraded.included, []);

  assert.equal(plain.state, passState(reservation, during));
  assert.equal(plain.room, 'Standard');
});

test('the Pass publishes its entitlements, and its state still comes from the stay', confirmed(() => {
  const plain = passFor(reservation, { now: during });
  assert.deepEqual(plain.entitlements, []);
  assert.deepEqual(plain.privileges, [], 'a standard Pass is never told it has privileges');
  assert.ok(plain.included.some((view) => view.partner_id === 'opera-caffe'));

  const upgraded = passFor(reservation, { card: { status: 'active' }, now: during });
  assert.deepEqual(upgraded.entitlements, [ENTITLEMENTS.privilege]);
  assert.equal(upgraded.privileges.length, 2);
  assert.ok(upgraded.included.some((view) => view.partner_id === 'opera-caffe'),
    'and Opera Caffè stays on the stay side of the line');

  // The state is the stay's, not the card's: one date engine, and this is it.
  assert.equal(plain.state, passState(reservation, during));
  assert.equal(passFor(reservation, { card: { status: 'active' }, now: new Date('2026-12-01T12:00:00Z') }).state,
    PASS_STATE.expired);
}));

/* ── The Shopping add-on: modelled, not sold ─────────────────────────────── */

test('the model can express an add-on entitlement without any rendering change', () => {
  const future = {
    ...agreed('le-firme'),
    partner_id: 'future-shop',
    eligibility: { passState: 'active', entitlementsAll: [ENTITLEMENTS.privilege, ENTITLEMENTS.shopping] },
  };

  assert.deepEqual(entitlementsRequiredBy(future), [ENTITLEMENTS.privilege, ENTITLEMENTS.shopping]);
  assert.equal(inclusionOf(future), 'card', 'still the paid card, now with more on it');

  // Privilege alone locks it and says exactly what is missing.
  const onlyPrivilege = benefitAccess(future.eligibility, passContextOf(privilegePass('active')));
  assert.equal(onlyPrivilege.state, ACCESS.locked);
  assert.deepEqual(onlyPrivilege.missing, [ENTITLEMENTS.shopping]);

  // Both unlock it.
  assert.equal(
    benefitAccess(future.eligibility,
      passContextOf({ state: 'active', entitlements: ['privilege', 'shopping'] })).state,
    ACCESS.available,
  );

  // And the same renderer draws it: no component per entitlement. On Bella Vigna's
  // own register, where nothing else is claimable, one record is all it takes.
  try {
    applyPartners([...PARTNERS, { ...future, active: true }]);
    assert.deepEqual(cardBenefits().map((view) => view.partner_id), ['future-shop']);
    const html = privilegeSection(cardBenefits(), { state: 'active', entitlements: ['privilege', 'shopping'] }, 'it');
    assert.ok(html.includes('data-partner="future-shop"'));
    assert.equal(html.includes('data-access="locked"'), false);
  } finally {
    restoreAgreements();
  }
});

test('a card can carry an add-on, and nothing writes one today', () => {
  assert.deepEqual(entitlementsOf({ status: 'active', add_ons: [ENTITLEMENTS.shopping] }),
    [ENTITLEMENTS.privilege, ENTITLEMENTS.shopping], 'the seam exists');
  assert.deepEqual(entitlementsOf({ status: 'active' }), [ENTITLEMENTS.privilege], 'and is empty');
});

test('Shopping is not on sale: no entitlement to buy, no product, no SKU, no price', () => {
  assert.deepEqual(ENTITLEMENTS_ON_SALE, [ENTITLEMENTS.privilege]);
  assert.equal(ENTITLEMENTS_ON_SALE.includes(ENTITLEMENTS.shopping), false);

  for (const product of PRODUCTS) {
    assert.equal(/shopping/i.test(product.id), false, `${product.id} looks like the add-on`);
  }
  for (const sku of Object.keys(PRICES)) {
    assert.equal(/shopping/i.test(sku), false, `${sku} prices something that is not for sale`);
  }
  // Not on Bella Vigna's register, and not on LunArt's agreements either: confirming
  // them would not move anybody behind it.
  try {
    for (const [label, register] of REGISTERS) {
      applyPartners(register);
      assert.equal(partnersRequiring(ENTITLEMENTS.shopping).length, 0,
        `${label}: and no partner has been moved behind it`);
    }
  } finally {
    restoreAgreements();
  }
});

test('Privilege carries LunArt\'s prices, and none of them is confirmed for Bella Vigna', () => {
  assert.equal(PRICES['privilege-card:2d'].amount, 1500);
  assert.equal(PRICES['privilege-card:5d'].amount, 2500);
  assert.equal(PRICES['privilege-card:8d'].amount, 3500);
  for (const days of ['2d', '5d', '8d']) {
    const sku = `privilege-card:${days}`;
    assert.equal(PRICES[sku].status, 'placeholder', sku);
    assert.match(PRICES[sku].source, /LunArt/, `${sku} says where the figure comes from`);
    // A preview can walk it with test money; production sells nothing on it.
    assert.equal(isSellable(sku), false, sku);
    assert.equal(isSellable(sku, { allowPlaceholders: true }), true, sku);
  }
});

test('the Privilege product is purchasable once real partners stand behind it', confirmed(() => {
  const card = privilegeCard();
  assert.equal(card.requiresPartners, true, 'the rail is still there');
  assert.equal(isPurchasable(card), true, 'and it passes without placeholder prices');
}));

/* ── Copy ────────────────────────────────────────────────────────────────── */

test('every piece of partner copy exists in both languages', () => {
  for (const [, register] of REGISTERS) {
    for (const partner of register) {
      for (const field of ['area', 'note', 'shortDescription']) {
        if (!partner[field]) continue;
        assert.ok(partner[field].it, `${partner.partner_id}.${field} it`);
        assert.ok(partner[field].en, `${partner.partner_id}.${field} en`);
      }
      for (const benefit of partner.benefits ?? []) {
        for (const field of ['headline', 'subline', 'description', 'note']) {
          if (!benefit[field]) continue;
          assert.ok(benefit[field].it?.trim(), `${benefit.benefit_id}.${field} it`);
          assert.ok(benefit[field].en?.trim(), `${benefit.benefit_id}.${field} en`);
        }
      }
    }
  }
  for (const category of Object.values(PARTNER_CATEGORIES)) {
    assert.ok(category.it && category.en);
  }
});

test('the Privilege section has its own words, in both languages', () => {
  const keys = [
    'privilegeBenefits', 'privilegeBenefitsNote', 'privilegeBenefitsDiscover',
    'privilegeLocked', 'privilegeGet', 'privilegeWhenActive', 'directions',
  ];
  for (const key of keys) {
    assert.ok(UI.it[key]?.trim(), `it.${key}`);
    assert.ok(UI.en[key]?.trim(), `en.${key}`);
    assert.notEqual(UI.it[key], UI.en[key], `${key} is not the same string twice`);
    assert.equal(/lunart/i.test(UI.it[key] + UI.en[key]), false, `${key} names another house`);
  }
  assert.equal(brand.privilegeName, 'Bella Vigna Privilege');
  assert.equal(UI.it.privilegeBenefits, 'Vantaggi Privilege');
  assert.equal(UI.en.privilegeBenefits, 'Privilege benefits');
  assert.equal(UI.it.privilegeBenefitsNote,
    `Mostra la tua ${brand.privilegeName} attiva per utilizzare questi vantaggi.`);
  assert.equal(UI.en.privilegeBenefitsNote,
    `Show your active ${brand.privilegeName} to use these benefits.`);
  assert.equal(UI.it.privilegeLocked, `Disponibile con ${brand.privilegeName}`);
  assert.equal(UI.en.privilegeLocked, `Available with ${brand.privilegeName}`);
});

/* ── What each guest sees ────────────────────────────────────────────────── */

test('a Privilege guest sees the benefits unlocked, and is told once how to use them', confirmed(() => {
  for (const lang of ['it', 'en']) {
    const html = privilegeSection(cardBenefits(), privilegePass('active'), lang);
    assert.ok(html.includes(UI[lang].privilegeBenefits), 'the section is there');
    assert.ok(html.includes(UI[lang].privilegeBenefitsNote), 'with the one explanation');
    assert.equal(html.includes(UI[lang].privilegeLocked), false, 'and nothing locked');
    assert.equal(html.includes('data-product="privilege-card"'), false, 'and nothing to buy again');

    // Said once, not once per venue.
    const saidTwice = html.split(UI[lang].privilegeBenefitsNote).length - 1;
    assert.equal(saidTwice, 1, 'the "show your card" sentence appears exactly once');
  }
}));

test('a standard-Pass guest discovers the same benefits, locked', confirmed(() => {
  for (const lang of ['it', 'en']) {
    const html = privilegeSection(cardBenefits(), standardPass('active'), lang);
    assert.ok(html.includes('Le Firme') && html.includes('Blue Velvet'),
      'they are shown, not hidden');
    assert.ok(html.includes(UI[lang].privilegeLocked), 'and marked as an upgrade');
    assert.ok(html.includes(UI[lang].privilegeBenefitsDiscover));
    assert.equal(html.split('data-access="locked"').length - 1 >= 2, true);

    // The way to get it is the ordinary product sheet, not a second checkout.
    assert.ok(html.includes('data-product="privilege-card"'));
    assert.ok(html.includes(UI[lang].privilegeGet));
  }
}));

test('the benefit is what the eye lands on, and the venue is the quiet line', confirmed(() => {
  const html = privilegeSection(cardBenefits(), privilegePass('active'), 'it');
  for (const headline of ['10% di sconto', '€15 MAX + DRINK', '20% OFF']) {
    assert.ok(html.includes(`<p class="benefit__headline">${headline}</p>`), headline);
  }
  assert.ok(html.includes('<p class="partner__name">Le Firme</p>'));
  assert.ok(html.includes('<p class="partner__name">Blue Velvet</p>'));
}));

test('Blue Velvet renders as one venue with two benefits and one set of directions', confirmed(() => {
  const html = privilegeSection(cardBenefits(), privilegePass('active'), 'it');
  const [, after] = html.split('data-partner="blue-velvet"');
  assert.equal(html.split('data-partner="blue-velvet"').length - 1, 1, 'one venue block');
  assert.equal(after.split('class="benefit"').length - 1, 2, 'two benefits inside it');
  assert.equal(after.split('class="partner__directions"').length - 1, 1, 'one way to get there');
  assert.ok(after.includes('maps/dir/?api=1&amp;destination=Via%20del%20Castello'));
}));

/**
 * Not usable is said to everybody; what to do about it depends on who is asking.
 *
 * A Pass that is not live makes nothing claimable, whether or not the upgrade was
 * bought — so neither guest is ever shown the "show your card" line. What differs
 * is the sentence and the button: an owner is told when their benefits start, and a
 * guest who has not upgraded is told what Privilege is and offered it, as long as
 * the stay still has a future. `test/privilege-card.test.mjs` holds that matrix in
 * full; this is the half of it the partner section is responsible for.
 */
test('a Pass that is not live never reads as usable, whoever owns it', confirmed(() => {
  for (const state of ['not-started', 'expired', 'cancelled']) {
    for (const pass of [standardPass(state), privilegePass(state)]) {
      const html = privilegeSection(cardBenefits(), pass, 'it');
      assert.equal(html.includes(UI.it.privilegeBenefitsNote), false,
        `${state}: nothing may read as usable today`);
      assert.equal(html.split('class="partner" data-access="unavailable"').length - 1, 2, state);
    }
  }
}));

test('an owner is told when their benefits start; everyone else is told what they are', confirmed(() => {
  for (const state of ['not-started', 'expired', 'cancelled']) {
    const owner = privilegeSection(cardBenefits(), privilegePass(state), 'it');
    assert.ok(owner.includes(UI.it.privilegeWhenActive), state);
    assert.equal(owner.includes('data-product='), false, 'and never sold it twice');

    const guest = privilegeSection(cardBenefits(), standardPass(state), 'it');
    assert.ok(guest.includes(UI.it.privilegeBenefitsDiscover), state);
  }
}));

test('the upgrade is offered while the stay has a future, and not afterwards', confirmed(() => {
  // Buying before arrival is legitimate: the card is sold inside the stay and its
  // start dates are the stay's own.
  for (const state of ['not-started', 'active']) {
    assert.ok(privilegeSection(cardBenefits(), standardPass(state), 'it').includes('data-product='), state);
  }
  // A stay that is over, or was called off, has nothing left to buy an upgrade for.
  for (const state of ['expired', 'cancelled']) {
    assert.equal(
      privilegeSection(cardBenefits(), standardPass(state), 'it').includes('data-product='),
      false,
      state,
    );
  }
}));

test('Opera Caffè is never drawn inside the Privilege section', confirmed(() => {
  for (const pass of [standardPass('active'), privilegePass('active')]) {
    assert.equal(privilegeSection(cardBenefits(), pass, 'it').includes('Opera'), false);
    assert.ok(stayBenefitsSection(stayBenefits(), pass, 'it').includes('Opera Caffè'));
  }
}));

test('the public guide lists what the stay includes without judging a Pass', confirmed(() => {
  // No Pass at all: this is information, not an entitlement, so nothing is dimmed.
  const html = stayBenefitsSection(stayBenefits(), null, 'it');
  assert.ok(html.includes('Opera Caffè'));
  assert.equal(html.includes('data-access="unavailable"'), false);
  assert.equal(html.includes('data-access="locked"'), false);
}));

test('an empty register draws nothing rather than an empty heading', () => {
  assert.equal(privilegeSection([], privilegePass('active'), 'it'), '');
  assert.equal(stayBenefitsSection([], null, 'it'), '');
});

test('every confirmed run above put the real register back', () => {
  // The tests that borrowed the confirmed state ran before this one. If any of
  // them leaked it, Bella Vigna would be selling an upgrade it has not agreed.
  assert.deepEqual(cardPartners(), []);
  assert.deepEqual(stayPartners(), []);
  assert.equal(isPurchasable(privilegeCard(), { allowPlaceholders: true }), false);
  assert.equal(isSellable('privilege-card:2d'), false, 'and the prices are placeholders again');
});
