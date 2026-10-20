/** A small, fixed-route adapter to the owner's native Messages renderer. */
const UPSTREAM = 'https://fakemsgs.com';
const ALLOWED_ORIGINS = new Set(['https://dev1niscool.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173']);
export const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SESSION = new RegExp(`^${UUID}\\.[0-9a-f]{64}$`, 'i');
const JOB = new RegExp(`^/api/renders/(${UUID})(/image)?$`, 'i');
const ASSET = /^assets\/[A-Za-z0-9._-]{1,180}$/;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function routeFor(url) {
  if (url.pathname === '/api/session' && !url.search) return { kind: 'session', method: 'POST', path: '/api/health' };
  if (url.pathname === '/api/assets' && !url.search) return { kind: 'asset', method: 'POST', path: '/api/assets' };
  if (url.pathname === '/api/renders' && !url.search) return { kind: 'submit', method: 'POST', path: '/api/renders' };
  const match = JOB.exec(url.pathname);
  if (!match) return null;
  if (!match[2] && url.search) return null;
  if (match[2] && url.search && url.search !== '?download=1') return null;
  return { kind: match[2] ? 'image' : 'job', method: 'GET', id: match[1], path: url.pathname + url.search };
}

async function readLimited(body, limit, errorStatus = 413) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RequestError(errorStatus, errorStatus === 413 ? 'Uploads and requests must be 10 MB or smaller.' : 'The renderer response was too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function parseJSON(bytes, status = 400) {
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestError(status, status === 400 ? 'The request must contain valid JSON.' : 'The renderer returned an invalid response.'); }
}

function sessionFrom(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie() : [response.headers.get('set-cookie') || ''];
  for (const value of values) {
    const match = /(?:^|,\s*)fakedms-session=([^;,\s]+)/.exec(value);
    if (match && SESSION.test(match[1])) return match[1];
  }
  throw new RequestError(502, 'The renderer did not create a session. Please try again.');
}

function safeJob(data, expectedId) {
  if (!data || typeof data !== 'object' || !new RegExp(`^${UUID}$`, 'i').test(data.id || '')
    || (expectedId && data.id.toLowerCase() !== expectedId.toLowerCase())
    || !['queued', 'running', 'done', 'failed'].includes(data.status)) {
    throw new RequestError(502, 'The renderer returned an invalid job.');
  }
  const result = {};
  for (const key of ['id', 'status', 'name', 'createdAt', 'updatedAt', 'startedAt', 'finishedAt', 'device', 'timings', 'elapsedMs', 'error']) {
    if (Object.hasOwn(data, key)) result[key] = data[key];
  }
  return result;
}

/**
 * Return a Response for the companion's /api routes.
 * `session` is a per-visitor anonymous upstream bearer credential, not a shared
 * service credential. Keep it in memory in the client and never log it.
 * Dependency injection exists solely to test the boundary without live jobs.
 */
