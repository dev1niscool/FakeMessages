/** A local, DOM-based iPhone Messages renderer. No user content is interpreted as HTML. */

import { createTapbackIcon } from './tapbacks.js?v=1.3.0';

const SVG_NS = 'http://www.w3.org/2000/svg';
let textMeasureContext;

export const PHONE_DIMENSIONS = Object.freeze({ width: 409, height: 868, screenWidth: 393, screenHeight: 852 });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function svgIcon(name, className = '', attributes = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('phone-icon');
  if (className) className.split(' ').forEach(value => svg.classList.add(value));
  Object.entries(attributes).forEach(([key, value]) => svg.setAttribute(key, String(value)));
  const shapes = {
    back: [['path', { d: 'm15 3-9 9 9 9' }]],
    chevron: [['path', { d: 'm9 5 7 7-7 7' }]],
    video: [['rect', { x: 2.2, y: 5.6, width: 13.3, height: 12.8, rx: 3 }], ['path', { d: 'm15.5 9 5.7-3.2v12.4L15.5 15' }]],
    plus: [['path', { d: 'M12 4v16M4 12h16' }]],
    mic: [['rect', { x: 8.5, y: 2, width: 7, height: 13, rx: 3.5, fill: 'currentColor', stroke: 'none' }], ['path', { d: 'M5.5 11v.8a6.5 6.5 0 0 0 13 0V11M12 18.5V22M9 22h6' }]],
    waveform: [['path', { d: 'M3 10v4M7.5 6.5v11M12 2v20M16.5 7v10M21 10v4', 'stroke-width': 2.3 }]],
    moon: [['path', { d: 'M19.7 15.2A8.2 8.2 0 0 1 8.8 4.3a8.2 8.2 0 1 0 10.9 10.9Z', fill: 'currentColor', stroke: 'none' }]],
    bolt: [['path', { d: 'm14 1-9 13h6l-1 9 9-14h-6Z', fill: 'currentColor', stroke: 'none' }]],
    link: [['path', { d: 'm10 13 4-4M7.5 14.5l-1 1a3.5 3.5 0 0 0 5 5l4-4a3.5 3.5 0 0 0 0-5M16.5 9.5l1-1a3.5 3.5 0 0 0-5-5l-4 4a3.5 3.5 0 0 0 0 5' }]],
    lock: [['rect', { x: 5, y: 10, width: 14, height: 11, rx: 2 }], ['path', { d: 'M8 10V6a4 4 0 0 1 8 0v4' }]],
  };
  for (const [tag, attrs] of shapes[name] || []) {
    const shape = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => shape.setAttribute(key, String(value)));
    svg.append(shape);
  }
  return svg;
}

function imageNode(source, className, alt) {
  const image = element('img', className);
  image.src = String(source);
  image.alt = alt;
  image.decoding = 'sync';
  image.draggable = false;
  return image;
}

function currentTime(config, date = new Date()) {
  const fixed = config.status?.time;
  if (fixed && fixed !== 'current' && /^\d{1,2}:\d{2}$/.test(fixed)) {
    const [hour, minute] = fixed.split(':').map(Number);
    return `${config.clock_format === 24 ? String(hour).padStart(2, '0') : (hour % 12 || 12)}:${String(minute).padStart(2, '0')}`;
  }
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: config.clock_format !== 24 }).replace(/\s*[AP]M$/, '');
}

function timeLabel(date, config) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: config.clock_format !== 24 }).toLowerCase();
}

