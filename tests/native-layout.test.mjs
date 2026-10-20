import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { collapseConversationLabels } from '../native-layout.js';

// Actual iMessage + Encrypted glyphs cropped from a native 1179×2556 render:
// x=482, y=507, width=218, height=78; RGBA bytes compressed with zlib.
const labels = inflateSync(readFileSync(new URL('./fixtures/native-service-labels.rgba.deflate', import.meta.url)));
const width = 1179, height = 2556, stride = width * 4;

function image(background = 0) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.fill(background, i, i + 3);
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function addLabels(target, top = 507, inverted = false) {
  for (let y = 0; y < 78; y++) {
    for (let x = 0; x < 218; x++) {
      for (let channel = 0; channel < 4; channel++) {
        const value = labels[(y * 218 + x) * 4 + channel];
        target.data[((top + y) * width + 482 + x) * 4 + channel] =
          inverted && channel < 3 ? 255 - value : value;
      }
    }
  }
}

function rectangle(target, x, y, w, h, colour) {
  for (let row = y; row < y + h; row++) {
    for (let column = x; column < x + w; column++) {
      target.data.set([...colour, 255], (row * width + column) * 4);
    }
  }
}

for (const theme of ['dark', 'light']) {
  test(`${theme}: collapses both labels and moves every conversation element without changing the frame`, () => {
    const target = image(theme === 'light' ? 255 : 0);
    addLabels(target, 507, theme === 'light');
    rectangle(target, 450, 632, 220, 31, [128, 128, 128]); // timestamp
    rectangle(target, 700, 689, 100, 100, [0, 155, 255]); // reaction
    rectangle(target, 50, 770, 750, 180, [50, 50, 53]); // bubble
    rectangle(target, 800, 2267, 200, 26, [128, 128, 128]); // bottom-most receipt
    rectangle(target, 200, 100, 700, 300, [180, 180, 180]); // header
    rectangle(target, 250, 2351, 800, 120, [60, 60, 63]); // composer
    const before = new Uint8ClampedArray(target.data);

    assert.equal(collapseConversationLabels(target), true);
    assert.deepEqual(target.data.subarray(0, 507 * stride), before.subarray(0, 507 * stride));
    assert.deepEqual(target.data.subarray(2295 * stride), before.subarray(2295 * stride));
    assert.deepEqual(
      target.data.subarray(546 * stride, (2295 - 78) * stride),
      before.subarray((546 + 78) * stride, 2295 * stride),
      'timestamp, bubbles, reactions and receipt retain their exact pixels, shifted up 78px',
    );
    assert.equal(target.data[(554 * width + 450) * 4], 128, 'timestamp now starts at y=554');
    assert.equal(target.data[(2270 * width + 850) * 4], theme === 'light' ? 255 : 0,
      'the old receipt position becomes clear background');
    assert.equal(collapseConversationLabels(target), false, 'neither service label remains');
  });
}

test('does not change a scrolled conversation when the labels are absent', () => {
  const target = image();
  rectangle(target, 300, 500, 800, 300, [35, 150, 255]);
  const before = new Uint8ClampedArray(target.data);
  assert.equal(collapseConversationLabels(target), false);
  assert.deepEqual(target.data, before);
});

test('does not edit an ambiguous repeated label or a block overlapping the header', () => {
  for (const tops of [[507, 707], [441]]) {
    const target = image();
    for (const top of tops) addLabels(target, top);
    const before = new Uint8ClampedArray(target.data);
    assert.equal(collapseConversationLabels(target), false);
    assert.deepEqual(target.data, before);
  }
});

test('recognizes low-contrast coloured labels using the strongest colour channel', () => {
  const target = image();
  addLabels(target);
  for (let y = 507; y < 585; y++) {
    for (let x = 482; x < 700; x++) {
      const offset = (y * width + x) * 4;
      target.data[offset + 2] = Math.round(target.data[offset] * 0.6);
      target.data[offset] = 0;
      target.data[offset + 1] = 0;
    }
  }
  assert.equal(collapseConversationLabels(target), true);
});

test('rejects an unexpected native image size instead of cropping unknown geometry', () => {
  assert.throws(() => collapseConversationLabels({ width: 393, height: 852 }), /changed its image size/);
});
