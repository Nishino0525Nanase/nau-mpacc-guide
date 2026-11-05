import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../worker/index.js';

const ORIGIN = 'https://nishino0525nanase.github.io';
const ADMIN = 'a'.repeat(64);
const SDP = 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n';
class Bucket {
  objects = new Map();
  version = 0;
  failOffer = false;
  answerGate = null;
  offerReadGate = null;
  onOfferRead = null;
  failDelete = false;
  async get(key) {
    const value = this.objects.get(key);
    if (!value) return null;
    const { text, etag } = value;
    if (key.endsWith('/offer.json') && this.offerReadGate) {
      this.onOfferRead?.();
      await this.offerReadGate;
    }
    return { etag, json: async () => JSON.parse(text) };
  }
  async head(key) { const value = this.objects.get(key); return value ? { etag: value.etag } : null; }
  async put(key, text, options = {}) {
    if (key.endsWith('/offer.json') && this.failOffer) throw new Error('storage failure with private details');
    if (key.endsWith('/answer.json') && this.answerGate) await this.answerGate;
    const current = this.objects.get(key);
    const condition = options.onlyIf;
    if (condition instanceof Headers && condition.get('If-None-Match') === '*' && current) return null;
    if (condition?.etagMatches && condition.etagMatches !== current?.etag) return null;
    const value = { text: String(text), etag: String(++this.version) };
    this.objects.set(key, value);
    return { etag: value.etag };
  }
  async delete(keys) {
    if (this.failDelete) { this.failDelete = false; throw new Error('transient private storage error'); }
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}
function fixture() {
  let clock = Date.UTC(2026, 0, 1);
  const bucket = new Bucket();
  const env = { BUCKET: bucket, ADMIN_SHARED_SECRET: ADMIN };
  const handler = createHandler({ now: () => clock });
  const request = (path, { method = 'GET', body, token, origin = ORIGIN, headers = {}, url } = {}) => {
    const h = new Headers(headers);
    if (origin !== null) h.set('Origin', origin);
    if (token) h.set('Authorization', 'Bearer ' + token);
    if (body !== undefined && !h.has('Content-Type')) h.set('Content-Type', 'application/json');
    return new Request(url || 'https://signal.example' + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  };
  const call = (path, options) => handler(request(path, options), env);
  const owner = (path = '/owner/sessions', options = {}) => call(path, { token: ADMIN, origin: null, ...options });
  const create = async () => {
    const r = await call('/api/sessions', { method: 'POST', body: { offer: { type: 'offer', sdp: SDP }, consentVersion: 'camera-share-v1' } });
    assert.equal(r.status, 201);
    return r.json();
  };
  return { bucket, env, handler, request, call, owner, create, advance: n => { clock += n; } };
}

test('unconfigured storage or placeholder admin key fails closed', async () => {
  const f = fixture();
  for (const env of [{}, { BUCKET: f.bucket, ADMIN_SHARED_SECRET: 'replace-this-placeholder-before-deployment' }]) {
    const r = await f.handler(f.request('/api/sessions', { method: 'POST', body: {} }), env);
    assert.equal(r.status, 503);
  }
  assert.equal(f.bucket.objects.size, 0);
});

test('owner requires independent server bearer and rejects all browser Origins', async () => {
  const f = fixture();
  assert.equal((await f.call('/owner/sessions', { origin: null })).status, 401);
  assert.equal((await f.owner('/owner/sessions', { token: 'b'.repeat(64) })).status, 401);
  assert.equal((await f.owner('/owner/sessions', { origin: ORIGIN })).status, 403);
  assert.equal((await f.owner()).status, 200);
});

test('public endpoints enforce HTTPS, exact Origin, consent version and bounded content', async () => {
  const f = fixture();
  const body = { offer: { type: 'offer', sdp: SDP }, consentVersion: 'camera-share-v1' };
  for (const origin of [null, 'null', 'https://nishino0525nanase.github.io.evil.test', 'http://nishino0525nanase.github.io']) {
    assert.equal((await f.call('/api/sessions', { method: 'POST', origin, body })).status, 403);
  }
  assert.equal((await f.call('/api/sessions', { method: 'POST', body, url: 'http://signal.example/api/sessions' })).status, 400);
  assert.equal((await f.call('/api/sessions?token=sensitive', { method: 'POST', body })).status, 400);
  assert.equal((await f.call('/api/sessions', { method: 'POST', body: { offer: body.offer } })).status, 400);
  assert.equal((await f.call('/api/sessions', { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.call('/api/sessions', { method: 'POST', body, headers: { 'Content-Encoding': 'gzip' } })).status, 415);
  assert.equal((await f.call('/api/sessions', { method: 'POST', body: 'x'.repeat(128 * 1024 + 1), headers: { 'Content-Length': '1' } })).status, 413);
  assert.equal(f.bucket.objects.size, 0);
});

test('oversized streamed body is rejected even without Content-Length', async () => {
  const f = fixture();
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(90 * 1024));
    controller.enqueue(new Uint8Array(90 * 1024));
    controller.close();
  } });
  const r = new Request('https://signal.example/api/sessions', { method: 'POST', body: stream, duplex: 'half', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' } });
  assert.equal((await f.handler(r, f.env)).status, 413);
  assert.equal(f.bucket.objects.size, 0);
});

test('audio and non-video descriptions are never accepted', async () => {
  const f = fixture();
  for (const sdp of [SDP.replace('m=video', 'm=audio'), SDP + 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', 'not SDP']) {
    const r = await f.call('/api/sessions', { method: 'POST', body: { consentVersion: 'camera-share-v1', offer: { type: 'offer', sdp } } });
    assert.equal(r.status, 400);
  }
});

test('create/list/poll expose only the correct role data and never store raw sender token', async () => {
  const f = fixture();
  const s = await f.create();
  assert.match(s.senderToken, /^[\w-]{43}$/);
  assert.equal(Date.parse(s.expiresAt), Date.UTC(2026, 0, 1) + 600000);
  const list = await f.owner();
  const text = await list.text();
  const data = JSON.parse(text);
  assert.deepEqual(Object.keys(data.sessions[0]).sort(), ['createdAt', 'expiresAt', 'id', 'status']);
  assert.equal(text.includes(s.senderToken), false);
  assert.equal(text.includes('sdp'), false);
  const poll = await f.call('/api/sessions/' + s.id, { token: s.senderToken });
  assert.deepEqual(await poll.json(), { id: s.id, answer: null, status: 'waiting', expiresAt: s.expiresAt });
  assert.equal(poll.headers.get('Cache-Control'), 'no-store');
  assert.equal([...f.bucket.objects.values()].some(o => o.text.includes(s.senderToken)), false);
  assert.equal([...f.bucket.objects.values()].some(o => o.text.includes(ADMIN)), false);
});

test('sender token cannot access a different session, owner API, or be replaced by admin token', async () => {
  const f = fixture(); const a = await f.create(); const b = await f.create();
  assert.equal((await f.call('/api/sessions/' + a.id, { token: b.senderToken })).status, 401);
  assert.equal((await f.call('/api/sessions/' + a.id, { method: 'DELETE', token: b.senderToken })).status, 401);
  assert.equal((await f.call('/owner/sessions', { token: a.senderToken, origin: null })).status, 401);
  assert.equal((await f.call('/api/sessions/' + a.id, { token: ADMIN })).status, 401);
});

test('answer round trip is idempotent and refuses replacement', async () => {
  const f = fixture(); const s = await f.create(); const path = '/owner/sessions/' + s.id;
  const offer = await (await f.owner(path)).json();
  assert.deepEqual(offer.offer, { type: 'offer', sdp: SDP });
  const answer = { type: 'answer', sdp: SDP.replace('sendonly', 'recvonly') };
  assert.equal((await f.owner(path + '/answer', { method: 'POST', body: { answer } })).status, 200);
  assert.equal((await f.owner(path + '/answer', { method: 'POST', body: { answer } })).status, 200);
  assert.equal((await f.owner(path + '/answer', { method: 'POST', body: { answer: { ...answer, sdp: answer.sdp + 'a=ice-options:trickle\r\n' } } })).status, 409);
  const sender = await (await f.call('/api/sessions/' + s.id, { token: s.senderToken })).json();
  assert.deepEqual(sender.answer, answer);
  assert.equal(sender.status, 'answered');
});

test('stopping deletes access gate and both descriptions; later reads are unavailable', async () => {
  const f = fixture(); const s = await f.create();
  const r = await f.call('/api/sessions/' + s.id, { method: 'DELETE', token: s.senderToken });
  assert.equal(r.status, 200);
  assert.equal((await f.owner()).status, 200);
  assert.equal((await f.call('/api/sessions/' + s.id, { token: s.senderToken })).status, 404);
  assert.equal((await f.owner('/owner/sessions/' + s.id)).status, 404);
  assert.equal([...f.bucket.objects.keys()].some(k => k.includes(s.id)), false);
});

test('exact TTL boundary rejects access and cleans expired signaling without renewal', async () => {
  const f = fixture(); const s = await f.create();
  f.advance(599999);
  assert.equal((await f.call('/api/sessions/' + s.id, { token: s.senderToken })).status, 200);
  f.advance(1);
  assert.equal((await f.call('/api/sessions/' + s.id, { token: s.senderToken })).status, 404);
  assert.deepEqual(await (await f.owner()).json(), { sessions: [] });
  assert.equal([...f.bucket.objects.keys()].some(k => k.includes(s.id)), false);
  assert.equal((await f.owner('/owner/sessions/' + s.id + '/answer', { method: 'POST', body: { answer: { type: 'answer', sdp: SDP } } })).status, 404);
});

test('parallel creates cannot reserve more than 20 sessions', async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 21 }, () => f.call('/api/sessions', { method: 'POST', body: { consentVersion: 'camera-share-v1', offer: { type: 'offer', sdp: SDP } } })));
  const statuses = responses.map(r => r.status);
  assert.equal(statuses.filter(s => s === 201).length, 20);
  assert.equal(statuses.filter(s => s === 409).length, 1);
  assert.equal((await (await f.owner()).json()).sessions.length, 20);
});

