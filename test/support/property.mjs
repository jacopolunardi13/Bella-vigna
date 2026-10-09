/**
 * Test support: exercising the shared core on a property whose commercial terms
 * are not confirmed yet.
 *
 * Bella Vigna runs LunArt's partner network and catalogue, but nothing in it is
 * confirmed for Bella Vigna: every partner benefit waits on `PROPERTY_AGREEMENTS`
 * and every price is a `placeholder` (see `commerce/partners.js` and
 * `commerce/prices.js`). That is the honest production state, and tests assert it.
 *
 * The mechanisms behind it — a Privilege Card that is bought, issued, rotated,
 * validated by a venue, refunded and revoked — still have to be proved, because
 * the day the operator confirms an agreement they must simply work. These helpers
 * put the process into "as if confirmed" for the duration of a test, through the
 * same seams the server uses at boot (`applyPartners`, `applyPriceOverrides`), and
 * put it back afterwards. Nothing here is reachable from the guide or the server.
 */

import { applyPartners, NETWORK, PARTNERS } from '../../commerce/partners.js';
import { applyPriceOverrides, PRICES, WINE_PRICE_OVERRIDES, PRICE_STATUS } from '../../commerce/prices.js';

/** The shared network as if every LunArt agreement had been confirmed for this property. */
export function confirmAllAgreements() {
  applyPartners(NETWORK);
}

/** Back to the register in force: Bella Vigna's real state, everything activating. */
export function restoreAgreements() {
  applyPartners(PARTNERS);
}

/** Every placeholder carried over from LunArt, as if the operator had confirmed it. */
export function confirmedPriceTable(extra = {}) {
  const table = {};
  for (const [sku, entry] of Object.entries(PRICES)) {
    if (entry.status === PRICE_STATUS.placeholder && typeof entry.amount === 'number') {
      table[sku] = { ...entry, status: PRICE_STATUS.confirmed };
    }
  }
  for (const [id, entry] of Object.entries(WINE_PRICE_OVERRIDES)) {
    table[`wine:${id}`] = { ...entry, status: PRICE_STATUS.confirmed };
  }
  return { ...table, ...extra };
}

export function confirmAllPrices(extra = {}) {
  applyPriceOverrides(confirmedPriceTable(extra));
}

export function restorePrices() {
  applyPriceOverrides({});
}

/** Both at once, for a test about the commerce mechanics rather than about Bella Vigna's terms. */
export function asIfConfirmed() {
  confirmAllAgreements();
  confirmAllPrices();
  return () => { restoreAgreements(); restorePrices(); };
}
