import http from 'node:http';
import { Transform } from 'node:stream';
import { pathToFileURL } from 'node:url';

const MODEL = 'large-v3-turbo';

function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

// This is a loopback-only adapter for the authenticated Diction gateway.
// The gateway converts audio to WAV and fixes the model before forwarding it.
export function createBridge({ upstreamPort = 8178, maxBytes = 25 * 1024 * 1024,
  timeoutMs = 120_000, healthTimeoutMs = 3_000 } = {}) {
  return http.createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const health = request.method === 'GET' && path === '/health';
    if (request.method === 'GET' && path === '/v1/models') {
      json(response, 200, { object: 'list', data: [
        { id: MODEL, object: 'model', owned_by: 'local' },
      ] });
      return;
    }
    if (!health && !(request.method === 'POST' && path === '/v1/audio/transcriptions')) {
      json(response, 404, { error: 'Route not found' });
      return;
    }
    const contentType = request.headers['content-type'] ?? '';
    if (!health && !/^multipart\/form-data\s*;.*\bboundary=/i.test(contentType)) {
      json(response, 415, { error: 'Expected multipart/form-data' });
      return;
    }
    if (!health && Number(request.headers['content-length'] ?? 0) > maxBytes) {
      response.setHeader('Connection', 'close');
      json(response, 413, { error: 'Audio upload is too large' });
      return;
    }

    let finished = false;
    let receivedBytes = 0;
    let upstreamResponse;
    const headers = health ? {} : { 'Content-Type': contentType };
    if (!health && request.headers['content-length']) {
      headers['Content-Length'] = request.headers['content-length'];
    }
    // Do not forward gateway credentials or arbitrary client headers.
    const upstream = http.request({
      hostname: '127.0.0.1', port: upstreamPort,
      method: health ? 'GET' : 'POST',
      path: health ? '/health' : '/inference', headers,
    });
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          fail(413, 'Audio upload is too large');
          callback();
          return;
        }
        callback(null, chunk);
      },
    });
    const timer = setTimeout(() => fail(health ? 503 : 504,
      health ? 'Whisper is unavailable' : 'Whisper timed out'),
    health ? healthTimeoutMs : timeoutMs);
    timer.unref();

    function stop() {
      clearTimeout(timer);
      request.unpipe(limiter);
      limiter.destroy();
      upstreamResponse?.destroy();
      upstream.destroy();
    }
    function fail(status, message) {
      if (finished) return;
      finished = true;
      stop();
      if (response.headersSent) {
        response.destroy();
      } else {
        response.setHeader('Connection', 'close');
        json(response, status, { error: message });
      }
    }
    request.on('aborted', () => { finished = true; stop(); });
    request.on('error', () => fail(400, 'Audio upload interrupted'));
    response.on('close', () => { finished = true; stop(); });
    response.on('finish', () => { finished = true; clearTimeout(timer); });
    upstream.on('error', () => fail(health ? 503 : 502, 'Whisper is unavailable'));
    upstream.on('response', (incoming) => {
      upstreamResponse = incoming;
      incoming.on('error', () => fail(health ? 503 : 502, 'Whisper response interrupted'));
      if (health) {
        incoming.resume();
        incoming.on('end', () => {
          if (!finished) json(response, incoming.statusCode === 200 ? 200 : 503,
            { status: incoming.statusCode === 200 ? 'ok' : 'unavailable' });
        });
        return;
      }
      response.writeHead(incoming.statusCode ?? 502, {
        'Content-Type': incoming.headers['content-type'] ?? 'application/json',
        'Cache-Control': 'no-store',
      });
      incoming.pipe(response);
    });
    if (health) upstream.end();
    else request.pipe(limiter).pipe(upstream);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createBridge();
  server.listen(8179, '127.0.0.1', () => {
    console.log('Diction Whisper bridge listening on 127.0.0.1:8179');
  });
  server.on('error', () => {
    console.error('Diction Whisper bridge could not listen on 127.0.0.1:8179');
    process.exitCode = 1;
  });
}
