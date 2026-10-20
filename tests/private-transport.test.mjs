import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createPrivateTransport } from '../private-transport.js';

const SERVICE = 'https://renderer.example';
const PARENT = 'https://dev1niscool.github.io';
const SECRET = 'private-authentication-secret';

function environment(t, { blocked = false, postError } = {}) {
  const listeners = [], opened = [], sent = [], requestWaiters = [], timers = new Map();
  let nextTimer = 0, nextUuid = 0;
  const popup = {
    closed: false,
    postMessage(message, targetOrigin, transfer) {
      if (postError) throw new Error(postError);
      const request = { message, targetOrigin, transfer };
      sent.push(request);
      requestWaiters.splice(0).forEach(resolve => resolve(request));
    },
  };
  const replacements = {
    window: {
      addEventListener(type, listener) {
        assert.equal(type, 'message');
        listeners.push(listener);
      },
      open(...arguments_) {
        opened.push(arguments_);
        return blocked ? null : popup;
      },
    },
    location: { origin: PARENT },
    crypto: { randomUUID: () => `${String(++nextUuid).padStart(8, '0')}-0000-4000-8000-000000000000` },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay, interval: false });
      return id;
    },
    setInterval(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay, interval: true });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    clearInterval: id => timers.delete(id),
  };
  for (const [name, value] of Object.entries(replacements)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  const channel = () => new URL(opened.at(-1)[0]).searchParams.get('channel');
  const emit = (data, overrides = {}) => listeners.forEach(listener => listener({
    origin: SERVICE, source: popup, data: { channel: channel(), ...data }, ...overrides,
  }));
  return {
    popup, opened, sent, timers, channel, emit,
    nextRequest: () => sent.length ? Promise.resolve(sent.at(-1)) : new Promise(resolve => requestWaiters.push(resolve)),
    ready: () => emit({ type: 'fakemessages:ready' }),
    respond(message, { status = 200, body = new TextEncoder().encode('{"ok":true}').buffer, contentType = 'application/json', ...extra } = {}) {
      emit({ type: 'fakemessages:response', id: message.id, status, body, contentType, ...extra });
    },
    fire(delay) {
      const matching = [...timers].filter(([, timer]) => timer.delay === delay);
      assert.ok(matching.length, `Expected a scheduled ${delay} ms timer`);
      for (const [id, timer] of matching) {
        if (!timer.interval) timers.delete(id);
        timer.callback();
      }
    },
    async connected() {
      const transport = createPrivateTransport(SERVICE);
      const connection = transport.connect();
      this.ready();
      await connection;
      return transport;
    },
  };
}

test('accepts readiness only from the private origin, opened window, and current channel', async t => {
  const env = environment(t);
  const transport = createPrivateTransport(`${SERVICE}/private?owner=${SECRET}#private`);
  const progress = [];
  const connection = transport.connect(message => progress.push(message));
  let settled = false;
  connection.then(() => { settled = true; });
  assert.strictEqual(transport.connect(), connection, 'A pending connection must reuse the sign-in window');

  for (const [message, overrides] of [
    [{ type: 'fakemessages:ready' }, { origin: `${SERVICE}.evil.example` }],
    [{ type: 'fakemessages:ready' }, { source: {} }],
    [{ type: 'fakemessages:ready', channel: 'wrong-channel' }, {}],
  ]) {
    env.emit(message, overrides);
    await nextTurn();
    assert.equal(settled, false, 'An untrusted message must not finish sign-in');
  }
  await assert.rejects(transport.send('/api/session', { method: 'POST' }), /Click Generate to reconnect/);
  assert.equal(env.sent.length, 0);

  env.ready();
  await connection;
  assert.equal(settled, true);
  assert.equal(env.timers.size, 0, 'Successful sign-in clears connection timers');
  assert.equal(env.opened.length, 1);
  const url = new URL(env.opened[0][0]);
  assert.equal(url.origin, SERVICE);
  assert.equal(url.pathname, '/render');
  assert.equal(url.hash, '');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['channel', 'parent']);
  assert.equal(url.searchParams.get('parent'), PARENT);
  assert.equal(url.searchParams.get('channel'), env.channel());
  assert.doesNotMatch(url.href + progress.join(' '), new RegExp(SECRET));
});

test('rejects forged responses while a valid session request remains pending', async t => {
  const env = environment(t);
  const transport = await env.connected();
  const responsePromise = transport.send('/api/session', { method: 'POST' });
  const request = env.sent.at(-1);
  assert.equal(request.message.type, 'fakemessages:request');
  assert.equal(request.message.path, '/api/session');
  assert.equal(request.message.method, 'POST');
  assert.equal(request.targetOrigin, SERVICE);
  assert.deepEqual(request.transfer, []);
  let settled = false;
  responsePromise.then(() => { settled = true; });
  const response = { type: 'fakemessages:response', id: request.message.id, status: 200,
    body: new TextEncoder().encode('{"session":"valid-session"}').buffer, contentType: 'application/json' };

  for (const [data, overrides] of [
    [response, { origin: 'https://untrusted.example' }],
    [response, { source: {} }],
    [{ ...response, channel: 'wrong-channel' }, {}],
    [{ ...response, id: 'unrelated-request' }, {}],
  ]) {
    env.emit(data, overrides);
    await nextTurn();
    assert.equal(settled, false, 'Untrusted responses must not resolve a request');
  }
  env.emit(response);
  const accepted = await responsePromise;
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { session: 'valid-session' });
  assert.equal(env.timers.size, 0);
});

