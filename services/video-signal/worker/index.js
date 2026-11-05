/* Voluntary video sharing: signaling only, never media storage or capture.
 * Caller-facing camera disclosure and consent belong in the independent sender UI.
 * R2 conditional writes coordinate a bounded private session index across isolates.
 */
const ALLOWED_ORIGIN = 'https://nishino0525nanase.github.io';
const CONSENT_VERSION = 'camera-share-v1';
const TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 20;
const MAX_BODY = 128 * 1024;
const INDEX_KEY = 'nau-video-v1/index.json';
const SESSION_PREFIX = 'nau-video-v1/session/';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
const encoder = new TextEncoder();

class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new ApiError(status, code); };
const objectKey = (id, kind) => `${SESSION_PREFIX}${id}/${kind}.json`;

function response(status, body, origin = null, extra = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  };
  if (origin === ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
    headers['Vary'] = 'Origin';
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function configured(env) {
  return typeof env?.ADMIN_SHARED_SECRET === 'string'
    && TOKEN.test(env.ADMIN_SHARED_SECRET)
    && !/placeholder|replace|change.?me|example|your[_-]/i.test(env.ADMIN_SHARED_SECRET)
    && env?.BUCKET && ['get', 'put', 'delete', 'head'].every(name => typeof env.BUCKET[name] === 'function');
}

function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  if (value.length > 280) return '';
  return /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(value)?.[1] || '';
}

async function digest(value) {
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(result, b => b.toString(16).padStart(2, '0')).join('');
}

function fixedEqual(a, b) {
  // All comparisons reaching here are fixed-length SHA-256 hex strings.
  if (a.length !== 64 || b.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function ownerAuthorized(request, env) {
  const supplied = bearer(request);
  if (!supplied) return false;
  return fixedEqual(await digest(supplied), await digest(env.ADMIN_SHARED_SECRET));
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function jsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) fail(415, 'unsupported_content_type');
  const encoding = request.headers.get('Content-Encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') fail(415, 'unsupported_encoding');
  const size = request.headers.get('Content-Length');
  if (size && (!/^\d+$/.test(size) || Number(size) > MAX_BODY)) fail(413, 'request_too_large');
  if (!request.body) fail(400, 'invalid_json');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY) {
        try { await reader.cancel(); } catch {}
        fail(413, 'request_too_large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(combined));
    if (!result || typeof result !== 'object' || Array.isArray(result)) fail(400, 'invalid_json');
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    fail(400, 'invalid_json');
  }
}

function description(value, expected) {
  if (!value || value.type !== expected || typeof value.sdp !== 'string') fail(400, 'invalid_sdp');
  const sdp = value.sdp;
  if (sdp.length < 20 || encoder.encode(sdp).length > MAX_BODY - 256 || !/^v=0\r?\n/.test(sdp) || /\0/.test(sdp)) fail(400, 'invalid_sdp');
  const media = [...sdp.matchAll(/(?:^|\n)m=([^\s]+) /g)].map(m => m[1]);
  if (media.length !== 1 || media[0] !== 'video') fail(400, 'video_only_sdp_required');
  return { type: expected, sdp };
}

async function storedJson(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json();
}

async function conditionalPut(bucket, key, body, options) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await bucket.put(key, body, options); }
    catch (error) {
      // R2 limits concurrent writes to a key to one per second. Never spin or
      // retry indefinitely, and never expose the storage exception to callers.
      const rateLimited = error?.status === 429 || error?.statusCode === 429 || /(?:\b429\b|rate.?limit)/i.test(String(error?.message || ''));
      if (!rateLimited || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }
}

function validIndex(index) {
  return index?.version === 1 && Array.isArray(index.sessions) && index.sessions.length <= MAX_SESSIONS
    && index.sessions.every(row => ID.test(row.id) && Number.isFinite(row.createdMs) && Number.isFinite(row.expiresMs)
      && row.expiresMs === row.createdMs + TTL_MS && /^[a-f0-9]{64}$/.test(row.tokenHash) && typeof row.ready === 'boolean')
    && new Set(index.sessions.map(row => row.id)).size === index.sessions.length;
}

async function deleteObjects(bucket, id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await bucket.delete([objectKey(id, 'offer'), objectKey(id, 'answer')]); return; }
    catch (error) {
      const rateLimited = error?.status === 429 || error?.statusCode === 429 || /(?:\b429\b|rate.?limit)/i.test(String(error?.message || ''));
      if (!rateLimited || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }
}

