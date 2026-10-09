/**
 * Notifications: from each property, through the console, to the right phones.
 *
 * A property no longer pushes to staff phones itself. When something happens —
 * a new order, a guest cancellation, a reservation — its server signs the event
 * and posts it to the console (`relay`); the console checks the signature, keeps
 * the event, and pushes it to every device of every person who works for that
 * property. One phone, one subscription, both houses, each notification titled
 * with its house.
 *
 * The signature is HMAC-SHA256 over `<timestamp>.<raw body>` with a secret shared
 * by that property and the console only (`CONSOLE_PROPERTY_<ID>_RELAY_SECRET` here,
 * `CONSOLE_RELAY_SECRET` there). Five minutes of clock skew, and every event id is
 * accepted once.
 */

import { randomUUID } from 'node:crypto';
import { verifyRelaySignature } from '../relay.js';
import { can, mayUseProperty } from './permissions.js';
import { identity } from './upstream.js';

export { signRelay, verifyRelaySignature } from '../relay.js';

const clip = (value, max) => String(value ?? '').slice(0, max);

/** What a phone shows, rebuilt from the event rather than trusted as sent. */
export function consoleNotification(property, event) {
  const n = event.notification ?? {};
  const title = clip(n.title, 120);
  const prefix = `${property.name} · `;
  return {
    id: clip(event.id, 80) || randomUUID(),
    property: property.id,
    event: clip(event.event, 40),
    title: title.startsWith(prefix) ? title : `${prefix}${title || 'Aggiornamento'}`,
    body: clip(n.body, 300),
    tag: `${property.id}:${clip(n.tag, 100).replace(new RegExp(`^${property.id}:`), '')}`,
    url: `/?struttura=${encodeURIComponent(property.id)}`,
    at: new Date().toISOString(),
  };
}

export function createNotifier({ store, push, config, now = () => Date.now() }) {
  /**
   * Accept one signed event from a property. Returns `{ status, payload }`.
   */
  async function relay(propertyId, { rawBody, headers }) {
    const property = config.properties.find((p) => p.id === propertyId);
    if (!property || !property.relaySecret) return { status: 404, payload: { error: 'unknown-property' } };
    const check = verifyRelaySignature({
      secret: property.relaySecret,
      timestamp: headers['x-relay-timestamp'],
      signature: headers['x-relay-signature'],
      rawBody,
      now: now(),
    });
    if (!check.ok) return { status: 401, payload: { error: check.reason } };

    let event;
    try { event = JSON.parse(rawBody); } catch { return { status: 400, payload: { error: 'bad-json' } }; }
    if (event?.property !== property.id) return { status: 400, payload: { error: 'property-mismatch' } };
    const id = clip(event.id, 80);
    if (!id) return { status: 400, payload: { error: 'missing-id' } };

    const notification = consoleNotification(property, { ...event, id });
    const fresh = await store.update((doc) => {
      const cutoff = now() - 24 * 3600e3;
      for (const [key, at] of Object.entries(doc.relay_seen)) if (at < cutoff) delete doc.relay_seen[key];
      const key = `${property.id}:${id}`;
      if (doc.relay_seen[key]) return false;
      doc.relay_seen[key] = now();
      doc.notifications.push(notification);
      return true;
    });
    if (!fresh) return { status: 200, payload: { ok: true, duplicate: true } };
    const delivery = await deliver(notification);
    return { status: 202, payload: { ok: true, ...delivery } };
  }

  /** Every device of every person who may see this property. */
  async function deliver(notification) {
    const targets = await store.read((doc) => Object.values(doc.subscriptions).filter((subscription) => {
      const user = doc.users[subscription.user_id];
      return user && can(user, 'notifications.receive') && mayUseProperty(user, config.properties, notification.property);
    }));
    let delivered = 0;
    const gone = [];
    for (const subscription of targets) {
      try {
        const outcome = await push.send(subscription, notification);
        if (outcome.gone) gone.push(subscription.endpoint);
        else if (!outcome.error) delivered += 1;
      } catch { /* a transport error is temporary: the device stays */ }
    }
    if (gone.length) {
      await store.update((doc) => {
        for (const [key, subscription] of Object.entries(doc.subscriptions)) {
          if (gone.includes(subscription.endpoint)) delete doc.subscriptions[key];
        }
      });
    }
    return { devices: targets.length, delivered, removed: gone.length, simulated: !push.configured };
  }

  async function subscribe(user, { subscription, label = '' }) {
    const endpoint = clip(subscription?.endpoint, 1000);
    if (!endpoint.startsWith('https://')) return { ok: false, reason: 'invalid-subscription' };
    await store.update((doc) => {
      // An endpoint is one browser on one phone: whoever signed in on it last owns it.
      doc.subscriptions[endpoint] = {
        endpoint,
        keys: { p256dh: clip(subscription?.keys?.p256dh, 200), auth: clip(subscription?.keys?.auth, 100) },
        user_id: user.id,
        label: clip(label, 60),
        created_at: new Date(now()).toISOString(),
      };
    });
    return { ok: true };
  }

  async function test(user) {
    const notification = {
      id: randomUUID(), property: null, event: 'test',
      title: `${config.name} · Prova`, body: `Notifica di prova per ${user.name}`,
      tag: `test:${user.id}`, url: '/', at: new Date(now()).toISOString(),
    };
    const targets = await store.read((doc) => Object.values(doc.subscriptions).filter((s) => s.user_id === user.id));
    let delivered = 0;
    for (const subscription of targets) {
      const outcome = await push.send(subscription, notification).catch(() => ({ error: true }));
      if (!outcome.error && !outcome.gone) delivered += 1;
    }
    return { ok: true, devices: targets.length, delivered, simulated: !push.configured };
  }

  /** The recent events this person may see, newest first. */
  async function recent(user, limit = 50) {
    return store.read((doc) => doc.notifications
      .filter((n) => mayUseProperty(user, config.properties, n.property))
      .slice(-limit)
      .reverse()
      .map((n) => ({ ...n, property: identity(config.properties.find((p) => p.id === n.property)) })));
  }

  return { relay, deliver, subscribe, test, recent };
}
