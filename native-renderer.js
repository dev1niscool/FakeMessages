/** The native service returns a real Messages screenshot, separate from the live illustration. */
const SERVICE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5173' : 'https://fake-messages-renderer.devinkancherlaawesome-bbc.workers.dev';
let session;
const uploaded = new Map();

async function request(path, options = {}) {
  const init = {
    ...options,
    headers: { ...(session ? { 'X-Renderer-Session': session } : {}), ...options.headers },
  };
  const response = await fetch(`${SERVICE}${path}`, {...init, credentials:'omit', signal:AbortSignal.timeout(45000)});
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Native renderer returned ${response.status}.`);
  }
  return response;
}

async function upload(value) {
  if (!value?.startsWith('data:image/')) return value;
  if (uploaded.has(value)) return uploaded.get(value);
  const blob = await (await fetch(value)).blob();
  const form = new FormData();
  form.append('file', blob, 'image.png');
  const result = await (await request('/api/assets', { method: 'POST', body: form })).json();
  if (typeof result.asset !== 'string') throw new Error('The renderer did not accept the image.');
  uploaded.set(value, result.asset);
  return result.asset;
}

export async function generateNativePng(config, onProgress = () => {}) {
  onProgress('Connecting to native renderer…');
  if (!session) {
    const result = await (await request('/api/session', { method: 'POST' })).json();
    session = result.session;
    if (!session) throw new Error('The native renderer did not create a session.');
  }
  const payload = structuredClone(config);
  delete payload.show_encryption;
  delete payload.live_activity;
  if (payload.background === 'default') delete payload.background;
  if (payload.status.time === 'current') {
    const now = new Date();
    payload.status.time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }
  payload.messages = payload.messages.filter(message => message.text?.trim() || message.image || message.link?.url);
  if (!payload.messages.length) throw new Error('Add a message before generating.');
  onProgress('Preparing conversation…');
  if (payload.contact.photo) payload.contact.photo = await upload(payload.contact.photo);
  if (payload.background) payload.background = await upload(payload.background);
  for (const message of payload.messages) {
    delete message._id;
    if (message.image) message.image = await upload(message.image);
    if (message.link?.image) message.link.image = await upload(message.link.image);
    if (!message.image && !message.link && /^https?:\/\/\S+$/i.test((message.text || '').trim())) {
      message.link = { url: message.text.trim() };
      delete message.text;
    }
  }
  let job = await (await request('/api/renders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload, (_key, value) => value === '' ? undefined : value),
  })).json();
  if (!/^[0-9a-f-]{36}$/i.test(job.id || '')) throw new Error('The renderer returned an invalid job.');
  const id = job.id;
  const deadline = Date.now() + 180000;
  while (job.status === 'queued' || job.status === 'running') {
    if (Date.now() > deadline) throw new Error('The native renderer is taking too long. Please try again later.');
    onProgress(job.status === 'queued' ? 'Waiting for an iPhone…' : 'Rendering in Messages…');
    await new Promise(resolve => setTimeout(resolve, 900));
    job = await (await request(`/api/renders/${id}`)).json();
  }
  if (job.status !== 'done') throw new Error(job.error || 'Native rendering failed.');
  onProgress('Preparing your PNG…');
  const blob = await (await request(`/api/renders/${id}/image`)).blob();
  return config.show_encryption === false && config.transport !== 'sms'
    ? removeEncryptionLabel(blob) : blob;
}

// Native Messages has no display setting for this label. Remove only that row
// from the downloaded screenshot, interpolating its surrounding background.
async function removeEncryptionLabel(blob) {
  const bitmap = await createImageBitmap(blob);
  if (bitmap.width !== 1179 || bitmap.height !== 2556) {
    bitmap.close();
    throw new Error('The renderer changed its image size; hiding the encryption label needs an update.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0); bitmap.close();
  const left = 483, width = 216, height = 39;
  const searchTop = 450, searchHeight = 490;
  const search = ctx.getImageData(left - 1, searchTop, width + 2, searchHeight);
  // Recognize the actual label's edge pattern before touching pixels. In a long
  // or scrolled conversation this row may contain a message instead.
  const edges = Uint8Array.from(atob('EQQByQQAGgUAPQUAygUAGAYBLwYBoAYAygYAGAcBLwcBxwcBDggBGwgAMQgAxwgBDgkBGQkBLwkBoAkAygkAEQoALgoBcQoAyQoAEAsAGwsAMQsARwsBYQsAbAsBdAsBgwsAjAsBmgsBswsAxwsBDgwBGQwBLwwBRQwAVwwBawwAdAwBgwwAiwwBmgwBtAwAyQwAGw0ALw0BRw0AVg0BYw0AdQ0Bfw0BjA0AoA0AsQ0Bvw0ADA4BLg4BQg4BUA4AYA4BbA4Afw4Biw4Alg4AqA4BtQ4AxQ4BDA8BLw8BRQ8AVQ8BYQ8Baw8Afw8Bhw8Blg8Apw8BtQ8AvQ8AyQ8AHRAAPBAATRABWBAAdhABfhABihAAlhAAoBAAsxABvRAAyhAALhEBRREAUBEAaBEBeREAhxEBlxEApxEBthEAxhEByhEALhIBQhIBThIBWBIAdhIBfhIBihIAnRIBthIAxxIBDBMBLxMBRRMAUBMAaBMBeRMAgBMAlBMBoBMAuhMByRMAHRQAMRQATRQBVRQBaxQAfRQBihQAnRQBqhQAxhQByhQALhUBQhUBThUBWBUAeBUBfxUAlBUBoBUAuhUByRUAHRYAMRYATRYBVRYBaxYAexYAhxYBlBYBnRYBqhYAxhYBDBcBLxcBRRcAUBcAWRcAaBcBexcAhxcBlhcApxcBsxcBvhcAyhcALhgBQhgBThgBWhgAaBgBexgAhxgBlhgAqBgBshgBuxgBxRgBDBkBLxkBRRkAUBkAaBkBfhkAnRkBuxkByhkALhoBQhoBThoBYhoAeRoBfhoAixoBnhoBtBoAxRoAyhoALhsBQhsBThsBaBsBfRsAjBsBnxsBshsAxxsBehwBihwAfB0AeR4Bih4Aih8AeyAAdSEB'), char => char.charCodeAt(0));
  const matches = [];
  for (let row = 0; row <= searchHeight - height; row++) {
    let normal = 0, inverted = 0;
    for (let i = 0; i < edges.length; i += 3) {
      const offset = ((row + edges[i + 1]) * (width + 2) + edges[i] + 1) * 4;
      const delta = search.data[offset] - search.data[offset - 4];
      if (Math.abs(delta) < 20) continue;
      if ((delta > 0) === Boolean(edges[i + 2])) normal++; else inverted++;
    }
    const score = Math.max(normal, inverted) / (edges.length / 3);
    if (score >= 0.85) matches.push({row, score});
  }
  if (!matches.length) return blob;
  matches.sort((a, b) => b.score - a.score);
  if (matches.some(match => Math.abs(match.row - matches[0].row) > 2)) return blob;
  const top = searchTop + matches[0].row;
  const pixels = ctx.getImageData(left - 1, top, width + 2, height);
  for (let y = 0; y < height; y++) {
    const a = y * (width + 2) * 4;
    const b = a + (width + 1) * 4;
    for (let x = 1; x <= width; x++) {
      const amount = x / (width + 1), offset = a + x * 4;
      for (let channel = 0; channel < 3; channel++) pixels.data[offset + channel] = Math.round(pixels.data[a + channel] * (1 - amount) + pixels.data[b + channel] * amount);
    }
  }
  ctx.putImageData(pixels, left - 1, top);
  return new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare the PNG.')), 'image/png'));
}
