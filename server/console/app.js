/**
 * The Staff console's HTTP surface.
 *
 *   /                          the Staff app (the same `src/staff/app.js` every
 *                              property ships), in console mode
 *   /console/api/…             sign-in, people, notifications, the audit log
 *   /console/api/p/<id>/…      one property's Staff API, through `permissions.js`
 *   /console/api/all/…         the same read across every house the person works for
 *   /console/api/relay/<id>    signed events from a property (no session: HMAC)
 *
 * Every state-changing request must come from the console's own origin (checked
 * on `Origin`, on top of the SameSite=Strict session cookie). Responses carry no
 * credential, no property address, and `cache-control: no-store`.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BODY_BYTES, matchRoute, readJson, readRawBody, sendJson, sendText, serveStatic } from '../http.js';
import { createPushAdapter } from '../push.js';
import { AuthError, createAuth } from './auth.js';
import { record, recentAudit } from './audit.js';
import { createNotifier } from './notify.js';
import { can, capabilities, mayUseProperty, policyFor, propertiesOf, ROLES } from './permissions.js';
import { cleanSearch, createUpstream, identity } from './upstream.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** What the console page may load: the Staff app and what it imports, nothing else of the guide. */
const STATIC_PREFIXES = ['/assets/', '/src/staff/'];
const STATIC_FILES = new Set(['/commerce/rooms.js', '/data/rooms.js', '/data/brand.js', '/data/console.js', '/console-sw.js']);

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'publickey-credentials-get=(self), publickey-credentials-create=(self), camera=(), microphone=(), geolocation=()',
};

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
  "font-src 'self'", "connect-src 'self'", "manifest-src 'self'", "worker-src 'self'",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
].join('; ');

const noStore = { 'cache-control': 'no-store', ...SECURITY_HEADERS };

/** A short, human name for the device, for the list of open sessions. */
export function deviceName(userAgent = '') {
  const ua = String(userAgent);
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, browser].filter(Boolean).join(' · ');
}

