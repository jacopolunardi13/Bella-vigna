/**
 * Who may do what, decided on the server.
 *
 * The page hides the buttons a person cannot use, but that is a courtesy: every
 * request is checked here before it reaches a property, against the person's role
 * and the houses they work for. A request the table below does not name is not
 * forwarded at all — the console is an allowlist of the Staff API, not a tunnel.
 *
 * Roles (operator's decision, 9 October 2026):
 *   - frontdesk (Diego): reservations, arrivals, guest requests and orders;
 *   - manager (Valentina): all of that, plus money, bulk email and the repairs;
 *   - owner (Jacopo): everything, including who has access.
 *
 * "Sensitive" operations — refunds, cancelling an order that may refund, bulk
 * email, reconciling a refund, managing access — also need the person to have
 * confirmed with their passkey in the last few minutes (`server/console/auth.js`),
 * on top of the confirmation the page asks for.
 */

import { matchRoute } from '../http.js';

export const ROLES = {
  frontdesk: {
    label: 'Front desk',
    permissions: [
      'dashboard.view', 'orders.view', 'orders.work',
      'reservations.view', 'reservations.manage', 'reservations.cancel',
      'sync.view', 'sync.run', 'notifications.receive', 'access.self',
    ],
  },
  manager: {
    label: 'Direzione',
    inherits: 'frontdesk',
    permissions: [
      'orders.cancel', 'orders.refund', 'payments.reconcile',
      'emails.bulk.preview', 'emails.bulk',
      'sync.repair', 'alerts.resolve', 'checks.view', 'audit.view',
    ],
  },
  owner: {
    label: 'Titolare',
    inherits: 'manager',
    permissions: ['access.manage'],
  },
};

export function permissionsOf(role) {
  const seen = new Set();
  for (let entry = ROLES[role]; entry; entry = ROLES[entry.inherits]) {
    for (const permission of entry.permissions) seen.add(permission);
  }
  return seen;
}

export const can = (user, permission) => Boolean(user && !user.disabled && permissionsOf(user.role).has(permission));

/** The houses a person works for, out of the ones the console serves. */
export function propertiesOf(user, served) {
  if (!user || user.disabled) return [];
  const wanted = user.properties ?? [];
  return served.filter((property) => wanted.includes('*') || wanted.includes(property.id));
}

export const mayUseProperty = (user, served, propertyId) =>
  propertiesOf(user, served).some((property) => property.id === propertyId);

/** Which order actions are routine and which move money. */
const ORDER_ACTIONS = {
  confirm: 'orders.work',
  reject: 'orders.work',
  preparing: 'orders.work',
  delivered: 'orders.work',
  completed: 'orders.work',
  substitution: 'orders.work',
  assign: 'orders.work',
  cancel: 'orders.cancel',
  refund: 'orders.refund',
};

const RESERVATION_ACTIONS = {
  edit: 'reservations.manage',
  link: 'reservations.manage',
  email: 'reservations.manage',
  cancel: 'reservations.cancel',
};

const always = () => true;

/**
 * The Staff API the console forwards, path by path (relative to `/api/staff`).
 *
 * `permission` may depend on the path parameters; `sensitive` on the body, for the
 * two endpoints that are a harmless dry run until the body says `confirm: true`.
 * Order matters: the first pattern that matches wins, so the fixed paths sit
 * before the ones with parameters in the same place.
 */
const POLICY = [
  ['GET', '/dashboard', { permission: 'dashboard.view' }],
  ['GET', '/orders', { permission: 'orders.view' }],
  ['GET', '/orders/:id/contact', { permission: 'orders.work' }],
  ['POST', '/orders/refund-reconcile', {
    permission: 'payments.reconcile',
    sensitive: (body) => body?.confirm === true,
  }],
  ['POST', '/orders/:id/:action', {
    permission: ({ action }) => ORDER_ACTIONS[action] ?? null,
    sensitive: (_body, { action }) => action === 'refund' || action === 'cancel',
    stampActor: true,
  }],
  ['GET', '/reservations', { permission: 'reservations.view' }],
  ['POST', '/reservations', { permission: 'reservations.manage' }],
  ['POST', '/reservations/:id/:action', {
    permission: ({ action }) => RESERVATION_ACTIONS[action] ?? null,
  }],
  ['GET', '/sync', { permission: 'sync.view' }],
  ['POST', '/sync/poll', { permission: 'sync.run' }],
  ['POST', '/sync/run/:job', { permission: 'sync.run' }],
  ['POST', '/sync/repair', { permission: 'sync.repair' }],
  ['POST', '/sync/backfill', { permission: 'sync.repair' }],
  ['POST', '/sync/reconcile', { permission: 'sync.repair' }],
  ['POST', '/sync/ingest', { permission: 'sync.repair' }],
  ['POST', '/sync/ical/inspect', { permission: 'sync.repair' }],
  ['POST', '/sync/send-emails', { permission: 'emails.bulk', sensitive: always }],
  ['GET', '/sync/guide-catchup', { permission: 'emails.bulk.preview' }],
  ['POST', '/sync/guide-catchup', { permission: 'emails.bulk', sensitive: always }],
  ['POST', '/alerts/:id/resolve', { permission: 'alerts.resolve' }],
  ['GET', '/checks', { permission: 'checks.view' }],
];

/**
 * The verdict on one forwarded request: `{ ok, permission, sensitive, stampActor }`
 * or `{ ok: false, status, error }`. Path segments are matched exactly, so
 * `/orders/x/../../checks` is not a route, it is a 404.
 */
const ROUTES = POLICY.map(([method, pattern, rule]) => [method, pattern, { ...rule, pattern }]);

/** An id, an action or a job name: never a path of its own. */
const SAFE_SEGMENT = /^[A-Za-z0-9_:-][A-Za-z0-9._:-]{0,119}$/;

export function policyFor(method, path, body = null) {
  const refused = { ok: false, status: 404, error: 'unknown-route' };
  let match;
  try { match = matchRoute(ROUTES, method, path); } catch { return refused; }
  if (!match) return refused;
  if (!Object.values(match.params).every((value) => SAFE_SEGMENT.test(value))) return refused;
  const rule = match.handler;
  const permission = typeof rule.permission === 'function' ? rule.permission(match.params) : rule.permission;
  if (!permission) return { ok: false, status: 400, error: 'unknown-action' };
  return {
    ok: true,
    permission,
    sensitive: Boolean(rule.sensitive?.(body, match.params)),
    stampActor: Boolean(rule.stampActor),
    params: match.params,
    // Rebuilt from the pattern, never copied from the request: what reaches the
    // property is exactly a route in the table above.
    upstreamPath: rule.pattern.split('/')
      .map((segment) => (segment.startsWith(':') ? encodeURIComponent(match.params[segment.slice(1)]) : segment))
      .join('/'),
  };
}

/** What the page needs to know to draw only the buttons that work. */
export function capabilities(user) {
  return [...permissionsOf(user?.role)].sort();
}
