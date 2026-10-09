/**
 * The Staff console: who works there and which houses it serves.
 *
 * One console for every property (operator's decision, 9 October 2026): one login
 * per person, one app on the phone, every record labelled with its house. The
 * properties keep their own servers, stores and integrations; the console holds
 * only people, their passkeys, their sessions and the audit log, and reaches each
 * house through that house's Staff API (`server/console/`).
 *
 * Nothing here is secret. The address of each property and the credential the
 * console uses to call it are environment variables of the console service
 * (`CONSOLE_PROPERTY_<ID>_URL`, `CONSOLE_PROPERTY_<ID>_TOKEN`), never this file.
 */

/**
 * The houses the console knows how to show. Adding a third is a row here plus
 * its two environment variables: no copy of the app.
 *
 * `rooms` is a fallback for a property whose Staff API does not yet list its own
 * rooms (LunArt in production until its PR is deployed); a property that answers
 * with `rooms` is believed instead.
 */
export const CONSOLE_PROPERTIES = [
  {
    id: 'lunart',
    name: 'LunArt',
    longName: 'LunArt Firenze',
    rooms: ['301', '302', '303', '304', '305', '306'],
  },
  {
    id: 'bella-vigna',
    name: 'Bella Vigna',
    longName: 'Bella Vigna Firenze',
    rooms: ['Standard', 'Deluxe', 'Terrazza'],
  },
];

/**
 * The people, as the operator listed them. No one else has an account until this
 * list says so; the store follows it at every start (a person removed here is
 * disabled there, with their sessions).
 *
 * `properties: ['*']` means every house the console serves, now and later — the
 * owner only. Everyone else names the houses they work for, so a property added
 * tomorrow is not opened to them by accident.
 */
export const CONSOLE_OPERATORS = [
  { id: 'jacopo', name: 'Jacopo', role: 'owner', properties: ['*'] },
  { id: 'valentina', name: 'Valentina', role: 'manager', properties: ['lunart', 'bella-vigna'] },
  { id: 'diego', name: 'Diego', role: 'frontdesk', properties: ['lunart', 'bella-vigna'] },
];

/** The console's own name, on the login screen, the app icon and the passkey prompt. */
export const CONSOLE_NAME = 'Staff LunArt · Bella Vigna';
