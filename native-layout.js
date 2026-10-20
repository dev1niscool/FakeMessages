/** Collapse the native service block without scaling text or changing the phone frame. */
export function collapseConversationLabels(image) {
  const { width, height, data } = image;
  if (width !== 1179 || height !== 2556) {
    throw new Error('The renderer changed its image size; hiding conversation labels needs an update.');
  }
  const labelLeft = 483, labelHeight = 39;
  // Match actual native glyph edges, including either light or dark appearance.
  // Never treat a message in the same position as the conversation label.
  const edges = Uint8Array.from(atob('EQQByQQAGgUAPQUAygUAGAYBLwYBoAYAygYAGAcBLwcBxwcBDggBGwgAMQgAxwgBDgkBGQkBLwkBoAkAygkAEQoALgoBcQoAyQoAEAsAGwsAMQsARwsBYQsAbAsBdAsBgwsAjAsBmgsBswsAxwsBDgwBGQwBLwwBRQwAVwwBawwAdAwBgwwAiwwBmgwBtAwAyQwAGw0ALw0BRw0AVg0BYw0AdQ0Bfw0BjA0AoA0AsQ0Bvw0ADA4BLg4BQg4BUA4AYA4BbA4Afw4Biw4Alg4AqA4BtQ4AxQ4BDA8BLw8BRQ8AVQ8BYQ8Baw8Afw8Bhw8Blg8Apw8BtQ8AvQ8AyQ8AHRAAPBAATRABWBAAdhABfhABihAAlhAAoBAAsxABvRAAyhAALhEBRREAUBEAaBEBeREAhxEBlxEApxEBthEAxhEByhEALhIBQhIBThIBWBIAdhIBfhIBihIAnRIBthIAxxIBDBMBLxMBRRMAUBMAaBMBeRMAgBMAlBMBoBMAuhMByRMAHRQAMRQATRQBVRQBaxQAfRQBihQAnRQBqhQAxhQByhQALhUBQhUBThUBWBUAeBUBfxUAlBUBoBUAuhUByRUAHRYAMRYATRYBVRYBaxYAexYAhxYBlBYBnRYBqhYAxhYBDBcBLxcBRRcAUBcAWRcAaBcBexcAhxcBlhcApxcBsxcBvhcAyhcALhgBQhgBThgBWhgAaBgBexgAhxgBlhgAqBgBshgBuxgBxRgBDBkBLxkBRRkAUBkAaBkBfhkAnRkBuxkByhkALhoBQhoBThoBYhoAeRoBfhoAixoBnhoBtBoAxRoAyhoALhsBQhsBThsBaBsBfRsAjBsBnxsBshsAxxsBehwBihwAfB0AeR4Bih4Aih8AeyAAdSEB'), char => char.charCodeAt(0));
  const matches = [];
  for (let row = 450; row <= 940 - labelHeight; row++) {
    let normal = 0, inverted = 0;
    for (let i = 0; i < edges.length; i += 3) {
      const offset = ((row + edges[i + 1]) * width + labelLeft + edges[i]) * 4;
      let delta = 0;
      for (let channel = 0; channel < 3; channel++) {
        const difference = data[offset + channel] - data[offset - 4 + channel];
        if (Math.abs(difference) > Math.abs(delta)) delta = difference;
      }
      if (Math.abs(delta) < 10) continue;
      if ((delta > 0) === Boolean(edges[i + 2])) normal++; else inverted++;
    }
    const score = Math.max(normal, inverted) / (edges.length / 3);
    if (score >= 0.85) matches.push({ row, score });
  }
  if (!matches.length) return false;
  matches.sort((a, b) => b.score - a.score);
  if (matches.some(match => Math.abs(match.row - matches[0].row) > 2)) return false;

  // Two 13-point lines at the renderer's 3x scale. The timestamp, bubbles,
  // reactions and receipts move together; the status/header and footer stay put.
  const serviceTop = matches[0].row - labelHeight;
  if (serviceTop < 450) return false; // A partially occluded block can overlap the contact header.
  const serviceBottom = matches[0].row + labelHeight;
  const collapsedHeight = serviceBottom - serviceTop;
  // Native receipts end by row 2292; composer shadows start at row 2295.
  const footerTop = 2295;
  const stride = width * 4;
  const headerBackground = new Uint8ClampedArray(data.subarray(serviceTop * stride, (serviceTop + labelHeight) * stride));
  const bottomBackground = new Uint8ClampedArray(data.subarray((footerTop - 1) * stride, (footerTop + 1) * stride));
  data.copyWithin(serviceTop * stride, serviceBottom * stride, footerTop * stride);

  // The first 13 points after the service block are clear background. Blend
  // that area into the untouched header so its shadow/wallpaper has no hard cut.
  for (let y = 0; y < labelHeight; y++) {
    const row = y * stride, amount = (y + 1) / labelHeight;
    for (let x = 0; x < width; x++) {
      const offset = row + x * 4, target = serviceTop * stride + offset;
      for (let channel = 0; channel < 3; channel++) {
        let background = headerBackground[offset + channel];
        if (x >= labelLeft && x < labelLeft + 216) {
          const position = (x - labelLeft + 1) / 217;
          background = headerBackground[row + (labelLeft - 1) * 4 + channel] * (1 - position)
            + headerBackground[row + (labelLeft + 216) * 4 + channel] * position;
        }
        data[target + channel] = Math.round(background * (1 - amount) + data[target + channel] * amount);
      }
    }
  }

  // Extend the clear background just above the composer into the vacated space.
  // Join both boundaries per column, preserving gradients without a color seam.
  for (let y = footerTop - collapsedHeight; y < footerTop; y++) {
    const amount = (y - (footerTop - collapsedHeight) + 1) / (collapsedHeight + 1);
    for (let x = 0; x < width; x++) {
      const source = x * 4, offset = y * stride + source;
      for (let channel = 0; channel < 3; channel++) {
        data[offset + channel] = Math.round(bottomBackground[source + channel] * (1 - amount)
          + bottomBackground[stride + source + channel] * amount);
      }
    }
  }
  return true;
}
