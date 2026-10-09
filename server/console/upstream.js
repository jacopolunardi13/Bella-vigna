/**
 * The console's side of each property's Staff API.
 *
 * Every call is made by the console server, with that property's credential,
 * after `permissions.js` has said yes. The browser never sees a property's
 * address or credential; it sees `/console/api/p/<property>/…` and the answer.
 *
 * Each answer is checked to come from the house it was asked of: a property that
 * names itself (`property.id`, which the Core adds to every Staff answer) and names
 * a different house is refused — an address pasted into the wrong variable must
 * not show LunArt's guests under Bella Vigna's badge. An answer that names no
 * house (a property not yet updated) is labelled with the house it was asked of.
 */

const QUERY_KEY = /^[a-z_]{1,30}$/;

/** Only short, plain query parameters travel on; everything else is dropped. */
export function cleanSearch(searchParams) {
  const out = new URLSearchParams();
  for (const [key, value] of searchParams ?? []) {
    if (QUERY_KEY.test(key) && value.length <= 200) out.append(key, value);
  }
  const text = out.toString();
  return text ? `?${text}` : '';
}

export const identity = (property) => ({ id: property.id, name: property.name, longName: property.longName });

export function createUpstream({ timeoutMs = 10000, fetchImpl = fetch } = {}) {
  /**
   * `{ status, payload }` — the property's own status for a refusal it explains
   * (409, 422…), 502/504 when it cannot be reached or does not accept the console.
   */
  async function call(property, { method = 'GET', path, search = '', body, actor }) {
    if (!property.token) return { status: 502, payload: { error: 'property-not-configured', property: identity(property) } };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${property.url}/api/staff${path}${search}`, {
        method,
        headers: {
          authorization: `Bearer ${property.token}`,
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(actor ? { 'x-console-actor': actor.id } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error.name === 'AbortError';
      return {
        status: timedOut ? 504 : 502,
        payload: { error: timedOut ? 'property-timeout' : 'property-unreachable', property: identity(property) },
      };
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text().catch(() => '');
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = null; }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return { status: 502, payload: { error: 'property-bad-answer', property: identity(property) } };
    }
    // The property refusing the console's credential is a configuration problem,
    // not the operator's session: never pass a 401 through as if it were.
    if (response.status === 401 || response.status === 403) {
      return { status: 502, payload: { error: 'property-refused-console', property: identity(property) } };
    }
    const claimed = payload.property?.id;
    if (claimed && claimed !== property.id) {
      return { status: 502, payload: { error: 'property-mismatch', property: identity(property), claimed } };
    }
    return { status: response.status, payload: { ...payload, property: identity(property) } };
  }

  return { call };
}