function stateStore(bucket, clock) {
  // There is one small CAS index. It never contains a raw sender/admin token or media.
  async function mutate(callback) {
    for (let attempt = 0; attempt < 32; attempt++) {
      const object = await bucket.get(INDEX_KEY);
      const current = object ? await object.json() : { version: 1, sessions: [] };
      if (!validIndex(current)) fail(503, 'storage_unavailable');
      const now = clock();
      const expired = current.sessions.filter(row => now >= row.expiresMs || !row.ready);
      const live = current.sessions.filter(row => now < row.expiresMs && row.ready);
      // Keep revoked/expired rows as private cleanup tombstones until object
      // deletion succeeds. A storage failure must not leave unindexed data.
      await Promise.all(expired.map(row => deleteObjects(bucket, row.id)));
      const result = callback(live);
      if (!expired.length && !result.changed) return result.value;
      const next = { version: 1, sessions: result.rows || live };
      if (!validIndex(next)) fail(503, 'storage_unavailable');
      const condition = object ? { etagMatches: object.etag } : new Headers({ 'If-None-Match': '*' });
      const saved = await conditionalPut(bucket, INDEX_KEY, JSON.stringify(next), {
        onlyIf: condition,
        httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' }
      });
      if (saved) {
        return result.value;
      }
      // Bounded contention retry. R2 checks the conditional put atomically.
      if (attempt > 3) await new Promise(resolve => setTimeout(resolve, Math.min(attempt * 2, 30)));
    }
    fail(503, 'try_again');
  }
  return {
    all: () => mutate(rows => ({ changed: false, value: rows })),
    reserve: row => mutate(rows => {
      if (rows.length >= MAX_SESSIONS) fail(409, 'session_capacity');
      return { changed: true, rows: [...rows, row], value: row };
    }),
    revoke: id => mutate(rows => ({ changed: rows.some(row => row.id === id),
      rows: rows.map(row => row.id === id ? { ...row, ready: false } : row), value: null })),
    remove: id => mutate(rows => ({ changed: rows.some(row => row.id === id), rows: rows.filter(row => row.id !== id), value: null }))
  };
}

function metadata(row, answered) {
  return { id: row.id, createdAt: new Date(row.createdMs).toISOString(),
    expiresAt: new Date(row.expiresMs).toISOString(), status: answered ? 'answered' : 'waiting' };
}

