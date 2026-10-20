import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { handleNativeRequest } from './native-renderer.mjs';

const port = 5173;
createServer(async (req, res) => {
  try {
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method, headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? {body: Readable.toWeb(req), duplex: 'half'} : {}),
    });
    const result = await handleNativeRequest(request);
    res.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) Readable.fromWeb(result.body).pipe(res); else res.end();
  } catch {
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Local renderer adapter failed.'}));
  }
}).listen(port, '127.0.0.1', () => console.log(`Renderer adapter: http://127.0.0.1:${port}`));
