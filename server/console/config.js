/**
 * The console's settings, all from the environment of the console service.
 *
 *   CONSOLE_PUBLIC_URL            where operators open it (https in any real use);
 *                                 falls back to RENDER_EXTERNAL_URL. Passkeys are
 *                                 bound to this host: changing it means enrolling again.
 *   CONSOLE_PROPERTY_<ID>_URL     each house's server, e.g. CONSOLE_PROPERTY_LUNART_URL
 *   CONSOLE_PROPERTY_<ID>_TOKEN   the credential the console uses on that house's
 *                                 Staff API (its CONSOLE_SERVICE_TOKEN, or — for a
 *                                 house not yet updated — its STAFF_TOKEN)
 *   CONSOLE_PROPERTY_<ID>_RELAY_SECRET
 *                                 shared with that house, to sign the events it sends
 *   CONSOLE_SETUP_CODE            the owner's first enrolment and last-resort recovery
 *   CONSOLE_DATA_DIR / DATABASE_URL
 *                                 where the console's own store lives (see store.js)
 *   CONSOLE_VAPID_PUBLIC_KEY / _PRIVATE_KEY / _SUBJECT
 *                                 Web Push; without them the console makes a pair once
 *                                 and keeps it in its store
 *   CONSOLE_PREVIEW=1             staging: says so on every screen
 *
 * `<ID>` is the property id in capitals with `-` as `_` (bella-vigna → BELLA_VIGNA).
 * A property with no URL is simply not served. Credentials are read here and
 * never leave the server: no response, log line or page ever carries one.
 */

import { CONSOLE_PROPERTIES, CONSOLE_NAME } from '../../data/console.js';

const envKey = (id) => id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
const bool = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());

export function propertiesFromEnv(env = process.env, known = CONSOLE_PROPERTIES) {
  const served = [];
  for (const property of known) {
    const key = `CONSOLE_PROPERTY_${envKey(property.id)}`;
    const url = String(env[`${key}_URL`] ?? '').trim().replace(/\/+$/, '');
    if (!url) continue;
    served.push({
      ...property,
      url,
      token: String(env[`${key}_TOKEN`] ?? ''),
      relaySecret: String(env[`${key}_RELAY_SECRET`] ?? ''),
    });
  }
  return served;
}

export function consoleConfig(env = process.env) {
  const port = Number(env.PORT ?? 4180);
  const publicUrl = String(env.CONSOLE_PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`)
    .replace(/\/+$/, '');
  const url = new URL(publicUrl);
  const production = env.NODE_ENV === 'production';

  const config = {
    name: CONSOLE_NAME,
    port,
    production,
    preview: bool(env.CONSOLE_PREVIEW),
    publicUrl,
    origin: url.origin,
    rpId: url.hostname,
    secureCookies: url.protocol === 'https:' || url.hostname === 'localhost',
    properties: propertiesFromEnv(env),
    setupCode: String(env.CONSOLE_SETUP_CODE ?? ''),
    dataDir: String(env.CONSOLE_DATA_DIR ?? ''),
    databaseUrl: String(env.DATABASE_URL ?? ''),
    databaseSsl: !bool(env.DATABASE_NO_SSL),
    vapid: {
      publicKey: String(env.CONSOLE_VAPID_PUBLIC_KEY ?? ''),
      privateKey: String(env.CONSOLE_VAPID_PRIVATE_KEY ?? ''),
      subject: String(env.CONSOLE_VAPID_SUBJECT ?? 'mailto:staff@invalid.example'),
    },
    /** How long a phone stays signed in, and how fresh a passkey check must be for money. */
    session: { absoluteHours: 14 * 24, idleHours: 72, stepUpMinutes: 5 },
    upstreamTimeoutMs: Number(env.CONSOLE_UPSTREAM_TIMEOUT_MS ?? 10000),
    /** Behind Render's proxy the client is the first X-Forwarded-For address (rate limits only). */
    trustProxy: Boolean(env.RENDER) || bool(env.CONSOLE_TRUST_PROXY),
  };

  const warnings = [];
  if (production && url.protocol !== 'https:') warnings.push('CONSOLE_PUBLIC_URL is not https: passkeys will not work outside localhost.');
  if (config.properties.length === 0) warnings.push('No CONSOLE_PROPERTY_<ID>_URL is set: the console serves no house.');
  for (const property of config.properties) {
    if (!property.token) warnings.push(`CONSOLE_PROPERTY_${envKey(property.id)}_TOKEN is not set: ${property.name} will refuse every request.`);
    if (!property.relaySecret) warnings.push(`CONSOLE_PROPERTY_${envKey(property.id)}_RELAY_SECRET is not set: ${property.name} cannot send notifications to the console.`);
  }
  if (!config.setupCode) warnings.push('CONSOLE_SETUP_CODE is not set: the owner cannot enrol a first passkey (or recover one).');
  if (production && !config.dataDir && !config.databaseUrl) warnings.push('Neither CONSOLE_DATA_DIR nor DATABASE_URL is set: people and passkeys are lost at every restart.');
  config.warnings = warnings;
  return config;
}
