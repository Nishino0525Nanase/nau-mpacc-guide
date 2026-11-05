import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const SECRET = 'test-only-secret-value-00000000000000';
const env = { SIGNAL_ORIGIN: 'https://signal.example', ADMIN_SHARED_SECRET: SECRET };
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const session = { id, createdAt: '2026-11-05T10:00:00.000Z', expiresAt: '2026-11-05T10:10:00.000Z', status: 'waiting', offer: { type: 'offer', sdp: 'v=0\r\n' } };
const originalFetch = globalThis.fetch;
async function stub(response, run) {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return typeof response === 'function' ? response(url, options) : response.clone(); };
  try { await run(calls); } finally { globalThis.fetch = originalFetch; }
}
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function request(path, init = {}) { return new Request('https://owner.example' + path, init); }

test('missing or unsafe runtime config fails closed', async () => {
  for (const config of [{}, { ...env, ADMIN_SHARED_SECRET: '' }, { ...env, SIGNAL_ORIGIN: 'http://signal.example' }, { ...env, SIGNAL_ORIGIN: 'https://signal.example/private' }, { ...env, SIGNAL_ORIGIN: 'https://secret@signal.example/' }]) {
    assert.equal((await worker.fetch(request('/'), config)).status, 503);
  }
});
test('owner HTML contains no secret, no capture API, and cannot be framed', async () => {
  const response = await worker.fetch(request('/'), env);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert(!html.includes(SECRET));
  assert(!html.includes('mediaDevices'));
  assert(!html.includes('getUserMedia'));
  assert(!html.includes('MediaRecorder'));
  assert(!html.includes('toDataURL'));
  assert(!html.includes(env.SIGNAL_ORIGIN));
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.match(response.headers.get('Permissions-Policy'), /camera=\(\)/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
  assert(html.includes('访客主动发起'));
});
test('only exact owner API paths and methods are supported', async () => {
  for (const path of ['/api', '/api/secrets', '/api/sessions/short', '/api/sessions/'+id+'/token', '/api/sessions?origin=evil']) assert.equal((await worker.fetch(request(path), env)).status, 404);
  assert.equal((await worker.fetch(request('/api/sessions', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(request('/api/sessions/'+id+'/answer'), env)).status, 405);
});
test('list proxy adds server credential and does not forward client headers or private fields', async () => {
  await stub(jsonResponse({ sessions: [{ ...session, senderToken: 'should-never-reach-browser', tokenHash: 'not-visible' }] }), async calls => {
    const response = await worker.fetch(request('/api/sessions', { headers: { Authorization: 'Bearer attacker', Origin: 'https://owner.example', Cookie: 'private=cookie' } }), env);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://signal.example/owner/sessions');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + SECRET);
    assert(!('Origin' in calls[0].options.headers));
    assert(!('Cookie' in calls[0].options.headers));
    assert.equal(calls[0].options.redirect, 'error');
    const body = await response.json();
    assert.deepEqual(Object.keys(body.sessions[0]).sort(), ['createdAt', 'expiresAt', 'id', 'status']);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  });
});
test('single-session proxy permits offer but strips token metadata', async () => {
  await stub(jsonResponse({ ...session, senderToken: 'not-visible', adminSecret: SECRET }), async () => {
    const response = await worker.fetch(request('/api/sessions/' + id), env);
    const text = await response.text();
    assert(!text.includes(SECRET)); assert(!text.includes('senderToken'));
    assert.deepEqual(JSON.parse(text).offer, session.offer);
  });
});
test('cross-origin mutations are denied before contacting upstream', async () => {
  await stub(jsonResponse({ok:true}), async calls => {
    const r = await worker.fetch(request('/api/sessions/' + id, { method: 'DELETE', headers: { Origin: 'https://attacker.example' } }), env);
    assert.equal(r.status, 403); assert.equal(calls.length, 0);
    const r2 = await worker.fetch(request('/api/sessions/' + id, { method: 'DELETE', headers: { 'Sec-Fetch-Site': 'cross-site' } }), env);
    assert.equal(r2.status, 403); assert.equal(calls.length, 0);
  });
});
test('answer proxy validates input and forwards only the SDP answer', async () => {
  await stub(jsonResponse({ok:true,status:'answered',unexpected:SECRET}), async calls => {
    const r = await worker.fetch(request('/api/sessions/' + id + '/answer', { method: 'POST', headers: { Origin: 'https://owner.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: { type: 'answer', sdp: 'v=0\r\n', token:'drop' }, senderToken:'drop' }) }), env);
    assert.equal(r.status, 200);
    assert.equal(calls[0].url, 'https://signal.example/owner/sessions/' + id + '/answer');
    assert.deepEqual(JSON.parse(calls[0].options.body), { answer: { type:'answer', sdp:'v=0\r\n' } });
    assert.deepEqual(await r.json(), {ok:true,status:'answered'});
  });
});
test('malformed, wrong-type and oversized answers are rejected without upstream contact', async () => {
  await stub(jsonResponse({ok:true}), async calls => {
    const path='/api/sessions/'+id+'/answer';
    assert.equal((await worker.fetch(request(path,{method:'POST',body:'{}'}),env)).status,415);
    for (const body of ['{', '{}', JSON.stringify({answer:{type:'offer',sdp:'v=0'}}), JSON.stringify({answer:{type:'answer',sdp:''}})]) {
      assert.equal((await worker.fetch(request(path,{method:'POST',headers:{'Content-Type':'application/json'},body}),env)).status,400);
    }
    assert.equal((await worker.fetch(request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answer:{type:'answer',sdp:'x'.repeat(128*1024)}})}),env)).status,413);
    assert.equal(calls.length,0);
  });
});
test('upstream errors are sanitized, never copied into HTML or JSON', async () => {
  await stub(jsonResponse({error:SECRET,trace:SECRET}, 401), async () => {
    const r=await worker.fetch(request('/api/sessions'),env);
    assert.equal(r.status,401); assert.deepEqual(await r.json(),{error:'upstream_request_failed'});
  });
  await stub(new Response('<html>'+SECRET+'</html>',{status:500,headers:{'Content-Type':'text/html'}}),async()=>{
    const r=await worker.fetch(request('/api/sessions'),env);assert.equal(r.status,502);assert(!(await r.text()).includes(SECRET));
  });
});
test('DELETE maps only to that session and is not a general proxy', async () => {
  await stub(jsonResponse({ok:true}), async calls => {
    const r=await worker.fetch(request('/api/sessions/'+id,{method:'DELETE',headers:{Origin:'https://owner.example'}}),env);
    assert.equal(r.status,200); assert.equal(calls[0].options.method,'DELETE');
    assert.equal(calls[0].url,'https://signal.example/owner/sessions/'+id);
    assert.equal(calls[0].options.body,undefined);
  });
});
