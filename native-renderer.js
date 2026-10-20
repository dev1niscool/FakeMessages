import { collapseConversationLabels } from './native-layout.js?v=1.6.0';

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
    ? removeConversationLabels(blob) : blob;
}

// Native Messages has no setting for these labels; collapse them in the PNG.
async function removeConversationLabels(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0); bitmap.close();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (!collapseConversationLabels(pixels)) return blob;
  ctx.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare the PNG.')), 'image/png'));
}
