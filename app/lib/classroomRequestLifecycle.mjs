// One explicit operation at a time. Retried operations retain their exact inputs.
export function createClassroomRequestGuard() {
  let active = null;
  return {
    begin(scope) {
      active?.controller.abort();
      const ticket = { scope, controller: new AbortController() };
      active = ticket;
      return ticket;
    },
    current(ticket, scope) { return active === ticket && ticket.scope === scope && !ticket.controller.signal.aborted; },
    finish(ticket) { if (active !== ticket) return false; active = null; return true; },
    cancel() { active?.controller.abort(); active = null; },
  };
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {{ signal?: AbortSignal, timeoutMs?: number, fetchImpl?: typeof fetch }} [config]
 */
export async function fetchClassroomResponse(url, options = {}, { signal, timeoutMs = 110000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  let timer;
  let onAbort;
  const interrupted = new Promise((_, reject) => {
    onAbort = () => { controller.abort(); reject(new Error('classroom_wait_stopped')); };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new Error('classroom_wait_timeout')); }, timeoutMs);
  });
  try {
    if (signal?.aborted) throw new Error('classroom_wait_stopped');
    return await Promise.race([interrupted, (async () => {
      const response = await fetchImpl(url, { ...options, cache: 'no-store', signal: controller.signal });
      // Consume the body within the same deadline, including slow/stalled streams.
      const body = await response.arrayBuffer();
      return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function createClassroomRequestCache() {
  const requests = new Map();
  return async (url, options, config) => {
    let entry = requests.get(url);
    if (!entry) { entry = { options, response: null }; requests.set(url, entry); }
    if (entry.response) return entry.response.clone();
    const response = await fetchClassroomResponse(url, entry.options, config);
    if (response.ok) entry.response = response.clone();
    return response;
  };
}