function dateLabel(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

function makeStatus(config) {
  const status = config.status || {};
  const bar = element('div', 'phone-status');
  const left = element('div', 'phone-status-left');
  left.append(element('span', 'phone-clock', currentTime(config)));
  if (config.notifications_silenced) left.append(svgIcon('moon', 'phone-focus-icon'));
  const island = element('div', 'phone-island');
  island.append(element('span', 'phone-island-camera'));
  const right = element('div', 'phone-status-right');
  const cellular = element('div', 'phone-cellular');
  cellular.setAttribute('aria-label', 'Cellular signal');
  const cellStrength = Math.min(4, Math.max(0, Number(status.cellular_strength ?? 4)));
  for (let i = 0; i < 4; i += 1) {
    const line = element('i', i < cellStrength ? 'phone-cell-bar is-active' : 'phone-cell-bar');
    line.style.height = `${4 + i * 3}px`;
    cellular.append(line);
  }
  right.append(cellular);
  if (!status.network || status.network === 'wifi') {
    const wifi = document.createElementNS(SVG_NS, 'svg');
    wifi.setAttribute('viewBox', '0 0 20 16');
    wifi.setAttribute('aria-hidden', 'true');
    wifi.classList.add('phone-wifi');
    const strength = Math.min(3, Math.max(0, Number(status.wifi_strength ?? 3)));
    [
      ['path', { d: 'M1.3 4.5a13.4 13.4 0 0 1 17.4 0', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.8 }, 3],
      ['path', { d: 'M4.6 8a8.3 8.3 0 0 1 10.8 0', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.8 }, 2],
      ['path', { d: 'M7.8 11.6a3.5 3.5 0 0 1 4.4 0L10 14.2Z', fill: 'currentColor' }, 1],
    ].forEach(([tag, attrs, level]) => {
      const shape = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([key, value]) => shape.setAttribute(key, String(value)));
      shape.setAttribute('opacity', level <= strength ? '1' : '.25');
      wifi.append(shape);
    });
    right.append(wifi);
  } else {
    right.append(element('span', 'phone-network', status.network));
  }
  const percent = Math.round(Math.min(100, Math.max(0, Number(status.battery ?? 87))));
  const battery = element('div', `phone-battery${status.charging ? ' is-charging' : ''}${percent <= 20 ? ' is-low' : ''}`);
  battery.setAttribute('aria-label', `${percent}% battery${status.charging ? ', charging' : ''}`);
  const fill = element('span', 'phone-battery-level');
  fill.style.width = `${Math.max(0, percent)}%`;
  battery.append(fill);
  if (status.charging) battery.append(svgIcon('bolt', 'phone-battery-bolt'));
  else battery.append(element('span', 'phone-battery-number', percent));
  right.append(battery);
  bar.append(left, island, right);
  return bar;
}

function makeHeader(config) {
  const header = element('div', 'phone-header');
  const back = element('div', 'phone-back');
  back.append(svgIcon('back'));
  if (Number(config.unread_count) > 0) back.append(element('span', 'phone-unread', config.unread_count > 99 ? '99+' : config.unread_count));
  const person = element('div', 'phone-person');
  const name = config.contact?.name || 'Contact';
  const avatar = element('div', 'phone-avatar');
  if (config.contact?.photo) avatar.append(imageNode(config.contact.photo, 'phone-avatar-image', name));
  else {
    const initials = Array.from(name.trim())[0]?.toUpperCase();
    avatar.append(element('span', 'phone-avatar-initials', initials || '?'));
  }
  const nameRow = element('div', 'phone-name-row');
  nameRow.append(element('span', 'phone-name', name), svgIcon('chevron', 'phone-name-chevron'));
  person.append(avatar, nameRow);
  if (config.contact?.location) person.append(element('span', 'phone-location', config.contact.location));
  const video = element('div', 'phone-video');
  video.append(svgIcon('video'));
  header.append(back, person, video);
  return header;
}

function makeTimestamp(date, config) {
  const label = element('div', 'phone-timestamp');
  label.append(element('strong', '', dateLabel(date)), document.createTextNode(` ${timeLabel(date, config)}`));
  return label;
}

function defaultMessageDate(config, count) {
  const date = new Date();
  if (/^\d{1,2}:\d{2}$/.test(config.status?.time || '')) {
    const [hour, minute] = config.status.time.split(':').map(Number);
    date.setHours(hour, minute, 0, 0);
  }
  date.setMinutes(date.getMinutes() - count);
  return date;
}

function makeConversationService(config) {
  const service = element('div', 'phone-conversation-service', config.transport === 'sms' ? 'Text Message • SMS' : 'iMessage');
  if (config.transport !== 'sms' && config.show_encryption !== false) {
    const encryption = element('small', 'phone-conversation-encryption');
    encryption.append(svgIcon('lock'), document.createTextNode('Encrypted'));
    service.append(encryption);
  }
  return service;
}

function positionConversation(device, config) {
  const messages = device.querySelector('.phone-messages');
  const spacer = device.querySelector('.phone-scroll-spacer');
  if (spacer) spacer.style.height = '0px';
  if (config.scroll_position === 'latest-top') {
    const rows = device.querySelectorAll('.phone-message-row');
    const latest = rows[rows.length - 1];
    if (latest) {
      // Give the final message enough space after it to reach the viewport's top.
      // Keep its reaction visible when the reaction protrudes above the bubble.
      const reactionInset = latest.classList.contains('has-reactions') ? 27 : 0;
      spacer.style.height = `${Math.max(0, messages.clientHeight - latest.offsetHeight - reactionInset - 8)}px`;
      messages.scrollTop = Math.max(0, latest.offsetTop - reactionInset);
      return;
    }
  }
  messages.scrollTop = config.scroll_position === 'top' ? 0 : messages.scrollHeight;
}

function safeHostname(url) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return String(url || 'Link'); }
}

