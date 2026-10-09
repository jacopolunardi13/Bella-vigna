/**
 * Facts that belong to one guest, for one stay, and to nobody else.
 *
 * The guide is public: anything in `data/` is a URL away from anyone. A few things
 * a guest needs are not like that — today, the in-room Wi-Fi password — and they
 * must never sit in the repository, the public guide, a log or a preview.
 *
 * So they are configured in the environment, read by `server/config.js` (never in
 * preview), and handed out here only to a personal guide link whose stay is live:
 * not cancelled, not a provisional calendar hold, and within the stay — from the
 * day before arrival, when a guest checks the guide on the train, to the morning
 * they leave. Outside that window the link still works and simply does not carry
 * them.
 *
 * Bella Vigna's guests normally join the Wi-Fi by scanning the QR code in the room
 * (Property Pack §1). The password is the fallback for a phone that will not scan,
 * which is why the guide works without it and says so.
 */

import { addDays, propertyDate } from '../commerce/time.js';

export function privateWindowOpen(reservation, today = propertyDate()) {
  if (!reservation || reservation.status === 'cancelled' || reservation.provisional === true) return false;
  if (!reservation.check_in || !reservation.check_out) return false;
  return today >= addDays(reservation.check_in, -1) && today <= reservation.check_out;
}

/** The Wi-Fi password for this guest, today, or nothing. */
export function wifiFor(reservation, { password = '', today = propertyDate() } = {}) {
  if (!password) return null;
  if (!privateWindowOpen(reservation, today)) return null;
  return { password };
}
