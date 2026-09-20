import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createBridge } from './bridge.mjs';

async function listen(server, t) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return server.address().port;
}

test('rewrites transcription path, preserves multipart, drops credentials, checks upstream health', async (t) => {
  const body = '--abc\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\n\r\nRIFF\r\n--abc--\r\n';
  let healthy = true;
  const backend = http.createServer(async (req, res) => {
    if (req.url === '/health') { res.writeHead(healthy ? 200 : 503); res.end('{}'); return; }
    assert.equal(req.url, '/inference');
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers['content-type'], 'multipart/form-data; boundary=abc');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), body);
    res.setHeader('Content-Type', 'application/json');
    res.end('{"text":"contract verified"}');
  });
  const upstreamPort = await listen(backend, t);
  const port = await listen(createBridge({ upstreamPort }), t);
  const url = `http://127.0.0.1:${port}`;
  const response = await fetch(`${url}/v1/audio/transcriptions?enhance=false`, {
    method: 'POST', body, headers: {
      'Content-Type': 'multipart/form-data; boundary=abc', Authorization: 'Bearer test-only',
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: 'contract verified' });
  assert.equal((await fetch(`${url}/health`)).status, 200);
  healthy = false;
  assert.equal((await fetch(`${url}/health`)).status, 503);
  assert.equal((await (await fetch(`${url}/v1/models`)).json()).data[0].id, 'large-v3-turbo');
});

test('bounds uploads and deadlines and reports upstream transport failures', async (t) => {
  const backend = http.createServer((req, res) => {
    if (req.headers['content-type']?.includes('broken')) req.socket.destroy();
    else req.resume();
  });
  const upstreamPort = await listen(backend, t);
  const port = await listen(createBridge({ upstreamPort, maxBytes: 16, timeoutMs: 50 }), t);
  const url = `http://127.0.0.1:${port}/v1/audio/transcriptions`;
  const send = (body, boundary = 'abc') => fetch(url, {
    method: 'POST', body, headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  });
  assert.equal((await send('12345678901234567')).status, 413);
  assert.equal((await send('small', 'broken')).status, 502);
  assert.equal((await send('small')).status, 504);
  assert.equal((await fetch(url, { method: 'POST', body: 'text' })).status, 415);
  const chunked = await new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: {
      'Content-Type': 'multipart/form-data; boundary=abc',
    } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write('1234567890');
    req.end('1234567890');
  });
  assert.equal(chunked, 413);
});

test('client disconnect closes the pending upstream connection', async (t) => {
  let arrived;
  let disconnected;
  const started = new Promise((resolve) => { arrived = resolve; });
  const closed = new Promise((resolve) => { disconnected = resolve; });
  const backend = http.createServer((req, res) => {
    req.resume();
    res.on('close', disconnected);
    arrived();
  });
  const upstreamPort = await listen(backend, t);
  const port = await listen(createBridge({ upstreamPort }), t);
  const req = http.request(`http://127.0.0.1:${port}/v1/audio/transcriptions`, {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=abc' },
  });
  req.on('error', () => {});
  req.end('audio');
  await started;
  req.destroy();
  await Promise.race([closed, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Upstream stayed connected')), 1_000);
    timer.unref();
  })]);
});