function makeLink(link) {
  const card = element('div', 'phone-link-card');
  if (link.image) card.append(imageNode(link.image, 'phone-link-image', 'Link preview'));
  else {
    const preview = element('div', 'phone-link-placeholder');
    preview.append(svgIcon('link'));
    card.append(preview);
  }
  const caption = element('div', 'phone-link-caption');
  caption.append(element('div', 'phone-link-title', link.title || link.url), element('div', 'phone-link-domain', safeHostname(link.url || '')));
  card.append(caption);
  return card;
}

function nativeTextWidth(text) {
  // Native Messages wraps at its maximum width, then hugs the longest line.
  // Ordinary CSS max-width alone leaves every wrapped bubble the same width.
  textMeasureContext ||= document.createElement('canvas').getContext('2d');
  if (!textMeasureContext) return 262;
  textMeasureContext.font = '400 17px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  const measure = value => Math.max(0, textMeasureContext.measureText(value).width - Math.max(0, Array.from(value).length - 1) * .25);
  let widest = 0;
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > 234) {
        widest = Math.max(widest, measure(line));
        line = word;
      } else line = candidate;
      if (measure(line) > 234) widest = 234;
    }
    widest = Math.max(widest, Math.min(234, measure(line)));
  }
  return Math.max(38, Math.min(262, Math.ceil(widest + 28.5)));
}

function makeBubble(message, config, isLastInRun) {
  const fromMe = message.from === 'me';
  const transport = message.transport || config.transport;
  let autoLink;
  if (!message.link && !message.image && /^https?:\/\/\S+$/i.test((message.text || '').trim())) {
    try {
      const url = new URL(message.text.trim());
      if (url.hostname && !url.username && !url.password) autoLink = { url: url.href };
    } catch { /* Keep incomplete URLs as ordinary message text. */ }
  }
  const link = message.link || autoLink;
  const text = autoLink ? '' : message.text;
  const row = element('div', `phone-message-row ${fromMe ? 'is-me' : 'is-them'}${isLastInRun ? ' is-last-in-run' : ''}`);
  const stack = element('div', 'phone-message-stack');
  const bubble = element('div', `phone-bubble${fromMe && transport === 'sms' ? ' is-sms' : ''}${message.image || link ? ' has-media' : ''}`);
  if (!message.image && !link) bubble.style.width = `${nativeTextWidth(text || '\u00a0')}px`;
  if (message._id != null) {
    bubble.dataset.messageId = String(message._id);
    row.dataset.messageId = String(message._id);
  }
  if (message.image) bubble.append(imageNode(message.image, 'phone-message-image', 'Shared photo'));
  if (text) bubble.append(element('div', 'phone-message-text', text));
  if (link) bubble.append(makeLink(link));
  if (!text && !message.image && !link) bubble.append(element('div', 'phone-message-text', '\u00a0'));
  if (Array.isArray(message.reactions) && message.reactions.length) {
    row.classList.add('has-reactions');
    const reactions = element('div', 'phone-reactions');
    message.reactions.slice(0, 5).sort((a, b) => Number(b.from === 'me') - Number(a.from === 'me')).forEach(reaction => {
      const reactionElement = element('span', `phone-reaction${reaction.from === 'me' ? ' from-me' : ''}`);
      reactionElement.append(createTapbackIcon(reaction, { fromMe: reaction.from === 'me' }));
      reactions.append(reactionElement);
    });
    bubble.append(reactions);
  }
  if (isLastInRun && !message.image && !link) {
    const tail = document.createElementNS(SVG_NS, 'svg');
    tail.setAttribute('viewBox', '0 0 22 22');
    tail.setAttribute('aria-hidden', 'true');
    tail.classList.add('phone-bubble-tail');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M0 0H15C11 9 12 15 20 21C21 23 17 22 13 20L0 12Z');
    path.setAttribute('fill', 'currentColor');
    tail.append(path);
    bubble.append(tail);
  }
  stack.append(bubble);
  if (message.receipt && fromMe) {
    const receipt = element('div', 'phone-receipt');
    receipt.textContent = message.receipt === 'read' ? 'Read' : 'Delivered';
    stack.append(receipt);
  }
  row.append(stack);
  return row;
}

function makeComposer(config) {
  const footer = element('div', 'phone-footer');
  if (config.notifications_silenced) {
    const silenced = element('div', 'phone-silenced');
    silenced.append(svgIcon('moon'), element('span', '', `${config.contact?.name || 'Contact'} has notifications silenced`));
    footer.append(silenced);
  }
  const composer = element('div', 'phone-composer');
  const plus = element('div', 'phone-composer-plus');
  plus.append(svgIcon('plus'));
  const field = element('div', 'phone-composer-field');
  field.append(element('span', 'phone-composer-placeholder', config.transport === 'sms' ? 'Text Message • SMS' : 'iMessage'), svgIcon('waveform', 'phone-composer-waveform'));
  composer.append(plus, field);
  footer.append(composer, element('div', 'phone-home-indicator'));
  return footer;
}

