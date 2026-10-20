import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultConfig, normalizeConfig, addMessage, moveMessage,
  duplicateMessage, removeMessage, reactionLabel, MAX_MESSAGES,
} from '../state.js';

const pixel = 'data:image/png;base64,iVBORw0KGgo=';
const minimal = () => ({ contact: { name: 'Alex' }, messages: [{ from: 'them', text: 'Hello' }] });

test('default drafts use the original dark example without sharing state', () => {
  const first = defaultConfig();
  const second = defaultConfig();
  assert.equal(first.theme, 'dark');
  assert.equal(first.show_encryption, true);
  assert.equal(first.contact.name, 'Fridge Support');
  assert.equal(first.messages.length, 4);
  assert.equal(first.messages[3].receipt, 'delivered');
  assert.notEqual(first.messages[0]._id, second.messages[0]._id);
  first.status.battery = 1;
  first.messages[0].reactions[0].type = 'dislike';
  assert.equal(second.status.battery, 87);
  assert.equal(second.messages[0].reactions[0].type, 'love');
  assert.deepEqual(normalizeConfig(second), second);
});

test('full configuration survives JSON export/import including embedded images', () => {
  const source = defaultConfig();
  Object.assign(source, {
    theme: 'light', transport: 'sms', unread_count: 999, notifications_silenced: true, show_encryption: false,
    clock_format: 24, scroll_position: 'latest-top', background: pixel, back_to_app: 'Maps',
  });
  Object.assign(source.contact, { photo: pixel, location: 'Chicago' });
  Object.assign(source.status, { time: '09:41', battery: 15, charging: true, network: '5G', wifi_strength: 1, cellular_strength: 2 });
  Object.assign(source.messages[0], {
    text: 'A caption', image: pixel, transport: 'sms', receipt: 'read',
    at: '2026-10-19T12:30:00.000Z',
    link: { url: 'https://example.com/hello', title: 'A page', image: pixel },
  });
  assert.deepEqual(normalizeConfig(JSON.parse(JSON.stringify(source))), source);
});

test('normalization supplies defaults, clamps status values, and repairs duplicate IDs', () => {
  const source = minimal();
  source.messages.push({ _id: 'same', from: 'me', text: '' });
  source.messages[0]._id = 'same';
  source.status = { time: '9:41', battery: 120.5, wifi_strength: -1, cellular_strength: 8 };
  source.unread_count = 1001;
  const result = normalizeConfig(source);
  assert.equal(result.theme, 'dark');
  assert.equal(result.show_encryption, true);
  assert.equal(result.status.time, '09:41');
  assert.equal(result.status.battery, 100);
  assert.equal(result.status.wifi_strength, 0);
  assert.equal(result.status.cellular_strength, 4);
  assert.equal(result.unread_count, 999);
  assert.notEqual(result.messages[0]._id, result.messages[1]._id);
  assert.equal(result.messages[1].text, '');
  assert.equal(source.status.time, '9:41');
});

test('unfinished blank contact names survive persistence without replacing the conversation', () => {
  for (const name of ['', '   ']) {
    const source = defaultConfig();
    source.contact.name = name;
    source.contact.location = 'Chicago';
    source.messages[0].text = 'Keep this edited draft';
    source.status.battery = 42;
    const restored = normalizeConfig(JSON.parse(JSON.stringify(source)));
    assert.equal(restored.contact.name, 'Contact');
    assert.equal(restored.contact.location, 'Chicago');
    assert.equal(restored.status.battery, 42);
    assert.deepEqual(restored.messages, source.messages);
    assert.deepEqual(normalizeConfig(restored), restored);
  }
});

test('unsupported arbitrary properties and prototype payloads are discarded', () => {
  const source = JSON.parse('{"contact":{"name":"Alex","__proto__":{"polluted":true}},"messages":[{"from":"me","text":"Hi","style":{"background":"url(https://example.com)"},"__proto__":{"polluted":true}}],"__proto__":{"polluted":true},"style":"anything","live_activity":true}');
  const result = normalizeConfig(source);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
  assert.equal(Object.hasOwn(result.contact, '__proto__'), false);
  assert.equal(Object.hasOwn(result.messages[0], '__proto__'), false);
  assert.equal(result.style, undefined);
  assert.equal(result.messages[0].style, undefined);
  assert.equal({}.polluted, undefined);
});