export async function handleNativeRequest(request, { fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const originAllowed = !origin || ALLOWED_ORIGINS.has(origin) || origin === url.origin;
  const headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' });
  if (origin && originAllowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'Content-Disposition');
  }
  const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
    status, headers: { ...Object.fromEntries(headers), 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
  if (!originAllowed || (!origin && request.headers.get('sec-fetch-site') === 'cross-site')) {
    return json({ error: 'This website is not allowed to use the renderer.' }, 403);
  }
  const route = routeFor(url);
  if (!route) return json({ error: 'Renderer route not found.' }, 404);
  if (request.method === 'OPTIONS') {
    const askedMethod = request.headers.get('access-control-request-method');
    const askedHeaders = (request.headers.get('access-control-request-headers') || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
    if ((askedMethod && askedMethod !== route.method) || askedHeaders.some(value => !['content-type', 'x-renderer-session'].includes(value))) {
      return json({ error: 'The requested renderer operation is not allowed.' }, 403);
    }
    headers.set('Access-Control-Allow-Methods', `${route.method}, OPTIONS`);
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Renderer-Session');
    headers.set('Access-Control-Max-Age', '600');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== route.method) return json({ error: 'Method not allowed.' }, 405, { Allow: `${route.method}, OPTIONS` });

  let timer;
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) {
      throw new RequestError(413, 'Uploads and requests must be 10 MB or smaller.');
    }
    const upstreamHeaders = new Headers();
    if (route.kind !== 'session') {
      const token = request.headers.get('x-renderer-session') || '';
      if (!SESSION.test(token)) throw new RequestError(401, 'Start a renderer session before generating a screenshot.');
      upstreamHeaders.set('Cookie', `fakedms-session=${token}`);
    }
    let body;
    if (route.kind === 'submit') {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
        throw new RequestError(415, 'Render requests must use application/json.');
      }
      const data = parseJSON(await readLimited(request.body, MAX_REQUEST_BYTES));
      if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.contact?.name !== 'string'
        || !data.contact.name.trim() || !Array.isArray(data.messages) || data.messages.length < 1 || data.messages.length > 300) {
        throw new RequestError(400, 'Include a contact name and 1–300 messages.');
      }
      body = JSON.stringify(data);
      upstreamHeaders.set('Content-Type', 'application/json');
    } else if (route.kind === 'asset') {
      const contentType = request.headers.get('content-type') || '';
      if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new RequestError(415, 'Images must be uploaded as multipart form data.');
      const bytes = await readLimited(request.body, MAX_REQUEST_BYTES);
      let form;
      try { form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData(); }
      catch { throw new RequestError(400, 'The image upload could not be read.'); }
      const entries = [...form.entries()];
      const file = form.get('file');
      if (entries.length !== 1 || entries[0][0] !== 'file' || !(file instanceof Blob) || !file.size || !IMAGE_TYPES.has(file.type)) {
        throw new RequestError(400, 'Upload one PNG, JPEG, WebP, GIF, HEIC, or HEIF image in the file field.');
      }
      body = new FormData();
      body.set('file', file, file.name || 'image');
    } else if (route.kind === 'session') {
      // Consume any supplied body under the same bound, but never forward it.
      await readLimited(request.body, MAX_REQUEST_BYTES);
    }
    timer = setTimeout(abort, timeoutMs);
    const response = await fetchImpl(`${UPSTREAM}${route.path}`, {
      method: route.kind === 'session' ? 'GET' : route.method,
      headers: upstreamHeaders, ...(body !== undefined ? { body } : {}),
      redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok) {
      const bytes = await readLimited(response.body, 1024 * 1024, 502);
      let data;
      try { data = parseJSON(bytes, 502); } catch { data = null; }
      const message = typeof data?.error === 'string' ? data.error.slice(0, 500) : 'The native renderer could not complete this request.';
      return json({ error: message }, [400, 401, 403, 404, 413, 415, 429, 503].includes(response.status) ? response.status : 502);
    }
    if (route.kind === 'image') {
      if (!/^image\/png(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new RequestError(502, 'The renderer did not return a PNG image.');
      const bytes = await readLimited(response.body, MAX_IMAGE_BYTES, 502);
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (!signature.every((value, index) => bytes[index] === value)) throw new RequestError(502, 'The renderer returned an invalid PNG image.');
      headers.set('Content-Type', 'image/png');
      headers.set('Content-Disposition', `attachment; filename="conversation-${route.id}.png"`);
      return new Response(bytes, { status: 200, headers });
    }
    const data = parseJSON(await readLimited(response.body, 1024 * 1024, 502), 502);
    if (route.kind === 'session') return json({ session: sessionFrom(response), available: data.available === true, devices: Number.isFinite(data.devices) ? data.devices : 0 });
    if (route.kind === 'asset') {
      if (typeof data?.asset !== 'string' || !ASSET.test(data.asset)) throw new RequestError(502, 'The renderer returned an invalid image reference.');
      return json({ asset: data.asset }, response.status);
    }
    return json(safeJob(data, route.id), response.status);
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') return json({ error: 'The renderer request timed out. Please check its status before submitting again.' }, 504);
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    return json({ error: 'Could not reach the native renderer. Please try again shortly.' }, 502);
  } finally {
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
  }
}
