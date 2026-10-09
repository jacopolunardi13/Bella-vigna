/**
 * The console's log of who did what, where.
 *
 * One line per sign-in, passkey change, invitation, and every request that
 * changes something at a property — refused ones included, with the reason.
 * Never a guest's details: the target is an id, the detail is the outcome.
 * Readable by the people with `audit.view` (direzione, titolare).
 */

export function record(doc, { actor, action, property = null, target = null, outcome = 'ok', detail = null, at = new Date() }) {
  doc.audit.push({
    at: at.toISOString(),
    actor: String(actor ?? 'unknown'),
    action: String(action),
    property,
    target: target == null ? null : String(target).slice(0, 80),
    outcome,
    ...(detail ? { detail } : {}),
  });
}

export async function recentAudit(store, { limit = 100, property = null } = {}) {
  return store.read((doc) => doc.audit
    .filter((entry) => !property || entry.property === property)
    .slice(-Math.min(Math.max(1, limit), 500))
    .reverse());
}