test('preserves multipart image bytes and forwards only explicitly allowed headers', async t => {
  const env = environment(t);
  const transport = await env.connected();
  const image = Uint8Array.from([137, 80, 78, 71, 0, 255, 128, 13, 10, 0, 1, 2]);
  const form = new FormData();
  form.set('file', new Blob([image], { type: 'image/png' }), 'native.png');
  form.set('caption', 'Private conversation text');
  const responsePromise = transport.send('/api/assets', {
    method: 'POST', body: form,
    headers: { 'X-Renderer-Session': 'isolated-session', Authorization: `Bearer ${SECRET}`,
      Cookie: `login=${SECRET}`, 'X-Untrusted': SECRET },
  });
  await env.nextRequest();
  assert.equal(env.sent.length, 1);
  const request = env.sent[0];
  assert.equal(request.targetOrigin, SERVICE);
  assert.deepEqual(Object.keys(request.message.headers).sort(), ['Content-Type', 'X-Renderer-Session']);
  assert.equal(request.message.headers['X-Renderer-Session'], 'isolated-session');
  assert.match(request.message.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  assert.ok(request.message.body instanceof ArrayBuffer);
  assert.strictEqual(request.transfer[0], request.message.body, 'Transfer the binary body without string conversion');
  const decoded = await new Response(request.message.body, { headers: request.message.headers }).formData();
  assert.equal(decoded.get('file').name, 'native.png');
  assert.equal(decoded.get('file').type, 'image/png');
  assert.deepEqual(new Uint8Array(await decoded.get('file').arrayBuffer()), image);
  assert.equal(decoded.get('caption'), 'Private conversation text');
  assert.doesNotMatch(env.opened[0][0], /Private|conversation|caption|native\.png/);
  assert.doesNotMatch(JSON.stringify(request.message.headers), new RegExp(SECRET));

  env.respond(request.message, { body: image.buffer, contentType: 'image/png' });
  const response = await responsePromise;
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);
});

test('gives an actionable error when the sign-in popup is blocked', async t => {
  const env = environment(t, { blocked: true });
  const transport = createPrivateTransport(SERVICE);
  await assert.rejects(transport.connect(), /Allow the private renderer window, then click Generate again/);
  assert.equal(env.sent.length, 0);
  assert.equal(env.timers.size, 0);
});

test('closing sign-in rejects promptly and a reconnect ignores the previous channel', async t => {
  const env = environment(t);
  const transport = createPrivateTransport(SERVICE);
  const connection = transport.connect();
  const oldChannel = env.channel();
  const rejected = assert.rejects(connection, /Finish signing in.*click Generate again/);
  env.popup.closed = true;
  env.fire(700);
  await rejected;
  assert.equal(env.timers.size, 0);

  env.popup.closed = false;
  const reconnect = transport.connect();
  let settled = false;
  reconnect.then(() => { settled = true; });
  assert.notEqual(env.channel(), oldChannel);
  env.emit({ type: 'fakemessages:ready', channel: oldChannel });
  await nextTurn();
  assert.equal(settled, false);
  env.ready();
  await reconnect;
  env.popup.closed = true;
  await assert.rejects(transport.send('/api/session', { headers: { Authorization: SECRET } }), error => {
    assert.match(error.message, /window closed.*Click Generate to reconnect/);
    assert.doesNotMatch(error.message, new RegExp(SECRET));
    return true;
  });
  assert.equal(env.sent.length, 0);
});

test('a disconnected popup does not expose authentication details from its exception', async t => {
  const env = environment(t, { postError: `Login failed with token ${SECRET}` });
  const transport = await env.connected();
  await assert.rejects(transport.send('/api/session', { method: 'POST', headers: { Authorization: SECRET } }), error => {
    assert.match(error.message, /Could not reach the private renderer window.*Click Generate to reconnect/);
    assert.doesNotMatch(error.message, new RegExp(SECRET));
    return true;
  });
  assert.equal(env.sent.length, 0);
  assert.equal(env.timers.size, 0);
});

test('connection and response timeouts provide reconnect guidance without private data', async t => {
  const env = environment(t);
  const transport = createPrivateTransport(SERVICE);
  const connection = transport.connect();
  const connectionRejected = assert.rejects(connection, /Sign in.*click Generate again/);
  env.fire(180000);
  await connectionRejected;
  const reconnect = transport.connect();
  env.ready();
  await reconnect;
  const request = transport.send('/api/session', { headers: { 'X-Renderer-Session': SECRET } });
  const requestRejected = assert.rejects(request, error => {
    assert.match(error.message, /did not respond.*Check its window and try again/);
    assert.doesNotMatch(error.message, new RegExp(SECRET));
    return true;
  });
  env.fire(50000);
  await requestRejected;
  assert.equal(env.timers.size, 0);
});

test('rejects malformed responses and does not trust response-supplied headers', async t => {
  const env = environment(t);
  const transport = await env.connected();
  for (const invalid of [{ status: 199 }, { status: 600 }, { status: 200.5 }, { body: SECRET },
    { body: new ArrayBuffer(20 * 1024 * 1024 + 1) }]) {
    const response = transport.send('/api/session');
    const rejected = assert.rejects(response, /invalid response/);
    env.respond(env.sent.at(-1).message, invalid);
    await rejected;
  }
  const response = transport.send('/api/session');
  env.respond(env.sent.at(-1).message, { contentType: 'text/html', headers: { 'Set-Cookie': SECRET }, status: 204 });
  const accepted = await response;
  assert.equal(accepted.status, 204);
  assert.equal(await accepted.text(), '');
  assert.equal(accepted.headers.get('content-type'), 'application/json');
  assert.equal(accepted.headers.get('set-cookie'), null);
  assert.equal(env.timers.size, 0);
});
