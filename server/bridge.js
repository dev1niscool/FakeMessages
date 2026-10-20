(() => {
  'use strict';

  // Trust is deliberately limited to the editor's exact origins and the window
  // that opened us. Platform sign-in stays on this origin; its cookies and user
  // identity are never included in the postMessage protocol.
  const EDITOR_ORIGINS = new Set([
    'https://dev1niscool.github.io',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ]);
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const UUID_PATTERN = new RegExp(`^${UUID}$`, 'i');
  const JOB_PATH = new RegExp(`^/api/renders/${UUID}(?:/image(?:\\?download=1)?)?$`, 'i');
  const MAX_REQUEST = 10 * 1024 * 1024;
  const MAX_RESPONSE = 20 * 1024 * 1024;
  const parameters = new URLSearchParams(location.search);
  const channel = parameters.get('channel');
  const parentOrigin = parameters.get('parent');
  const status = document.getElementById('connection-status');
  const detail = document.getElementById('connection-detail');
  const setStatus = (title, description) => {
    if (status) status.textContent = title;
    if (detail) detail.textContent = description;
  };
  const retry = () => setStatus('You’re signed in.', 'Return to the editor and choose Generate again to reconnect this window.');

  if (!UUID_PATTERN.test(channel || '') || !EDITOR_ORIGINS.has(parentOrigin)) {
    setStatus('Ready to connect.', 'Open this window from the conversation editor when you generate a screenshot.');
    return;
  }
  const editor = window.opener;
  if (!editor || editor.closed) { retry(); return; }
  document.getElementById('return-to-editor')?.addEventListener('click', (event) => {
    if (stillConnected()) {
      event.preventDefault();
      editor.focus();
    }
  });
  const active = new Set();
  const seen = new Set();

  function stillConnected() {
    return window.opener === editor && !editor.closed;
  }

  function post(message, transfer = []) {
    if (!stillConnected()) { retry(); return; }
    try { editor.postMessage({ ...message, channel }, parentOrigin, transfer); }
    catch { retry(); }
  }

  function errorResponse(id, code, error) {
    const body = new TextEncoder().encode(JSON.stringify({ error })).buffer;
    post({ type: 'fakemessages:response', id, status: code, contentType: 'application/json; charset=utf-8', body }, [body]);
  }

  function validate(message) {
    if (typeof message.path !== 'string' || typeof message.method !== 'string') return null;
    const postRoute = ['/api/session', '/api/assets', '/api/renders'].includes(message.path);
    if (postRoute ? message.method !== 'POST' : !(message.method === 'GET' && JOB_PATH.test(message.path))) return null;
    if (message.headers !== undefined && (!message.headers || typeof message.headers !== 'object' || Array.isArray(message.headers))) return null;
    const headers = new Headers();
    for (const [name, value] of Object.entries(message.headers || {})) {
      const normalized = name.toLowerCase();
      if (!['content-type', 'x-renderer-session'].includes(normalized) || typeof value !== 'string'
        || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value) || headers.has(normalized)) return null;
      headers.set(normalized, value);
    }
    if (message.body !== undefined && !(message.body instanceof ArrayBuffer)) return null;
    if (message.body && (message.body.byteLength > MAX_REQUEST || message.method !== 'POST')) return null;
    return { method: message.method, headers, ...(message.body === undefined ? {} : { body: message.body }) };
  }

  async function readResponse(response) {
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_RESPONSE) throw new Error('The screenshot is too large to download.');
    if (!response.body) return new ArrayBuffer(0);
    const reader = response.body.getReader();
    const chunks = [];
    let count = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        count += value.byteLength;
        if (count > MAX_RESPONSE) {
          await reader.cancel();
          throw new Error('The screenshot is too large to download.');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  }

  window.addEventListener('message', async (event) => {
    if (event.origin !== parentOrigin || event.source !== editor || !stillConnected()) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || message.type !== 'fakemessages:request' || message.channel !== channel) return;
    if (typeof message.id !== 'string' || !message.id || message.id.length > 100) return;
    const options = validate(message);
    if (!options) { errorResponse(message.id, 400, 'This screenshot request is not supported.'); return; }
    if (seen.has(message.id)) { errorResponse(message.id, 409, 'This screenshot request was already received.'); return; }
    if (active.size >= 8) { errorResponse(message.id, 429, 'Please wait for the current screenshot requests to finish.'); return; }
    if (seen.size >= 5000) { errorResponse(message.id, 429, 'Reconnect the renderer from the editor to continue.'); return; }
    seen.add(message.id);
    active.add(message.id);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    setStatus('Connected to your editor.', 'Your screenshot is being prepared. Keep this window open.');
    try {
      // Only fixed same-origin API routes are reachable. The browser supplies
      // this signed-in window's own platform cookie; the parent cannot supply
      // Cookie, Authorization, Origin, redirects, or any other fetch options.
      const response = await fetch(message.path, {
        ...options, credentials: 'same-origin', redirect: 'manual', cache: 'no-store', signal: controller.signal,
      });
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        errorResponse(message.id, 401, 'Please sign in to the renderer again, then return to the editor and retry.');
        retry();
        return;
      }
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      if (!/^(?:application\/json|image\/png)(?:\s*;|$)/i.test(contentType)) {
        errorResponse(message.id, 401, 'Please sign in to the renderer again, then return to the editor and retry.');
        retry();
        return;
      }
      const body = await readResponse(response);
      post({ type: 'fakemessages:response', id: message.id, status: response.status, contentType, body }, [body]);
      if (response.ok && /^image\/png/i.test(contentType)) setStatus('Your screenshot is ready.', 'Return to the editor to download it. Keep this window open for your next screenshot.');
      else if (!response.ok) setStatus('The request could not finish.', 'Return to the editor for details, then try again.');
    } catch (error) {
      const timedOut = controller.signal.aborted;
      errorResponse(message.id, timedOut ? 504 : 502, timedOut ? 'The renderer took too long to respond. Return to the editor and try again.' : 'The renderer connection was interrupted. Return to the editor and try again.');
      setStatus('Connection interrupted.', 'Return to the editor and try again.');
    } finally {
      clearTimeout(timer);
      active.delete(message.id);
    }
  });

  setStatus('Connected to your editor.', 'Keep this window open while generating. Return to the editor to download your screenshot.');
  const ready = () => {
    if (!stillConnected()) { clearInterval(heartbeat); retry(); return; }
    post({ type: 'fakemessages:ready' });
  };
  const heartbeat = setInterval(ready, 750);
  ready();
})();