export async function createConsoleApp({ config, store, fetchImpl, pushTransport = null, now = () => Date.now() }) {
  const auth = createAuth({ store, config, now });
  const upstream = createUpstream({ timeoutMs: config.upstreamTimeoutMs, fetchImpl });

  // Web Push keys: from the environment, or made once and kept in the store, so a
  // restart does not orphan every phone's subscription.
  let vapid = config.vapid;
  if (!vapid.publicKey || !vapid.privateKey) {
    vapid = await store.update(async (doc) => {
      if (!doc.secrets.vapid) {
        const { default: webpush } = await import('web-push');
        doc.secrets.vapid = webpush.generateVAPIDKeys();
      }
      return { ...config.vapid, ...doc.secrets.vapid };
    });
  }
  const push = createPushAdapter({
    vapidPublicKey: vapid.publicKey, vapidPrivateKey: vapid.privateKey, vapidSubject: vapid.subject, pushTransport,
  });
  const notifier = createNotifier({ store, push, config, now });

  const ipOf = (req) => {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    return (config.trustProxy && forwarded) || req.socket?.remoteAddress || 'unknown';
  };

  const sameOrigin = (req) => req.headers.origin === config.origin;

  const fail = (res, error) => {
    if (error instanceof AuthError) {
      sendJson(res, error.statusCode, { error: error.code }, noStore);
      return;
    }
    throw error;
  };

  /** A handler that needs a signed-in person, and optionally a permission. */
  const signedIn = (handler, permission = null) => async (req, res, params, url) => {
    const session = await auth.sessionFor(req);
    if (!session) { sendJson(res, 401, { error: 'unauthenticated' }, noStore); return; }
    if (permission && !can(session.user, permission)) {
      sendJson(res, 403, { error: 'forbidden', permission }, noStore);
      return;
    }
    await handler(req, res, { ...params, session }, url);
  };

  /** Plus a passkey check in the last few minutes. */
  const freshlyVerified = (handler, permission) => signedIn(async (req, res, params, url) => {
    if (!auth.freshlyVerified(params.session.session)) {
      sendJson(res, 403, { error: 'step-up-required' }, noStore);
      return;
    }
    await handler(req, res, params, url);
  }, permission);

  const body = (req) => readJson(req).catch(() => ({}));

  /* ── Who am I ─────────────────────────────────────────────────────────── */

  async function getMe(req, res, { session }) {
    const { user } = session;
    sendJson(res, 200, {
      name: config.name,
      preview: config.preview,
      user: { id: user.id, name: user.name, role: user.role, roleLabel: ROLES[user.role]?.label ?? user.role },
      permissions: capabilities(user),
      properties: propertiesOf(user, config.properties).map((p) => ({ ...identity(p), rooms: p.rooms })),
      push: { configured: push.configured, publicKey: push.publicKey },
      verifiedUntil: new Date(Date.parse(session.session.verified_at) + config.session.stepUpMinutes * 60e3).toISOString(),
    }, noStore);
  }

  /**
   * `?deep=1`: whether each house answers, accepts the console's credential, is
   * the house it should be, and runs in demonstration mode — yes/no only, never a
   * record, an address or a secret. It is how a deployment is checked from outside
   * without signing in. Cached for 30 seconds, so it cannot be used to hammer the
   * properties.
   */
  let deepCache = { at: 0, value: null };
  async function deepCheck() {
    if (deepCache.value && now() - deepCache.at < 30_000) return deepCache.value;
    const value = await Promise.all(config.properties.map(async (property) => {
      let reachable = false;
      let preview = null;
      try {
        const answer = await (fetchImpl ?? fetch)(`${property.url}/api/health`, { signal: AbortSignal.timeout(config.upstreamTimeoutMs) });
        reachable = answer.ok;
        preview = Boolean((await answer.json().catch(() => ({}))).preview);
      } catch { /* unreachable */ }
      const staff = await upstream.call(property, { method: 'GET', path: '/dashboard' });
      return {
        id: property.id,
        reachable,
        preview,
        credentialAccepted: staff.status === 200,
        sameHouse: staff.payload?.error !== 'property-mismatch',
        error: staff.status === 200 ? null : staff.payload?.error ?? `status-${staff.status}`,
      };
    }));
    deepCache = { at: now(), value };
    return value;
  }

  async function getHealth(req, res, _params, url) {
    sendJson(res, 200, {
      ok: true,
      service: 'staff-console',
      preview: config.preview,
      store: store.backend,
      properties: config.properties.map((p) => ({ id: p.id, name: p.name, credential: Boolean(p.token), relay: Boolean(p.relaySecret) })),
      setup: Boolean(config.setupCode),
      push: push.configured,
      ...(url?.searchParams.get('deep') === '1' ? { checks: await deepCheck() } : {}),
    }, noStore);
  }

  /* ── Signing in ───────────────────────────────────────────────────────── */

  async function postSignInOptions(req, res) {
    sendJson(res, 200, await auth.signInOptions(), noStore);
  }

  async function postSignInVerify(req, res) {
    const input = await body(req);
    try {
      const { user, setCookie } = await auth.signInVerify({
        response: input.response, device: deviceName(req.headers['user-agent']), ip: ipOf(req),
      });
      sendJson(res, 200, { ok: true, user }, { ...noStore, 'set-cookie': setCookie });
    } catch (error) { fail(res, error); }
  }

  async function postSignOut(req, res) {
    const session = await auth.sessionFor(req);
    if (session) await auth.endSession(session.key);
    sendJson(res, 200, { ok: true }, { ...noStore, 'set-cookie': auth.clearCookie() });
  }

  async function postInviteDescribe(req, res) {
    const input = await body(req);
    try {
      sendJson(res, 200, await auth.describeInvite(String(input.invite ?? ''), ipOf(req)), noStore);
    } catch (error) { fail(res, error); }
  }

  async function postEnrolOptions(req, res) {
    const input = await body(req);
    try {
      const session = input.invite || input.setupCode !== undefined ? null : await auth.sessionFor(req);
      const result = await auth.enrolOptions({
        invite: input.invite ? String(input.invite) : undefined,
        setupCode: input.setupCode !== undefined ? String(input.setupCode) : undefined,
        userId: input.user ? String(input.user) : undefined,
        session,
        ip: ipOf(req),
      });
      sendJson(res, 200, result, noStore);
    } catch (error) { fail(res, error); }
  }

  async function postEnrolVerify(req, res) {
    const input = await body(req);
    try {
      const { user, setCookie } = await auth.enrolVerify({
        response: input.response,
        label: String(input.label ?? ''),
        device: deviceName(req.headers['user-agent']),
        ip: ipOf(req),
      });
      sendJson(res, 200, { ok: true, user }, { ...noStore, 'set-cookie': setCookie });
    } catch (error) { fail(res, error); }
  }

  async function postStepUpOptions(req, res, { session }) {
    sendJson(res, 200, await auth.stepUpOptions(session), noStore);
  }

  async function postStepUpVerify(req, res, { session }) {
    const input = await body(req);
    try {
      sendJson(res, 200, await auth.stepUpVerify(session, { response: input.response }), noStore);
    } catch (error) { fail(res, error); }
  }

  /* ── My passkeys ──────────────────────────────────────────────────────── */

  async function getMyPasskeys(req, res, { session }) {
    const sessions = await store.read((doc) => Object.entries(doc.sessions)
      .filter(([, s]) => s.user_id === session.user.id)
      .map(([key, s]) => ({ device: s.device, last_seen_at: s.last_seen_at, current: key === session.key })));
    sendJson(res, 200, { passkeys: await auth.passkeysOf(session.user.id), sessions }, noStore);
  }

  async function postMyPasskeyRevoke(req, res, { session, id }) {
    try {
      sendJson(res, 200, await auth.revokePasskey({ by: session.user, credentialId: id, userId: session.user.id }), noStore);
    } catch (error) { fail(res, error); }
  }

  /* ── People (owner) ───────────────────────────────────────────────────── */

  async function getPeople(req, res) {
    const people = await store.read((doc) => Object.values(doc.users).filter((u) => !u.disabled).map((user) => {
      const passkeys = Object.values(doc.credentials).filter((c) => c.user_id === user.id && !c.revoked_at);
      const sessions = Object.values(doc.sessions).filter((s) => s.user_id === user.id);
      const pending = Object.values(doc.invites).find((i) => i.user_id === user.id && !i.used_at && Date.parse(i.expires_at) > now());
      return {
        id: user.id, name: user.name, role: user.role, roleLabel: ROLES[user.role]?.label ?? user.role,
        properties: propertiesOf(user, config.properties).map(identity),
        passkeys: passkeys.map((c) => ({ id: c.id, label: c.label, created_at: c.created_at, last_used_at: c.last_used_at })),
        sessions: sessions.length,
        last_seen_at: sessions.map((s) => s.last_seen_at).sort().at(-1) ?? null,
        invite_pending_until: pending?.expires_at ?? null,
      };
    }));
    sendJson(res, 200, { people }, noStore);
  }

  async function postPersonInvite(req, res, { session, id }) {
    const input = await body(req);
    try {
      const result = await auth.createInvite({
        by: session.user, userId: id,
        purpose: input.purpose === 'recover' ? 'recover' : 'enroll',
        revokeExisting: input.revokeExisting === true,
      });
      sendJson(res, 200, { ok: true, ...result }, noStore);
    } catch (error) { fail(res, error); }
  }

  async function postPersonPasskeyRevoke(req, res, { session, id, credential }) {
    try {
      sendJson(res, 200, await auth.revokePasskey({ by: session.user, credentialId: credential, userId: id }), noStore);
    } catch (error) { fail(res, error); }
  }

  async function postPersonSignOut(req, res, { session, id }) {
    sendJson(res, 200, await auth.revokeSessions({ by: session.user, userId: id, except: id === session.user.id ? session.key : null }), noStore);
  }

  async function getAudit(req, res, { session }, url) {
    const property = url.searchParams.get('property');
    if (property && !mayUseProperty(session.user, config.properties, property)) {
      sendJson(res, 403, { error: 'forbidden' }, noStore);
      return;
    }
    const entries = await recentAudit(store, { limit: Number(url.searchParams.get('limit') ?? 100), property });
    // Someone who does not work for a house does not read its history either.
    const visible = entries.filter((entry) => !entry.property || mayUseProperty(session.user, config.properties, entry.property));
    sendJson(res, 200, { entries: visible }, noStore);
  }

  /* ── Notifications ────────────────────────────────────────────────────── */

  async function getNotifications(req, res, { session }) {
    sendJson(res, 200, { notifications: await notifier.recent(session.user) }, noStore);
  }

  async function postPushSubscribe(req, res, { session }) {
    const input = await body(req);
    const result = await notifier.subscribe(session.user, { subscription: input.subscription, label: input.label });
    sendJson(res, result.ok ? 200 : 422, result, noStore);
  }

  async function postPushTest(req, res, { session }) {
    sendJson(res, 200, await notifier.test(session.user), noStore);
  }

  async function postRelay(req, res, { property }) {
    const raw = await readRawBody(req, MAX_BODY_BYTES).catch(() => null);
    if (raw === null) { sendJson(res, 413, { error: 'too-large' }, noStore); return; }
    const result = await notifier.relay(property, { rawBody: raw.toString('utf8'), headers: req.headers });
    sendJson(res, result.status, result.payload, noStore);
  }

  /* ── The properties ───────────────────────────────────────────────────── */

  const AGGREGATES = {
    dashboard: { path: '/dashboard', permission: 'dashboard.view' },
    orders: { path: '/orders', permission: 'orders.view' },
    reservations: { path: '/reservations', permission: 'reservations.view' },
  };

  /** One read, every house this person works for (or the ones they picked). */
  async function getAggregate(req, res, { session, view }, url) {
    const spec = AGGREGATES[view];
    if (!spec) { sendJson(res, 404, { error: 'unknown-view' }, noStore); return; }
    if (!can(session.user, spec.permission)) { sendJson(res, 403, { error: 'forbidden' }, noStore); return; }
    const picked = String(url.searchParams.get('properties') ?? '').split(',').filter(Boolean);
    const scope = propertiesOf(session.user, config.properties).filter((p) => !picked.length || picked.includes(p.id));
    const params = new URLSearchParams(url.searchParams);
    params.delete('properties');
    const search = cleanSearch(params);
    const answers = await Promise.all(scope.map((property) => upstream.call(property, {
      method: 'GET', path: spec.path, search, actor: session.user,
    })));
    sendJson(res, 200, {
      results: answers.map((answer, i) => ({
        property: { ...identity(scope[i]), rooms: scope[i].rooms },
        ok: answer.status < 400,
        status: answer.status,
        data: answer.payload,
      })),
    }, noStore);
  }

  /** One request to one house, if the table in `permissions.js` and the person's role allow it. */
  async function proxy(req, res, session, propertyId, rest, url) {
    const { user } = session;
    const property = config.properties.find((p) => p.id === propertyId);
    if (!property) { sendJson(res, 404, { error: 'unknown-property' }, noStore); return; }
    if (!mayUseProperty(user, config.properties, propertyId)) {
      sendJson(res, 403, { error: 'property-not-allowed' }, noStore);
      return;
    }
    const input = req.method === 'POST' ? await body(req) : undefined;
    const verdict = policyFor(req.method, rest, input);
    const audit = (outcome, status) => req.method !== 'GET' && store.update((doc) => record(doc, {
      actor: user.id,
      action: `${verdict.permission ?? 'unknown'}${verdict.params?.action ? `:${verdict.params.action}` : ''}`,
      property: propertyId,
      target: verdict.params?.id ?? verdict.upstreamPath ?? rest,
      outcome: outcome === 'ok' ? 'ok' : `${outcome}:${status}`,
      at: new Date(now()),
    }));

    if (!verdict.ok) { sendJson(res, verdict.status, { error: verdict.error }, noStore); return; }
    if (!can(user, verdict.permission)) {
      await audit('refused', 403);
      sendJson(res, 403, { error: 'forbidden', permission: verdict.permission }, noStore);
      return;
    }
    if (verdict.sensitive && !auth.freshlyVerified(session.session)) {
      sendJson(res, 403, { error: 'step-up-required' }, noStore);
      return;
    }
    // Who did it is the console's to say, never the page's.
    const forwarded = input && verdict.stampActor ? { ...input, by: user.name } : input;
    const answer = await upstream.call(property, {
      method: req.method,
      path: verdict.upstreamPath,
      search: req.method === 'GET' ? cleanSearch(url.searchParams) : '',
      body: forwarded,
      actor: user,
    });
    await audit(answer.status < 400 ? 'ok' : 'failed', answer.status);
    sendJson(res, answer.status, answer.payload, noStore);
  }

  /* ── Pages ────────────────────────────────────────────────────────────── */

  let page = null;
  async function getPage(req, res) {
    page ??= await readFile(join(ROOT, 'console.html'), 'utf8');
    const html = page
      .replaceAll('{{NAME}}', config.name.replace(/[<>&"]/g, ''))
      .replace('{{PREVIEW}}', config.preview ? '' : 'hidden');
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
      'content-security-policy': CSP,
      ...SECURITY_HEADERS,
    }).end(html);
  }

  function getManifest(req, res) {
    sendJson(res, 200, {
      name: config.name,
      short_name: 'Staff',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#16140f',
      theme_color: '#16140f',
      icons: [
        { src: '/assets/icon-console-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/assets/icon-console-512.png', sizes: '512x512', type: 'image/png' },
      ],
    }, { 'content-type': 'application/manifest+json', ...SECURITY_HEADERS });
  }

  const routes = [
    ['GET', '/console/api/health', getHealth],
    ['GET', '/console/api/me', signedIn(getMe)],
    ['POST', '/console/api/sign-in/options', postSignInOptions],
    ['POST', '/console/api/sign-in/verify', postSignInVerify],
    ['POST', '/console/api/sign-out', postSignOut],
    ['POST', '/console/api/invite/describe', postInviteDescribe],
    ['POST', '/console/api/enrol/options', postEnrolOptions],
    ['POST', '/console/api/enrol/verify', postEnrolVerify],
    ['POST', '/console/api/step-up/options', signedIn(postStepUpOptions)],
    ['POST', '/console/api/step-up/verify', signedIn(postStepUpVerify)],
    ['GET', '/console/api/me/passkeys', signedIn(getMyPasskeys, 'access.self')],
    ['POST', '/console/api/me/passkeys/:id/revoke', signedIn(postMyPasskeyRevoke, 'access.self')],
    ['GET', '/console/api/people', signedIn(getPeople, 'access.manage')],
    ['POST', '/console/api/people/:id/invite', freshlyVerified(postPersonInvite, 'access.manage')],
    ['POST', '/console/api/people/:id/passkeys/:credential/revoke', freshlyVerified(postPersonPasskeyRevoke, 'access.manage')],
    ['POST', '/console/api/people/:id/sign-out', freshlyVerified(postPersonSignOut, 'access.manage')],
    ['GET', '/console/api/audit', signedIn(getAudit, 'audit.view')],
    ['GET', '/console/api/notifications', signedIn(getNotifications)],
    ['POST', '/console/api/push/subscribe', signedIn(postPushSubscribe, 'notifications.receive')],
    ['POST', '/console/api/push/test', signedIn(postPushTest, 'notifications.receive')],
    ['GET', '/console/api/all/:view', signedIn(getAggregate)],
    ['POST', '/console/api/relay/:property', postRelay],
    ['GET', '/console.webmanifest', getManifest],
    ['GET', '/', getPage],
  ];

  async function handle(req, res) {
    const url = new URL(req.url, 'http://console.invalid');
    try {
      // Everything that changes state comes from this origin, or not at all. The
      // relay is server-to-server and signs its body instead.
      const relay = url.pathname.startsWith('/console/api/relay/');
      if (req.method !== 'GET' && req.method !== 'HEAD' && !relay && !sameOrigin(req)) {
        sendJson(res, 403, { error: 'cross-origin' }, noStore);
        return;
      }

      const proxied = url.pathname.match(/^\/console\/api\/p\/([^/]+)(\/.*)$/);
      if (proxied && (req.method === 'GET' || req.method === 'POST')) {
        const session = await auth.sessionFor(req);
        if (!session) { sendJson(res, 401, { error: 'unauthenticated' }, noStore); return; }
        await proxy(req, res, session, decodeURIComponent(proxied[1]), proxied[2], url);
        return;
      }

      const route = matchRoute(routes, req.method, url.pathname);
      if (route) { await route.handler(req, res, route.params, url); return; }

      if (req.method === 'GET' || req.method === 'HEAD') {
        const allowed = STATIC_FILES.has(url.pathname) || STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
        if (allowed && await serveStatic(req, res, ROOT, url.pathname)) return;
      }
      sendText(res, 404, 'Not found');
    } catch (error) {
      if (error instanceof AuthError) { fail(res, error); return; }
      console.error('[console]', req.method, url.pathname, error);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal-error' }, noStore);
    }
  }

  return { handle, auth, notifier, push, store };
}