test('failed offer write leaves no reserved slot and reveals no private storage error', async () => {
  const f = fixture(); f.bucket.failOffer = true;
  const r = await f.call('/api/sessions', { method: 'POST', body: { consentVersion: 'camera-share-v1', offer: { type: 'offer', sdp: SDP } } });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: 'storage_unavailable' });
  assert.deepEqual(await (await f.owner()).json(), { sessions: [] });
});

test('answer arriving after deletion cannot resurrect stopped signaling', async () => {
  const f = fixture(); const s = await f.create();
  let release; f.bucket.answerGate = new Promise(resolve => { release = resolve; });
  const answering = f.owner('/owner/sessions/' + s.id + '/answer', { method: 'POST', body: { answer: { type: 'answer', sdp: SDP } } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await f.call('/api/sessions/' + s.id, { method: 'DELETE', token: s.senderToken })).status, 200);
  release();
  assert.equal((await answering).status, 404);
  assert.deepEqual(await (await f.owner()).json(), { sessions: [] });
  assert.equal([...f.bucket.objects.keys()].some(k => k.includes(s.id)), false);
});

test('CORS preflight is scoped and never grants credentials or private owner access', async () => {
  const f = fixture();
  const r = await f.call('/api/sessions', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(r.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await f.call('/owner/sessions', { method: 'OPTIONS', token: ADMIN })).status, 403);
});

for (const scenario of ['stop', 'expire']) {
  test(`owner offer delayed read cannot outlive ${scenario}`, async () => {
    const f = fixture(); const s = await f.create();
    let release, started;
    f.bucket.offerReadGate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    f.bucket.onOfferRead = started;
    const reading = f.owner('/owner/sessions/' + s.id);
    await entered;
    if (scenario === 'stop') {
      assert.equal((await f.call('/api/sessions/' + s.id, { method: 'DELETE', token: s.senderToken })).status, 200);
    } else f.advance(600000);
    release();
    const r = await reading;
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { error: 'session_unavailable' });
  });
}

test('failed physical cleanup retains revoked gate for a later cleanup retry', async () => {
  const f = fixture(); const s = await f.create();
  f.bucket.failDelete = true;
  assert.equal((await f.call('/api/sessions/' + s.id, { method: 'DELETE', token: s.senderToken })).status, 503);
  // The storage failure is not permission to return old signaling.
  assert.equal((await f.call('/api/sessions/' + s.id, { token: s.senderToken })).status, 404);
  assert.deepEqual(await (await f.owner()).json(), { sessions: [] });
  assert.equal([...f.bucket.objects.keys()].some(key => key.includes(s.id)), false);
});
