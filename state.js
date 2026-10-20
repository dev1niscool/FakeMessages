/** Conversation state shared by the editor and browser renderer. */
export const MAX_MESSAGES = 300;
export const MAX_TEXT_LENGTH = 8000;

const REACTIONS = Object.freeze({
  love: '❤️', like: '👍', dislike: '👎', laugh: '😂', emphasize: '‼️', question: '❓',
});
const IMAGE_LIMIT = 14 * 1024 * 1024;
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const present = (object, key) => has(object, key) && object[key] !== undefined;
const newId = () => globalThis.crypto?.randomUUID?.()
  || `message-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function string(value, label, max, { required = false, trim = false } = {}) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const result = trim ? value.trim() : value;
  if (required && !result.trim()) throw new Error(`${label} is required.`);
  if (result.length > max) throw new Error(`${label} must contain at most ${max} characters.`);
  return result;
}

function optionalText(source, target, key, label, max) {
  if (!present(source, key)) return;
  const value = string(source[key], label, max);
  if (value !== '') target[key] = value;
}

function choice(source, key, choices, fallback, label = key) {
  if (!present(source, key)) return fallback;
  if (!choices.includes(source[key])) throw new Error(`${label} must be ${choices.join(', ')}.`);
  return source[key];
}

function number(source, key, fallback, min, max, label = key) {
  if (!present(source, key)) return fallback;
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a number.`);
  return Math.max(min, Math.min(max, Math.round(value)));
}

function boolean(source, key, fallback, label = key) {
  if (!present(source, key)) return fallback;
  if (typeof source[key] !== 'boolean') throw new Error(`${label} must be true or false.`);
  return source[key];
}

function image(value, label) {
  string(value, label, IMAGE_LIMIT, { required: true });
  if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) {
    throw new Error(`${label} must be an embedded PNG, JPEG, WebP, or GIF image.`);
  }
  return value;
}

