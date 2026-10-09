/**
 * Prices for the preview only. Never loaded in production.
 *
 * The products with no commercial terms yet cannot be exercised end to end —
 * you cannot test a card purchase that refuses to be bought. This file fills those
 * gaps with figures that are obviously not real, so the flow can be walked through
 * without anyone mistaking a test value for a decision. €1.00 is not a price for an
 * eight-day privilege card, and that is the point.
 *
 * Loaded only when GUIDE_DEV_PRICES=1, which `npm run dev` and the tests set and
 * a production server does not.
 */

export const DEV_PRICES = {
  // Nothing to invent at Bella Vigna: every priced LunArt product is carried as a
  // placeholder at LunArt's own figure, which the preview sells. The entry LunArt
  // kept here (the light breakfast at €1) predates its real price and overrode it,
  // so the preview showed €1 for a €49 breakfast; it is gone. Products nobody has
  // priced (sunrise breakfast, the Chianti day) stay unpriced in the preview too.
};