export function createHandler({ now = () => Date.now() } = {}) {
  return async function fetch(request, env) {
    const origin = request.headers.get('Origin');
    let corsOrigin = origin === ALLOWED_ORIGIN ? origin : null;
    try {
      const url = new URL(request.url);
      if (url.protocol !== 'https:') fail(400, 'https_required');
      if (!configured(env)) fail(503, 'configuration_unavailable');
      if (url.search) fail(400, 'query_not_supported');
      if (url.pathname === '/health' && request.method === 'GET') return response(200, { ok: true, service: 'voluntary-video-signaling' });
      const publicPath = url.pathname === '/api/sessions' || /^\/api\/sessions\/[0-9a-f-]+$/i.test(url.pathname);
      const ownerPath = url.pathname === '/owner/sessions' || /^\/owner\/sessions\/[0-9a-f-]+(?:\/answer)?$/i.test(url.pathname);
      if (!publicPath && !ownerPath) fail(404, 'not_found');
      if (publicPath && origin !== ALLOWED_ORIGIN) fail(403, 'origin_not_allowed');
      if (ownerPath) {
        corsOrigin = null;
        if (origin !== null) fail(403, 'origin_not_allowed');
        if (!await ownerAuthorized(request, env)) fail(401, 'unauthorized');
      }
      if (request.method === 'OPTIONS') {
        if (!publicPath) fail(405, 'method_not_allowed');
        return response(204, null, corsOrigin, {
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '300'
        });
      }
      const bucket = env.BUCKET;
      const store = stateStore(bucket, now);
      // Cleanup is bounded by the 20-entry index and runs for valid API requests.
      const isCreation = publicPath && url.pathname === '/api/sessions' && request.method === 'POST';
      const rows = isCreation ? [] : await store.all();
      if (publicPath && url.pathname === '/api/sessions') {
        if (request.method !== 'POST') fail(405, 'method_not_allowed');
        const body = await jsonBody(request);
        if (body.consentVersion !== CONSENT_VERSION) fail(400, 'consent_required');
        const offer = description(body.offer, 'offer');
        const id = crypto.randomUUID();
        const senderToken = newToken();
        const createdMs = now();
        const row = { id, createdMs, expiresMs: createdMs + TTL_MS, tokenHash: await digest(senderToken), ready: true };
        await store.reserve(row);
        try {
          await bucket.put(objectKey(id, 'offer'), JSON.stringify(offer), { httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' } });
        } catch (error) {
          await store.revoke(id);
          await deleteObjects(bucket, id);
          await store.remove(id);
          throw error;
        }
        return response(201, { id, senderToken, expiresAt: new Date(row.expiresMs).toISOString() }, corsOrigin);
      }
      if (ownerPath && url.pathname === '/owner/sessions') {
        if (request.method !== 'GET') fail(405, 'method_not_allowed');
        const entries = await Promise.all(rows.filter(row => row.ready).map(async row => {
          if (!await bucket.head(objectKey(row.id, 'offer'))) return null;
          return metadata(row, !!await bucket.head(objectKey(row.id, 'answer')));
        }));
        const currentIds = new Set((await store.all()).filter(row => row.ready && now() < row.expiresMs).map(row => row.id));
        return response(200, { sessions: entries.filter(row => row && currentIds.has(row.id)) }, null);
      }
      const match = /^\/(api|owner)\/sessions\/([^/]+)(\/answer)?$/.exec(url.pathname);
      if (!match || !ID.test(match[2])) fail(404, 'session_unavailable');
      const [, role, id, answerPath] = match;
      const row = rows.find(item => item.id === id && item.ready);
      if (!row || now() >= row.expiresMs) fail(404, 'session_unavailable');
      if (role === 'api') {
        const supplied = bearer(request);
        if (!supplied || !fixedEqual(await digest(supplied), row.tokenHash)) fail(401, 'unauthorized');
      }
      if (request.method === 'DELETE' && !answerPath) {
        await store.revoke(id); // Revoke access before data deletion; retain a cleanup tombstone on failure.
        await deleteObjects(bucket, id);
        await store.remove(id);
        return response(200, { ok: true }, corsOrigin);
      }
      if (request.method === 'POST' && role === 'owner' && answerPath) {
        const body = await jsonBody(request);
        const answer = description(body.answer, 'answer');
        const old = await storedJson(bucket, objectKey(id, 'answer'));
        if (old && old.sdp !== answer.sdp) fail(409, 'answer_already_set');
        if (!old) {
          const written = await bucket.put(objectKey(id, 'answer'), JSON.stringify(answer), {
            onlyIf: new Headers({ 'If-None-Match': '*' }),
            httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' }
          });
          if (!written) {
            const competing = await storedJson(bucket, objectKey(id, 'answer'));
            if (!competing || competing.sdp !== answer.sdp) fail(409, 'answer_already_set');
          }
        }
        // A late answer cannot resurrect a stopped or expired session.
        const current = (await store.all()).find(item => item.id === id && item.ready);
        if (!current || now() >= current.expiresMs) {
          await deleteObjects(bucket, id);
          fail(404, 'session_unavailable');
        }
        return response(200, { ok: true, status: 'answered' });
      }
      if (request.method !== 'GET' || answerPath) fail(405, 'method_not_allowed');
      const answer = await storedJson(bucket, objectKey(id, 'answer'));
      const offer = role === 'owner' ? await storedJson(bucket, objectKey(id, 'offer')) : null;
      const current = (await store.all()).find(item => item.id === id && item.ready);
      if (!current || now() >= current.expiresMs) fail(404, 'session_unavailable');
      if (role === 'api') return response(200, { id, answer, status: answer ? 'answered' : 'waiting', expiresAt: new Date(row.expiresMs).toISOString() }, corsOrigin);
      if (!offer) fail(404, 'session_unavailable');
      return response(200, { ...metadata(row, !!answer), offer });
    } catch (error) {
      if (error instanceof ApiError) return response(error.status, { error: error.code }, corsOrigin);
      // Do not log request headers, bodies, descriptions, tokens or storage exceptions.
      return response(503, { error: 'storage_unavailable' }, corsOrigin);
    }
  };
}

export default { fetch: createHandler() };
