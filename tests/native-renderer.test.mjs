import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNativeRequest, MAX_REQUEST_BYTES } from '../server/native-renderer.mjs';

const ORIGIN = 'https://dev1niscool.github.io';
const HOST = 'https://renderer.example';
const ID = 'a83cedc6-0212-4575-ab82-4ff033bf0a22';
const SESSION = `10070ce2-cc2d-453a-98b4-31d2dd656ba2.${'a'.repeat(64)}`;
const config = { contact: { name: 'Test' }, messages: [{ from: 'me', text: 'Hello', reactions: [{ from: 'them', type: 'laugh' }] }] };
const upstreamJSON = (data, options = {}) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' }, ...options });
const request = (path, options = {}) => new Request(HOST + path, { ...options, headers: { Origin: ORIGIN, 'X-Renderer-Session': SESSION, ...options.headers } });
const neverFetch = async () => { assert.fail('Rejected requests must never contact the renderer'); };

test('creates an isolated anonymous session without forwarding ambient credentials', async () => {
  const response = await handleNativeRequest(request('/api/session', { method: 'POST', headers: { Cookie: 'personal=secret', Authorization: 'Bearer unrelated' } }), {
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://fakemsgs.com/api/health');
      assert.equal(options.method, 'GET');
      for (const name of ['cookie', 'authorization', 'origin', 'referer', 'x-renderer-session']) assert.equal(options.headers.get(name), null);
      assert.equal(options.redirect, 'manual');
      return upstreamJSON({ available: true, devices: 2 }, { headers: { 'Set-Cookie': `fakedms-session=${SESSION}; Path=/; Secure; HttpOnly; SameSite=lax` } });
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { session: SESSION, available: true, devices: 2 });
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('rejects a malformed upstream session without exposing its cookie', async () => {
  const response = await handleNativeRequest(request('/api/session', { method: 'POST' }), { fetchImpl: async () => upstreamJSON({ available: true }, { headers: { 'Set-Cookie': 'fakedms-session=bad-cookie; HttpOnly' } }) });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /bad-cookie/);
});

test('limits browser origins and preflight headers; allows companion and localhost', async () => {
  for (const origin of ['https://evil.example', 'null', 'https://dev1niscool.github.io.evil.example']) {
    const response = await handleNativeRequest(request('/api/session', { method: 'POST', headers: { Origin: origin } }), { fetchImpl: neverFetch });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  for (const origin of [ORIGIN, HOST, 'http://localhost:4173']) {
    const response = await handleNativeRequest(request('/api/renders', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-renderer-session' } }), { fetchImpl: neverFetch });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  const denied = await handleNativeRequest(request('/api/renders', { method: 'OPTIONS', headers: { 'Access-Control-Request-Headers': 'authorization' } }), { fetchImpl: neverFetch });
  assert.equal(denied.status, 403);
});

test('does not expose history, arbitrary paths, or arbitrary upstream URLs', async () => {
  for (const [path, method] of [['/api/renders', 'GET'], ['/api/assets/secret', 'GET'], ['/api/proxy?url=https://evil.example', 'GET'], [`/api/renders/${ID}?url=https://evil.example`, 'GET'], [`/api/renders/${ID}/image?download=2`, 'GET']]) {
    const response = await handleNativeRequest(request(path, { method }), { fetchImpl: neverFetch });
    assert.ok([404, 405].includes(response.status));
  }
});

test('validates session token syntax before sending any upstream request', async () => {
  for (const token of ['', 'abc', SESSION + '; other=secret', SESSION + ',another', 'a'.repeat(10000)]) {
    const response = await handleNativeRequest(request(`/api/renders/${ID}`, { headers: { 'X-Renderer-Session': token } }), { fetchImpl: neverFetch });
    assert.equal(response.status, 401);
  }
});

test('submits JSON and forwards only the visitor session, stripping response owner/cookies', async () => {
  const response = await handleNativeRequest(request('/api/renders', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'unrelated=private', Authorization: 'Bearer private' }, body: JSON.stringify(config) }), {
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://fakemsgs.com/api/renders');
      assert.equal(options.headers.get('cookie'), `fakedms-session=${SESSION}`);
      assert.equal(options.headers.get('authorization'), null);
      assert.equal(options.headers.get('origin'), null);
      assert.deepEqual(JSON.parse(options.body), config);
      return upstreamJSON({ id: ID, status: 'queued', owner: 'private-owner', name: 'Test' }, { status: 202, headers: { 'Set-Cookie': 'private=yes' } });
    },
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { id: ID, status: 'queued', name: 'Test' });
  assert.equal(response.headers.get('set-cookie'), null);
});

test('enforces the byte limit even without Content-Length', async () => {
  const response = await handleNativeRequest(request('/api/renders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(MAX_REQUEST_BYTES + 1) }), { fetchImpl: neverFetch });
  assert.equal(response.status, 413);
  const advertised = await handleNativeRequest(request('/api/session', { method: 'POST', headers: { 'Content-Length': String(MAX_REQUEST_BYTES + 1) } }), { fetchImpl: neverFetch });
  assert.equal(advertised.status, 413);
});

test('rejects malformed JSON and unsupported content types before contacting upstream', async () => {
  for (const [body, type, expected] of [['{', 'application/json', 400], ['{}', 'application/json', 400], [JSON.stringify(config), 'text/plain', 415]]) {
    const response = await handleNativeRequest(request('/api/renders', { method: 'POST', headers: { 'Content-Type': type }, body }), { fetchImpl: neverFetch });
    assert.equal(response.status, expected);
  }
});

test('uploads exactly one supported image as multipart, preserving session continuity', async () => {
  const body = new FormData();
  body.set('file', new Blob(['image bytes'], { type: 'image/png' }), 'test.png');
  const response = await handleNativeRequest(request('/api/assets', { method: 'POST', body }), {
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://fakemsgs.com/api/assets');
      assert.equal(options.headers.get('cookie'), `fakedms-session=${SESSION}`);
      assert.equal(options.headers.get('content-type'), null);
      assert.equal(options.body.get('file').type, 'image/png');
      return upstreamJSON({ asset: `assets/${ID}.png` });
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { asset: `assets/${ID}.png` });
});

test('rejects arbitrary asset fields and unsafe upstream asset references', async () => {
  const body = new FormData();
  body.set('file', new Blob(['image'], { type: 'image/png' }), 'test.png');
  body.set('url', 'https://evil.example');
  const response = await handleNativeRequest(request('/api/assets', { method: 'POST', body }), { fetchImpl: neverFetch });
  assert.equal(response.status, 400);
  const valid = new FormData();
  valid.set('file', new Blob(['image'], { type: 'image/png' }), 'test.png');
  const unsafe = await handleNativeRequest(request('/api/assets', { method: 'POST', body: valid }), { fetchImpl: async () => upstreamJSON({ asset: 'https://evil.example/image.png' }) });
  assert.equal(unsafe.status, 502);
});

test('polls only the requested job and passes native failure states', async () => {
  const response = await handleNativeRequest(request(`/api/renders/${ID}`), {
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://fakemsgs.com/api/renders/${ID}`);
      assert.equal(options.headers.get('cookie'), `fakedms-session=${SESSION}`);
      return upstreamJSON({ id: ID, status: 'failed', error: 'Device unavailable' });
    },
  });
  assert.deepEqual(await response.json(), { id: ID, status: 'failed', error: 'Device unavailable' });
  const mismatch = await handleNativeRequest(request(`/api/renders/${ID}`), { fetchImpl: async () => upstreamJSON({ id: '00000000-0000-0000-0000-000000000000', status: 'done' }) });
  assert.equal(mismatch.status, 502);
});

test('proxies PNG bytes with safe download headers and no upstream cookies', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
  const response = await handleNativeRequest(request(`/api/renders/${ID}/image?download=1`), {
    fetchImpl: async () => new Response(png, { headers: { 'Content-Type': 'image/png', 'Set-Cookie': 'private=yes', 'Content-Disposition': 'attachment; filename="untrusted.png"' } }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-disposition'), `attachment; filename="conversation-${ID}.png"`);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
});

test('maps upstream errors, malformed images, and timeouts without credential leakage', async () => {
  const denied = await handleNativeRequest(request(`/api/renders/${ID}`), { fetchImpl: async () => upstreamJSON({ error: 'Render not found.' }, { status: 404 }) });
  assert.equal(denied.status, 404);
  assert.deepEqual(await denied.json(), { error: 'Render not found.' });
  const invalid = await handleNativeRequest(request(`/api/renders/${ID}/image`), { fetchImpl: async () => new Response('bad', { headers: { 'Content-Type': 'image/png' } }) });
  assert.equal(invalid.status, 502);
  const timeout = await handleNativeRequest(request(`/api/renders/${ID}`), {
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })),
  });
  assert.equal(timeout.status, 504);
  assert.doesNotMatch(await timeout.text(), new RegExp(SESSION));
});