function url(value, label) {
  const result = string(value, label, 4096, { required: true, trim: true });
  let parsed;
  try { parsed = new URL(result); } catch { throw new Error(`${label} must be a valid HTTP or HTTPS URL.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`${label} must be a valid HTTP or HTTPS URL without credentials.`);
  }
  return result;
}

function normalizeMessage(raw, index, ids) {
  const label = `Message ${index + 1}`;
  object(raw, label);
  if (!present(raw, 'from')) throw new Error(`${label} needs a sender.`);
  const result = { _id: '', from: choice(raw, 'from', ['me', 'them'], undefined, `${label} sender`) };
  const requestedId = present(raw, '_id') && typeof raw._id === 'string'
    && /^[A-Za-z0-9_-]{1,100}$/.test(raw._id) ? raw._id : '';
  result._id = requestedId && !ids.has(requestedId) ? requestedId : newId();
  ids.add(result._id);
  // Empty text is useful while writing a new message and remains valid in drafts.
  if (present(raw, 'text')) result.text = string(raw.text, `${label} text`, MAX_TEXT_LENGTH);
  if (present(raw, 'image') && raw.image !== '') result.image = image(raw.image, `${label} image`);
  if (present(raw, 'link') && raw.link !== '') {
    const link = typeof raw.link === 'string' ? { url: raw.link } : object(raw.link, `${label} link`);
    result.link = { url: url(link.url, `${label} link`) };
    optionalText(link, result.link, 'title', `${label} link title`, 300);
    if (present(link, 'image') && link.image !== '') result.link.image = image(link.image, `${label} link image`);
  }
  if (present(raw, 'transport') && raw.transport !== '') {
    result.transport = choice(raw, 'transport', ['imessage', 'sms'], undefined, `${label} transport`);
  }
  if (present(raw, 'receipt') && raw.receipt !== '') {
    result.receipt = choice(raw, 'receipt', ['delivered', 'read'], undefined, `${label} receipt`);
  }
  if (present(raw, 'at') && raw.at !== '') {
    const at = string(raw.at, `${label} timestamp`, 40);
    const date = new Date(at);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at) || Number.isNaN(date.getTime())) {
      throw new Error(`${label} timestamp must be an ISO date and time.`);
    }
    result.at = date.toISOString();
  }
  if (present(raw, 'reactions')) {
    if (!Array.isArray(raw.reactions) || raw.reactions.length > 2) {
      throw new Error(`${label} can have one reaction from each person.`);
    }
    const senders = new Set();
    result.reactions = raw.reactions.map((reaction) => {
      object(reaction, `${label} reaction`);
      const from = choice(reaction, 'from', ['me', 'them'], undefined, `${label} reaction sender`);
      if (!from || senders.has(from)) throw new Error(`${label} can have one reaction from each person.`);
      senders.add(from);
      if (present(reaction, 'emoji')) {
        return { from, emoji: string(reaction.emoji, `${label} custom reaction`, 16, { required: true }) };
      }
      const type = choice(reaction, 'type', Object.keys(REACTIONS), undefined, `${label} reaction`);
      if (!type) throw new Error(`${label} reaction needs a type or emoji.`);
      return { from, type };
    });
  }
  return result;
}

/** A fresh copy of the original dark-theme example, with no shared nested state. */
export function defaultConfig() {
  return {
    contact: { name: 'Fridge Support' },
    theme: 'dark', transport: 'imessage', unread_count: 3,
    notifications_silenced: false, show_encryption: true, clock_format: 12, scroll_position: 'bottom',
    status: {
      time: 'current', battery: 87, charging: false, network: 'wifi',
      wifi_strength: 3, cellular_strength: 4,
    },
    messages: [
      { _id: newId(), from: 'them', text: 'The cheese department has approved your request.', reactions: [{ from: 'me', type: 'love' }] },
      { _id: newId(), from: 'me', text: 'I have never felt so supported by a dairy product.', reactions: [{ from: 'them', type: 'laugh' }] },
      { _id: newId(), from: 'them', text: 'Your emotional support cheddar is on its way.', reactions: [{ from: 'me', emoji: '🧀' }] },
      { _id: newId(), from: 'me', text: 'Finally. A delivery I can believe in.', receipt: 'delivered', reactions: [{ from: 'them', type: 'like' }, { from: 'me', type: 'emphasize' }] },
    ],
  };
}

/** Validate imports and return only supported fields; never copy arbitrary properties. */
export function normalizeConfig(raw) {
  object(raw, 'Configuration');
  const contact = object(raw.contact, 'Contact');
  if (!Array.isArray(raw.messages) || raw.messages.length < 1 || raw.messages.length > MAX_MESSAGES) {
    throw new Error(`Include between 1 and ${MAX_MESSAGES} messages.`);
  }
  const ids = new Set();
  const result = {
    // A cleared name is a valid unfinished draft. Preserve its conversation on reload.
    contact: { name: string(contact.name, 'Contact name', 80, { trim: true }) || 'Contact' },
    theme: choice(raw, 'theme', ['light', 'dark'], 'dark', 'Theme'),
    transport: choice(raw, 'transport', ['imessage', 'sms'], 'imessage', 'Message type'),
    unread_count: number(raw, 'unread_count', 3, 0, 999, 'Unread conversations'),
    notifications_silenced: boolean(raw, 'notifications_silenced', false, 'Notifications silenced'),
    show_encryption: boolean(raw, 'show_encryption', true, 'Show encryption label'),
    clock_format: choice(raw, 'clock_format', [12, 24], 12, 'Clock format'),
    scroll_position: choice(raw, 'scroll_position', ['bottom', 'latest-top'], 'bottom', 'Conversation position'),
    status: {},
    messages: raw.messages.map((message, index) => normalizeMessage(message, index, ids)),
  };
  if (present(contact, 'photo') && contact.photo !== '') result.contact.photo = image(contact.photo, 'Contact photo');
  optionalText(contact, result.contact, 'location', 'Contact location', 100);
  optionalText(raw, result, 'back_to_app', 'Back-to-app label', 40);
  if (present(raw, 'background') && raw.background !== '') {
    const background = string(raw.background, 'Background', IMAGE_LIMIT);
    if (['default', 'colour', 'sky', 'water', 'aurora'].includes(background)
        || /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(background)) {
      result.background = background;
    } else {
      result.background = image(background, 'Background');
    }
  }
  const status = present(raw, 'status') ? object(raw.status, 'Status bar') : {};
  const time = present(status, 'time') ? string(status.time, 'Time', 7) : 'current';
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (time !== 'current' && (!clock || Number(clock[1]) > 23 || Number(clock[2]) > 59)) {
    throw new Error('Time must be current or HH:MM in 24-hour format.');
  }
  result.status = {
    time: clock ? `${clock[1].padStart(2, '0')}:${clock[2]}` : time,
    battery: number(status, 'battery', 87, 0, 100, 'Battery percentage'),
    charging: boolean(status, 'charging', false, 'Charging'),
    network: choice(status, 'network', ['wifi', '5G', 'LTE'], 'wifi', 'Network'),
    wifi_strength: number(status, 'wifi_strength', 3, 0, 3, 'Wi-Fi signal'),
    cellular_strength: number(status, 'cellular_strength', 4, 0, 4, 'Cellular signal'),
  };
  return result;
}

/** Append a blank outgoing message. Return null when the 300-message limit is reached. */
export function addMessage(config) {
  if (config.messages.length >= MAX_MESSAGES) return null;
  const message = { _id: newId(), from: 'me', text: '' };
  config.messages.push(message);
  return message;
}

/** Move a message by an integer offset. Invalid/out-of-bounds moves have no effect. */
export function moveMessage(config, id, delta) {
  const index = config.messages.findIndex((message) => message._id === id);
  const destination = index + delta;
  if (index < 0 || !Number.isInteger(delta) || delta === 0 || destination < 0 || destination >= config.messages.length) return false;
  const [message] = config.messages.splice(index, 1);
  config.messages.splice(destination, 0, message);
  return true;
}

/** Duplicate a message immediately after its original, with independent nested fields. */
export function duplicateMessage(config, id) {
  const index = config.messages.findIndex((message) => message._id === id);
  if (index < 0 || config.messages.length >= MAX_MESSAGES) return null;
  const message = structuredClone(config.messages[index]);
  message._id = newId();
  config.messages.splice(index + 1, 0, message);
  return message;
}

/** Preserve at least one editable message. */
export function removeMessage(config, id) {
  const index = config.messages.findIndex((message) => message._id === id);
  if (index < 0 || config.messages.length <= 1) return false;
  config.messages.splice(index, 1);
  return true;
}

export function reactionLabel(reaction) {
  if (!reaction || typeof reaction !== 'object') return '';
  return typeof reaction.emoji === 'string' ? reaction.emoji
    : has(REACTIONS, reaction.type) ? REACTIONS[reaction.type] : '';
}
