/** Curved, shaded Tapback glyphs drawn from the native Messages reference.
 * Keep these as paths so exports do not depend on an installed display font.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
let nextIcon = 0;

function node(tag, attributes = {}, children = []) {
  const result = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) result.setAttribute(name, String(value));
  result.append(...children);
  return result;
}

function linear(id, colors) {
  return node('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' }, colors.map(([offset, color, opacity = 1]) =>
    node('stop', { offset, 'stop-color': color, 'stop-opacity': opacity })));
}

function radial(id, color, opacity = 1) {
  return node('radialGradient', { id }, [
    node('stop', { offset: '0', 'stop-color': color, 'stop-opacity': opacity }),
    node('stop', { offset: '.45', 'stop-color': color, 'stop-opacity': opacity * .75 }),
    node('stop', { offset: '1', 'stop-color': color, 'stop-opacity': '0' }),
  ]);
}

function path(d, attributes = {}) {
  return node('path', { d, ...attributes });
}

// The top HA is intentionally larger than the lower HA. Its rounded stems,
// narrow counter, and swollen feet are part of the glyph, rather than a font.
const LAUGH_H = 'M3.1 .7C.8 .7 .1 4.3 .25 8.3 .4 12.3 1.6 15.3 3.5 15.3 5.6 15.3 6.4 12.1 6.45 9.75 7.1 9.4 7.9 9.4 8.55 9.7 8.8 12.3 9.8 15.2 11.85 15.2 14 15.2 14.85 11.9 14.7 7.9 14.55 3.7 13.5 .35 11.45 .35 9.45 .35 8.65 3.5 8.45 6.1 7.8 6.5 7 6.5 6.35 6.1 5.95 3.1 5.1 .7 3.1 .7Z';
const LAUGH_A = 'M21.2 .6C19.3 .6 17.5 3.1 16.25 6.1 15 9 14.5 12.2 14.2 13.65 13.95 14.9 14.8 15.35 15.95 15.1 17 14.85 18.1 13.55 18.75 12.65L23 12.65C23.8 13.6 24.45 15.25 25.9 15.2 27.3 15.15 27.8 13.95 27.5 12.1 27.05 8.5 25.65 5.1 24.1 2.6 23.3 1.25 22.3 .6 21.2 .6ZM21.15 6.15C21.65 6.1 22.0 8.35 22.15 9.6L20.1 9.6C20.4 8.25 20.7 6.2 21.15 6.15Z';

function laugh(id, fromMe) {
  const body = `${id}-body`, shine = `${id}-shine`, crossbar = `${id}-crossbar`;
  const definitions = node('defs', {}, [
    linear(body, fromMe
      ? [['0', '#eafaff'], ['.38', '#f7feff'], ['1', '#bcecff']]
      : [['0', '#00b8f5'], ['.3', '#00c7fa'], ['.7', '#00bbf3'], ['1', '#00b2ee']]),
    radial(shine, '#e5fbff', fromMe ? .8 : .86),
    radial(crossbar, '#d4f8ff', fromMe ? .62 : .64),
  ]);
  const row = (transform) => node('g', { transform }, [
    path(LAUGH_H, { fill: `url(#${body})`, stroke: fromMe ? '#a9dcf8' : '#009fdf', 'stroke-width': '.16' }),
    path(LAUGH_A, { fill: `url(#${body})`, 'fill-rule': 'evenodd', stroke: fromMe ? '#a9dcf8' : '#009fdf', 'stroke-width': '.16' }),
    node('ellipse', { cx: '3.2', cy: '6.7', rx: '2.3', ry: '6.0', fill: `url(#${shine})` }),
    node('ellipse', { cx: '11.45', cy: '6.4', rx: '2.25', ry: '6.0', fill: `url(#${shine})` }),
    node('ellipse', { cx: '7.45', cy: '7.9', rx: '2.0', ry: '1.9', fill: `url(#${crossbar})` }),
    path('M16.7 7.8C17.6 4.6 19.5 1.15 21.25 1.15 23.2 1.15 25.5 5.25 26.0 8.2 24.2 7.9 23 3.6 21.2 3.55 19.8 3.55 18.8 7.2 16.7 7.8Z', { fill: `url(#${shine})` }),
    node('ellipse', { cx: '21.15', cy: '11.05', rx: '2.65', ry: '1.0', fill: `url(#${crossbar})` }),
  ]);
  return [definitions, row('translate(1.1 .8)'), row('translate(5.0 17.1) scale(.77)')];
}

function heart(id) {
  const body = `${id}-body`, shine = `${id}-shine`;
  return [
    node('defs', {}, [
      linear(body, [['0', '#ffc1e7'], ['.28', '#ffafe0'], ['.68', '#ff85cb'], ['1', '#fb64b6']]),
      radial(shine, '#ffeafa', .28),
    ]),
    path('M16 28.3C14.75 28.3 2.55 19 2.55 10.75 2.55 3.15 10.7 .9 16 7.15 21.3 .9 29.45 3.15 29.45 10.75 29.45 19 17.25 28.3 16 28.3Z', {
      fill: `url(#${body})`, stroke: '#ff94d0', 'stroke-width': '.3',
    }),
    node('ellipse', { cx: '8.8', cy: '8.8', rx: '5.8', ry: '5.0', fill: `url(#${shine})` }),
    node('ellipse', { cx: '23.2', cy: '8.8', rx: '5.8', ry: '5.0', fill: `url(#${shine})` }),
  ];
}

function punctuation(id, type, fromMe) {
  const body = `${id}-body`, shine = `${id}-shine`;
  const definitions = node('defs', {}, [
    linear(body, fromMe
      ? [['0', '#fff'], ['.35', '#f8ffff'], ['.74', '#d9f7ff'], ['1', '#b4e5ff']]
      : [['0', '#c5f7ff'], ['.35', '#70e1ff'], ['.74', '#22c6fc'], ['1', '#09acf0']]),
    radial(shine, '#fff', fromMe ? .9 : .7),
  ]);
  if (type === 'emphasize') return [
    definitions,
    path('M5.65 5.6C2.5 5.6 2 8.2 2.6 11.7L3.9 20.5C4.35 23.65 7.65 24 8.25 20.85L9.15 11.2C9.45 7.75 8.25 5.6 5.65 5.6Z', { fill: `url(#${body})` }),
    path('M17.15 1.15C13.6 1.15 12.7 3.9 12.85 7.75L13.35 18.25C13.5 21.9 17.15 22.35 18.15 18.7L20.3 7.2C21.05 3.5 20.05 1.15 17.15 1.15Z', { fill: `url(#${body})` }),
    node('ellipse', { cx: '6.7', cy: '27.1', rx: '3.05', ry: '3.1', fill: `url(#${body})` }),
    node('ellipse', { cx: '15.6', cy: '24.9', rx: '3.15', ry: '3.1', fill: `url(#${body})` }),
    node('ellipse', { cx: '5.6', cy: '10', rx: '3.1', ry: '4.3', fill: `url(#${shine})` }),
    node('ellipse', { cx: '16.7', cy: '5.9', rx: '3.7', ry: '4.7', fill: `url(#${shine})` }),
    node('ellipse', { cx: '6.55', cy: '25.9', rx: '2.5', ry: '1.7', fill: `url(#${shine})` }),
    node('ellipse', { cx: '15.5', cy: '23.7', rx: '2.6', ry: '1.7', fill: `url(#${shine})` }),
  ];
  return [
    definitions,
    path('M5.65 8.2C3.95 7.7 3.7 5.9 4.65 4.35 6.3 1.45 9.15 .45 12.4 .55 17.65 .7 21.05 3.2 20.85 7.3 20.65 10.7 18.3 12.3 16.15 13.9 14.25 15.35 13.8 16.5 13.55 18.25 13.25 20.25 12.1 21.1 10.6 20.9 8.8 20.6 8.25 19.05 8.45 17.2 8.7 14.65 10 12.55 12.3 10.75 14.5 9.1 15.65 8.2 15.45 6.65 15.25 5.15 13.6 4.4 12 4.45 10 4.45 8.95 5.5 8.15 6.95 7.5 8.1 6.55 8.5 5.65 8.2Z', { fill: `url(#${body})` }),
    node('ellipse', { cx: '10.45', cy: '26.2', rx: '3.3', ry: '3.35', fill: `url(#${body})` }),
    node('ellipse', { cx: '11.7', cy: '2.7', rx: '6.1', ry: '2.1', fill: `url(#${shine})` }),
    node('ellipse', { cx: '10.3', cy: '24.9', rx: '2.7', ry: '1.9', fill: `url(#${shine})` }),
  ];
}

/** Return a safe SVG or emoji span; the caller supplies the circular badge. */
export function createTapbackIcon(reaction = {}, { fromMe = false } = {}) {
  const type = reaction.type;
  if (reaction.emoji || !['love', 'laugh', 'emphasize', 'question'].includes(type)) {
    const emoji = document.createElement('span');
    emoji.className = 'tapback-icon tapback-emoji';
    emoji.textContent = reaction.emoji || ({ like: '👍', dislike: '👎' }[type] || '👍');
    emoji.setAttribute('aria-hidden', 'true');
    return emoji;
  }
  const id = `tapback-${++nextIcon}`;
  const svg = node('svg', {
    xmlns: SVG_NS, viewBox: type === 'love' ? '0 0 32 32' : type === 'laugh' ? '0 0 30 32' : '0 0 24 32',
    class: `tapback-icon tapback-${type}`, width: type === 'emphasize' || type === 'question' ? '18' : '22', height: '22',
    'aria-hidden': 'true', focusable: 'false',
  });
  svg.append(...(type === 'love' ? heart(id) : type === 'laugh' ? laugh(id, fromMe) : punctuation(id, type, fromMe)));
  return svg;
}
