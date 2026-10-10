#!/usr/bin/env node
/**
 * Is the staging up, safe and wired? Checked from outside, without signing in.
 *
 *   node tools/verify-staging.mjs
 *   GUIDE_URL=… LUNART_URL=… CONSOLE_URL=… node tools/verify-staging.mjs
 *
 * Every check is a public GET: health endpoints, the staging front door, the
 * console's page and its deep health (yes/no per house). Nothing is written,
 * nobody is signed in, no secret is needed or printed.
 */

const URLS = {
  guide: (process.env.GUIDE_URL ?? 'https://bella-vigna-preview.onrender.com').replace(/\/$/, ''),
  lunart: (process.env.LUNART_URL ?? 'https://lunart-pr6-staging.onrender.com').replace(/\/$/, ''),
  console: (process.env.CONSOLE_URL ?? 'https://staff-console-staging.onrender.com').replace(/\/$/, ''),
};

let failures = 0;
const note = (ok, message) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`); };

/** Free services sleep: the first answer can take a minute. */
async function get(url, { json = true } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90_000), redirect: 'manual' });
      const text = await response.text();
      return { status: response.status, headers: response.headers, text, body: json ? JSON.parse(text || 'null') : null };
    } catch (error) {
      if (attempt === 3) return { status: 0, error: error.message, text: '' };
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  return { status: 0, text: '' };
}

console.log('\n── Bella Vigna guide ──');
const guide = await get(`${URLS.guide}/api/health`);
note(guide.status === 200, `${URLS.guide} answers (${guide.status || guide.error})`);
note(guide.body?.preview === true, 'it is in demonstration mode (GUIDE_PREVIEW)');
note(guide.body?.payments === 'mock', `payments are the stand-in (${guide.body?.payments})`);
note(guide.body?.integrations?.staffConsole?.configured === true, 'it accepts the console’s credential');
note(guide.body?.integrations?.staffConsole?.relay === true, 'it relays notifications to the console');
const front = await get(`${URLS.guide}/preview`, { json: false });
const links = [...front.text.matchAll(/href="([^"]+\/g\/[\w-]+)"/g)].map((m) => m[1]);
note(front.status === 200 && links.length >= 1, `the staging front door lists personal guides (${links.length})`);
note(front.text.includes(URLS.console), 'and links to the Staff console');
if (links[0]) {
  const personal = await get(`${URLS.guide}/api/guide/${links[0].split('/g/')[1]}`);
  note(personal.status === 200, 'a personal guide resolves');
}

console.log('\n── LunArt (PR #6 branch, demonstration mode) ──');
const lunart = await get(`${URLS.lunart}/api/health`);
note(lunart.status === 200, `${URLS.lunart} answers (${lunart.status || lunart.error})`);
note(lunart.body?.preview === true, 'it is in demonstration mode (LUNART_PREVIEW)');
note(lunart.body?.payments === 'mock', `payments are the stand-in (${lunart.body?.payments})`);
note(lunart.body?.integrations?.staffConsole?.configured === true, 'it accepts the console’s credential');

console.log('\n── Staff console ──');
const health = await get(`${URLS.console}/console/api/health?deep=1`);
note(health.status === 200, `${URLS.console} answers (${health.status || health.error})`);
note(health.body?.preview === true, 'it says Staging on every screen');
note(health.body?.store === 'postgres', `people and passkeys are kept in the database (${health.body?.store})`);
note(health.body?.setup === true, 'the owner’s setup code is configured (its value is never shown)');
for (const check of health.body?.checks ?? []) {
  note(check.reachable && check.credentialAccepted && check.sameHouse && check.preview === true,
    `${check.id}: reachable ${check.reachable}, credential accepted ${check.credentialAccepted}, right house ${check.sameHouse}, demo mode ${check.preview}${check.error ? ` (${check.error})` : ''}`);
}
const page = await get(`${URLS.console}/`, { json: false });
note(page.status === 200 && page.text.includes('Accedi con passkey'), 'the console page shows the passkey sign-in');
note(/frame-ancestors 'none'/.test(page.headers?.get('content-security-policy') ?? ''), 'with its strict security policy');
const me = await get(`${URLS.console}/console/api/me`);
note(me.status === 401, 'and nobody is signed in without a passkey');
const proxied = await get(`${URLS.console}/console/api/p/bella-vigna/dashboard`);
note(proxied.status === 401, 'a house’s data cannot be read without signing in');

console.log(failures === 0 ? '\nSTAGING VERIFIED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