test('unsafe image schemes, SVGs, and backgrounds cannot enter normalized state', () => {
  for (const bad of ['https://example.com/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:text/html;base64,PGgxPg==', 'url(https://example.com/a.png)']) {
    for (const setField of [
      (c) => { c.contact.photo = bad; },
      (c) => { c.messages[0].image = bad; },
      (c) => { c.messages[0].link = { url: 'https://example.com', image: bad }; },
      (c) => { c.background = bad; },
    ]) {
      const source = minimal();
      setField(source);
      assert.throws(() => normalizeConfig(source), /embedded/);
    }
  }
  for (const background of ['default', 'colour', 'sky', 'water', 'aurora', '#abc', '#123456', '#12345678']) {
    assert.equal(normalizeConfig({ ...minimal(), background }).background, background);
  }
});

test('links allow only HTTP(S) URLs without embedded credentials', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/x', 'https://name:secret@example.com', 'not a url']) {
    const source = minimal();
    source.messages[0].link = bad;
    assert.throws(() => normalizeConfig(source), /HTTP or HTTPS/);
  }
  const source = minimal();
  source.messages[0].link = 'https://example.com/path?q=yes#anchor';
  assert.deepEqual(normalizeConfig(source).messages[0].link, { url: source.messages[0].link });
});

test('invalid conversation structure, sender, settings, and lengths produce actionable errors', () => {
  for (const bad of [null, [], 42, 'hello']) assert.throws(() => normalizeConfig(bad), /object/);
  assert.throws(() => normalizeConfig({ ...minimal(), contact: { name: null } }), /must be text/);
  assert.throws(() => normalizeConfig({ ...minimal(), messages: [] }), /between 1 and 300/);
  assert.throws(() => normalizeConfig({ ...minimal(), messages: Array(301).fill({ from: 'me' }) }), /between 1 and 300/);
  assert.throws(() => normalizeConfig({ ...minimal(), messages: [{ from: 'someone' }] }), /sender/);
  assert.throws(() => normalizeConfig({ ...minimal(), messages: [{ from: 'me', text: 'a'.repeat(8001) }] }), /8000/);
  assert.throws(() => normalizeConfig({ ...minimal(), status: { time: '24:01' } }), /HH:MM/);
  assert.throws(() => normalizeConfig({ ...minimal(), status: { battery: '90' } }), /number/);
  assert.throws(() => normalizeConfig({ ...minimal(), notifications_silenced: 'false' }), /true or false/);
  assert.throws(() => normalizeConfig({ ...minimal(), show_encryption: 'false' }), /true or false/);
  assert.throws(() => normalizeConfig({ ...minimal(), theme: 'url(bad)' }), /Theme/);
  assert.throws(() => normalizeConfig({ ...minimal(), messages: [{ from: 'me', at: 'yesterday' }] }), /ISO/);
});

test('reactions preserve each person and reject invalid or repeated senders', () => {
  const source = minimal();
  source.messages[0].reactions = [{ from: 'them', type: 'laugh' }, { from: 'me', emoji: '🧀' }];
  assert.deepEqual(normalizeConfig(source).messages[0].reactions, source.messages[0].reactions);
  assert.equal(reactionLabel({ type: 'love' }), '❤️');
  assert.equal(reactionLabel({ type: 'emphasize' }), '‼️');
  assert.equal(reactionLabel({ emoji: '🧀' }), '🧀');
  assert.equal(reactionLabel({ type: '__proto__' }), '');
  source.messages[0].reactions.push({ from: 'me', type: 'like' });
  assert.throws(() => normalizeConfig(source), /one reaction/);
  source.messages[0].reactions = [{ from: 'me', type: 'like' }, { from: 'me', type: 'love' }];
  assert.throws(() => normalizeConfig(source), /one reaction/);
});

test('message operations preserve order, prevent missing-ID deletion, and clone reactions', () => {
  const state = defaultConfig();
  const first = state.messages[0];
  const copy = duplicateMessage(state, first._id);
  assert.equal(state.messages[1], copy);
  assert.notEqual(copy._id, first._id);
  copy.reactions[0].type = 'question';
  assert.equal(first.reactions[0].type, 'love');
  assert.equal(moveMessage(state, copy._id, 1), true);
  assert.equal(state.messages[2], copy);
  assert.equal(moveMessage(state, first._id, -1), false);
  assert.equal(removeMessage(state, 'missing'), false);
  assert.equal(removeMessage(state, copy._id), true);
  assert.equal(state.messages.length, 4);
  const added = addMessage(state);
  assert.equal(state.messages.at(-1), added);
  assert.equal(added.from, 'me');
  assert.equal(added.text, '');
});

test('message helpers enforce lower and upper bounds', () => {
  const state = normalizeConfig(minimal());
  assert.equal(removeMessage(state, state.messages[0]._id), false);
  while (state.messages.length < MAX_MESSAGES) assert.ok(addMessage(state));
  assert.equal(addMessage(state), null);
  assert.equal(duplicateMessage(state, state.messages[0]._id), null);
  assert.equal(state.messages.length, MAX_MESSAGES);
});