/** Returns a detached, fixed-size phone element; callers can scale its container. */
export function renderPhone(config = {}) {
  const device = element('div', `device phone-theme-${config.theme === 'light' ? 'light' : 'dark'}`);
  device.setAttribute('aria-label', `Messages conversation with ${config.contact?.name || 'Contact'}`);
  const screen = element('div', 'phone-screen');
  const background = config.background;
  if (background && background !== 'default') {
    device.classList.add('phone-has-background');
    if (['colour', 'sky', 'water', 'aurora'].includes(background)) screen.classList.add(`phone-background-${background}`);
    else if (/^#[a-f\d]{3,8}$/i.test(background)) screen.style.background = background;
    else if (/^data:image\//i.test(background)) screen.style.backgroundImage = `url("${background.replace(/"/g, '%22')}")`;
  }
  const chrome = element('div', 'phone-top-chrome');
  chrome.append(makeStatus(config));
  if (config.back_to_app) {
    const returnLabel = element('div', 'phone-return-app');
    returnLabel.append(element('span', '', '◀'), document.createTextNode(` ${config.back_to_app}`));
    chrome.append(returnLabel);
    device.classList.add('phone-has-return-app');
  }
  chrome.append(makeHeader(config));
  const messages = element('div', 'phone-messages');
  messages.setAttribute('role', 'log');
  const messageList = element('div', 'phone-message-list');
  const items = Array.isArray(config.messages) ? config.messages : [];
  messageList.append(makeConversationService(config));
  let previousDate = null;
  items.forEach((message, index) => {
    const parsed = message.at ? new Date(message.at) : null;
    const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    if (index === 0 && !date) messageList.append(makeTimestamp(defaultMessageDate(config, items.length), config));
    if (date && (!previousDate || date.toDateString() !== previousDate.toDateString() || date.getTime() - previousDate.getTime() > 60 * 60 * 1000)) messageList.append(makeTimestamp(date, config));
    if (date) previousDate = date;
    const next = items[index + 1];
    const nextDate = next?.at ? new Date(next.at) : null;
    const isLast = !next || next.from !== message.from || Boolean(message.receipt) || (date && nextDate && nextDate.getTime() - date.getTime() > 60 * 60 * 1000);
    messageList.append(makeBubble(message, config, isLast));
  });
  if (config.scroll_position === 'latest-top') {
    const spacer = element('div', 'phone-scroll-spacer');
    spacer.setAttribute('aria-hidden', 'true');
    messageList.append(spacer);
  }
  messages.append(messageList);
  screen.append(chrome, messages, makeComposer(config));
  device.append(screen);
  const scroll = () => positionConversation(device, config);
  // Renderers are usually appended immediately; one frame lets the browser lay them out.
  requestAnimationFrame(scroll);
  device.querySelectorAll('img').forEach(img => img.addEventListener('load', scroll, { once: true }));
  return device;
}

/** Export exactly the DOM preview, with no remote upload or rendering service. */
export async function generatePng(config, { frame = false, scale = 3 } = {}) {
  if (!window.htmlToImage?.toPng) throw new Error('The local image exporter is unavailable. Please reload and try again.');
  const holder = element('div', 'phone-export-holder');
  Object.assign(holder.style, { position: 'fixed', top: '0', left: '-20000px', width: 'max-content', zIndex: '-100', pointerEvents: 'none' });
  const device = renderPhone(config);
  device.classList.add('phone-export');
  if (!frame) device.classList.add('device--frameless');
  holder.append(device);
  document.body.append(holder);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(Array.from(device.querySelectorAll('img'), img => img.complete ? Promise.resolve() : new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    })));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const messages = device.querySelector('.phone-messages');
    positionConversation(device, config);
    // Translating the inner list preserves scroll position in SVG/foreignObject exports.
    const messageList = device.querySelector('.phone-message-list');
    const scrollOffset = messages.scrollTop;
    messages.scrollTop = 0;
    messageList.style.transform = `translateY(-${scrollOffset}px)`;
    return await window.htmlToImage.toPng(device, {
      pixelRatio: Math.max(1, Math.min(4, Number(scale) || 3)),
      width: frame ? 409 : 393,
      height: frame ? 868 : 852,
      cacheBust: false,
      skipFonts: true,
      backgroundColor: undefined,
    });
  } finally {
    holder.remove();
  }
}
