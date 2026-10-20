/** Authenticated requests stay in the private renderer's own browser window. */
export function createPrivateTransport(service) {
  const origin = new URL(service).origin;
  let popup, channel, ready = false, connecting, finishConnection;
  const pending = new Map();

  window.addEventListener('message', event => {
    const message = event.data;
    if (event.origin !== origin || event.source !== popup || !message || message.channel !== channel) return;
    if (message.type === 'fakemessages:ready') {
      ready = true;
      finishConnection?.();
      return;
    }
    if (message.type !== 'fakemessages:response' || typeof message.id !== 'string') return;
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (!Number.isInteger(message.status) || message.status < 200 || message.status > 599
      || !(message.body instanceof ArrayBuffer) || message.body.byteLength > 20 * 1024 * 1024) {
      item.reject(new Error('The private renderer returned an invalid response.'));
      return;
    }
    item.resolve(new Response([204, 205, 304].includes(message.status) ? null : message.body, {
      status: message.status,
      headers: { 'Content-Type': message.contentType === 'image/png' ? 'image/png' : 'application/json' },
    }));
  });

  function connect(onProgress = () => {}) {
    if (ready && popup && !popup.closed) return Promise.resolve();
    if (connecting) return connecting;
    ready = false;
    channel = crypto.randomUUID();
    const url = new URL('/render', origin);
    url.searchParams.set('channel', channel);
    url.searchParams.set('parent', location.origin);
    // This runs synchronously from the Generate button's click so browsers can
    // open the sign-in window. Never put conversation content in its URL.
    popup = window.open(url.href, 'fakemessages-private-renderer', 'popup,width=480,height=620');
    if (!popup) return Promise.reject(new Error('Allow the private renderer window, then click Generate again.'));
    onProgress('Sign in to your private renderer…');
    connecting = new Promise((resolve, reject) => {
      const cleanup = () => {
        clearInterval(checkClosed); clearTimeout(timeout);
        finishConnection = undefined; connecting = undefined;
      };
      const checkClosed = setInterval(() => {
        if (!popup || popup.closed) {
          cleanup();
          reject(new Error('Finish signing in to the private renderer, then return here and click Generate again.'));
        }
      }, 700);
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Sign in to the private renderer, then return here and click Generate again.'));
      }, 180000);
      finishConnection = () => { cleanup(); resolve(); };
    });
    return connecting;
  }

  async function send(path, options = {}) {
    if (!ready || !popup || popup.closed) {
      ready = false;
      throw new Error('The private renderer window closed. Click Generate to reconnect.');
    }
    const encoded = new Request(`${origin}${path}`, options);
    const headers = {};
    for (const name of ['Content-Type', 'X-Renderer-Session']) {
      const value = encoded.headers.get(name);
      if (value) headers[name] = value;
    }
    const body = encoded.body ? await encoded.arrayBuffer() : undefined;
    if (body?.byteLength > 10 * 1024 * 1024) throw new Error('This request is larger than 10 MB.');
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('The private renderer did not respond. Check its window and try again.'));
      }, 50000);
      pending.set(id, {resolve, reject, timer});
      try {
        popup.postMessage({type: 'fakemessages:request', channel, id, path, method: encoded.method, headers, body}, origin, body ? [body] : []);
      } catch {
        clearTimeout(timer); pending.delete(id);
        reject(new Error('Could not reach the private renderer window. Click Generate to reconnect.'));
      }
    });
  }

  return { connect, send };
}
